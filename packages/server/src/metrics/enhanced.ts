import { Counter, Histogram, register } from 'prom-client';

// Content negotiation metrics
export const contentNegotiationDuration = new Histogram({
  name: 'peac_content_negotiation_duration_seconds',
  help: 'Duration of content negotiation',
  labelNames: ['outcome'],
  buckets: [0.001, 0.002, 0.005, 0.01, 0.02],
});

export const contentNegotiationRejections = new Counter({
  name: 'peac_content_negotiation_rejections_total',
  help: 'Total content negotiation rejections (406)',
  labelNames: ['path'],
});

// Protocol event metrics
export const protocolEvents = new Counter({
  name: 'peac_protocol_events_total',
  help: 'Total protocol events emitted',
  labelNames: ['type'],
});

// DPoP metrics
export const dpopValidationErrors = new Counter({
  name: 'peac_dpop_validation_errors_total',
  help: 'Total DPoP validation errors',
  labelNames: ['reason'],
});

// Rate limit metrics
export const rateLimitAllowed = new Counter({
  name: 'peac_rate_limit_allowed_total',
  help: 'Total requests allowed by rate limiter',
  labelNames: ['key'],
});

export const rateLimitExceeded = new Counter({
  name: 'peac_rate_limit_exceeded_total',
  help: 'Total requests rejected by rate limiter',
  labelNames: ['key'],
});

// Readiness metrics
export const readinessCheckFailures = new Counter({
  name: 'peac_readiness_check_failures_total',
  help: 'Total readiness check failures',
});

// Idempotency metrics
export const idempotencyHits = new Counter({
  name: 'peac_idempotency_hits_total',
  help: 'Total idempotent cache hits',
  labelNames: ['path'],
});

export const idempotencyStores = new Counter({
  name: 'peac_idempotency_stores_total',
  help: 'Total idempotent responses stored',
  labelNames: ['path'],
});

// Register all metrics
register.registerMetric(contentNegotiationDuration);
register.registerMetric(contentNegotiationRejections);
register.registerMetric(protocolEvents);
register.registerMetric(dpopValidationErrors);
register.registerMetric(rateLimitAllowed);
register.registerMetric(rateLimitExceeded);
register.registerMetric(readinessCheckFailures);
register.registerMetric(idempotencyHits);
register.registerMetric(idempotencyStores);
