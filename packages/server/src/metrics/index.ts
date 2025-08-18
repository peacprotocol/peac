/* istanbul ignore file */
import { Registry, Counter, Histogram } from "prom-client";
export * from "./enhanced";

const register = new Registry();

export const metrics = {
  verifyTotal: new Counter({
    name: "peac_verify_total",
    help: "Count of /verify requests",
    labelNames: ["outcome"] as const,
    registers: [register],
  }),
  attributionCompliance: new Counter({
    name: "peac_attribution_compliance_total",
    help: "Attribution header compliance",
    labelNames: ["outcome"] as const,
    registers: [register],
  }),
  paymentAttempt: new Counter({
    name: "peac_payment_attempt_total",
    help: "Payment attempts and results",
    labelNames: ["provider", "outcome"] as const,
    registers: [register],
  }),
  negotiationLatency: new Histogram({
    name: "peac_negotiation_latency_seconds",
    help: "Latency of negotiation flows",
    labelNames: ["outcome"] as const,
    buckets: [0.1, 0.3, 0.5, 0.8, 1, 2, 5],
    registers: [register],
  }),
  propertyClaimsTotal: new Counter({
    name: "peac_property_claims_total",
    help: "Property claims (preview) counted during verification",
    labelNames: ["source", "valid"] as const, // source: descriptor | future sources
    registers: [register],
  }),
  redistributionTotal: new Counter({
    name: "peac_redistribution_total",
    help: "Redistribution hook (preview) outcomes after payment",
    labelNames: ["outcome", "mode"] as const, // outcome: applied|skipped|failed, mode: DIRECT_USDC|SETTLEMENT_CONTRACT
    registers: [register],
  }),
  // Enhanced metrics from PR-1
  httpRequestDuration: new Histogram({
    name: "peac_http_request_duration_seconds",
    help: "Duration of HTTP requests in seconds",
    labelNames: ["method", "route", "status"] as const,
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    registers: [register],
  }),
  httpRequestTotal: new Counter({
    name: "peac_http_requests_total",
    help: "Total number of HTTP requests",
    labelNames: ["method", "route", "status"] as const,
    registers: [register],
  }),
  contentNegotiationDuration: new Histogram({
    name: "peac_content_negotiation_duration_seconds",
    help: "Duration of content negotiation",
    labelNames: ["outcome"] as const,
    buckets: [0.001, 0.002, 0.005, 0.01, 0.02],
    registers: [register],
  }),
  contentNegotiationRejections: new Counter({
    name: "peac_content_negotiation_rejections_total",
    help: "Total content negotiation rejections (406)",
    labelNames: ["path"] as const,
    registers: [register],
  }),
  protocolEvents: new Counter({
    name: "peac_protocol_events_total",
    help: "Total protocol events emitted",
    labelNames: ["type"] as const,
    registers: [register],
  }),
  dpopValidationErrors: new Counter({
    name: "peac_dpop_validation_errors_total",
    help: "Total DPoP validation errors",
    labelNames: ["reason"] as const,
    registers: [register],
  }),
  rateLimitAllowed: new Counter({
    name: "peac_rate_limit_allowed_total",
    help: "Total requests allowed by rate limiter",
    labelNames: ["key"] as const,
    registers: [register],
  }),
  rateLimitExceeded: new Counter({
    name: "peac_rate_limit_exceeded_total",
    help: "Total requests rejected by rate limiter",
    labelNames: ["key"] as const,
    registers: [register],
  }),
  readinessCheckFailures: new Counter({
    name: "peac_readiness_check_failures_total",
    help: "Total readiness check failures",
    registers: [register],
  }),
};

export function getMetricsRegistry() {
  return register;
}

// Re-export the registry for metrics endpoint
export { register as metricsRegistry };
