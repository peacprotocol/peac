import { Router, Request, Response } from 'express';
import { eventEmitter } from '../events/contracts/emitter';
import { logger } from '../logging';
import { problemDetails } from '../http/problems';
import { validateWebhookPayload, WebhookPayload } from '../validation';
import { WebhookVerifier, WebhookConfig } from './verify';

// Extend Express Request type to include rawBody property
declare module 'express-serve-static-core' {
  interface Request {
    rawBody?: string;
  }
}

export function createWebhookRouter(): Router {
  const router = Router();

  // Note: Raw body capture and JSON parsing is handled by the main server middleware

  // Create webhook verifier instance dynamically to pick up current environment
  const getWebhookConfig = (): WebhookConfig => ({
    secret: process.env.PEAC_WEBHOOK_SECRET || '',
    toleranceSeconds: parseInt(process.env.PEAC_WEBHOOK_TOLERANCE_SECONDS || '120'),
    maxBodySize: parseInt(process.env.PEAC_WEBHOOK_MAX_BODY_SIZE || '1048576'), // 1MB
    enableRotation: process.env.PEAC_WEBHOOK_ROTATION_ENABLED === 'true',
    rotationConfig: process.env.PEAC_WEBHOOK_ROTATION_CONFIG,
  });

  router.post(
    '/webhooks/peac',
    (req: Request, res: Response, next) => {
      // Create webhook verifier for each request to pick up env changes
      const webhookVerifier = new WebhookVerifier(getWebhookConfig());
      return webhookVerifier.middleware()(req, res, next);
    },
    validateWebhookPayload,
    async (req: Request, res: Response) => {
      try {
        const payload = req.body as WebhookPayload;

        logger.info(
          {
            webhookType: payload.type,
            webhookId: payload.id,
            requestId: res.get('X-Request-Id'),
          },
          'Processing webhook',
        );

        // Process webhook based on type
        switch (payload.type) {
          case 'payment.succeeded':
            await eventEmitter.emit('PaymentSucceeded', {
              paymentId: payload.id,
              data: payload.data,
            });
            break;

          case 'payment.failed':
            await eventEmitter.emit('PaymentFailed', {
              paymentId: payload.id,
              data: payload.data,
            });
            break;

          case 'negotiation.updated':
            await eventEmitter.emit('NegotiationUpdated', {
              negotiationId: payload.id,
              data: payload.data,
            });
            break;

          default:
            logger.warn({ webhookType: payload.type }, 'Unknown webhook type');
            return problemDetails.send(res, 'validation_error', {
              detail: `Unknown webhook type: ${payload.type}`,
            });
        }

        // Success response
        res.status(204).end();
      } catch (error) {
        logger.error({ error, path: req.path }, 'Webhook processing failed');
        problemDetails.send(res, 'internal_error', {
          detail: 'Failed to process webhook',
        });
      }
    },
  );

  return router;
}
