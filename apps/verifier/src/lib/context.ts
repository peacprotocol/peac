/**
 * Verification-context parsing. Closed schema, set semantics, semantic digest.
 *
 * Reuses the CANONICAL PEAC validators rather than inventing looser app-local ones.
 */
import { base64urlDecode, base64urlEncode, canonicalize, sha256Hex } from '@peac/crypto';
import { isCanonicalIss, isValidReceiptType } from '@peac/schema';
import { VerifierError } from './errors.js';
import {
  MAX_ALLOWED_KIDS,
  MAX_ALLOWED_RECORD_TYPES,
  MAX_CONTEXT_BYTES,
  MAX_IDENTIFIER_BYTES,
  MAX_KID_UTF8_BYTES,
  MAX_TRUSTED_THUMBPRINTS,
} from './limits.js';
import { parseStrictJsonText, utf8ByteLength } from './strict-json.js';
import { isValidKid } from '../../../../packages/crypto/src/kid';
import type { VerificationContextV1 } from './verifier-types.js';

const invalid = (m: string) => new VerifierError('E_VERIFIER_CONTEXT_INVALID', m);

/** Unpadded base64url alphabet, RFC 4648 section 5. */
const BASE64URL_ALPHABET = /^[A-Za-z0-9_-]+$/;
/** A SHA-256 digest is 32 bytes, which is 43 unpadded base64url characters. */
const SHA256_BYTES = 32;
const SHA256_BASE64URL_LENGTH = 43;

/**
 * An RFC 7638 JWK thumbprint: SHA-256, unpadded base64url, decoding to exactly 32 bytes.
 *
 * A length-and-alphabet test is not sufficient. base64url has unused trailing bits in the final
 * character, so several distinct 43-character strings decode to the SAME 32 bytes. Accepting those
 * aliases would let a caller supply a trust anchor that looks different from the one the verifier
 * computes, and the mismatch would read as "key not trusted" rather than as malformed input.
 * Requiring the value to re-encode identically admits exactly the canonical spelling.
 */
function isCanonicalJwkThumbprint(s: string): boolean {
  if (s.length !== SHA256_BASE64URL_LENGTH || !BASE64URL_ALPHABET.test(s)) return false;
  let bytes: Uint8Array;
  try {
    bytes = base64urlDecode(s);
  } catch {
    return false;
  }
  if (bytes.length !== SHA256_BYTES) return false;
  // Re-encode and compare: this rejects a non-canonical alias whose unused trailing bits are
  // non-zero.
  return base64urlEncode(bytes) === s;
}

/** Arrays are SETS: non-empty, unique, bounded, each member bounded, then sorted for canonicalization. */
function readSet(
  v: unknown,
  max: number,
  maxItemBytes: number,
  label: string,
  check?: (s: string) => boolean
): string[] {
  if (!Array.isArray(v) || v.length === 0) throw invalid(`${label} must be a non-empty array`);
  if (v.length > max) throw invalid(`${label} exceeds its maximum size`);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    if (typeof item !== 'string' || item.length === 0) {
      throw invalid(`${label} members must be non-empty strings`);
    }
    if (utf8ByteLength(item) > maxItemBytes)
      throw invalid(`${label} member exceeds the size limit`);
    if (check && !check(item)) throw invalid(`${label} member is not valid`);
    if (seen.has(item)) throw invalid(`${label} contains a duplicate member`);
    seen.add(item);
    out.push(item);
  }
  // Exact string matching everywhere: no case folding, no whitespace normalization. Sorting is for
  // canonicalization only and never changes membership.
  return out.sort();
}

function assertClosed(o: Record<string, unknown>, allowed: readonly string[], label: string): void {
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) throw invalid(`${label} contains an unknown member: ${k}`);
  }
}

export interface ParsedContext {
  readonly value: VerificationContextV1;
  readonly sha256: string;
}

/**
 * Parse, validate and NORMALIZE a verification context from its RAW document.
 *
 * Returns the semantic value together with its digest. Both are produced here, so they can never
 * be paired from different sources.
 */
export async function parseVerificationContext(text: string): Promise<ParsedContext> {
  if (utf8ByteLength(text) > MAX_CONTEXT_BYTES) {
    throw new VerifierError(
      'E_VERIFIER_CONTEXT_TOO_LARGE',
      'verification context exceeds the size limit'
    );
  }
  const parsed = parseStrictJsonText(text, 'E_VERIFIER_CONTEXT_INVALID');
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw invalid('verification context must be a JSON object');
  }
  const o = parsed as Record<string, unknown>;
  assertClosed(o, ['contextVersion', 'trust', 'constraints'], 'context');
  if (o.contextVersion !== '1') throw invalid('contextVersion must be "1"');

  // An empty context does NOT select constraints-checked or trusted-key mode.
  if (o.trust === undefined && o.constraints === undefined) {
    throw invalid('context must carry trust and/or constraints');
  }

  const semantic: Record<string, unknown> = { contextVersion: '1' };
  let trust: VerificationContextV1['trust'];
  let constraints: VerificationContextV1['constraints'];

  if (o.trust !== undefined) {
    if (typeof o.trust !== 'object' || o.trust === null || Array.isArray(o.trust)) {
      throw invalid('trust must be an object');
    }
    const t = o.trust as Record<string, unknown>;
    assertClosed(t, ['trustedJwkThumbprints'], 'trust');
    const set = readSet(
      t.trustedJwkThumbprints,
      MAX_TRUSTED_THUMBPRINTS,
      MAX_IDENTIFIER_BYTES,
      'trustedJwkThumbprints',
      isCanonicalJwkThumbprint
    );
    trust = { trustedJwkThumbprints: set };
    semantic.trust = { trustedJwkThumbprints: set };
  }

  if (o.constraints !== undefined) {
    if (
      typeof o.constraints !== 'object' ||
      o.constraints === null ||
      Array.isArray(o.constraints)
    ) {
      throw invalid('constraints must be an object');
    }
    const c = o.constraints as Record<string, unknown>;
    assertClosed(c, ['expectedIssuer', 'allowedKids', 'allowedRecordTypes'], 'constraints');
    if (Object.keys(c).length === 0) throw invalid('constraints must carry at least one member');

    const sc: Record<string, unknown> = {};
    const oc: {
      expectedIssuer?: string;
      allowedKids?: readonly string[];
      allowedRecordTypes?: readonly string[];
    } = {};

    if (c.expectedIssuer !== undefined) {
      if (typeof c.expectedIssuer !== 'string' || !isCanonicalIss(c.expectedIssuer)) {
        throw invalid('expectedIssuer is not a canonical PEAC issuer');
      }
      oc.expectedIssuer = c.expectedIssuer;
      sc.expectedIssuer = c.expectedIssuer;
    }
    if (c.allowedKids !== undefined) {
      // The SAME predicate the canonical verifier applies to a protected-header kid. A constraint
      // expressed in a value the verifier could never accept is unsatisfiable, and would be reported
      // as a mismatch rather than as the malformed input it is. The raw-I-JSON gate upstream and the
      // UTF-8 byte ceiling in readSet both still apply.
      const set = readSet(
        c.allowedKids,
        MAX_ALLOWED_KIDS,
        MAX_KID_UTF8_BYTES,
        'allowedKids',
        isValidKid
      );
      oc.allowedKids = set;
      sc.allowedKids = set;
    }
    if (c.allowedRecordTypes !== undefined) {
      const set = readSet(
        c.allowedRecordTypes,
        MAX_ALLOWED_RECORD_TYPES,
        MAX_IDENTIFIER_BYTES,
        'allowedRecordTypes',
        isValidReceiptType
      );
      oc.allowedRecordTypes = set;
      sc.allowedRecordTypes = set;
    }
    constraints = oc;
    semantic.constraints = sc;
  }

  // The digest is over the VALIDATED, NORMALIZED semantic value, not the raw source JSON, so two
  // contexts differing only in array order or whitespace produce the same digest.
  const digest = await sha256Hex(canonicalize(semantic));
  return {
    value: {
      contextVersion: '1',
      ...(trust ? { trust } : {}),
      ...(constraints ? { constraints } : {}),
    },
    sha256: `sha256:${digest}`,
  };
}
