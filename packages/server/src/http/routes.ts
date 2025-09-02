/* istanbul ignore file */
import { Router } from 'express';
import { handleVerify } from './verify';
import { handleWellKnown } from './wellKnown';
import { handleCapabilities } from './wellKnown/capabilities.handler';
import { handlePolicy } from './wellKnown/policy.handler';
import { handleLiveness, handleReadiness } from '../health/handlers';
import { greaseHandler } from '../ext/grease';
import { standardRateLimiter } from '../middleware/enhanced-rate-limit';
import { securityHeaders as newSecurityHeaders } from './middleware/security-headers';
import { requestTracing } from './middleware/request-tracing';
import { idempotencyMiddleware } from '../middleware/idempotency';
import {
  createAgreement,
  getAgreement,
  handleNegotiateAlias,
  validateProtocolVersion,
  validateProtocolVersionWithDeprecation,
  validateContentType,
} from './agreements';
import {
  handlePaymentCharge,
  handleLegacyPayment,
  validateAgreementBinding,
} from '../payments/http';
import webhookRouter from '../webhooks/router';
import { metrics } from '../metrics';
import { keyStore, exportJWKS } from '../core/keys';
import { handleBatchVerifyPost, handleBatchVerifyGet } from './verify-endpoint';
import { receiptStore } from '../core/receipt-store';
import { exportHandler } from './export';
import crypto from 'crypto';

export function createRoutes() {
  const router = Router();

  // Apply global middleware (order matters)
  router.use(requestTracing.middleware());
  router.use(newSecurityHeaders.middleware());
  router.use(greaseHandler.middleware());
  router.use(idempotencyMiddleware.middleware());

  // Health endpoints (no rate limiting)
  router.get('/health/live', handleLiveness);
  router.get('/health/ready', handleReadiness);

  // Well-known endpoints
  router.get('/.well-known/peac.json', handleWellKnown);
  router.get('/.well-known/peac', handlePolicy);
  router.get('/.well-known/peac.txt', (_req, res) => {
    try {
      metrics.peacTxtSeen?.inc();
    } catch {
      // Metric optional in test environment
    }

    res.status(308);
    res.set({
      Location: '/.well-known/peac',
      Link: '</.well-known/peac>; rel="canonical peac-policy"',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
      'Content-Length': '0',
    });
    res.end();
  });
  router.get(
    '/.well-known/peac-capabilities',
    standardRateLimiter.middleware(),
    handleCapabilities,
  );

  // JWKS endpoint for receipt verification
  router.get('/.well-known/peac/jwks.json', async (_req, res) => {
    try {
      const keys = await keyStore.getAllPublic();
      const jwks = exportJWKS(keys);

      res.set({
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400',
        ETag: `"${crypto.createHash('sha256').update(JSON.stringify(jwks)).digest('hex').substring(0, 16)}"`,
      });

      res.json(jwks);
    } catch (error) {
      res.status(500).json({
        type: 'https://peac.dev/problems/internal-error',
        title: 'Internal Server Error',
        status: 500,
      });
    }
  });

  // Batch verify endpoints
  router.post('/.well-known/peac/verify', standardRateLimiter.middleware(), handleBatchVerifyPost);
  router.get('/.well-known/peac/verify', standardRateLimiter.middleware(), handleBatchVerifyGet);

  // Export endpoint (authenticated)
  router.get('/.well-known/peac/export', exportHandler);

  // Receipt hosting endpoint
  router.get('/.well-known/peac/receipts/:jti', async (req, res) => {
    try {
      const { jti } = req.params;

      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(jti)) {
        res.status(400).json({
          type: 'https://peac.dev/problems/invalid-jti',
          title: 'Invalid JTI',
          status: 400,
          detail: 'JTI must be a valid UUID',
        });
        return;
      }

      const jws = await receiptStore.get(jti);
      if (!jws) {
        res.status(404).json({
          type: 'https://peac.dev/problems/receipt-not-found',
          title: 'Receipt Not Found',
          status: 404,
          detail: `Receipt with JTI ${jti} not found or expired`,
        });
        return;
      }

      res.set({
        'Content-Type': 'application/jose',
        'Cache-Control': 'public, max-age=86400, immutable',
      });

      res.send(jws);
    } catch (error) {
      res.status(500).json({
        type: 'https://peac.dev/problems/internal-error',
        title: 'Internal Server Error',
        status: 500,
      });
    }
  });

  // Agreement-first API endpoints (v0.9.6)
  router.post('/peac/agreements', validateProtocolVersion, validateContentType, createAgreement);

  router.get('/peac/agreements/:id', getAgreement);

  // Deprecated negotiation alias (backward compatibility)
  router.post(
    '/peac/negotiate',
    validateProtocolVersionWithDeprecation,
    validateContentType,
    handleNegotiateAlias,
  );

  // Agreement-bound payment endpoints (v0.9.6)
  router.post(
    '/peac/payments/charges',
    validateProtocolVersion,
    validateContentType,
    validateAgreementBinding,
    handlePaymentCharge,
  );

  // Webhook endpoints (no protocol version required)
  router.use('/webhooks', webhookRouter);

  // Existing endpoints (legacy behavior maintained)
  router.post('/verify', handleVerify);
  router.post('/pay', handleLegacyPayment);

  return router;
}
