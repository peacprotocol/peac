/* istanbul ignore file */
import { Registry, Counter, Histogram } from 'prom-client';

const register = new Registry();

export const metrics = {
  verifyTotal: new Counter({
    name: 'peac_verify_total',
    help: 'Count of /verify requests',
    labelNames: ['outcome'] as const,
    registers: [register],
  }),
  attributionCompliance: new Counter({
    name: 'peac_attribution_compliance_total',
    help: 'Attribution header compliance',
    labelNames: ['outcome'] as const,
    registers: [register],
  }),
  paymentAttempt: new Counter({
    name: 'peac_payment_attempt_total',
    help: 'Payment attempts and results',
    labelNames: ['provider', 'outcome'] as const,
    registers: [register],
  }),
  negotiationLatency: new Histogram({
    name: 'peac_negotiation_latency_seconds',
    help: 'Latency of negotiation flows',
    labelNames: ['outcome'] as const,
    buckets: [0.1, 0.3, 0.5, 0.8, 1, 2, 5],
    registers: [register],
  }),
  propertyClaimsTotal: new Counter({
    name: 'peac_property_claims_total',
    help: 'Property claims (preview) counted during verification',
    labelNames: ['source', 'valid'] as const, // source: descriptor | future sources
    registers: [register],
  }),
  redistributionTotal: new Counter({
    name: 'peac_redistribution_total',
    help: 'Redistribution hook (preview) outcomes after payment',
    labelNames: ['outcome', 'mode'] as const, // outcome: applied|skipped|failed, mode: DIRECT_USDC|SETTLEMENT_CONTRACT
    registers: [register],
  }),
};

export function getMetricsRegistry() {
  return register;
}
