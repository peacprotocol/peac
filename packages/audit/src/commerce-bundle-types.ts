/**
 * Commerce evidence bundle types (experimental, DD-192).
 *
 * Cross-ecosystem commerce evidence correlation without aggregating
 * or asserting settlement totals. Non-aggregating by default.
 *
 * Promotion gate (must be met before removing -experimental suffix):
 * - At least 2 independent producers
 * - At least 1 independent verifier path
 * - Documented in a versioned spec
 */

/** Bundle format version */
export const COMMERCE_BUNDLE_VERSION = 'peac.commerce-bundle/0.1-experimental' as const;

/** Source discriminant for protocol-specific evidence */
export interface ProtocolEvidence {
  /** Protocol source identifier */
  source: string;
  /** Timestamp of the evidence capture */
  captured_at: string;
  /** Protocol-specific evidence data */
  data: Record<string, unknown>;
}

/** Timeline entry for chronological event tracking */
export interface TimelineEntry {
  /** Timestamp of the event */
  timestamp: string;
  /** Protocol source */
  source: string;
  /** Event description */
  event: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/** Individual observed amount (non-aggregated) */
export interface ObservedAmount {
  /** Protocol source that reported this amount */
  source: string;
  /** Amount in minor units (string for arbitrary precision) */
  amount: string;
  /** Currency code */
  currency: string;
  /** Semantic stage if known (e.g., "authorization", "settlement") */
  semantic_stage?: string;
}

/** Commerce summary: observation-set, NOT aggregation */
export interface CommerceSummary {
  /** Individual observed amounts from each source (not rolled up) */
  observed_amounts: ObservedAmount[];
  /** Currencies observed across all sources */
  currencies_observed: string[];
  /** Payment rails observed */
  rails_observed: string[];
  /** Count of protocol evidence snapshots */
  evidence_count: number;
}

/** Commerce evidence bundle */
export interface CommerceEvidenceBundle {
  /** Format version (includes -experimental suffix) */
  version: typeof COMMERCE_BUNDLE_VERSION;
  /** Cross-system transaction correlation ID */
  transaction_ref: string;
  /** Payment rails observed in this transaction */
  rails_observed: string[];
  /** Protocol-specific evidence snapshots */
  protocol_evidence: ProtocolEvidence[];
  /** Chronological event sequence */
  timeline: TimelineEntry[];
  /** Associated PEAC receipt references (receipt_ref hashes) */
  receipts: string[];
  /** Non-aggregating observation summary */
  summary: CommerceSummary;
  /** Bundle creation timestamp */
  created_at: string;
}

/** Options for creating a commerce evidence bundle */
export interface CreateCommerceBundleOptions {
  /** Cross-system transaction correlation ID */
  transaction_ref: string;
  /** Optional initial protocol evidence */
  evidence?: ProtocolEvidence[];
  /** Optional initial timeline entries */
  timeline?: TimelineEntry[];
  /** Optional initial receipt references */
  receipts?: string[];
  /** Optional creation timestamp (for deterministic output; defaults to now) */
  created_at?: string;
}

/**
 * Input record accepted by `groupByLifecycle`.
 *
 * Observational-only shape: callers provide the fields necessary for
 * grouping without passing the full signed record. `session_ref` is the
 * value the grouper keys on; records with the same `session_ref` end up
 * in the same `LifecycleBundle`.
 */
export interface LifecycleInputRecord {
  /** Session or transaction identifier shared across a lifecycle. */
  session_ref: string;
  /**
   * Observed commerce event name, per the upstream attestation. An
   * empty, missing, null, or non-string value routes the record to the
   * `unclassified` bucket; no event is synthesized.
   */
  commerce_event?: string | null;
  /** Issued-at time (RFC 3339 string or unix seconds). */
  iat: string | number;
  /** SHA-256 hash of the JWS (used for deterministic tie-breaking). */
  receipt_ref: string;
  /** Optional opaque passthrough so callers can carry the full record. */
  data?: Record<string, unknown>;
}

/**
 * Reserved bucket name for records whose `commerce_event` is absent,
 * null, empty, or not a string. No lifecycle semantics are inferred;
 * `unclassified` preserves the record as observed and never promotes
 * it into an interpreted bucket.
 */
export const UNCLASSIFIED_LIFECYCLE_BUCKET = 'unclassified' as const;

/**
 * One session's records grouped by the event name each record carries,
 * observational only. `buckets` keys are the literal `commerce_event`
 * values the upstream attested (or `'unclassified'` for records with
 * no event). Buckets with zero records are omitted.
 */
export interface LifecycleBundle {
  /** Session or transaction identifier shared by every record in the bundle. */
  session_ref: string;
  /** Per-event record lists, keyed by the upstream event name. */
  buckets: Record<string, LifecycleInputRecord[]>;
  /** Total number of records in the bundle (sum across buckets). */
  record_count: number;
  /** Bundle format version (same experimental constant as commerce bundles). */
  version: typeof COMMERCE_BUNDLE_VERSION;
}
