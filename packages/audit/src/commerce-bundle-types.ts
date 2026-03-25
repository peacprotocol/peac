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
