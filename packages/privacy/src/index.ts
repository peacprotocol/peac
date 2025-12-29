/**
 * PEAC Privacy Pillar
 *
 * Privacy-preserving receipts, data protection, and privacy budgeting.
 *
 * Core features:
 * - k-Anonymity checking (k >= 20 threshold)
 * - Privacy-preserving hashing utilities
 * - Classification hints for data handling
 *
 * Design decisions:
 * - NO differential privacy (no Laplace noise)
 * - Simple boolean k-check (meets threshold or not)
 * - Deterministic hashing with optional salt
 */

export const PRIVACY_VERSION = '0.9.20';

// k-Anonymity primitives
export {
  DEFAULT_K_THRESHOLD,
  checkKAnonymity,
  meetsKAnonymity,
  filterByKAnonymity,
  aggregateSmallBuckets,
  type KAnonymityResult,
  type KAnonymityOptions,
  type MetricBucket,
} from './k-anonymity.js';

// Privacy-preserving hashing
export { hashIdentifier, hashUrl, hashEmail, hashIp } from './hash.js';

// Types
export type { PrivacyLevel, ClassificationHint, HashOptions, HashResult } from './types.js';
