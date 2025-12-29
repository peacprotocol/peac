/**
 * Metrics API for PEAC Protocol Analytics
 *
 * Provides privacy-preserving analytics with k-anonymity protection.
 * Small groups are aggregated into "__other__" bucket or suppressed.
 */

import { DEFAULT_K_THRESHOLD, aggregateSmallBuckets, type MetricBucket } from '@peac/privacy';

import type {
  ReceiptEvent,
  RequestMetric,
  RevenueMetric,
  MetricsResponse,
  MetricsQueryOptions,
} from './types.js';

/**
 * Aggregate receipt events into request metrics by bot
 *
 * @param events - Raw receipt events
 * @param kThreshold - k-anonymity threshold (minimum 20)
 * @returns Request metrics with k-anonymity protection
 */
export function aggregateRequestsByBot(
  events: ReceiptEvent[],
  kThreshold: number = DEFAULT_K_THRESHOLD
): { metrics: RequestMetric[]; suppressed: boolean } {
  const effectiveK = Math.max(kThreshold, DEFAULT_K_THRESHOLD);

  // Group by bot ID
  const byBot = new Map<
    string,
    {
      requestCount: number;
      bytesTransferred: number;
      challengeCount: number;
      paymentCount: number;
    }
  >();

  for (const event of events) {
    const botId = event.botId ?? '__unknown__';
    const existing = byBot.get(botId) ?? {
      requestCount: 0,
      bytesTransferred: 0,
      challengeCount: 0,
      paymentCount: 0,
    };

    existing.requestCount++;
    existing.bytesTransferred += event.bytesTransferred ?? 0;
    if (event.wasChallenge) existing.challengeCount++;
    if (event.paymentSuccessful) existing.paymentCount++;

    byBot.set(botId, existing);
  }

  // Convert to buckets for k-anonymity filtering
  const buckets: MetricBucket<RequestMetric>[] = Array.from(byBot.entries()).map(
    ([botId, data]) => ({
      key: botId,
      count: data.requestCount,
      value: {
        botId,
        ...data,
      },
    })
  );

  // Aggregate small buckets
  const filtered = aggregateSmallBuckets(
    buckets,
    (values: RequestMetric[]) => ({
      botId: '__other__',
      requestCount: values.reduce((sum, v) => sum + v.requestCount, 0),
      bytesTransferred: values.reduce((sum, v) => sum + v.bytesTransferred, 0),
      challengeCount: values.reduce((sum, v) => sum + v.challengeCount, 0),
      paymentCount: values.reduce((sum, v) => sum + v.paymentCount, 0),
    }),
    { kThreshold: effectiveK }
  );

  const hadSuppression = filtered.length < buckets.length;
  const hasOther = filtered.some((b) => b.key === '__other__');

  return {
    metrics: filtered.map((b) => b.value),
    suppressed: hadSuppression && !hasOther,
  };
}

/**
 * Aggregate receipt events into revenue metrics by rail
 *
 * @param events - Raw receipt events
 * @param kThreshold - k-anonymity threshold (minimum 20)
 * @returns Revenue metrics with k-anonymity protection
 */
export function aggregateRevenueByRail(
  events: ReceiptEvent[],
  kThreshold: number = DEFAULT_K_THRESHOLD
): { metrics: RevenueMetric[]; suppressed: boolean } {
  const effectiveK = Math.max(kThreshold, DEFAULT_K_THRESHOLD);

  // Group by rail + currency
  const byRail = new Map<
    string,
    {
      railId: string;
      currency: string;
      totalMinorUnits: bigint;
      transactionCount: number;
    }
  >();

  for (const event of events) {
    if (!event.railId || !event.paymentSuccessful) continue;

    const currency = event.currency ?? 'USD';
    const key = `${event.railId}:${currency}`;
    const existing = byRail.get(key) ?? {
      railId: event.railId,
      currency,
      totalMinorUnits: 0n,
      transactionCount: 0,
    };

    existing.totalMinorUnits += event.amountMinorUnits ?? 0n;
    existing.transactionCount++;

    byRail.set(key, existing);
  }

  // Convert to buckets for k-anonymity filtering
  const buckets: MetricBucket<RevenueMetric>[] = Array.from(byRail.values()).map((data) => ({
    key: `${data.railId}:${data.currency}`,
    count: data.transactionCount,
    value: data,
  }));

  // For revenue, we aggregate small rails into "__other__"
  const filtered = aggregateSmallBuckets(
    buckets,
    (values: RevenueMetric[]) => {
      // Group by currency when aggregating
      const byCurrency = new Map<string, bigint>();
      let totalCount = 0;
      for (const v of values) {
        byCurrency.set(v.currency, (byCurrency.get(v.currency) ?? 0n) + v.totalMinorUnits);
        totalCount += v.transactionCount;
      }

      // Return the first currency found (simplification)
      const firstCurrency = values[0]?.currency ?? 'USD';
      return {
        railId: '__other__',
        currency: firstCurrency,
        totalMinorUnits: byCurrency.get(firstCurrency) ?? 0n,
        transactionCount: totalCount,
      };
    },
    { kThreshold: effectiveK }
  );

  const hadSuppression = filtered.length < buckets.length;
  const hasOther = filtered.some((b) => b.key.startsWith('__other__'));

  return {
    metrics: filtered.map((b) => b.value),
    suppressed: hadSuppression && !hasOther,
  };
}

/**
 * Generate metrics response from receipt events
 *
 * @param events - Raw receipt events
 * @param options - Query options
 * @returns Metrics response with k-anonymity protection
 */
export function generateMetrics(
  events: ReceiptEvent[],
  options: MetricsQueryOptions
): MetricsResponse {
  const kThreshold = Math.max(options.kThreshold ?? DEFAULT_K_THRESHOLD, DEFAULT_K_THRESHOLD);

  // Filter events by time range
  const start = new Date(options.timeRange.start).getTime();
  const end = new Date(options.timeRange.end).getTime();

  const filteredEvents = events.filter((e) => {
    const ts = new Date(e.timestamp).getTime();
    return ts >= start && ts <= end;
  });

  const requestResults = aggregateRequestsByBot(filteredEvents, kThreshold);
  const revenueResults = aggregateRevenueByRail(filteredEvents, kThreshold);

  return {
    timeRange: options.timeRange,
    requestsByBot: requestResults.metrics,
    revenueByRail: revenueResults.metrics,
    dataSuppressed: requestResults.suppressed || revenueResults.suppressed,
    kThreshold,
  };
}
