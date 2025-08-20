/**
 * Prometheus Metrics for Webhook Operations
 * 
 * Provides webhook-specific metrics collection and reporting.
 */

import { Counter, Gauge, register } from 'prom-client';

/**
 * Webhook verification metrics
 */
const webhookVerificationTotal = new Counter({
  name: 'peac_webhook_verification_total',
  help: 'Total webhook verification attempts',
  labelNames: ['result', 'reason', 'verification_method', 'secret_version'],
  registers: [register],
});

const webhookVerificationDuration = new Gauge({
  name: 'peac_webhook_verification_duration_ms',
  help: 'Webhook verification duration in milliseconds',
  labelNames: [],
  registers: [register],
});

/**
 * Prometheus metrics interface for webhooks
 */
export const prometheus = {
  incrementCounter: (name: string, labels: Record<string, string>) => {
    if (name === 'webhook_verification_total') {
      webhookVerificationTotal.inc(labels);
    }
  },
  
  setGauge: (name: string, labels: Record<string, string>, value: number) => {
    if (name === 'webhook_verification_duration_ms') {
      webhookVerificationDuration.set(labels, value);
    }
  },
  
  getStats: () => ({
    webhook_verifications: webhookVerificationTotal,
    webhook_duration: webhookVerificationDuration,
  }),
};