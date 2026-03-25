/**
 * Commerce evidence bundle (experimental, DD-192).
 *
 * Cross-ecosystem commerce evidence correlation. Correlates receipts
 * across payment rails without aggregating or asserting settlement totals.
 *
 * Summary is non-aggregating by default: observed_amounts lists each
 * source's observation independently. A canonical total may only be
 * derived when same currency, same semantic stage, and an explicit
 * authoritative-winner rule is documented and tested.
 */

import type {
  CommerceEvidenceBundle,
  CommerceSummary,
  CreateCommerceBundleOptions,
  ObservedAmount,
  ProtocolEvidence,
  TimelineEntry,
} from './commerce-bundle-types.js';
import { COMMERCE_BUNDLE_VERSION } from './commerce-bundle-types.js';

/**
 * Create a new commerce evidence bundle.
 */
export function createCommerceEvidenceBundle(
  options: CreateCommerceBundleOptions
): CommerceEvidenceBundle {
  const evidence = options.evidence ?? [];
  const timeline = options.timeline ?? [];
  const receipts = options.receipts ?? [];

  const bundle: CommerceEvidenceBundle = {
    version: COMMERCE_BUNDLE_VERSION,
    transaction_ref: options.transaction_ref,
    rails_observed: extractRails(evidence),
    protocol_evidence: evidence,
    timeline: sortTimeline(timeline),
    receipts,
    summary: computeCommerceSummary(evidence),
    created_at: options.created_at ?? new Date().toISOString(),
  };

  return bundle;
}

/**
 * Add protocol evidence to an existing bundle.
 * Returns a new bundle (immutable pattern).
 */
export function addProtocolEvidence(
  bundle: CommerceEvidenceBundle,
  evidence: ProtocolEvidence
): CommerceEvidenceBundle {
  const newEvidence = [...bundle.protocol_evidence, evidence];
  return {
    ...bundle,
    protocol_evidence: newEvidence,
    rails_observed: extractRails(newEvidence),
    summary: computeCommerceSummary(newEvidence),
  };
}

/**
 * Add a timeline entry to an existing bundle.
 * Returns a new bundle with sorted timeline.
 */
export function addTimelineEntry(
  bundle: CommerceEvidenceBundle,
  entry: TimelineEntry
): CommerceEvidenceBundle {
  return {
    ...bundle,
    timeline: sortTimeline([...bundle.timeline, entry]),
  };
}

/**
 * Add a receipt reference to an existing bundle.
 */
export function addReceiptRef(
  bundle: CommerceEvidenceBundle,
  receiptRef: string
): CommerceEvidenceBundle {
  return {
    ...bundle,
    receipts: [...bundle.receipts, receiptRef],
  };
}

/**
 * Compute a non-aggregating commerce summary from protocol evidence.
 *
 * Lists each source's observed amounts independently. Does NOT compute
 * a rolled-up transaction total. A canonical total requires same currency,
 * same semantic stage, and an explicit authoritative-winner rule.
 */
export function computeCommerceSummary(evidence: ProtocolEvidence[]): CommerceSummary {
  const observedAmounts: ObservedAmount[] = [];
  const currencies = new Set<string>();
  const rails = new Set<string>();

  for (const ev of evidence) {
    const data = ev.data;

    // Extract amount/currency if present in evidence data
    const amount =
      typeof data.amount_minor === 'string'
        ? data.amount_minor
        : typeof data.amount === 'string'
          ? data.amount
          : typeof data.amount === 'number'
            ? String(data.amount)
            : undefined;

    const currency = typeof data.currency === 'string' ? data.currency : undefined;
    const rail = typeof data.payment_rail === 'string' ? data.payment_rail : undefined;
    const stage =
      typeof data.commerce_event === 'string'
        ? data.commerce_event
        : typeof data.semantic_stage === 'string'
          ? data.semantic_stage
          : undefined;

    if (amount && currency) {
      observedAmounts.push({
        source: ev.source,
        amount,
        currency: currency.toUpperCase(),
        semantic_stage: stage,
      });
      currencies.add(currency.toUpperCase());
    }

    if (rail) rails.add(rail);
  }

  return {
    observed_amounts: observedAmounts,
    currencies_observed: [...currencies].sort(),
    rails_observed: [...rails].sort(),
    evidence_count: evidence.length,
  };
}

/**
 * Serialize a commerce bundle to deterministic JSON.
 *
 * Uses recursive key sorting so nested objects (protocol evidence,
 * timeline metadata, summary) are also serialized deterministically.
 * Arrays are preserved in-order. No nested fields are omitted.
 */
export function serializeCommerceBundle(bundle: CommerceEvidenceBundle): string {
  return JSON.stringify(stableSort(bundle), null, 2);
}

/**
 * Recursively sort object keys for deterministic serialization.
 * Arrays preserved in-order; primitives pass through unchanged.
 */
function stableSort(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stableSort);

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = stableSort((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract payment rails from evidence.
 * Only uses explicit payment_rail from evidence data.
 * Does NOT infer rails from source names to avoid semantic drift.
 */
function extractRails(evidence: ProtocolEvidence[]): string[] {
  const rails = new Set<string>();
  for (const ev of evidence) {
    if (typeof ev.data.payment_rail === 'string') {
      rails.add(ev.data.payment_rail);
    }
  }
  return [...rails].sort();
}

function sortTimeline(entries: TimelineEntry[]): TimelineEntry[] {
  return [...entries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}
