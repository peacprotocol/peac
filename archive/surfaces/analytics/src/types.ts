/**
 * Analytics types for PEAC Protocol
 *
 * Metrics schema inspired by TollBit-style analytics:
 * - Requests by bot/agent
 * - Revenue by source/rail
 * - Volume metrics with k-anonymity protection
 */

/**
 * Time range for metrics queries
 */
export interface TimeRange {
  /** Start of range (ISO 8601) */
  start: string;
  /** End of range (ISO 8601) */
  end: string;
}

/**
 * Granularity for time-series data
 */
export type TimeGranularity = 'hour' | 'day' | 'week' | 'month';

/**
 * Bot/agent classification
 */
export interface BotClassification {
  /** Bot identifier (e.g., "googlebot", "gpt-crawler") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Category (search, ai, social, other) */
  category: 'search' | 'ai' | 'social' | 'other';
  /** Organization (e.g., "Google", "OpenAI") */
  organization?: string;
}

/**
 * Request metric data point
 */
export interface RequestMetric {
  /** Bot/agent ID or "__other__" for aggregated small groups */
  botId: string;
  /** Number of requests (k-anonymity protected) */
  requestCount: number;
  /** Total bytes transferred */
  bytesTransferred: number;
  /** Number of 402 challenges issued */
  challengeCount: number;
  /** Number of successful payments */
  paymentCount: number;
}

/**
 * Revenue metric data point
 */
export interface RevenueMetric {
  /** Payment rail ID (e.g., "stripe", "x402", "razorpay") */
  railId: string;
  /** Total revenue in minor units (e.g., cents) */
  totalMinorUnits: bigint;
  /** Currency code (ISO 4217) */
  currency: string;
  /** Number of transactions */
  transactionCount: number;
}

/**
 * Time-series data point
 */
export interface TimeSeriesPoint<T> {
  /** Timestamp (start of period) */
  timestamp: string;
  /** Metric value */
  value: T;
}

/**
 * Aggregated metrics response
 */
export interface MetricsResponse {
  /** Time range of the query */
  timeRange: TimeRange;
  /** Request metrics by bot (k-anonymity protected) */
  requestsByBot: RequestMetric[];
  /** Revenue metrics by rail (k-anonymity protected) */
  revenueByRail: RevenueMetric[];
  /** Whether any data was suppressed due to k-anonymity */
  dataSuppressed: boolean;
  /** k-anonymity threshold used */
  kThreshold: number;
}

/**
 * Raw receipt event for analytics ingestion
 */
export interface ReceiptEvent {
  /** Receipt ID */
  receiptId: string;
  /** Timestamp of receipt */
  timestamp: string;
  /** Bot/agent ID (from subject profile or user-agent) */
  botId?: string;
  /** Payment rail used */
  railId?: string;
  /** Amount in minor units */
  amountMinorUnits?: bigint;
  /** Currency code */
  currency?: string;
  /** Bytes transferred */
  bytesTransferred?: number;
  /** Whether this was a 402 challenge */
  wasChallenge: boolean;
  /** Whether payment was successful */
  paymentSuccessful: boolean;
}

/**
 * Options for metrics queries
 */
export interface MetricsQueryOptions {
  /** Time range */
  timeRange: TimeRange;
  /** Granularity for time-series (optional) */
  granularity?: TimeGranularity;
  /** Custom k-anonymity threshold (minimum 20) */
  kThreshold?: number;
}
