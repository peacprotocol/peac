/**
 * Shadow-mode divergence types.
 *
 * @internal
 *
 * INTERNAL ONLY. Not re-exported from packages/protocol/src/index.ts.
 * The dist-leak Tier 2 (.d.ts) and Tier 2b (runtime-export) gates
 * assert these names never appear in any public emitted file.
 *
 * Divergence records describe the difference between the canonical
 * (real-path) result of a public call and a shadow-path result. They
 * NEVER carry raw secret material, raw error messages, raw payloads,
 * or stringified results. All comparison is done via canonical hashes
 * (SHA-256 over a canonical-stringified value); all error reporting is
 * done via registered error codes (not message text); all free-form
 * notes are bounded and redacted before storage.
 */

/**
 * The class of divergence between real-path and shadow-path results.
 *
 * @internal
 */
export type ShadowDivergenceKind =
  | 'output-byte-diff'
  | 'error-code-diff'
  | 'timing-diff'
  | 'resource-limit-diff'
  | 'shadow-error';

/**
 * Which public call produced this divergence record.
 *
 * @internal
 */
export type ShadowCall = 'issue' | 'verifyLocal' | 'verify';

/**
 * A single divergence record. Fields are intentionally narrow:
 *
 *   - hashes (SHA-256 hex of canonicalized values), never raw values;
 *   - error codes (registered identifiers), never message text;
 *   - byte lengths (counts), never payload contents;
 *   - notes (short category labels, ≤128 bytes, redaction-marked).
 *
 * @internal
 */
export interface ShadowDivergence {
  readonly kind: ShadowDivergenceKind;
  readonly call: ShadowCall;
  /** SHA-256 hex of the recordRef (e.g., the produced JWS). Never the raw ref. */
  readonly recordRefHash: string;
  /** SHA-256 hex of the canonical real-path result, when defined. */
  readonly realResultHash?: string;
  /** SHA-256 hex of the canonical shadow-path result, when defined. */
  readonly shadowResultHash?: string;
  /** Registered error code from the real-path failure, when present. */
  readonly realErrorCode?: string;
  /** Registered error code from the shadow-path failure, when present. */
  readonly shadowErrorCode?: string;
  /** Byte length of the real-path result. */
  readonly realByteLen?: number;
  /** Byte length of the shadow-path result. */
  readonly shadowByteLen?: number;
  /** Short category label, ≤128 bytes, redaction-marked. */
  readonly notes: string;
  /** ISO 8601 UTC timestamp. */
  readonly timestamp: string;
}
