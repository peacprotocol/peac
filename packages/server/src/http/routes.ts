/* istanbul ignore file */
import { Router } from 'express';
import { handleVerify } from './verify';
import { handlePayment } from './payment';
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

  // Existing endpoints
  router.post('/verify', rateLimitMiddleware('verify'), handleVerify);
  router.post('/pay', rateLimitMiddleware('pay'), handlePayment);

  return router;
}
