/**
 * App-local error model.
 *
 * These are NOT kernel error-registry entries: `errors_version` and specs/kernel/errors.json are
 * unchanged. Canonical verifier error codes pass through untouched once record validation begins --
 * they are the interoperable semantics and must never be collapsed into a code from this list.
 */

export type VerifierErrorCode =
  // input
  | 'E_VERIFIER_INPUT_EMPTY'
  | 'E_VERIFIER_RECORD_TOO_LARGE'
  | 'E_VERIFIER_RECORD_WHITESPACE'
  | 'E_VERIFIER_RECORD_MALFORMED'
  | 'E_VERIFIER_TIME_INVALID'
  | 'E_VERIFIER_SKEW_INVALID'
  | 'E_VERIFIER_BUILD_INVALID'
  // I-JSON pathologies, preserved rather than collapsed
  | 'E_IJSON_DUPLICATE_MEMBER_NAME'
  | 'E_IJSON_NUMBER_OUT_OF_RANGE'
  | 'E_IJSON_INVALID_STRING'
  // key document
  | 'E_VERIFIER_KEY_INPUT_EMPTY'
  | 'E_VERIFIER_KEY_INPUT_TOO_LARGE'
  | 'E_VERIFIER_KEY_JSON_INVALID'
  | 'E_VERIFIER_JWKS_INVALID'
  | 'E_VERIFIER_JWKS_TOO_MANY_KEYS'
  | 'E_VERIFIER_PRIVATE_KEY_REJECTED'
  | 'E_VERIFIER_KEY_TYPE_UNSUPPORTED'
  | 'E_VERIFIER_KEY_METADATA_INVALID'
  | 'E_VERIFIER_KEY_MATERIAL_INVALID'
  // routing / selection
  | 'E_VERIFIER_KID_INVALID'
  | 'E_VERIFIER_KID_REQUIRED'
  | 'E_VERIFIER_KID_NOT_FOUND'
  | 'E_VERIFIER_KID_AMBIGUOUS'
  // context
  | 'E_VERIFIER_CONTEXT_INVALID'
  | 'E_VERIFIER_CONTEXT_TOO_LARGE'
  // expectations
  | 'E_VERIFIER_TRUSTED_KEY_MISMATCH'
  | 'E_VERIFIER_ISSUER_MISMATCH'
  | 'E_VERIFIER_KID_MISMATCH'
  | 'E_VERIFIER_RECORD_TYPE_MISMATCH'
  // runtime / internal
  | 'E_VERIFIER_RUNTIME_UNSUPPORTED'
  | 'E_VERIFIER_INTERNAL_ERROR'
  | 'E_VERIFIER_UNMAPPED_CANONICAL_CODE';

/**
 * Internal control-flow error.
 *
 * `diagnostic` carries a stable upstream code for local display only. It never carries prose from
 * an untrusted payload, a stack, key material or a claim value.
 */
export class VerifierError extends Error {
  constructor(
    readonly code: VerifierErrorCode,
    message: string,
    readonly diagnostic?: string
  ) {
    super(message);
    this.name = 'VerifierError';
  }
}

export function isVerifierError(e: unknown): e is VerifierError {
  return e instanceof VerifierError;
}

/**
 * Bounded app-local DIAGNOSTIC codes.
 *
 * These are NOT error codes. They are never a `failureCode`, never enter the report's `failureCode`
 * field, and are not part of any protocol surface -- they ride in the local `diagnostic` field so an
 * operator can tell two internal errors apart. Distinguishing them must never require inventing a
 * public error code: a retired inconsistency code (see the machine contract's `forbidden_terms`) was
 * briefly used that way. It is absent from the report schema, so it would have produced a
 * schema-invalid report. The literal token is deliberately not repeated in live source.
 */
export const DIAGNOSTIC = {
  /** Routing could not read the protected header, yet canonical verification succeeded. */
  ROUTING_CANONICAL_DIVERGENCE: 'D_ROUTING_CANONICAL_DIVERGENCE',
  /** The canonical verifier threw instead of returning a result. */
  CANONICAL_THREW: 'D_CANONICAL_THREW',
  /** Report construction itself failed. */
  REPORT_CONSTRUCTION_FAILED: 'D_REPORT_CONSTRUCTION_FAILED',
} as const;

export type DiagnosticCode = (typeof DIAGNOSTIC)[keyof typeof DIAGNOSTIC];
