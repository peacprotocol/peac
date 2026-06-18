/**
 * @peac/mappings-ucp - RFC 9421 HTTP Message Signature verification
 *
 * Verifies UCP request and webhook signatures using the current UCP signing
 * model: RFC 9421 HTTP Message Signatures (`Signature-Input` / `Signature`)
 * with an RFC 9530 `Content-Digest` computed over the raw body bytes.
 *
 * This is distinct from the legacy `Request-Signature` detached-JWS path in
 * `verify.ts` (`verifyUcpWebhookSignature`). The two schemes do NOT silently
 * fall back to each other: the caller selects which one to verify, and a
 * failure for the selected scheme is surfaced, never quietly downgraded.
 *
 * This verifier covers request-shaped UCP signatures (method / authority / path
 * / headers / body). UCP response signatures use `@status` instead of `@method`
 * and are a separate component model, out of scope here.
 *
 * UCP specifics enforced here (per https://ucp.dev/specification/signatures/):
 * - The algorithm is RESOLVED from the signing key's `crv` (P-256 -> ES256,
 *   P-384 -> ES384). UCP does not include a JOSE/JWA `alg` in `Signature-Input`;
 *   if a signer includes an `alg` parameter anyway it is treated as advisory and
 *   accepted only when it is consistent with the key curve.
 * - `created` is OPTIONAL (UCP handles replay at the business layer through
 *   idempotency keys), so the signature is parsed leniently.
 * - The required signed-component set is enforced (see UcpComponentPolicy):
 *   `@method`, `@authority`, `@path`; `@query` when the URL has a query;
 *   `ucp-agent` when that header is present; `idempotency-key` for
 *   state-changing methods; `content-digest` + `content-type` when a body is
 *   present.
 * - Signatures are fixed-width raw `r||s` (IEEE P1363): 64 bytes for P-256, 96
 *   for P-384. DER is rejected by an explicit length check.
 *
 * Implementation notes:
 * - ECDSA verification uses WebCrypto (`crypto.subtle`), which expects raw
 *   `r||s`, so no new external dependency is introduced for ES256/ES384.
 * - RFC 9421 header parsing and signature-base construction are reused from
 *   `@peac/http-signatures`. The signature base is built with
 *   `preferSerializedParams: true` so the `@signature-params` line is the exact
 *   serialized `Signature-Input` value that was signed (RFC 9421 Section 2.5),
 *   not a reconstructed one. That package's Ed25519-only `verifySignature` is
 *   intentionally not used.
 * - `Content-Digest` is verified over the raw request body bytes with no JSON
 *   canonicalization (UCP binds raw bytes). JCS is only relevant to the separate
 *   AP2 mandate layer, which is out of scope here.
 */

import {
  parseSignature,
  buildSignatureBase,
  signatureBaseToBytes,
  HttpSignatureError,
  type ParsedSignature,
  type SignatureRequest,
} from '@peac/http-signatures';
import type {
  UcpComponentPolicy,
  VerifyUcpHttpSignatureOptions,
  VerifyUcpHttpSignatureResult,
} from './types.js';
import { ErrorCodes, type ErrorCode } from './errors.js';
import { sha256Bytes } from './util.js';
import { findSigningKey } from './verify.js';

/**
 * ECDSA parameters resolved from a signing key's curve. ES256 (P-256) is
 * required by UCP; ES384 (P-384) is optional. No other curve is accepted.
 */
const CURVE_PARAMS: Record<
  string,
  {
    alg: 'ES256' | 'ES384';
    hash: 'SHA-256' | 'SHA-384';
    /** Fixed-width raw (r||s) signature length in bytes (rejects DER). */
    rawSignatureLength: number;
  }
> = {
  'P-256': { alg: 'ES256', hash: 'SHA-256', rawSignatureLength: 64 },
  'P-384': { alg: 'ES384', hash: 'SHA-384', rawSignatureLength: 96 },
};

/**
 * RFC 9421 ECDSA algorithm tokens mapped to the curve they imply. Used only for
 * an optional consistency check when a signer redundantly includes `alg`.
 */
const ALG_TOKEN_CURVE: Record<string, 'P-256' | 'P-384'> = {
  'ecdsa-p256-sha256': 'P-256',
  'ecdsa-p384-sha384': 'P-384',
};

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

/**
 * Build a failing result with optional evidence fields.
 */
function fail(
  code: ErrorCode,
  message: string,
  extra?: Partial<VerifyUcpHttpSignatureResult>
): VerifyUcpHttpSignatureResult {
  return { valid: false, error_code: code, error_message: message, ...extra };
}

/**
 * Case-insensitive header lookup.
 */
function getHeader(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      return value;
    }
  }
  return undefined;
}

/**
 * Whether the request URL carries a non-empty query string.
 */
function hasQueryString(url: string): boolean {
  try {
    return new URL(url).search !== '';
  } catch {
    const i = url.indexOf('?');
    return i !== -1 && i < url.length - 1;
  }
}

/**
 * Decode standard or URL-safe base64 to bytes. Returns null on failure.
 */
function base64ToBytes(b64: string): Uint8Array | null {
  try {
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      return new Uint8Array(Buffer.from(b64, 'base64'));
    }
    const normalized = b64.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Constant-time byte-array equality (defense in depth; digests are not secret).
 */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

type DigestParse =
  | { ok: true; digests: Map<string, string> }
  | { ok: false; code: ErrorCode; message: string };

/**
 * Strictly parse an RFC 9530 / RFC 8941 Content-Digest dictionary. Every member
 * must be exactly `algorithm=:base64:`; a malformed member, a duplicate
 * algorithm, or an empty value rejects the whole header rather than being
 * silently ignored. Base64 byte-sequences contain no commas, so splitting the
 * top-level dictionary on commas is safe.
 */
function parseContentDigestStrict(headerValue: string): DigestParse {
  const digests = new Map<string, string>();
  const members = headerValue.split(',');

  for (const raw of members) {
    const member = raw.trim();
    if (!member) {
      return {
        ok: false,
        code: ErrorCodes.CONTENT_DIGEST_MALFORMED,
        message: 'Content-Digest contains an empty member',
      };
    }
    const match = member.match(/^([A-Za-z0-9-]+)=:([A-Za-z0-9+/=]+):$/);
    if (!match) {
      return {
        ok: false,
        code: ErrorCodes.CONTENT_DIGEST_MALFORMED,
        message: `Content-Digest member is malformed: ${member}`,
      };
    }
    const algName = match[1].toLowerCase();
    if (digests.has(algName)) {
      return {
        ok: false,
        code: ErrorCodes.CONTENT_DIGEST_MALFORMED,
        message: `Content-Digest has a duplicate algorithm: ${algName}`,
      };
    }
    digests.set(algName, match[2]);
  }

  if (digests.size === 0) {
    return {
      ok: false,
      code: ErrorCodes.CONTENT_DIGEST_MALFORMED,
      message: 'Content-Digest header is empty',
    };
  }

  return { ok: true, digests };
}

type DigestOutcome = { ok: true } | { ok: false; code: ErrorCode; message: string };

/**
 * Verify a Content-Digest header against the raw request body bytes (sha-256).
 */
function verifyContentDigest(body: Uint8Array, headerValue: string | undefined): DigestOutcome {
  if (!headerValue || !headerValue.trim()) {
    return {
      ok: false,
      code: ErrorCodes.CONTENT_DIGEST_MISSING,
      message: 'Missing Content-Digest header for a request with a body',
    };
  }

  const parsed = parseContentDigestStrict(headerValue);
  if (!parsed.ok) {
    return parsed;
  }

  const provided = parsed.digests.get('sha-256');
  if (!provided) {
    return {
      ok: false,
      code: ErrorCodes.CONTENT_DIGEST_UNSUPPORTED,
      message: `Content-Digest must include sha-256; got: ${[...parsed.digests.keys()].join(', ')}`,
    };
  }

  const providedBytes = base64ToBytes(provided);
  if (!providedBytes) {
    return {
      ok: false,
      code: ErrorCodes.CONTENT_DIGEST_MALFORMED,
      message: 'Content-Digest sha-256 value is not valid base64',
    };
  }

  if (!bytesEqual(providedBytes, sha256Bytes(body))) {
    return {
      ok: false,
      code: ErrorCodes.CONTENT_DIGEST_MISMATCH,
      message: 'Content-Digest does not match the raw request body',
    };
  }

  return { ok: true };
}

/**
 * Components that must be in the signed set for a UCP request (the `ucp-request`
 * policy; `signature-only` skips this). UCP defines no separate webhook set, so
 * webhook deliveries use the same requirements, including idempotency-key.
 */
function requiredComponents(
  method: string,
  url: string,
  headers: Record<string, string>,
  hasBody: boolean
): string[] {
  const required = ['@method', '@authority', '@path'];
  if (hasQueryString(url)) {
    required.push('@query');
  }
  if (getHeader(headers, 'ucp-agent') !== undefined) {
    required.push('ucp-agent');
  }
  if (STATE_CHANGING_METHODS.has(method.toUpperCase())) {
    required.push('idempotency-key');
  }
  if (hasBody) {
    required.push('content-digest', 'content-type');
  }
  return required;
}

type AgentParse = { ok: true; profileUrl: string } | { ok: false; reason: string };

/** A bare RFC 8941 token / sf-key (sufficient for the UCP-Agent members we accept). */
const SF_KEY = /^[a-z*][a-z0-9_\-.*]*$/;
const SF_TOKEN = /^[A-Za-z0-9._-]+$/;

/**
 * Strictly parse a `UCP-Agent` header. UCP defines it as an RFC 8941 dictionary
 * with a REQUIRED `profile` member whose value is a quoted HTTPS URL, e.g.
 * `UCP-Agent: profile="https://platform.example/.well-known/ucp"`. This is a
 * minimal UCP-scoped parser (not a general structured-field parser): it splits
 * members (respecting quoted strings), requires each member to be `key=value`
 * with a well-formed value (quoted string, token, integer, or boolean), requires
 * exactly one `profile` whose value is a quoted non-empty HTTPS URL, and rejects
 * duplicates, unquoted/empty/non-HTTPS profiles, and malformed members. It never
 * fetches the URL.
 */
function parseUcpAgentProfile(header: string): AgentParse {
  // Split into dictionary members on commas that are not inside a quoted string.
  const members: string[] = [];
  let current = '';
  let inString = false;
  for (let i = 0; i < header.length; i++) {
    const ch = header[i];
    if (ch === '"') {
      inString = !inString;
      current += ch;
    } else if (ch === ',' && !inString) {
      members.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  members.push(current);
  if (inString) {
    return { ok: false, reason: 'unterminated quoted string' };
  }

  let profileUrl: string | undefined;
  let profileCount = 0;

  for (const raw of members) {
    const member = raw.trim();
    if (member === '') {
      return { ok: false, reason: 'empty dictionary member' };
    }
    const eq = member.indexOf('=');
    if (eq === -1) {
      return { ok: false, reason: `malformed member (expected key=value): ${member}` };
    }
    const key = member.slice(0, eq).trim();
    const value = member.slice(eq + 1).trim();
    if (!SF_KEY.test(key)) {
      return { ok: false, reason: `malformed member key: ${key}` };
    }
    const isQuoted = value.length >= 2 && value.startsWith('"') && value.endsWith('"');
    const valueOk =
      isQuoted || SF_TOKEN.test(value) || /^-?\d+$/.test(value) || value === '?0' || value === '?1';
    if (!valueOk) {
      return { ok: false, reason: `malformed member value for ${key}` };
    }
    if (key === 'profile') {
      profileCount += 1;
      if (profileCount > 1) {
        return { ok: false, reason: 'duplicate profile member' };
      }
      if (!isQuoted) {
        return { ok: false, reason: 'profile value must be a quoted string' };
      }
      profileUrl = value.slice(1, -1);
    }
  }

  if (profileUrl === undefined) {
    return { ok: false, reason: 'missing profile member' };
  }
  // Validate the profile URL by parsing it, not by prefix matching.
  if (/\s/.test(profileUrl)) {
    return { ok: false, reason: 'profile URL contains whitespace' };
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(profileUrl);
  } catch {
    return { ok: false, reason: 'profile is not a valid URL' };
  }
  if (parsedUrl.protocol !== 'https:') {
    return { ok: false, reason: 'profile must be an https URL' };
  }
  if (!parsedUrl.host) {
    return { ok: false, reason: 'profile URL has no host' };
  }
  if (parsedUrl.username !== '' || parsedUrl.password !== '') {
    return { ok: false, reason: 'profile URL must not contain credentials' };
  }
  return { ok: true, profileUrl };
}

/**
 * Verify an ECDSA raw (r||s) signature with WebCrypto using a public JWK.
 * Returns false on any import/verify failure (never throws for normal failures).
 */
async function verifyEcdsaRaw(
  publicJwk: { crv: 'P-256' | 'P-384'; x: string; y: string },
  namedCurve: 'P-256' | 'P-384',
  hash: 'SHA-256' | 'SHA-384',
  signature: Uint8Array,
  data: Uint8Array
): Promise<boolean> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('WebCrypto subtle is unavailable in this runtime');
  }

  try {
    const key = await subtle.importKey(
      'jwk',
      { kty: 'EC', crv: namedCurve, x: publicJwk.x, y: publicJwk.y },
      { name: 'ECDSA', namedCurve },
      false,
      ['verify']
    );
    return await subtle.verify({ name: 'ECDSA', hash: { name: hash } }, key, signature, data);
  } catch {
    // Malformed key material or verification error -> not verifiable.
    return false;
  }
}

/**
 * Verify a UCP RFC 9421 HTTP Message Signature.
 *
 * Never falls back to the legacy `Request-Signature` / RFC 7797 path.
 */
export async function verifyUcpHttpSignature(
  options: VerifyUcpHttpSignatureOptions
): Promise<VerifyUcpHttpSignatureResult> {
  const {
    signature_input,
    signature,
    method,
    url,
    headers,
    body_bytes,
    profile,
    label,
    component_policy = 'ucp-request',
    expected_profile_url,
  } = options;

  // 1. Presence checks (explicit; distinct error codes).
  if (!signature_input || !signature_input.trim()) {
    return fail(ErrorCodes.HTTP_SIGNATURE_INPUT_MISSING, 'Missing Signature-Input header');
  }
  if (!signature || !signature.trim()) {
    return fail(ErrorCodes.HTTP_SIGNATURE_MISSING, 'Missing Signature header');
  }

  // 2. Parse RFC 9421 headers. alg and created are optional for UCP; keyid is
  //    still required by the parser.
  let parsed: ParsedSignature;
  try {
    parsed = parseSignature(signature_input, signature, label, {
      requireAlg: false,
      requireCreated: false,
    });
  } catch (err) {
    const message =
      err instanceof HttpSignatureError || err instanceof Error
        ? err.message
        : 'Failed to parse HTTP signature';
    return fail(ErrorCodes.HTTP_SIGNATURE_MALFORMED, message);
  }

  const params = parsed.params;
  const covered = params.coveredComponents;

  // 2a. Preflight the derived request inputs. RFC 9421 derived components must
  //     reflect real values; an empty method/authority/path would bind nothing.
  //     UCP is HTTPS-based, so the request URL must be an absolute https URL.
  // The method must be a valid HTTP token with no surrounding or internal
  // whitespace (RFC 7230); `@method` binds it verbatim into the signature base.
  if (!method || method.trim() !== method || !/^[A-Za-z!#$%&'*+.^_`|~-]+$/.test(method)) {
    return fail(
      ErrorCodes.HTTP_SIGNATURE_MALFORMED,
      'Request method is empty or not a valid token',
      {
        keyid: params.keyid,
      }
    );
  }
  let requestUrl: URL;
  try {
    requestUrl = new URL(url);
  } catch {
    return fail(ErrorCodes.HTTP_SIGNATURE_MALFORMED, 'Request URL must be an absolute URL', {
      keyid: params.keyid,
    });
  }
  if (requestUrl.protocol !== 'https:') {
    return fail(ErrorCodes.HTTP_SIGNATURE_MALFORMED, 'Request URL must use https', {
      keyid: params.keyid,
    });
  }
  if (!requestUrl.host) {
    return fail(ErrorCodes.HTTP_SIGNATURE_MALFORMED, 'Request URL has no authority', {
      keyid: params.keyid,
    });
  }
  if (!requestUrl.pathname.startsWith('/')) {
    return fail(ErrorCodes.HTTP_SIGNATURE_MALFORMED, 'Request path must begin with /', {
      keyid: params.keyid,
    });
  }

  // 3. Resolve the signing key by keyid -> signing_keys[].kid.
  const key = findSigningKey(profile, params.keyid);
  if (!key) {
    return fail(ErrorCodes.KEY_NOT_FOUND, `Key not found in profile: ${params.keyid}`, {
      keyid: params.keyid,
      covered_components: covered,
    });
  }

  // 4. Key must be a public EC key.
  if (key.kty !== 'EC') {
    return fail(ErrorCodes.KEY_ALGORITHM_MISMATCH, `Expected EC key, got ${key.kty}`, {
      keyid: params.keyid,
    });
  }
  if (!key.x || !key.y) {
    return fail(ErrorCodes.KEY_ALGORITHM_MISMATCH, 'Signing key is missing x/y coordinates', {
      keyid: params.keyid,
    });
  }
  if ((key as { d?: unknown }).d !== undefined) {
    return fail(
      ErrorCodes.KEY_ALGORITHM_MISMATCH,
      'Signing key must be a public key (private "d" present)',
      { keyid: params.keyid }
    );
  }

  // 5. Resolve the algorithm from the key's curve (UCP does not send alg).
  const curveParams = CURVE_PARAMS[key.crv];
  if (!curveParams) {
    return fail(
      ErrorCodes.KEY_CURVE_MISMATCH,
      `Unsupported key curve: ${key.crv} (UCP requires P-256, optionally P-384)`,
      { keyid: params.keyid }
    );
  }

  // 6. If the signer redundantly included alg, it must be consistent with the key.
  if (params.alg !== undefined) {
    const expectedCurve = ALG_TOKEN_CURVE[params.alg.toLowerCase()];
    if (expectedCurve === undefined || expectedCurve !== key.crv) {
      return fail(
        ErrorCodes.SIGNATURE_ALGORITHM_UNSUPPORTED,
        `Signature-Input alg "${params.alg}" is not consistent with key curve ${key.crv}`,
        { keyid: params.keyid, covered_components: covered }
      );
    }
  }

  // 7. Signature must be fixed-width raw (r||s); DER is rejected by length.
  if (parsed.signatureBytes.length !== curveParams.rawSignatureLength) {
    return fail(
      ErrorCodes.SIGNATURE_MALFORMED,
      `Expected a ${curveParams.rawSignatureLength}-byte raw (r||s) ${curveParams.alg} signature, ` +
        `got ${parsed.signatureBytes.length} bytes (DER encoding is not accepted)`,
      { keyid: params.keyid }
    );
  }

  // 8. Enforce the required signed-component policy.
  const hasBody = body_bytes !== undefined && body_bytes.length > 0;
  if (component_policy !== 'signature-only') {
    const required = requiredComponents(method, url, headers, hasBody);

    // 8a. Each required component must be in the signed set.
    const uncovered = required.filter((c) => !covered.includes(c));
    if (uncovered.length > 0) {
      return fail(
        ErrorCodes.HTTP_SIGNATURE_COMPONENT_MISSING,
        `Required signed components missing: ${uncovered.join(', ')}`,
        { keyid: params.keyid, covered_components: covered }
      );
    }

    // 8b. A required header component must also be present and non-empty:
    //     buildSignatureBase yields '' for a missing header, so signing the name
    //     alone is not equivalent to signing a real value. content-digest is
    //     handled in step 9 (so a missing one reports a digest-specific error).
    const emptyHeaders = required.filter((c) => {
      if (c.startsWith('@') || c === 'content-digest') {
        return false;
      }
      const value = getHeader(headers, c);
      return value === undefined || value.trim() === '';
    });
    if (emptyHeaders.length > 0) {
      return fail(
        ErrorCodes.HTTP_SIGNATURE_COMPONENT_MISSING,
        `Required signed header(s) absent or empty: ${emptyHeaders.join(', ')}`,
        { keyid: params.keyid, covered_components: covered }
      );
    }
  }

  // 9. Content-Digest verification over the raw body bytes.
  const digestHeader = getHeader(headers, 'content-digest');
  let contentDigestVerified = false;
  if (hasBody) {
    const skipForSignatureOnly =
      component_policy === 'signature-only' &&
      !(covered.includes('content-digest') && digestHeader);
    if (!skipForSignatureOnly) {
      const outcome = verifyContentDigest(body_bytes as Uint8Array, digestHeader);
      if (!outcome.ok) {
        return fail(outcome.code, outcome.message, {
          keyid: params.keyid,
          covered_components: covered,
        });
      }
      contentDigestVerified = true;
    }
  } else if (
    component_policy !== 'signature-only' &&
    (covered.includes('content-digest') || digestHeader !== undefined)
  ) {
    // A signature covers (or the request carries) a Content-Digest, but no body
    // was supplied to verify it against. Fail closed.
    return fail(
      ErrorCodes.BODY_REQUIRED,
      'content-digest is signed or present but no request body was provided to verify it',
      { keyid: params.keyid, covered_components: covered }
    );
  }

  // 10. Build the signature base (exact serialized params) and verify ECDSA.
  //     buildSignatureBase throws on a duplicate covered component (RFC 9421
  //     Section 2.5); surface that as a clean malformed result, never a throw.
  const request: SignatureRequest = { method, url, headers };
  let baseBytes: Uint8Array;
  try {
    const base = buildSignatureBase(request, params, { preferSerializedParams: true });
    baseBytes = signatureBaseToBytes(base);
  } catch (err) {
    return fail(
      ErrorCodes.HTTP_SIGNATURE_MALFORMED,
      err instanceof Error ? err.message : 'Invalid signature base',
      { keyid: params.keyid, covered_components: covered }
    );
  }

  let signatureValid: boolean;
  try {
    signatureValid = await verifyEcdsaRaw(
      { crv: key.crv as 'P-256' | 'P-384', x: key.x, y: key.y },
      key.crv as 'P-256' | 'P-384',
      curveParams.hash,
      parsed.signatureBytes,
      baseBytes
    );
  } catch (err) {
    return fail(
      ErrorCodes.VERIFICATION_FAILED,
      `Signature verification error: ${err instanceof Error ? err.message : String(err)}`,
      { keyid: params.keyid, covered_components: covered }
    );
  }

  if (!signatureValid) {
    return fail(ErrorCodes.SIGNATURE_INVALID, 'HTTP Message Signature verification failed', {
      keyid: params.keyid,
      covered_components: covered,
      alg: curveParams.alg,
    });
  }

  // 11. Signer-profile handling. UCP-Agent is a signed identity-binding component.
  //     Under the strict request policy it is validated whenever the header is
  //     present (not only when a profile is expected); a binding is also enforced
  //     when expected_profile_url is supplied. Only a SIGNED ucp-agent is trusted.
  let signerProfileUrl: string | undefined;
  const agentHeader = getHeader(headers, 'ucp-agent');
  const mustValidateAgent =
    expected_profile_url !== undefined ||
    (component_policy === 'ucp-request' && agentHeader !== undefined);

  if (mustValidateAgent) {
    if (!covered.includes('ucp-agent')) {
      return fail(
        ErrorCodes.AGENT_MISMATCH,
        'UCP-Agent must be a signed component to bind the signer profile',
        { keyid: params.keyid, covered_components: covered }
      );
    }
    if (!agentHeader || !agentHeader.trim()) {
      return fail(ErrorCodes.AGENT_MISMATCH, 'UCP-Agent header is absent or empty', {
        keyid: params.keyid,
      });
    }
    const parsedAgent = parseUcpAgentProfile(agentHeader);
    if (!parsedAgent.ok) {
      return fail(ErrorCodes.AGENT_MISMATCH, `Invalid UCP-Agent: ${parsedAgent.reason}`, {
        keyid: params.keyid,
      });
    }
    signerProfileUrl = parsedAgent.profileUrl;
    if (expected_profile_url !== undefined && signerProfileUrl !== expected_profile_url) {
      return fail(
        ErrorCodes.AGENT_MISMATCH,
        'UCP-Agent profile does not match the expected profile URL',
        { keyid: params.keyid }
      );
    }
  }

  return {
    valid: true,
    alg: curveParams.alg,
    keyid: params.keyid,
    covered_components: covered,
    content_digest_verified: contentDigestVerified,
    ...(signerProfileUrl !== undefined ? { signer_profile_url: signerProfileUrl } : {}),
  };
}
