/**
 * Webhook Router for PEAC Protocol v0.9.6
 *
 * Handles incoming webhook requests with HMAC verification and replay protection.
 */

import express, { Router, Request, Response } from 'express';
import { verifyWebhookRequest } from './verify';
import { logger } from '../logging';
import { problemDetails } from '../http/problems';

/**
 * Create webhook router with verification middleware
 */
const router = Router();

// Capture raw bytes but still let express parse JSON for req.body
router.use(
  '/peac',
  express.json({
    verify: (req, _res, buf) => {
      (req as Request).rawBody = Buffer.from(buf);
    },
    type: () => true, // accept vendor JSON types too
    strict: false,
  }),
);

/**
 * POST /peac (mounted at /webhooks, so full path is /webhooks/peac)
 * Main webhook endpoint with HMAC verification and no-op processing
 */
router.post('/peac', async (req: Request, res: Response) => {
  try {
    // Verify webhook signature using new robust verification
    const webhookSecret = process.env.PEAC_WEBHOOK_SECRET || 'test_secret';
    const timestamp = verifyWebhookRequest(req, webhookSecret);

    logger.info(
      {
        webhookType: req.body?.type || 'unknown',
        deliveryId: req.get('Peac-Delivery-Id'),
        timestamp,
        bodyTimestamp: req.body?.timestamp,
      },
      'Webhook received and verified',
    );

    // Process webhook payload as no-op
    await processWebhookPayload(req.body);

    // Return 204 No Content for successful webhook processing
    res.status(204).end();
  } catch (error) {
    if (error instanceof Error && error.message.includes('signature')) {
      logger.warn(
        {
          error: error.message,
          webhookType: req.body?.type,
          hasSignature: !!req.get('Peac-Signature'),
          hasTimestamp: !!req.get('Peac-Timestamp'),
        },
        'Webhook signature verification failed',
      );

      return problemDetails.send(res, 'webhook_signature_invalid', {
        detail: error.message,
      });
    }

    logger.error(
      {
        error: error instanceof Error ? error.message : 'unknown',
        webhookType: req.body?.type,
      },
      'Webhook processing failed',
    );

    return problemDetails.send(res, 'internal_error', {
      detail: 'Webhook processing failed',
    });
  }
});

// GET /peac/stats — minimal, no secrets
router.get('/peac/stats', (_req: Request, res: Response) => {
  try {
    const stats = {
      status: 'active',
      verification: 'hmac-sha256',
      supported_events: [
        'agreement.created',
        'agreement.updated',
        'payment.completed',
        'payment.failed',
      ],
      timestamp: new Date().toISOString(),
    };
    res.json(stats);
  } catch (error) {
    logger.error({ error }, 'Failed to get webhook stats');
    return problemDetails.send(res, 'internal_error', {
      detail: 'Failed to retrieve webhook statistics',
    });
  }
});

/**
 * Process webhook payload based on type
 */
async function processWebhookPayload(payload: unknown): Promise<void> {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid webhook payload');
  }

  const webhookData = payload as Record<string, unknown>;
  const type = webhookData.type;

  logger.debug({ type, payload }, 'Processing webhook payload');

  switch (type) {
    case 'agreement.created':
      await handleAgreementCreated(webhookData);
      break;

    case 'agreement.updated':
      await handleAgreementUpdated(webhookData);
      break;

    case 'payment.completed':
      await handlePaymentCompleted(webhookData);
      break;

    case 'payment.failed':
      await handlePaymentFailed(webhookData);
      break;

    default:
      logger.warn({ type }, 'Unknown webhook type received');
      // Don't throw error for unknown types - just log and continue
      break;
  }
}

/**
 * Handle agreement creation webhook
 */
async function handleAgreementCreated(data: Record<string, unknown>): Promise<void> {
  logger.info(
    {
      agreementId: data.agreement_id,
      timestamp: data.timestamp,
    },
    'Processing agreement.created webhook',
  );

  // NOTE: agreement.created received — handled as no-op, 204 returned
}

/**
 * Handle agreement update webhook
 */
async function handleAgreementUpdated(data: Record<string, unknown>): Promise<void> {
  logger.info(
    {
      agreementId: data.agreement_id,
      changes: data.changes,
      timestamp: data.timestamp,
    },
    'Processing agreement.updated webhook',
  );

  // NOTE: agreement.updated received — handled as no-op, 204 returned
}

/**
 * Handle payment completion webhook
 */
async function handlePaymentCompleted(data: Record<string, unknown>): Promise<void> {
  logger.info(
    {
      paymentId: data.payment_id,
      agreementId: data.agreement_id,
      amount: data.amount,
      timestamp: data.timestamp,
    },
    'Processing payment.completed webhook',
  );

  // NOTE: payment.completed received — handled as no-op, 204 returned
}

/**
 * Handle payment failure webhook
 */
async function handlePaymentFailed(data: Record<string, unknown>): Promise<void> {
  logger.warn(
    {
      paymentId: data.payment_id,
      agreementId: data.agreement_id,
      reason: data.reason,
      timestamp: data.timestamp,
    },
    'Processing payment.failed webhook',
  );

  // NOTE: payment.failed received — handled as no-op, 204 returned
}

export default router;
