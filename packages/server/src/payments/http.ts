import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { storeManager } from '../config/stores';
import { eventEmitter } from '../events/contracts/emitter';
import { logger } from '../logging';
import { problemDetails } from '../http/problems';
import { rateLimitMiddleware } from '../middleware/rateLimit';
import {
  validatePaymentCreation,
  validatePaymentQuery,
  validateResourceId,
  validateIdempotencyKey,
  CreatePaymentRequest,
  PaymentListQuery,
} from '../validation';
import { traceBusinessOperation, traceDbOperation } from '../telemetry/tracing';
import { withResilience, resilienceConfigs } from '../resilience';
import { createPaginationManager } from '../utils/stable-pagination';
import { protocolVersionMiddleware } from '../middleware/protocol-version';

// Types now imported from validation module

export function createPaymentRouter(): Router {
  const router = Router();
  const paymentStore = storeManager.getPaymentStore();

  // POST /payments - Create payment
  router.post(
    '/payments',
    rateLimitMiddleware('pay'),
    protocolVersionMiddleware,
    validateIdempotencyKey,
    validatePaymentCreation,
    async (req: Request, res: Response) => {
      try {
        const body = req.body as CreatePaymentRequest;

        // Check if rail is supported
        if (body.rail === 'x402') {
          const x402Mode = process.env.PEAC_X402_MODE || 'simulate';
          if (x402Mode === 'off') {
            return problemDetails.send(res, 'payment_unsupported_rail', {
              detail: 'X402 payments are currently disabled',
              rail: body.rail,
            });
          }
        }

        // Create payment record with tracing and resilience
        const payment = await traceDbOperation(req, 'create', 'payments', () =>
          withResilience(
            () =>
              paymentStore.create({
                rail: body.rail,
                amount: body.amount,
                currency: body.currency,
                status: 'pending',
                metadata: body.metadata,
              }),
            resilienceConfigs.criticalDb,
            'payment.create',
          ),
        );

        logger.info(
          {
            paymentId: payment.id,
            rail: payment.rail,
            amount: payment.amount,
            currency: payment.currency,
            requestId: res.get('X-Request-Id'),
          },
          'Payment initiated',
        );

        // Process payment based on rail
        let updatedPayment = payment;
        if (body.rail === 'credits') {
          // Credits rail - immediate success (live rail)
          updatedPayment = await traceBusinessOperation(
            req,
            'payment.process.credits',
            {
              rail: body.rail,
              amount: body.amount,
              currency: body.currency,
            },
            () =>
              withResilience(
                async () => {
                  const result = await paymentStore.update(payment.id, {
                    status: 'succeeded',
                    external_id: `credit_${randomUUID()}`,
                  });
                  return result || payment;
                },
                resilienceConfigs.payments,
                'payment.process.credits',
              ),
          );

          await eventEmitter.emit('PaymentSucceeded', {
            paymentId: payment.id,
            rail: payment.rail,
            amount: payment.amount,
            currency: payment.currency,
          });
        } else if (body.rail === 'x402') {
          // X402 rail - simulate based on config
          const x402Mode = process.env.PEAC_X402_MODE || 'simulate';

          if (x402Mode === 'simulate') {
            // Simulate requires_action or success
            const shouldSucceed = Math.random() > 0.3; // 70% success rate for simulation

            if (shouldSucceed) {
              updatedPayment =
                (await paymentStore.update(payment.id, {
                  status: 'succeeded',
                  external_id: `x402_sim_${randomUUID()}`,
                })) || payment;

              await eventEmitter.emit('PaymentSucceeded', {
                paymentId: payment.id,
                rail: payment.rail,
                amount: payment.amount,
                currency: payment.currency,
              });
            } else {
              updatedPayment =
                (await paymentStore.update(payment.id, {
                  status: 'requires_action',
                  external_id: `x402_action_${randomUUID()}`,
                })) || payment;
            }
          }
        }

        // Set standard headers
        res.set({
          'Content-Type': 'application/json',
          Location: `/payments/${payment.id}`,
        });

        res.status(201).json(updatedPayment);
      } catch (error) {
        logger.error({ error, path: req.path }, 'Failed to create payment');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to create payment',
        });
      }
    },
  );

  // GET /payments/:id - Get payment
  router.get(
    '/payments/:id',
    rateLimitMiddleware('standard'),
    validateResourceId,
    async (req: Request, res: Response) => {
      try {
        const paymentId = req.params.id;

        const payment = await traceDbOperation(req, 'get', 'payments', () =>
          paymentStore.get(paymentId),
        );
        if (!payment) {
          return problemDetails.send(res, 'resource_not_found', {
            detail: 'Payment not found',
          });
        }

        res.json(payment);
      } catch (error) {
        logger.error({ error, paymentId: req.params.id }, 'Failed to get payment');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to retrieve payment',
        });
      }
    },
  );

  // GET /payments - List payments with stable cursor pagination
  router.get(
    '/payments',
    rateLimitMiddleware('standard'),
    validatePaymentQuery,
    async (req: Request, res: Response) => {
      const startTime = Date.now();

      try {
        const paginationManager = createPaginationManager('payments');
        const query = req.query as unknown as PaymentListQuery;

        // Validate pagination options with enterprise-grade validation
        const paginationOptions = paginationManager.validateOptions({
          cursor: query.cursor,
          limit: query.limit ? parseInt(String(query.limit), 10) : undefined,
          sort: query.sort || 'created_at',
          order: (query.order as 'asc' | 'desc') || 'desc',
          filters: {
            status: query.status,
            rail: query.rail,
            currency: query.currency,
          },
        });

        // Execute query with tracing and resilience
        const storeResult = await traceDbOperation(req, 'list', 'payments', () =>
          withResilience(
            () =>
              paymentStore.list({
                cursor: paginationOptions.cursor
                  ? Buffer.from(
                      JSON.stringify({
                        created_at: paginationOptions.cursor.timestamp,
                        id: paginationOptions.cursor.id,
                      }),
                    ).toString('base64')
                  : undefined,
                limit: paginationOptions.limit,
              }),
            resilienceConfigs.quick,
            'payment.list',
          ),
        );

        // Process results with stable pagination
        const response = paginationManager.processResults(
          storeResult.items as unknown as Record<string, unknown>[],
          {
            limit: paginationOptions.limit,
            sort: paginationOptions.sort,
            order: paginationOptions.order,
            filters: paginationOptions.filters,
            hasMore: !!storeResult.next_cursor,
          },
        );

        // Add performance headers
        const duration = Date.now() - startTime;
        res.set({
          'X-Pagination-Duration': duration.toString(),
          'X-Pagination-Count': response.items.length.toString(),
          'X-Pagination-Has-More': response.has_more.toString(),
        });

        logger.debug(
          {
            count: response.items.length,
            hasMore: response.has_more,
            duration,
            sort: paginationOptions.sort,
            cursor: !!paginationOptions.cursor,
          },
          'Payment list query completed',
        );

        res.json(response);
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(
          {
            error: (error as Error).message,
            duration,
            query: req.query,
          },
          'Failed to list payments',
        );

        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to list payments',
        });
      }
    },
  );

  return router;
}

// Add problem types for payment-specific errors
const originalProblemMap = (problemDetails as unknown as { problemMap: Map<string, unknown> })
  .problemMap;

originalProblemMap.set('payment_unsupported_rail', {
  type: 'https://peacprotocol.org/problems/payment-unsupported-rail',
  title: 'Payment Rail Not Supported',
  status: 400,
});

originalProblemMap.set('pagination_invalid_cursor', {
  type: 'https://peacprotocol.org/problems/pagination-invalid-cursor',
  title: 'Invalid Pagination Cursor',
  status: 400,
});
