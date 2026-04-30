// Internal-only. Classifiers that map the native protocol and resolver-http
// pointer-fetch result shapes to a shared NormalizedPointerResult, plus a
// pure verdict function that compares two normalized results for the
// shadow-mode parity gate. Stability: internal-only, unstable; not part of
// the public surface.

import type {
  NormalizedPointerClass,
  NormalizedPointerResult,
  ParityMismatchClass,
  ParityVerdict,
} from './shadow-types.js';

/**
 * Minimal structural type that captures the protocol pointer-fetch return
 * shape without importing protocol's internals. Mirrors
 * `packages/protocol/src/pointer-fetch.ts` PointerFetchSuccess +
 * PointerFetchError; new fields added in protocol are tolerated by this
 * structural type and ignored by the classifier.
 */
export interface ProtocolPointerResultLike {
  ok: boolean;
  reason?: string;
  message?: string;
  actualDigest?: string;
  contentType?: string;
  contentTypeWarning?: string;
}

/**
 * Minimal structural type that captures the resolver-http pointer-fetch
 * return shape without importing resolver-http types eagerly. Mirrors
 * `packages/resolver-http/src/pointer-fetch.ts` PointerFetchSuccess +
 * PointerFetchFailure.
 */
export interface ResolverHttpPointerResultLike {
  ok: boolean;
  code?: string;
  actualDigest?: string;
  contentType?: string;
  contentTypeWarning?: string;
}

const PROTOCOL_INVALID_DIGEST_PREFIX = 'Invalid expected digest';
const PROTOCOL_INVALID_URL_PREFIX = 'Invalid pointer URL';

export function classifyProtocolPointerResult(
  result: ProtocolPointerResultLike
): NormalizedPointerResult {
  if (result.ok) {
    return {
      class: 'success',
      actualDigest: result.actualDigest,
      contentType: result.contentType,
      hasContentTypeWarning: typeof result.contentTypeWarning === 'string',
    };
  }

  const reason = result.reason ?? '';
  const message = result.message ?? '';
  const klass = mapProtocolReason(reason, message);

  return {
    class: klass,
    actualDigest: result.actualDigest,
    contentType: result.contentType,
    hasContentTypeWarning: typeof result.contentTypeWarning === 'string',
  };
}

function mapProtocolReason(reason: string, message: string): NormalizedPointerClass {
  switch (reason) {
    case 'pointer_digest_mismatch':
      return 'digest_mismatch';
    case 'malformed_receipt':
      return 'malformed_jws';
    case 'pointer_fetch_blocked':
      return 'url_blocked';
    case 'pointer_fetch_timeout':
    case 'pointer_fetch_too_large':
      return 'fetch_failure';
    case 'pointer_fetch_failed':
      if (message.startsWith(PROTOCOL_INVALID_DIGEST_PREFIX)) return 'invalid_expected_digest';
      if (message.startsWith(PROTOCOL_INVALID_URL_PREFIX)) return 'url_blocked';
      return 'fetch_failure';
    default:
      return 'unknown_failure';
  }
}

export function classifyResolverHttpPointerResult(
  result: ResolverHttpPointerResultLike
): NormalizedPointerResult {
  if (result.ok) {
    return {
      class: 'success',
      actualDigest: result.actualDigest,
      contentType: result.contentType,
      hasContentTypeWarning: typeof result.contentTypeWarning === 'string',
    };
  }

  const code = result.code ?? '';
  const klass = mapResolverHttpCode(code);

  return {
    class: klass,
    actualDigest: result.actualDigest,
    contentType: result.contentType,
    hasContentTypeWarning: typeof result.contentTypeWarning === 'string',
  };
}

function mapResolverHttpCode(code: string): NormalizedPointerClass {
  switch (code) {
    case 'pointer_invalid_expected_digest':
      return 'invalid_expected_digest';
    case 'pointer_fetch_blocked':
    case 'fetch_blocked_https_only':
    case 'fetch_blocked_ssrf':
    case 'fetch_blocked_metadata_ip':
    case 'fetch_blocked_redirect':
    case 'fetch_blocked_dangerous_port':
      return 'url_blocked';
    case 'pointer_malformed_jws':
      return 'malformed_jws';
    case 'pointer_digest_mismatch':
      return 'digest_mismatch';
    case 'fetch_timeout':
    case 'fetch_network_error':
    case 'fetch_blocked_byte_cap':
    case 'fetch_status_4xx':
    case 'fetch_status_5xx':
    case 'fetch_invalid_content_type':
      return 'fetch_failure';
    default:
      return 'unknown_failure';
  }
}

/**
 * Compute the parity verdict by comparing two normalized pointer-fetch
 * results. Pure function: no side effects, no IO, no allocations beyond
 * the verdict object and the mismatch class array.
 */
export function computeParityVerdict(
  legacy: NormalizedPointerResult,
  shadow: NormalizedPointerResult
): ParityVerdict {
  const mismatchClasses: ParityMismatchClass[] = [];

  const classMatches = legacy.class === shadow.class;
  if (!classMatches) {
    mismatchClasses.push('parity_class_mismatch');
  }

  const contentTypeWarningClassMatches =
    legacy.hasContentTypeWarning === shadow.hasContentTypeWarning;
  if (!contentTypeWarningClassMatches) {
    mismatchClasses.push('parity_content_type_warning_mismatch');
  }

  let digestMatches: boolean | undefined;
  let successShapeMatches: boolean | undefined;
  if (legacy.class === 'success' && shadow.class === 'success') {
    digestMatches = legacy.actualDigest === shadow.actualDigest;
    if (!digestMatches) mismatchClasses.push('parity_digest_mismatch');

    // Success-shape parity (Commit 4.0.1 record): both must surface the
    // same set of public success keys. NormalizedPointerResult only carries
    // public keys (class, actualDigest, contentType, hasContentTypeWarning),
    // so the comparison reduces to whether each is present on both sides.
    const legacyHasContentType = typeof legacy.contentType === 'string';
    const shadowHasContentType = typeof shadow.contentType === 'string';
    successShapeMatches =
      typeof legacy.actualDigest === 'string' &&
      typeof shadow.actualDigest === 'string' &&
      legacyHasContentType === shadowHasContentType;
    if (!successShapeMatches) mismatchClasses.push('parity_success_shape_mismatch');
  }

  return {
    classMatches,
    digestMatches,
    contentTypeWarningClassMatches,
    successShapeMatches,
    mismatchClasses,
  };
}
