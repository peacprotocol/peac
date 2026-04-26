/**
 * Internal validator types for the bounded shadow-mode validator foundation.
 *
 * INTERNAL ONLY. These names MUST NOT appear in any emitted .d.ts file from
 * the published @peac/protocol package. Enforced by Tier 2 + Tier 2b
 * dist-leak gates in scripts/verify-dist-private-leaks.mjs.
 */

/**
 * Stable, normalized verdict shape for parity comparison between two
 * validators. The differential harness compares JCS-canonicalized JSON
 * forms of two verdicts; raw exception messages, raw Zod issues, raw
 * stack traces, and object key order are NEVER compared.
 */
export interface ParityVerdict {
  /** Did the validator accept the input? */
  readonly accepted: boolean;
  /** Normalized error codes; sorted by code then path; deduplicated. */
  readonly errors: readonly ParityError[];
  /** Normalized warning codes; sorted by code then path; deduplicated. */
  readonly warnings: readonly ParityWarning[];
  /**
   * SHA-256 hex of the JCS-canonicalized accepted claims object. Present
   * only when accepted is true. Asserts canonical-claims agreement, not
   * just accept/reject agreement.
   */
  readonly canonicalClaimsDigest?: string;
}

/** Normalized error entry. `code` is a canonical identifier. */
export interface ParityError {
  /** Canonical error code (e.g., from @peac/kernel/errors). */
  readonly code: string;
  /** Stable JSON-pointer-like path. Omitted when not applicable. */
  readonly path?: string;
}

/** Normalized warning entry. `code` is a canonical identifier. */
export interface ParityWarning {
  /** Canonical warning code (e.g., from @peac/schema/wire-02-warnings). */
  readonly code: string;
  /** Stable JSON-pointer-like path. Omitted when not applicable. */
  readonly path?: string;
}
