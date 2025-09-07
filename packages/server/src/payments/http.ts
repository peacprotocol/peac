/**
 * Agreement-Bound Payment Handlers for PEAC Protocol v0.9.6
 *
 * Implements payment processing with mandatory agreement binding via X-PEAC-Agreement header.
 * All payment operations must reference a valid agreement.
 */

import type { Request, Response, NextFunction } from 'express';
import {
  PaymentChargeRequest,
  PaymentReceipt,
  extractAgreementId,
  isAgreementValid,
  Agreement,
} from '@peacprotocol/schema';
import { problemDetails } from '../http/problems';
import { logger } from '../logging';
import { metrics } from '../metrics';
import { paymentGuards } from './guards';
import { agreementStore } from '../agreements/store';

/**
 * Request with attached agreement from middleware
 */
interface AgreementRequest extends Request {
  agreement?: Agreement;
}

/**
 * Type definition for payment providers
 */
type PaymentProvider = {
  processPayment(body: unknown): Promise<string>;
};

/**
 * Load payment provider based on environment configuration
 */
async function loadProvider(): Promise<{
  name: 'x402' | 'stripe' | 'mock';
  Provider: new () => PaymentProvider;
}> {
  // Default to mock in test environments
  const defaultProvider = process.env.NODE_ENV === 'test' ? 'mock' : 'x402';
  const mode = (process.env.PAYMENT_PROVIDER || defaultProvider).toLowerCase();

  if (mode === 'mock') {
    const mod = await import('./providers/mock');
    return { name: 'mock', Provider: mod.MockPaymentProvider };
  }

  if (mode === 'stripe') {
    const mod = await import('./stripe-credits');
    return { name: 'stripe', Provider: mod.StripeCreditsProvider };
  }

  const mod = await import('../x402');
  return { name: 'x402', Provider: mod.X402Provider };
}

/**
 * Validate agreement binding middleware
 */
export function validateAgreementBinding(req: Request, res: Response, next: NextFunction): void {
  const agreementHeader = req.get('X-PEAC-Agreement');

  if (!agreementHeader) {
    return problemDetails.send(res, 'invalid_reference', {
      detail: 'X-PEAC-Agreement header is required for payment operations',
      required_header: 'X-PEAC-Agreement',
    });
  }

  const agreementId = extractAgreementId(agreementHeader);
  if (!agreementId) {
    return problemDetails.send(res, 'invalid_reference', {
      detail: 'Invalid agreement ID format in X-PEAC-Agreement header',
      provided: agreementHeader,
      expected_format: 'agr_<ulid>',
    });
  }

  // Find agreement using shared store
  const agreement = agreementStore.get(agreementId);
  if (!agreement) {
    return problemDetails.send(res, 'invalid_reference', {
      detail: `Agreement ${agreementId} not found`,
      agreement_id: agreementId,
    });
  }

  // Check agreement.status === 'valid'
  if (agreement.status !== 'valid') {
    return problemDetails.send(res, 'invalid_reference', {
      detail: `Agreement ${agreementId} is not valid`,
      agreement_id: agreementId,
      agreement_status: agreement.status,
      reason: agreement.reason,
    });
  }

  // Validate agreement expiration
  if (!isAgreementValid(agreement)) {
    return problemDetails.send(res, 'invalid_reference', {
      detail: `Agreement ${agreementId} has expired`,
      agreement_id: agreementId,
      agreement_status: agreement.status,
      expires_at: agreement.expires_at,
    });
  }

  // Optional fingerprint verification
  const expectedFingerprint = req.get('X-PEAC-Fingerprint');
  if (expectedFingerprint && expectedFingerprint !== agreement.fingerprint) {
    return problemDetails.send(res, 'agreement_mismatch', {
      detail: `Agreement fingerprint mismatch`,
      agreement_id: agreementId,
      expected_fingerprint: expectedFingerprint,
      actual_fingerprint: agreement.fingerprint,
    });
  }

  // Attach agreement to request for handler use
  (req as AgreementRequest).agreement = agreement;
  next();
}

/**
 * POST /peac/payments/charges
 * Process payment charge with agreement binding
 */
export async function handlePaymentCharge(req: Request, res: Response): Promise<void> {
  try {
    // Extract agreement from middleware
    const agreement = (req as AgreementRequest).agreement;
    if (!agreement) {
      return problemDetails.send(res, 'internal_error', {
        detail: 'Agreement validation middleware failed',
      });
    }

    // Validate payment request structure
    const paymentRequest = req.body as PaymentChargeRequest;
    if (!paymentRequest.amount || typeof paymentRequest.amount !== 'string') {
      return problemDetails.send(res, 'validation_error', {
        detail: 'Invalid payment amount',
      });
    }

    // Load and validate payment provider
    const { name, Provider } = await loadProvider();

    // Validate payment attempt with guards
    const amount = parseInt(paymentRequest.amount, 10);
    paymentGuards.validatePaymentAttempt(name, amount);

    metrics.paymentAttempt.inc({ provider: name, outcome: 'attempt' });

    // Process payment through provider
    const provider = new Provider();
    const session = await provider.processPayment({
      ...paymentRequest,
      agreement_id: agreement.id,
      agreement_fingerprint: agreement.fingerprint,
    });

    // Generate payment receipt
    const receipt: PaymentReceipt = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`, // Better ID generation needed
      amount: paymentRequest.amount,
      currency: paymentRequest.currency || 'USD',
      agreement_id: agreement.id,
      agreement_fingerprint: agreement.fingerprint,
      created_at: new Date().toISOString(),
      status: 'completed',
      metadata: {
        provider: name,
        session,
        ...paymentRequest.metadata,
      },
    };

    logger.info(
      {
        paymentId: receipt.id,
        agreementId: agreement.id,
        amount: paymentRequest.amount,
        provider: name,
      },
      'Payment processed successfully'
    );

    res.setHeader('Authorization', `Bearer ${session}`);
    res.status(200).json(receipt);

    metrics.paymentAttempt.inc({ provider: name, outcome: 'success' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'payment_failed';
    const defaultProvider = process.env.NODE_ENV === 'test' ? 'mock' : 'x402';
    const label = (process.env.PAYMENT_PROVIDER || defaultProvider).toLowerCase();

    logger.error(
      {
        error: message,
        agreementId: (req as AgreementRequest).agreement?.id,
        amount: req.body?.amount,
      },
      'Payment processing failed'
    );

    metrics.paymentAttempt.inc({
      provider: label as 'x402' | 'stripe' | 'mock',
      outcome: 'failure',
    });

    return problemDetails.send(res, 'internal_error', {
      detail: 'Payment processing failed',
      error: message,
    });
  }
}

/**
 * Legacy payment handler (backward compatibility)
 * Redirects to new agreement-bound handler if X-PEAC-Agreement is present
 */
export async function handleLegacyPayment(req: Request, res: Response): Promise<void> {
  // Check if agreement header is present (new behavior)
  const agreementHeader = req.get('X-PEAC-Agreement');

  if (agreementHeader) {
    logger.info(
      {
        path: req.path,
        agreementId: agreementHeader,
      },
      'Legacy payment endpoint used with agreement binding'
    );

    // Validate agreement and forward to new handler
    return validateAgreementBinding(req, res, () => handlePaymentCharge(req, res));
  }

  // Original legacy behavior (no agreement binding)
  logger.warn(
    {
      path: req.path,
      userAgent: req.get('User-Agent'),
    },
    'Legacy payment endpoint used without agreement binding'
  );

  try {
    const { name, Provider } = await loadProvider();
    metrics.paymentAttempt.inc({ provider: name, outcome: 'attempt' });

    const provider = new Provider();
    const session = await provider.processPayment(req.body as unknown);

    res.setHeader('Authorization', `Bearer ${session}`);
    res.status(200).json({ ok: true, session });

    metrics.paymentAttempt.inc({ provider: name, outcome: 'success' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'payment_failed';
    const defaultProvider = process.env.NODE_ENV === 'test' ? 'mock' : 'x402';
    const label = (process.env.PAYMENT_PROVIDER || defaultProvider).toLowerCase();

    metrics.paymentAttempt.inc({
      provider: label as 'x402' | 'stripe' | 'mock',
      outcome: 'failure',
    });

    return problemDetails.send(res, 'internal_error', {
      detail: 'Payment processing failed',
      error: message,
    });
  }
}

/**
 * Get payment statistics (for monitoring)
 */
export function getPaymentStats() {
  return {
    guards: paymentGuards.getStatus(),
    processing_enabled: paymentGuards.canProcessPayments(),
  };
}
