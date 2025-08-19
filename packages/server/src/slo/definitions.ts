/**
 * PEAC Protocol v0.9.6 Service Level Objectives (SLO) Definitions
 *
 * Enterprise-grade SLO configuration with:
 * - Service Level Indicators (SLIs)
 * - Service Level Objectives (SLOs)
 * - Error budgets and burn rates
 * - Multi-window alerting strategies
 * - Business impact classification
 */

export interface SLI {
  name: string;
  description: string;
  query: string;
  unit: string;
  goodEventQuery?: string;
  totalEventQuery?: string;
}

export interface SLO {
  name: string;
  description: string;
  service: string;
  sli: string;
  objective: number; // e.g., 0.999 for 99.9%
  window: string; // e.g., '30d', '7d', '1h'
  alerting: {
    burnRateWindows: Array<{
      window: string;
      burnRate: number;
      severity: 'critical' | 'warning' | 'info';
    }>;
    errorBudgetRemaining: Array<{
      threshold: number; // percentage remaining
      severity: 'critical' | 'warning' | 'info';
    }>;
  };
  businessImpact: 'critical' | 'high' | 'medium' | 'low';
}

export interface AlertRule {
  name: string;
  description: string;
  expr: string;
  for: string;
  severity: 'critical' | 'warning' | 'info';
  labels: Record<string, string>;
  annotations: Record<string, string>;
  runbook?: string;
}

/**
 * Service Level Indicators for PEAC Protocol
 */
export const slis: Record<string, SLI> = {
  // Availability SLIs
  availability: {
    name: 'peac_availability',
    description: 'Percentage of successful HTTP requests',
    query: 'rate(http_requests_total{code!~"5.."}[5m]) / rate(http_requests_total[5m])',
    unit: 'ratio',
    goodEventQuery: 'rate(http_requests_total{code!~"5.."}[5m])',
    totalEventQuery: 'rate(http_requests_total[5m])',
  },

  // Latency SLIs
  latency_p95: {
    name: 'peac_latency_p95',
    description: '95th percentile request latency',
    query: 'histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m]))',
    unit: 'milliseconds',
  },

  latency_p99: {
    name: 'peac_latency_p99',
    description: '99th percentile request latency',
    query: 'histogram_quantile(0.99, rate(http_request_duration_ms_bucket[5m]))',
    unit: 'milliseconds',
  },

  // Payment-specific SLIs
  payment_success_rate: {
    name: 'peac_payment_success_rate',
    description: 'Percentage of successful payment processing',
    query: 'rate(payments_succeeded_total[5m]) / rate(payments_initiated_total[5m])',
    unit: 'ratio',
    goodEventQuery: 'rate(payments_succeeded_total[5m])',
    totalEventQuery: 'rate(payments_initiated_total[5m])',
  },

  payment_latency: {
    name: 'peac_payment_latency',
    description: 'Payment processing latency',
    query: 'histogram_quantile(0.95, rate(payment_duration_ms_bucket[5m]))',
    unit: 'milliseconds',
  },

  // Negotiation SLIs
  negotiation_acceptance_rate: {
    name: 'peac_negotiation_acceptance_rate',
    description: 'Percentage of negotiations that reach accepted state',
    query: 'rate(negotiations_accepted_total[5m]) / rate(negotiations_created_total[5m])',
    unit: 'ratio',
    goodEventQuery: 'rate(negotiations_accepted_total[5m])',
    totalEventQuery: 'rate(negotiations_created_total[5m])',
  },

  // Webhook SLIs
  webhook_delivery_success_rate: {
    name: 'peac_webhook_delivery_success',
    description: 'Percentage of successful webhook deliveries',
    query: 'rate(webhook_delivery_success_total[5m]) / rate(webhook_delivery_attempts_total[5m])',
    unit: 'ratio',
    goodEventQuery: 'rate(webhook_delivery_success_total[5m])',
    totalEventQuery: 'rate(webhook_delivery_attempts_total[5m])',
  },

  // Infrastructure SLIs
  error_rate: {
    name: 'peac_error_rate',
    description: 'Rate of 5xx errors',
    query: 'rate(http_requests_total{code=~"5.."}[5m])',
    unit: 'requests_per_second',
  },

  circuit_breaker_health: {
    name: 'peac_circuit_breaker_health',
    description: 'Percentage of circuit breakers in closed state',
    query: 'avg(circuit_breaker_state == 0)', // 0 = Closed, 1 = Open, 2 = Half-Open
    unit: 'ratio',
  },
};

/**
 * Service Level Objectives for PEAC Protocol
 */
export const slos: Record<string, SLO> = {
  // Critical SLOs - 99.9% uptime
  availability_monthly: {
    name: 'PEAC API Availability',
    description: 'API must be available 99.9% of the time over 30 days',
    service: 'peac-api',
    sli: 'availability',
    objective: 0.999, // 99.9%
    window: '30d',
    alerting: {
      burnRateWindows: [
        { window: '1h', burnRate: 14.4, severity: 'critical' }, // 2% budget in 1h
        { window: '6h', burnRate: 6, severity: 'critical' }, // 10% budget in 6h
        { window: '1d', burnRate: 3, severity: 'warning' }, // 20% budget in 1d
        { window: '3d', burnRate: 1, severity: 'warning' }, // 100% budget in 3d
      ],
      errorBudgetRemaining: [
        { threshold: 10, severity: 'critical' }, // < 10% budget remaining
        { threshold: 25, severity: 'warning' }, // < 25% budget remaining
      ],
    },
    businessImpact: 'critical',
  },

  // Payment SLOs
  payment_success_monthly: {
    name: 'Payment Success Rate',
    description: 'Payments must succeed 99.5% of the time over 30 days',
    service: 'peac-payments',
    sli: 'payment_success_rate',
    objective: 0.995, // 99.5%
    window: '30d',
    alerting: {
      burnRateWindows: [
        { window: '1h', burnRate: 14.4, severity: 'critical' },
        { window: '6h', burnRate: 6, severity: 'critical' },
        { window: '1d', burnRate: 3, severity: 'warning' },
      ],
      errorBudgetRemaining: [
        { threshold: 10, severity: 'critical' },
        { threshold: 25, severity: 'warning' },
      ],
    },
    businessImpact: 'critical',
  },

  // Latency SLOs
  latency_p95_weekly: {
    name: 'API Latency P95',
    description: '95% of requests must complete within 500ms over 7 days',
    service: 'peac-api',
    sli: 'latency_p95',
    objective: 500, // 500ms
    window: '7d',
    alerting: {
      burnRateWindows: [
        { window: '30m', burnRate: 14.4, severity: 'critical' },
        { window: '2h', burnRate: 6, severity: 'warning' },
      ],
      errorBudgetRemaining: [
        { threshold: 5, severity: 'critical' },
        { threshold: 15, severity: 'warning' },
      ],
    },
    businessImpact: 'high',
  },

  payment_latency_weekly: {
    name: 'Payment Processing Latency',
    description: '95% of payments must process within 2s over 7 days',
    service: 'peac-payments',
    sli: 'payment_latency',
    objective: 2000, // 2s
    window: '7d',
    alerting: {
      burnRateWindows: [
        { window: '30m', burnRate: 10, severity: 'critical' },
        { window: '2h', burnRate: 5, severity: 'warning' },
      ],
      errorBudgetRemaining: [
        { threshold: 10, severity: 'critical' },
        { threshold: 20, severity: 'warning' },
      ],
    },
    businessImpact: 'high',
  },

  // Webhook SLOs
  webhook_delivery_daily: {
    name: 'Webhook Delivery Success',
    description: 'Webhooks must deliver successfully 99% of the time over 24h',
    service: 'peac-webhooks',
    sli: 'webhook_delivery_success_rate',
    objective: 0.99, // 99%
    window: '1d',
    alerting: {
      burnRateWindows: [
        { window: '15m', burnRate: 14.4, severity: 'critical' },
        { window: '1h', burnRate: 6, severity: 'warning' },
      ],
      errorBudgetRemaining: [
        { threshold: 5, severity: 'critical' },
        { threshold: 15, severity: 'warning' },
      ],
    },
    businessImpact: 'medium',
  },
};

/**
 * Alert Rules based on SLO burn rates and error budgets
 */
export const alertRules: AlertRule[] = [
  // Fast burn rate alerts (critical)
  {
    name: 'PEACApiAvailabilityFastBurn',
    description: 'PEAC API availability SLO is burning error budget too fast',
    expr: `
      (
        1 - (
          rate(http_requests_total{code!~"5.."}[1h]) /
          rate(http_requests_total[1h])
        )
      ) > (14.4 * (1 - 0.999))
    `,
    for: '2m',
    severity: 'critical',
    labels: {
      service: 'peac-api',
      slo: 'availability',
      burn_rate: 'fast',
    },
    annotations: {
      summary: 'PEAC API availability SLO fast burn detected',
      description:
        'The PEAC API availability SLO is consuming error budget 14.4x faster than sustainable rate',
      runbook: 'https://runbooks.peac.dev/slo/availability-fast-burn',
    },
  },

  // Payment success rate alerts
  {
    name: 'PEACPaymentSuccessFastBurn',
    description: 'Payment success rate SLO is burning error budget too fast',
    expr: `
      (
        1 - (
          rate(payments_succeeded_total[1h]) /
          rate(payments_initiated_total[1h])
        )
      ) > (14.4 * (1 - 0.995))
    `,
    for: '2m',
    severity: 'critical',
    labels: {
      service: 'peac-payments',
      slo: 'payment_success',
      burn_rate: 'fast',
    },
    annotations: {
      summary: 'Payment success rate SLO fast burn detected',
      description: 'Payment success rate is dropping below SLO threshold',
      runbook: 'https://runbooks.peac.dev/slo/payment-success-fast-burn',
    },
  },

  // Latency threshold alerts
  {
    name: 'PEACApiLatencyThreshold',
    description: 'API latency exceeding SLO threshold',
    expr: 'histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m])) > 500',
    for: '5m',
    severity: 'warning',
    labels: {
      service: 'peac-api',
      slo: 'latency_p95',
    },
    annotations: {
      summary: 'PEAC API latency SLO threshold exceeded',
      description: 'P95 latency is {{ $value }}ms, above 500ms SLO threshold',
      runbook: 'https://runbooks.peac.dev/slo/latency-threshold',
    },
  },

  // Error budget depletion alerts
  {
    name: 'PEACApiErrorBudgetLow',
    description: 'PEAC API error budget is running low',
    expr: `
      (
        1 - (
          avg_over_time(
            (rate(http_requests_total{code!~"5.."}[5m]) / rate(http_requests_total[5m]))[30d:5m]
          )
        )
      ) / (1 - 0.999) > 0.75
    `,
    for: '5m',
    severity: 'warning',
    labels: {
      service: 'peac-api',
      slo: 'availability',
      budget: 'low',
    },
    annotations: {
      summary: 'PEAC API error budget is 75% depleted',
      description: 'Only 25% of monthly error budget remains for availability SLO',
      runbook: 'https://runbooks.peac.dev/slo/error-budget-low',
    },
  },

  // Circuit breaker health
  {
    name: 'PEACCircuitBreakerOpen',
    description: 'Circuit breakers are in open state',
    expr: 'avg(circuit_breaker_state) > 0.1', // More than 10% in non-closed state
    for: '1m',
    severity: 'warning',
    labels: {
      service: 'peac-api',
      component: 'circuit-breaker',
    },
    annotations: {
      summary: 'Circuit breakers are in degraded state',
      description: '{{ $value | humanizePercentage }} of circuit breakers are open or half-open',
      runbook: 'https://runbooks.peac.dev/circuit-breaker-open',
    },
  },

  // Webhook delivery alerts
  {
    name: 'PEACWebhookDeliveryFailure',
    description: 'Webhook delivery success rate below SLO',
    expr: `
      (
        rate(webhook_delivery_success_total[15m]) /
        rate(webhook_delivery_attempts_total[15m])
      ) < 0.99
    `,
    for: '5m',
    severity: 'warning',
    labels: {
      service: 'peac-webhooks',
      slo: 'delivery_success',
    },
    annotations: {
      summary: 'Webhook delivery success rate below SLO',
      description:
        'Webhook delivery success rate is {{ $value | humanizePercentage }}, below 99% SLO',
      runbook: 'https://runbooks.peac.dev/webhook-delivery-failure',
    },
  },

  // Infrastructure alerts
  {
    name: 'PEACHighErrorRate',
    description: 'High rate of 5xx errors detected',
    expr: 'rate(http_requests_total{code=~"5.."}[5m]) > 0.1',
    for: '2m',
    severity: 'critical',
    labels: {
      service: 'peac-api',
      type: 'error_rate',
    },
    annotations: {
      summary: 'High error rate detected',
      description:
        'Error rate is {{ $value }} errors/sec, indicating potential service degradation',
      runbook: 'https://runbooks.peac.dev/high-error-rate',
    },
  },

  // Resource utilization
  {
    name: 'PEACHighMemoryUsage',
    description: 'High memory usage detected',
    expr: 'process_resident_memory_bytes / (1024*1024*1024) > 1.0', // > 1GB
    for: '5m',
    severity: 'warning',
    labels: {
      service: 'peac-api',
      resource: 'memory',
    },
    annotations: {
      summary: 'High memory usage detected',
      description: 'Memory usage is {{ $value | humanize }}GB',
      runbook: 'https://runbooks.peac.dev/high-memory-usage',
    },
  },
];

/**
 * SLO Dashboard configuration for Grafana
 */
export const dashboardConfig = {
  title: 'PEAC Protocol SLO Dashboard',
  description: 'Service Level Objectives monitoring for PEAC Protocol v0.9.6',
  panels: [
    {
      title: 'API Availability SLO',
      type: 'stat',
      targets: [
        {
          expr: 'avg_over_time((rate(http_requests_total{code!~"5.."}[5m]) / rate(http_requests_total[5m]))[30d:5m])',
          legendFormat: 'Current',
        },
        {
          expr: '0.999',
          legendFormat: 'SLO Target',
        },
      ],
      thresholds: [0.999, 0.995, 0.99],
    },
    {
      title: 'Payment Success Rate SLO',
      type: 'stat',
      targets: [
        {
          expr: 'avg_over_time((rate(payments_succeeded_total[5m]) / rate(payments_initiated_total[5m]))[30d:5m])',
          legendFormat: 'Current',
        },
        {
          expr: '0.995',
          legendFormat: 'SLO Target',
        },
      ],
      thresholds: [0.995, 0.99, 0.98],
    },
    {
      title: 'Error Budget Burn Rate',
      type: 'timeseries',
      targets: [
        {
          expr: '1 - (rate(http_requests_total{code!~"5.."}[1h]) / rate(http_requests_total[1h]))',
          legendFormat: 'Current Burn Rate',
        },
        {
          expr: '(1 - 0.999) * 14.4', // Fast burn threshold
          legendFormat: 'Fast Burn Threshold',
        },
      ],
    },
  ],
};
