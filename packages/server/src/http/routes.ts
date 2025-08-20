/* istanbul ignore file */
import { Router } from 'express';
import { handleVerify } from './verify';
import { rateLimitMiddleware } from '../middleware/rateLimit';
import { handleWellKnown } from './wellKnown';
import { handleCapabilities } from './wellKnown/capabilities.handler';
import { handleJWKS } from './wellKnown/jwks.handler';
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
  validateContentType 
} from './agreements';
import { 
  handlePaymentCharge,
  handleLegacyPayment,
  validateAgreementBinding 
} from '../payments/http';
import { createWebhookRouter } from '../webhooks/router';

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
  router.get(
    '/.well-known/peac-capabilities',
    standardRateLimiter.middleware(),
    handleCapabilities,
  );
  router.get('/.well-known/jwks.json', standardRateLimiter.middleware(), handleJWKS);

  // Agreement-first API endpoints (v0.9.6)
  router.post('/peac/agreements', 
    validateProtocolVersion,
    validateContentType,
    standardRateLimiter.middleware(),
    createAgreement
  );
  
  router.get('/peac/agreements/:id',
    standardRateLimiter.middleware(), 
    getAgreement
  );
  
  // Deprecated negotiation alias (backward compatibility)
  router.post('/peac/negotiate',
    validateProtocolVersionWithDeprecation,
    validateContentType, 
    standardRateLimiter.middleware(),
    handleNegotiateAlias
  );

  // Agreement-bound payment endpoints (v0.9.6)
  router.post('/peac/payments/charges',
    validateProtocolVersion,
    validateContentType,
    validateAgreementBinding,
    standardRateLimiter.middleware(),
    handlePaymentCharge
  );

  // Webhook endpoints (no protocol version required)
  router.use('/webhooks', createWebhookRouter());

  // Existing endpoints (legacy behavior maintained)
  router.post('/verify', rateLimitMiddleware('verify'), handleVerify);
  router.post('/pay', rateLimitMiddleware('pay'), handleLegacyPayment);

  return router;
}
