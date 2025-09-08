/**
 * Performance budgets for PEAC API endpoints
 * CI fails if these budgets are exceeded
 */
export default {
  budgets: {
    '/receipts/issue': {
      p95: 3, // ms - without full crawler sync (async)
      p99: 5, // ms
    },
    '/receipts/verify': {
      p95: 1, // ms
      p99: 2, // ms
    },
    '/receipts/bulk-verify': {
      p95: 50, // ms
      p99: 100, // ms
    },
    '/.well-known/peac': {
      p95: 0.5, // ms - discovery should be very fast
      p99: 1, // ms
    },
  },

  // Global thresholds
  global: {
    errorRate: 0.01, // 1% max error rate
    availability: 0.99, // 99% availability SLO
    memoryMB: 100, // Peak RSS
  },

  // Crawler-specific SLOs
  crawler: {
    verifyP95: 35, // ms with Cloudflare
    localFallbackP95: 20, // ms local-only
    cacheHitRate: 0.7, // 70% minimum hit rate
  },
};
