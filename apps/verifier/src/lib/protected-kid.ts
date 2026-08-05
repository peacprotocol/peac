/**
 * Minimal protected-header routing parser.
 *
 * The unverified JWS decoder is deliberately NOT used here. Measured against 16 defect classes it
 * throws for `crit`, embedded jwk/jku/x5c/x5u, b64:false, zip, missing kid, unknown typ and
 * typ/payload wire incoherence -- masking canonical errors in 14 of them
 * Every one of those is a JOSE-policy or Wire decision that belongs to the canonical verifier, whose
 * error code must survive into the report.
 *
 * So this parser is deliberately incurious. It answers exactly one question: which supplied key
 * should be used? It applies NO signature, alg, typ, crit, embedded-key, b64, zip or Wire policy,
 * and it never decodes, retains, logs or exposes the payload segment.
 */
import { VerifierError } from './errors.js';
import { MAX_KID_UTF8_BYTES } from './limits.js';
import { assertIJsonBytes } from './strict-json.js';
import { isValidKid } from '../../../../packages/crypto/src/kid';

/**
 * The COMPLETE set of error codes this module may throw.
 *
 * Callers that swallow routing failures (the single-key optimization) must swallow exactly these and
 * rethrow everything else. Without an explicit set, an unqualified `catch {}` also absorbs
 * programmer errors and invariant violations, silently degrading a verification that then still
 * reports a confident outcome.
 */
export const ROUTING_FAILURE_CODES = [
  'E_VERIFIER_RECORD_MALFORMED',
  'E_VERIFIER_KID_INVALID',
  'E_IJSON_DUPLICATE_MEMBER_NAME',
  'E_IJSON_NUMBER_OUT_OF_RANGE',
  'E_IJSON_INVALID_STRING',
] as const;

export type RoutingFailureCode = (typeof ROUTING_FAILURE_CODES)[number];

/** True only for a bounded, documented routing failure. */
export function isRoutingFailure(e: unknown): e is VerifierError & { code: RoutingFailureCode } {
  return (
    e instanceof VerifierError && (ROUTING_FAILURE_CODES as readonly string[]).includes(e.code)
  );
}

/** Unpadded base64url, RFC 4648 section 5. */
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function decodeBase64Url(seg: string): Uint8Array {
  const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Extract the protected-header `kid` used to select among several supplied keys.
 *
 * Returns undefined when the header carries no kid -- that is not an error here; with a single
 * supplied key no routing value is needed at all.
 */
export function readProtectedKidForRouting(record: string): string | undefined {
  const parts = record.split('.');
  if (parts.length !== 3) {
    throw new VerifierError(
      'E_VERIFIER_RECORD_MALFORMED',
      'record is not a three-part compact JWS'
    );
  }
  const seg = parts[0];
  if (seg.length === 0 || !BASE64URL.test(seg)) {
    throw new VerifierError(
      'E_VERIFIER_RECORD_MALFORMED',
      'protected header is not unpadded base64url'
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64Url(seg);
  } catch {
    throw new VerifierError(
      'E_VERIFIER_RECORD_MALFORMED',
      'protected header base64url does not decode'
    );
  }

  // Preserves the three I-JSON classifications rather than collapsing them.
  assertIJsonBytes(bytes, 'E_VERIFIER_RECORD_MALFORMED');

  let header: unknown;
  try {
    header = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new VerifierError('E_VERIFIER_RECORD_MALFORMED', 'protected header is not valid JSON');
  }
  if (typeof header !== 'object' || header === null || Array.isArray(header)) {
    throw new VerifierError('E_VERIFIER_RECORD_MALFORMED', 'protected header is not a JSON object');
  }

  // ONLY kid is read. Nothing else in the header is inspected, and the payload is never touched.
  const kid = (header as Record<string, unknown>).kid;
  if (kid === undefined) return undefined;
  if (typeof kid !== 'string' || kid.length === 0) {
    throw new VerifierError(
      'E_VERIFIER_KID_INVALID',
      'protected header kid must be a non-empty string'
    );
  }
  // The SAME predicate the canonical verifier uses. Routing must never reject a kid the canonical
  // verifier would accept: that produced a state where routing failed, verification succeeded, and a
  // supplied kid constraint was evaluated against an unread header.
  if (!isValidKid(kid)) {
    throw new VerifierError(
      'E_VERIFIER_KID_INVALID',
      `protected header kid exceeds ${MAX_KID_UTF8_BYTES} UTF-8 bytes`
    );
  }
  return kid;
}
