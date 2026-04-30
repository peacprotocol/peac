// Internal-only. Bounded comparison shapes used by the shadow resolver path
// to compare the protocol pointer-fetch result against the resolver-http
// pointer-fetch result on the same input. Stability: internal-only, unstable;
// not part of the public surface.

/**
 * Least-common-denominator class produced by both the protocol and the
 * resolver-http pointer-fetch implementations. Both classifiers map their
 * native result shape to one of these classes so the parity gate can
 * compare like-with-like even though the taxonomies are not byte-identical.
 */
export type NormalizedPointerClass =
  | 'success'
  | 'invalid_expected_digest'
  | 'url_blocked'
  | 'malformed_jws'
  | 'digest_mismatch'
  | 'fetch_failure'
  | 'unknown_failure';

/**
 * Normalized result for a single pointer-fetch invocation. Strictly
 * redaction-safe by design: no raw URL path / query, no headers, no body
 * bytes or excerpts, no bearer tokens or private key material. Only the
 * normalized class plus public response metadata (digest hex, content-type
 * header value, content-type warning class).
 */
export interface NormalizedPointerResult {
  class: NormalizedPointerClass;
  /** SHA-256 hex of the fetched body (success or digest_mismatch only). */
  actualDigest?: string;
  /** Content-Type header from the upstream response. Public response metadata. */
  contentType?: string;
  /** Whether the implementation surfaced a content-type warning (class only, not the warning string). */
  hasContentTypeWarning: boolean;
}

/**
 * Mismatch class used by the parity gate when the protocol and
 * resolver-http normalized results disagree.
 */
export type ParityMismatchClass =
  | 'parity_class_mismatch'
  | 'parity_digest_mismatch'
  | 'parity_content_type_warning_mismatch'
  | 'parity_success_shape_mismatch';

/**
 * Verdict from comparing two normalized pointer-fetch results. When the
 * verdict reports a mismatch, the mismatch sink records the verdict (not
 * raw payloads) so operators can inspect drift without learning anything
 * sensitive about either implementation's internal handling.
 */
export interface ParityVerdict {
  classMatches: boolean;
  /** Only meaningful when both results are `success`. */
  digestMatches?: boolean;
  contentTypeWarningClassMatches: boolean;
  /** Only meaningful when both results are `success`. */
  successShapeMatches?: boolean;
  /** Mismatch classes detected; empty array when verdict is fully aligned. */
  mismatchClasses: ParityMismatchClass[];
}
