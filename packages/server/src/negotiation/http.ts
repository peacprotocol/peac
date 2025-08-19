import { Router, Request, Response } from 'express';
import { storeManager } from '../config/stores';
import { eventEmitter } from '../events/contracts/emitter';
import { logger } from '../logging';
import { problemDetails } from '../http/problems';
import { rateLimitMiddleware } from '../middleware/rateLimit';
import {
  validateNegotiationCreation,
  validateNegotiationAccept,
  validateNegotiationReject,
  validateNegotiationQuery,
  validateResourceId,
  validateIdempotencyKey,
  CreateNegotiationRequest,
  AcceptNegotiationRequest,
  RejectNegotiationRequest,
  NegotiationListQuery,
} from '../validation';
import { traceBusinessOperation, traceDbOperation } from '../telemetry/tracing';
import { createPaginationManager } from '../utils/stable-pagination';
import { withResilience, resilienceConfigs } from '../resilience';
import { protocolVersionMiddleware } from '../middleware/protocol-version';

// Types now imported from validation module

export function createNegotiationRouter(): Router {
  const router = Router();
  const negotiationStore = storeManager.getNegotiationStore();

  // POST /negotiations - Start negotiation
  router.post(
    '/negotiations',
    rateLimitMiddleware('negotiate'),
    protocolVersionMiddleware,
    validateIdempotencyKey,
    validateNegotiationCreation,
    async (req: Request, res: Response) => {
      try {
        const body = req.body as CreateNegotiationRequest;

        const negotiation = await traceDbOperation(req, 'create', 'negotiations', () =>
          negotiationStore.create({
            state: 'proposed',
            terms: body.terms,
            context: body.context,
            proposed_by: body.proposed_by,
          }),
        );

        logger.info(
          {
            negotiationId: negotiation.id,
            proposedBy: body.proposed_by,
            requestId: res.get('X-Request-Id'),
          },
          'Negotiation created',
        );

        // Emit event
        await eventEmitter.emit('NegotiationProposed', {
          negotiationId: negotiation.id,
          terms: negotiation.terms,
          context: negotiation.context,
          proposedBy: negotiation.proposed_by,
        });

        // Set standard headers
        res.set({
          'Content-Type': 'application/json',
          Location: `/negotiations/${negotiation.id}`,
        });

        res.status(201).json(negotiation);
      } catch (error) {
        logger.error({ error, path: req.path }, 'Failed to create negotiation');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to create negotiation',
        });
      }
    },
  );

  // POST /negotiations/:id/accept - Accept negotiation
  router.post(
    '/negotiations/:id/accept',
    rateLimitMiddleware('negotiate'),
    protocolVersionMiddleware,
    validateNegotiationAccept,
    async (req: Request, res: Response) => {
      try {
        const negotiationId = req.params.id;
        const body = req.body as AcceptNegotiationRequest;

        const existing = await traceDbOperation(req, 'get', 'negotiations', () =>
          negotiationStore.get(negotiationId),
        );
        if (!existing) {
          return problemDetails.send(res, 'resource_not_found', {
            detail: 'Negotiation not found',
          });
        }

        // Check state transition validity
        if (existing.state !== 'proposed') {
          return problemDetails.send(res, 'invalid_negotiation_state', {
            detail: `Cannot accept negotiation in state: ${existing.state}`,
            current_state: existing.state,
          });
        }

        const updated = await traceBusinessOperation(
          req,
          'negotiation.accept',
          { negotiationId, decidedBy: body.decided_by || 'unknown' },
          () =>
            negotiationStore.update(negotiationId, {
              state: 'accepted',
              decided_by: body.decided_by,
            }),
        );

        if (!updated) {
          return problemDetails.send(res, 'internal_error', {
            detail: 'Failed to update negotiation',
          });
        }

        logger.info(
          {
            negotiationId,
            decidedBy: body.decided_by,
            requestId: res.get('X-Request-Id'),
          },
          'Negotiation accepted',
        );

        // Emit event
        await eventEmitter.emit('NegotiationAccepted', {
          negotiationId,
          decidedBy: updated.decided_by,
          originalTerms: updated.terms,
        });

        res.json(updated);
      } catch (error) {
        logger.error({ error, negotiationId: req.params.id }, 'Failed to accept negotiation');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to accept negotiation',
        });
      }
    },
  );

  // POST /negotiations/:id/reject - Reject negotiation
  router.post(
    '/negotiations/:id/reject',
    rateLimitMiddleware('negotiate'),
    protocolVersionMiddleware,
    validateNegotiationReject,
    async (req: Request, res: Response) => {
      try {
        const negotiationId = req.params.id;
        const body = req.body as RejectNegotiationRequest;

        const existing = await negotiationStore.get(negotiationId);
        if (!existing) {
          return problemDetails.send(res, 'resource_not_found', {
            detail: 'Negotiation not found',
          });
        }

        // Check state transition validity
        if (existing.state !== 'proposed') {
          return problemDetails.send(res, 'invalid_negotiation_state', {
            detail: `Cannot reject negotiation in state: ${existing.state}`,
            current_state: existing.state,
          });
        }

        const updated = await negotiationStore.update(negotiationId, {
          state: 'rejected',
          reason: body.reason.trim(),
          decided_by: body.decided_by,
        });

        if (!updated) {
          return problemDetails.send(res, 'internal_error', {
            detail: 'Failed to update negotiation',
          });
        }

        logger.info(
          {
            negotiationId,
            reason: body.reason,
            decidedBy: body.decided_by,
            requestId: res.get('X-Request-Id'),
          },
          'Negotiation rejected',
        );

        // Emit event
        await eventEmitter.emit('NegotiationRejected', {
          negotiationId,
          reason: updated.reason,
          decidedBy: updated.decided_by,
          originalTerms: updated.terms,
        });

        res.json(updated);
      } catch (error) {
        logger.error({ error, negotiationId: req.params.id }, 'Failed to reject negotiation');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to reject negotiation',
        });
      }
    },
  );

  // GET /negotiations/:id - Get negotiation
  router.get(
    '/negotiations/:id',
    rateLimitMiddleware('standard'),
    validateResourceId,
    async (req: Request, res: Response) => {
      try {
        const negotiationId = req.params.id;

        const negotiation = await negotiationStore.get(negotiationId);
        if (!negotiation) {
          return problemDetails.send(res, 'resource_not_found', {
            detail: 'Negotiation not found',
          });
        }

        res.json(negotiation);
      } catch (error) {
        logger.error({ error, negotiationId: req.params.id }, 'Failed to get negotiation');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to retrieve negotiation',
        });
      }
    },
  );

  // GET /negotiations - List negotiations with stable cursor pagination
  router.get(
    '/negotiations',
    rateLimitMiddleware('standard'),
    validateNegotiationQuery,
    async (req: Request, res: Response) => {
      const startTime = Date.now();

      try {
        const paginationManager = createPaginationManager('negotiations');
        const query = req.query as unknown as NegotiationListQuery;

        // Validate pagination options with enterprise-grade validation
        const paginationOptions = paginationManager.validateOptions({
          cursor: query.cursor,
          limit: query.limit ? parseInt(String(query.limit), 10) : undefined,
          sort: query.sort || 'created_at',
          order: (query.order as 'asc' | 'desc') || 'desc',
          filters: {
            state: query.state,
            expires_at: query.expires_at,
          },
        });

        // Execute query with tracing and resilience
        const storeResult = await traceDbOperation(req, 'list', 'negotiations', () =>
          withResilience(
            () =>
              negotiationStore.list({
                cursor: paginationOptions.cursor
                  ? Buffer.from(
                      JSON.stringify({
                        created_at: paginationOptions.cursor.timestamp,
                        id: paginationOptions.cursor.id,
                      }),
                    ).toString('base64')
                  : undefined,
                limit: paginationOptions.limit,
                state: paginationOptions.filters.state as
                  | 'proposed'
                  | 'accepted'
                  | 'rejected'
                  | undefined,
              }),
            resilienceConfigs.quick,
            'negotiation.list',
          ),
        );

        // Process results with stable pagination
        const response = paginationManager.processResults(
          (storeResult.items || storeResult) as unknown as Record<string, unknown>[],
          {
            limit: paginationOptions.limit,
            sort: paginationOptions.sort,
            order: paginationOptions.order,
            filters: paginationOptions.filters,
            hasMore: !!(storeResult as any).next_cursor,
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
            state: paginationOptions.filters.state,
          },
          'Negotiation list query completed',
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
          'Failed to list negotiations',
        );

        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to list negotiations',
        });
      }
    },
  );

  return router;
}

// Add problem type for negotiation state errors
const originalProblemMap = (problemDetails as any).problemMap;
originalProblemMap.set('invalid_negotiation_state', {
  type: 'https://peacprotocol.org/problems/invalid-negotiation-state',
  title: 'Invalid Negotiation State',
  status: 409,
});
