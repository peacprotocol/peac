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
import { createEnhancedIdempotencyMiddleware } from '../middleware/enhanced-idempotency';
import { globalContentNegotiation } from './middleware/global-content-negotiation';
import { tracingMiddleware } from '../telemetry/tracing';
import { createNegotiationRouter } from '../negotiation/http';
import { createPaymentRouter } from '../payments/http';
import { createWebhookRouter } from '../webhooks/router';
import { createSLORouter } from '../slo/http';
import { createPrivacyRouter } from '../privacy/http';
import { prometheus } from '../metrics/prom';

export function createRoutes(sloManager?: any, dataProtection?: any) {
  const router = Router();

  // Create enhanced idempotency middleware
  const enhancedIdempotency = createEnhancedIdempotencyMiddleware();

  // Apply global middleware (order matters)
  router.use(requestTracing.middleware());
  router.use(tracingMiddleware()); // Add distributed tracing
  router.use(newSecurityHeaders.middleware());
  router.use(globalContentNegotiation);
  router.use(standardRateLimiter.middleware());
  router.use(greaseHandler.middleware());
  router.use(enhancedIdempotency.middleware());

  // Middleware to track HTTP requests in metrics
  router.use((req, res, next) => {
    // Track inflight requests
    prometheus.incrementGauge('inflight_requests', {}, 1);

    res.on('finish', () => {
      // Track completed requests
      prometheus.incrementGauge('inflight_requests', {}, -1);
      prometheus.incrementCounter('http_requests_total', {
        route: req.route?.path || req.path,
        method: req.method,
        status: res.statusCode.toString(),
      });
    });

    next();
  });

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

  // New API endpoints
  router.use('/', createNegotiationRouter());
  router.use('/', createPaymentRouter());
  router.use('/', createWebhookRouter());

  // SLO monitoring endpoints (conditional)
  if (sloManager) {
    router.use('/slo', createSLORouter(sloManager));
  }

  // Privacy and data protection endpoints (conditional)
  if (dataProtection) {
    router.use('/privacy', createPrivacyRouter(dataProtection));
  }

  return router;
}
