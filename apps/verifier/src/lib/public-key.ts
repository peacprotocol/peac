/**
 * Strict public-key parsing and DETERMINISTIC selection.
 *
 * Never: a first-key fallback, a trimmed or case-folded kid, a network fetch, a key inferred from
 * the issuer, or an accepted duplicate kid.
 */
import {
  base64urlDecode,
  base64urlEncode,
  computeJwkThumbprint,
  jwkToPublicKeyBytes,
} from '@peac/crypto';
import { isValidKid } from '../../../../packages/crypto/src/kid';
import { VerifierError } from './errors.js';
import {
  ED25519_PUBLIC_KEY_BYTES,
  MAX_JWKS_BYTES,
  MAX_JWKS_KEYS,
  MAX_JWK_BYTES,
} from './limits.js';
import { parseStrictJsonText, utf8ByteLength } from './strict-json.js';

const B64URL_32 = /^[A-Za-z0-9_-]{43}$/;

export interface PublicJwk {
  readonly kty: 'OKP';
  readonly crv: 'Ed25519';
  readonly x: string;
  readonly kid?: string;
}

export interface SelectedKey {
  readonly publicKeyBytes: Uint8Array;
  readonly protectedKid?: string;
  readonly selectedJwkKid?: string;
  readonly jwkThumbprint: string;
}

/**
 * Validate the KNOWN JWK members.
 *
 * Unknown non-critical extension members are PERMITTED: RFC 7638 computes the thumbprint from the
 * required members only, so an extension member cannot change key identity, and blanket-rejecting
 * unknown members would break ordinary interop.
 */
function validateJwk(raw: unknown): PublicJwk {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new VerifierError('E_VERIFIER_KEY_JSON_INVALID', 'JWK must be a JSON object');
  }
  const o = raw as Record<string, unknown>;

  if ('d' in o) {
    throw new VerifierError(
      'E_VERIFIER_PRIVATE_KEY_REJECTED',
      'private key material is not accepted'
    );
  }
  if (o.kty !== 'OKP' || o.crv !== 'Ed25519') {
    throw new VerifierError(
      'E_VERIFIER_KEY_TYPE_UNSUPPORTED',
      'only OKP/Ed25519 public keys are supported'
    );
  }
  if (o.alg !== undefined && o.alg !== 'EdDSA') {
    throw new VerifierError('E_VERIFIER_KEY_METADATA_INVALID', 'alg, if present, must be EdDSA');
  }
  if (o.use !== undefined && o.use !== 'sig') {
    throw new VerifierError('E_VERIFIER_KEY_METADATA_INVALID', 'use, if present, must be sig');
  }
  if (o.key_ops !== undefined) {
    // EXACT cardinality, not just "every element is verify". RFC 7517 section 4.3 states that
    // duplicate key operation values MUST NOT be present, so ["verify","verify"] is malformed --
    // and a predicate that only checked membership would have accepted it.
    const ops = o.key_ops;
    if (!Array.isArray(ops) || ops.length !== 1 || ops[0] !== 'verify') {
      throw new VerifierError(
        'E_VERIFIER_KEY_METADATA_INVALID',
        'key_ops, if present, must be exactly ["verify"]'
      );
    }
  }
  if (typeof o.x !== 'string' || !B64URL_32.test(o.x)) {
    throw new VerifierError(
      'E_VERIFIER_KEY_MATERIAL_INVALID',
      'x must be 43 unpadded base64url characters'
    );
  }
  // Canonical encoding: decode to exactly 32 bytes and re-encode identically. Rejects padding,
  // alternate alphabets and anything a lenient decoder would otherwise accept.
  let bytes: Uint8Array;
  try {
    bytes = base64urlDecode(o.x);
  } catch {
    throw new VerifierError('E_VERIFIER_KEY_MATERIAL_INVALID', 'x is not valid base64url');
  }
  if (bytes.length !== ED25519_PUBLIC_KEY_BYTES || base64urlEncode(bytes) !== o.x) {
    throw new VerifierError(
      'E_VERIFIER_KEY_MATERIAL_INVALID',
      'x is not a canonical 32-byte Ed25519 key'
    );
  }
  if (o.kid !== undefined) {
    // Identical rule to the protected-header kid and the canonical verifier.
    if (!isValidKid(o.kid)) {
      throw new VerifierError(
        'E_VERIFIER_KID_INVALID',
        'JWK kid must be a bounded non-empty string'
      );
    }
  }
  return { kty: 'OKP', crv: 'Ed25519', x: o.x, kid: o.kid as string | undefined };
}

export function parseKeyDocument(text: string): PublicJwk[] {
  if (text.length === 0) {
    throw new VerifierError('E_VERIFIER_KEY_INPUT_EMPTY', 'no key supplied');
  }
  const size = utf8ByteLength(text);
  if (size > MAX_JWKS_BYTES) {
    throw new VerifierError(
      'E_VERIFIER_KEY_INPUT_TOO_LARGE',
      'key document exceeds the size limit'
    );
  }
  const parsed = parseStrictJsonText(text, 'E_VERIFIER_KEY_JSON_INVALID');
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new VerifierError('E_VERIFIER_KEY_JSON_INVALID', 'key document must be a JSON object');
  }
  const o = parsed as Record<string, unknown>;

  if (!('keys' in o)) {
    if (size > MAX_JWK_BYTES) {
      throw new VerifierError('E_VERIFIER_KEY_INPUT_TOO_LARGE', 'JWK exceeds the size limit');
    }
    return [validateJwk(o)];
  }

  if (!Array.isArray(o.keys) || o.keys.length === 0) {
    throw new VerifierError('E_VERIFIER_JWKS_INVALID', 'JWKS keys must be a non-empty array');
  }
  if (o.keys.length > MAX_JWKS_KEYS) {
    throw new VerifierError('E_VERIFIER_JWKS_TOO_MANY_KEYS', 'JWKS exceeds the maximum key count');
  }
  const keys = o.keys.map(validateJwk);

  // A duplicate kid makes selection ambiguous whichever key the header names.
  const seen = new Set<string>();
  for (const k of keys) {
    if (k.kid === undefined) continue;
    if (seen.has(k.kid)) {
      throw new VerifierError('E_VERIFIER_KID_AMBIGUOUS', 'JWKS contains duplicate kid values');
    }
    seen.add(k.kid);
  }
  return keys;
}

async function materialize(jwk: PublicJwk, protectedKid: string | undefined): Promise<SelectedKey> {
  return {
    publicKeyBytes: jwkToPublicKeyBytes(jwk),
    protectedKid,
    selectedJwkKid: jwk.kid,
    jwkThumbprint: await computeJwkThumbprint(jwk),
  };
}

/**
 * Select exactly one key.
 *
 * SINGLE-KEY OPTIMIZATION: with one validated JWK there is nothing to disambiguate, so the caller
 * selects it WITHOUT reading the protected header at all. That lets a malformed header reach the
 * canonical verifier and be reported under its canonical code instead of failing at the routing
 * boundary. Use `selectSoleKey` for that path.
 */
export async function selectSoleKey(keys: readonly PublicJwk[]): Promise<SelectedKey> {
  // INVARIANT GUARD, not a live path: the orchestrator only calls this inside `keys.length === 1`.
  // It is kept because this function is exported and a future caller could get it wrong -- silently
  // verifying against an arbitrary key would be far worse than an internal error.
  if (keys.length !== 1) {
    throw new VerifierError('E_VERIFIER_INTERNAL_ERROR', 'selectSoleKey requires exactly one key');
  }
  return materialize(keys[0], undefined);
}

/** Select from a multi-key set. Requires an unambiguous protected kid. */
export async function selectFromKeySet(
  keys: readonly PublicJwk[],
  protectedKid: string | undefined
): Promise<SelectedKey> {
  if (protectedKid === undefined) {
    throw new VerifierError(
      'E_VERIFIER_KID_REQUIRED',
      'the record has no kid, so a multi-key set is ambiguous'
    );
  }
  const matches = keys.filter((k) => k.kid === protectedKid);
  if (matches.length === 0) {
    throw new VerifierError('E_VERIFIER_KID_NOT_FOUND', 'no supplied key matches the record kid');
  }
  // INVARIANT GUARD, unreachable through parseKeyDocument: that function already rejects a JWKS
  // containing duplicate kid values, so no set reaching here can produce two matches. Retained
  // because this function is exported and the deduplication lives in a different module: if those
  // two ever drift apart, the failure must be an explicit ambiguity error and never an arbitrary
  // pick of `matches[0]`.
  if (matches.length > 1) {
    throw new VerifierError(
      'E_VERIFIER_KID_AMBIGUOUS',
      'more than one supplied key matches the record kid'
    );
  }
  return materialize(matches[0], protectedKid);
}

/** Attach a routing kid to an already-selected sole key, for reporting only. */
export function withProtectedKid(sel: SelectedKey, protectedKid: string | undefined): SelectedKey {
  return protectedKid === undefined ? sel : { ...sel, protectedKid };
}
