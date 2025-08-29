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
      'Location': '/.well-known/peac',
      'Link': '</.well-known/peac>; rel="canonical peac-policy"',
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
