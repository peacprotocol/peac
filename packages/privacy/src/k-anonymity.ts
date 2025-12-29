/**
 * k-Anonymity primitives for PEAC Protocol
 *
 * Provides k-anonymity checking for aggregated metrics to prevent
 * re-identification of individual transactions or users.
 *
 * Design decisions:
 * - k >= 20 threshold (configurable, but 20 is the minimum)
 * - NO differential privacy (no Laplace noise)
 * - Returns boolean (meets threshold or not)
 * - Simple counting-based approach
 */

/**
 * Default minimum k-anonymity threshold.
 * A group must have at least this many members to be reported.
 */
export const DEFAULT_K_THRESHOLD = 20;

/**
 * Result of a k-anonymity check
 */
export interface KAnonymityResult {
  /** Whether the group meets the k-anonymity threshold */
  meetsThreshold: boolean;
  /** Number of members in the group */
  groupSize: number;
  /** The k threshold that was checked against */
  kThreshold: number;
}

/**
 * Options for k-anonymity checking
 */
export interface KAnonymityOptions {
  /** Minimum group size required (default: 20) */
  kThreshold?: number;
}

/**
 * Check if a group size meets k-anonymity threshold
 *
 * @param groupSize - Number of members in the group
 * @param options - Configuration options
 * @returns Result indicating if threshold is met
 */
export function checkKAnonymity(
  groupSize: number,
  options: KAnonymityOptions = {}
): KAnonymityResult {
  const kThreshold = Math.max(options.kThreshold ?? DEFAULT_K_THRESHOLD, DEFAULT_K_THRESHOLD);

  return {
    meetsThreshold: groupSize >= kThreshold,
    groupSize,
    kThreshold,
  };
}

/**
 * Simple boolean check for k-anonymity
 *
 * @param groupSize - Number of members in the group
 * @param kThreshold - Minimum threshold (default: 20, minimum: 20)
 * @returns true if group meets threshold, false otherwise
 */
export function meetsKAnonymity(
  groupSize: number,
  kThreshold: number = DEFAULT_K_THRESHOLD
): boolean {
  return groupSize >= Math.max(kThreshold, DEFAULT_K_THRESHOLD);
}

/**
 * Metric bucket for aggregation
 */
export interface MetricBucket<T = unknown> {
  /** Unique key for this bucket (e.g., "bot:googlebot", "rail:stripe") */
  key: string;
  /** Number of entries in this bucket */
  count: number;
  /** Aggregated value (sum, average, etc.) */
  value: T;
}

/**
 * Filter buckets to only include those meeting k-anonymity threshold
 *
 * @param buckets - Array of metric buckets
 * @param options - Configuration options
 * @returns Filtered array containing only buckets that meet threshold
 */
export function filterByKAnonymity<T>(
  buckets: MetricBucket<T>[],
  options: KAnonymityOptions = {}
): MetricBucket<T>[] {
  const kThreshold = Math.max(options.kThreshold ?? DEFAULT_K_THRESHOLD, DEFAULT_K_THRESHOLD);
  return buckets.filter((bucket) => bucket.count >= kThreshold);
}

/**
 * Aggregate buckets that don't meet k-anonymity into an "other" bucket
 *
 * @param buckets - Array of metric buckets
 * @param aggregateFn - Function to aggregate values
 * @param options - Configuration options
 * @returns Array with small buckets aggregated into "other"
 */
export function aggregateSmallBuckets<T>(
  buckets: MetricBucket<T>[],
  aggregateFn: (values: T[]) => T,
  options: KAnonymityOptions = {}
): MetricBucket<T>[] {
  const kThreshold = Math.max(options.kThreshold ?? DEFAULT_K_THRESHOLD, DEFAULT_K_THRESHOLD);

  const passing: MetricBucket<T>[] = [];
  const failing: MetricBucket<T>[] = [];

  for (const bucket of buckets) {
    if (bucket.count >= kThreshold) {
      passing.push(bucket);
    } else {
      failing.push(bucket);
    }
  }

  // If failing buckets combined still don't meet threshold, suppress entirely
  const failingCount = failing.reduce((sum, b) => sum + b.count, 0);

  if (failing.length > 0 && failingCount >= kThreshold) {
    const otherBucket: MetricBucket<T> = {
      key: '__other__',
      count: failingCount,
      value: aggregateFn(failing.map((b) => b.value)),
    };
    return [...passing, otherBucket];
  }

  // Small buckets don't meet threshold even when combined - suppress them
  return passing;
}
