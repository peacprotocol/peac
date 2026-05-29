/**
 * PEAC Analytics Surface
 *
 * Privacy-preserving analytics for PEAC Protocol with k-anonymity protection.
 *
 * This is a PRIVATE surface (not published to npm).
 * It provides metrics APIs for internal dashboards and reporting.
 *
 * Features:
 * - Request metrics by bot/agent (k-anonymity protected)
 * - Revenue metrics by payment rail (k-anonymity protected)
 * - Time-series aggregation
 *
 * k-Anonymity Rules:
 * - Minimum k = 20 (configurable, but cannot go lower)
 * - Small groups aggregated into "__other__" bucket
 * - If combined "__other__" still < k, data is suppressed entirely
 */

export const ANALYTICS_VERSION = '0.9.20';

// Re-export privacy primitives used by analytics
export { DEFAULT_K_THRESHOLD, meetsKAnonymity, checkKAnonymity } from '@peac/privacy';

// Metrics API
export { aggregateRequestsByBot, aggregateRevenueByRail, generateMetrics } from './metrics-api.js';

// Types
export type {
  TimeRange,
  TimeGranularity,
  BotClassification,
  RequestMetric,
  RevenueMetric,
  TimeSeriesPoint,
  MetricsResponse,
  ReceiptEvent,
  MetricsQueryOptions,
} from './types.js';
