/**
 * @peac/mappings-ucp - RFC 9421 HTTP Message Signature verification tests
 *
 * Exercises the current UCP signing model (`verifyUcpHttpSignature`):
 *  - the algorithm is resolved from the key curve; `alg` is NOT in Signature-Input;
 *  - `created` is optional;
 *  - the required signed-component set is enforced;
 *  - Content-Digest is verified strictly over raw body bytes;
 *  - signatures are fixed-width raw r||s (DER rejected).
 *
 * The test signer uses node:crypto to construct fixtures with explicit control
 * over raw vs DER encoding and over the exact serialized Signature-Input value;
 * the verifier under test uses WebCrypto. Keys are generated at runtime.
 */

import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createHash, sign as nodeSign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import * as jose from 'jose';
import {
  buildSignatureBase,
  signatureBaseToBytes,
  type ParsedSignatureParams,
} from '@peac/http-signatures';
import { verifyUcpHttpSignature } from '../src/http-signature.js';
import { verifyUcpWebhookSignature } from '../src/verify.js';
import { ErrorCodes, ErrorHttpStatus } from '../src/errors.js';
import type { UcpComponentPolicy, UcpProfile, UcpSigningKey } from '../src/types.js';

const DEFAULT_URL = 'https://merchant.example.com/ucp/webhooks';
const DEFAULT_PROFILE_URL = 'https://platform.example.com/.well-known/ucp';
const DEFAULT_AGENT = `profile="${DEFAULT_PROFILE_URL}"`;
const STATE_CHANGING = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

function makeKeypair(
  namedCurve: 'P-256' | 'P-384',
  kid: string
): { privateKey: KeyObject; signingKey: UcpSigningKey } {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve });
  const jwk = publicKey.export({ format: 'jwk' }) as { crv: string; x: string; y: string };
  const signingKey: UcpSigningKey = {
    kty: 'EC',
    crv: jwk.crv as UcpSigningKey['crv'],
    kid,
    x: jwk.x,
    y: jwk.y,
  };
  return { privateKey, signingKey };
}

function contentDigest(body: Uint8Array): string {
  return `sha-256=:${createHash('sha256').update(body).digest('base64')}:`;
}

function hasQuery(url: string): boolean {
  const i = url.indexOf('?');
  return i !== -1 && i < url.length - 1;
}

interface FixtureOptions {
  curve?: 'P-256' | 'P-384';
  method?: string;
  url?: string;
  agent?: string | null; // null -> omit UCP-Agent header
  body?: Uint8Array | null; // null -> no body
  covered?: string[]; // override the signed component set
  created?: number; // include a created parameter
  algToken?: string; // include a (UCP-redundant) alg parameter
  paramOrder?: 'created-first' | 'keyid-first';
}

interface Fixture {
  signature_input: string;
  signature: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body_bytes?: Uint8Array;
  profile: UcpProfile;
  kid: string;
  privateKey: KeyObject;
  covered: string[];
}

function defaultCovered(
  method: string,
  url: string,
  hasBody: boolean,
  agentPresent: boolean
): string[] {
  const c = ['@method', '@authority', '@path'];
  if (hasQuery(url)) c.push('@query');
  if (agentPresent) c.push('ucp-agent');
  if (STATE_CHANGING.has(method.toUpperCase())) c.push('idempotency-key');
  if (hasBody) c.push('content-digest', 'content-type');
  return c;
}

/**
 * Build a self-consistent valid UCP RFC 9421 fixture. The signer constructs the
 * exact serialized signature-params value and signs the base produced from it
 * (preferSerializedParams), so the verifier (which also uses the exact value)
 * agrees byte-for-byte.
 */
function buildFixture(opts: FixtureOptions = {}): Fixture {
  const curve = opts.curve ?? 'P-256';
  const hash = curve === 'P-256' ? 'sha256' : 'sha384';
  const kid = 'ucp-key-1';
  const method = opts.method ?? 'POST';
  const url = opts.url ?? DEFAULT_URL;
  const agentPresent = opts.agent !== null;
  const agent = opts.agent ?? DEFAULT_AGENT;
  const hasBody = opts.body !== null;
  const body = opts.body === null ? undefined : (opts.body ?? new TextEncoder().encode('{"id":1}'));

  const covered = opts.covered ?? defaultCovered(method, url, hasBody, agentPresent);
  const { privateKey, signingKey } = makeKeypair(curve, kid);

  const headers: Record<string, string> = {};
  if (agentPresent) headers['ucp-agent'] = agent;
  if (STATE_CHANGING.has(method.toUpperCase())) headers['idempotency-key'] = 'idem-123';
  if (body) {
    headers['content-type'] = 'application/json';
    headers['content-digest'] = contentDigest(body);
  }

  const components = covered.map((c) => `"${c}"`).join(' ');
  let paramsValue = `(${components})`;
  if (opts.created !== undefined && opts.paramOrder === 'created-first') {
    paramsValue += `;created=${opts.created};keyid="${kid}"`;
  } else if (opts.created !== undefined) {
    paramsValue += `;keyid="${kid}";created=${opts.created}`;
  } else {
    paramsValue += `;keyid="${kid}"`;
  }
  if (opts.algToken !== undefined) {
    paramsValue += `;alg="${opts.algToken}"`;
  }

  const signerParams: ParsedSignatureParams = {
    keyid: kid,
    coveredComponents: covered,
    signatureParamsValue: paramsValue,
  };
  const base = buildSignatureBase({ method, url, headers }, signerParams, {
    preferSerializedParams: true,
  });
  const sig = nodeSign(hash, signatureBaseToBytes(base), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });

  return {
    signature_input: `sig1=${paramsValue}`,
    signature: `sig1=:${sig.toString('base64')}:`,
    method,
    url,
    headers,
    body_bytes: body,
    profile: { version: '1.0', business_id: 'merchant.example.com', signing_keys: [signingKey] },
    kid,
    privateKey,
    covered,
  };
}

function verify(fx: Fixture, overrides: Record<string, unknown> = {}) {
  return verifyUcpHttpSignature({
    signature_input: fx.signature_input,
    signature: fx.signature,
    method: fx.method,
    url: fx.url,
    headers: fx.headers,
    body_bytes: fx.body_bytes,
    profile: fx.profile,
    ...overrides,
  });
}

describe('verifyUcpHttpSignature: valid UCP signatures', () => {
  it('verifies ES256 with no alg and no created (canonical UCP)', async () => {
    const fx = buildFixture();
    const result = await verify(fx);
    expect(result.valid).toBe(true);
    expect(result.alg).toBe('ES256');
    expect(result.keyid).toBe(fx.kid);
    expect(result.content_digest_verified).toBe(true);
  });

  it('verifies ES384 (optional) with no alg and no created', async () => {
    const fx = buildFixture({ curve: 'P-384' });
    const result = await verify(fx);
    expect(result.valid).toBe(true);
    expect(result.alg).toBe('ES384');
  });

  it('verifies when an optional created parameter is present', async () => {
    const fx = buildFixture({ created: 1750000000 });
    expect((await verify(fx)).valid).toBe(true);
  });

  it('verifies with a redundant but consistent alg parameter', async () => {
    const fx = buildFixture({ algToken: 'ecdsa-p256-sha256' });
    expect((await verify(fx)).valid).toBe(true);
  });

  it('preserves exact param order: created-first and keyid-first both verify', async () => {
    const a = await verify(buildFixture({ created: 1750000000, paramOrder: 'created-first' }));
    const b = await verify(buildFixture({ created: 1750000000, paramOrder: 'keyid-first' }));
    expect(a.valid).toBe(true);
    expect(b.valid).toBe(true);
  });

  it('verifies a GET request with no body (minimal component set)', async () => {
    const fx = buildFixture({ method: 'GET', body: null, agent: null });
    const result = await verify(fx);
    expect(result.valid).toBe(true);
    expect(result.content_digest_verified).toBe(false);
  });

  it('verifies a query URL when @query is signed', async () => {
    const url = 'https://merchant.example.com/ucp/orders?status=open';
    const fx = buildFixture({ method: 'GET', body: null, agent: null, url });
    expect((await verify(fx)).valid).toBe(true);
  });

  it('requires idempotency-key for a webhook-style POST (no spec exemption)', async () => {
    const covered = [
      '@method',
      '@authority',
      '@path',
      'ucp-agent',
      'content-digest',
      'content-type',
    ];
    const fx = buildFixture({ covered }); // POST, omits idempotency-key
    expect((await verify(fx)).error_code).toBe(ErrorCodes.HTTP_SIGNATURE_COMPONENT_MISSING);
  });

  it('signature-only policy verifies a minimal covered set', async () => {
    const fx = buildFixture({ method: 'GET', body: null, agent: null, covered: ['@method'] });
    expect(
      (await verify(fx, { component_policy: 'signature-only' as UcpComponentPolicy })).valid
    ).toBe(true);
  });
});

describe('verifyUcpHttpSignature: header / parse failures', () => {
  it('rejects a missing Signature-Input', async () => {
    const fx = buildFixture();
    expect((await verify(fx, { signature_input: '' })).error_code).toBe(
      ErrorCodes.HTTP_SIGNATURE_INPUT_MISSING
    );
  });

  it('rejects a missing Signature', async () => {
    const fx = buildFixture();
    expect((await verify(fx, { signature: '' })).error_code).toBe(
      ErrorCodes.HTTP_SIGNATURE_MISSING
    );
  });

  it('rejects a malformed Signature-Input', async () => {
    const fx = buildFixture();
    expect((await verify(fx, { signature_input: 'not a structured field' })).error_code).toBe(
      ErrorCodes.HTTP_SIGNATURE_MALFORMED
    );
  });
});

describe('verifyUcpHttpSignature: key / algorithm failures', () => {
  it('rejects an unknown keyid', async () => {
    const fx = buildFixture();
    const profile: UcpProfile = {
      ...fx.profile,
      signing_keys: [{ ...fx.profile.signing_keys[0], kid: 'other' }],
    };
    expect((await verify(fx, { profile })).error_code).toBe(ErrorCodes.KEY_NOT_FOUND);
  });

  it('rejects an unsupported key curve', async () => {
    const fx = buildFixture();
    const profile: UcpProfile = {
      ...fx.profile,
      signing_keys: [{ ...fx.profile.signing_keys[0], crv: 'P-521' as UcpSigningKey['crv'] }],
    };
    expect((await verify(fx, { profile })).error_code).toBe(ErrorCodes.KEY_CURVE_MISMATCH);
  });

  it('rejects a public key carrying a private "d"', async () => {
    const fx = buildFixture();
    const profile: UcpProfile = {
      ...fx.profile,
      signing_keys: [
        { ...fx.profile.signing_keys[0], d: 'PRIVATE' } as UcpSigningKey & { d: string },
      ],
    };
    expect((await verify(fx, { profile })).error_code).toBe(ErrorCodes.KEY_ALGORITHM_MISMATCH);
  });

  it('rejects a redundant alg that conflicts with the key curve', async () => {
    const fx = buildFixture({ algToken: 'ecdsa-p384-sha384' }); // key is P-256
    expect((await verify(fx)).error_code).toBe(ErrorCodes.SIGNATURE_ALGORITHM_UNSUPPORTED);
  });

  it('rejects a DER-encoded signature (raw r||s required)', async () => {
    const fx = buildFixture();
    const params: ParsedSignatureParams = {
      keyid: fx.kid,
      coveredComponents: fx.covered,
      signatureParamsValue: fx.signature_input.slice('sig1='.length),
    };
    const base = buildSignatureBase(
      { method: fx.method, url: fx.url, headers: fx.headers },
      params,
      {
        preferSerializedParams: true,
      }
    );
    const der = nodeSign('sha256', signatureBaseToBytes(base), { key: fx.privateKey }); // DER default
    expect((await verify(fx, { signature: `sig1=:${der.toString('base64')}:` })).error_code).toBe(
      ErrorCodes.SIGNATURE_MALFORMED
    );
  });
});

describe('verifyUcpHttpSignature: required component policy', () => {
  const cases: Array<{ name: string; covered: string[]; opts?: FixtureOptions }> = [
    {
      name: '@method',
      covered: [
        '@authority',
        '@path',
        'ucp-agent',
        'idempotency-key',
        'content-digest',
        'content-type',
      ],
    },
    {
      name: '@authority',
      covered: [
        '@method',
        '@path',
        'ucp-agent',
        'idempotency-key',
        'content-digest',
        'content-type',
      ],
    },
    {
      name: '@path',
      covered: [
        '@method',
        '@authority',
        'ucp-agent',
        'idempotency-key',
        'content-digest',
        'content-type',
      ],
    },
    {
      name: 'idempotency-key (POST)',
      covered: ['@method', '@authority', '@path', 'ucp-agent', 'content-digest', 'content-type'],
    },
    {
      name: 'content-type (body)',
      covered: ['@method', '@authority', '@path', 'ucp-agent', 'idempotency-key', 'content-digest'],
    },
    {
      name: 'content-digest (body)',
      covered: ['@method', '@authority', '@path', 'ucp-agent', 'idempotency-key', 'content-type'],
    },
    {
      name: 'ucp-agent (header present)',
      covered: [
        '@method',
        '@authority',
        '@path',
        'idempotency-key',
        'content-digest',
        'content-type',
      ],
    },
  ];

  for (const c of cases) {
    it(`rejects when ${c.name} is not signed`, async () => {
      const fx = buildFixture({ covered: c.covered, ...c.opts });
      expect((await verify(fx)).error_code).toBe(ErrorCodes.HTTP_SIGNATURE_COMPONENT_MISSING);
    });
  }

  it('rejects a query URL when @query is not signed', async () => {
    const url = 'https://merchant.example.com/ucp/orders?status=open';
    const covered = [
      '@method',
      '@authority',
      '@path',
      'ucp-agent',
      'idempotency-key',
      'content-digest',
      'content-type',
    ];
    const fx = buildFixture({ url, covered });
    expect((await verify(fx)).error_code).toBe(ErrorCodes.HTTP_SIGNATURE_COMPONENT_MISSING);
  });
});

describe('verifyUcpHttpSignature: required header presence (covered != present)', () => {
  it('rejects a POST where idempotency-key is covered but the header is absent', async () => {
    const fx = buildFixture(); // idempotency-key covered + present
    const headers = { ...fx.headers };
    delete headers['idempotency-key'];
    expect((await verify(fx, { headers })).error_code).toBe(
      ErrorCodes.HTTP_SIGNATURE_COMPONENT_MISSING
    );
  });

  it('rejects a POST where idempotency-key is covered but the header is whitespace', async () => {
    const fx = buildFixture();
    const headers = { ...fx.headers, 'idempotency-key': '   ' };
    expect((await verify(fx, { headers })).error_code).toBe(
      ErrorCodes.HTTP_SIGNATURE_COMPONENT_MISSING
    );
  });

  it('rejects a body request where content-type is covered but the header is absent', async () => {
    const fx = buildFixture();
    const headers = { ...fx.headers };
    delete headers['content-type'];
    expect((await verify(fx, { headers })).error_code).toBe(
      ErrorCodes.HTTP_SIGNATURE_COMPONENT_MISSING
    );
  });

  it('rejects a body request where content-type is covered but the header is empty', async () => {
    const fx = buildFixture();
    const headers = { ...fx.headers, 'content-type': '' };
    expect((await verify(fx, { headers })).error_code).toBe(
      ErrorCodes.HTTP_SIGNATURE_COMPONENT_MISSING
    );
  });
});

describe('UCP error HTTP status mapping', () => {
  it('maps digest mismatch to 400 and missing signature to 401', () => {
    expect(ErrorHttpStatus[ErrorCodes.CONTENT_DIGEST_MISMATCH]).toBe(400);
    expect(ErrorHttpStatus[ErrorCodes.HTTP_SIGNATURE_INPUT_MISSING]).toBe(401);
    expect(ErrorHttpStatus[ErrorCodes.HTTP_SIGNATURE_MISSING]).toBe(401);
    expect(ErrorHttpStatus[ErrorCodes.SIGNATURE_INVALID]).toBe(401);
    expect(ErrorHttpStatus[ErrorCodes.SIGNATURE_ALGORITHM_UNSUPPORTED]).toBe(400);
  });
});

describe('verifyUcpHttpSignature: Content-Digest', () => {
  it('rejects a missing Content-Digest when a body is present', async () => {
    const fx = buildFixture();
    const headers = { ...fx.headers };
    delete headers['content-digest'];
    expect((await verify(fx, { headers })).error_code).toBe(ErrorCodes.CONTENT_DIGEST_MISSING);
  });

  it('rejects a Content-Digest that does not match the body', async () => {
    const fx = buildFixture();
    const tampered = new TextEncoder().encode('{"id":"TAMPERED"}');
    expect((await verify(fx, { body_bytes: tampered })).error_code).toBe(
      ErrorCodes.CONTENT_DIGEST_MISMATCH
    );
  });

  it('rejects a malformed Content-Digest member', async () => {
    const fx = buildFixture();
    const headers = { ...fx.headers, 'content-digest': 'sha-256=not-a-byte-sequence' };
    expect((await verify(fx, { headers })).error_code).toBe(ErrorCodes.CONTENT_DIGEST_MALFORMED);
  });

  it('rejects a duplicate sha-256 member', async () => {
    const fx = buildFixture();
    const dup = fx.headers['content-digest'];
    const headers = { ...fx.headers, 'content-digest': `${dup}, ${dup}` };
    expect((await verify(fx, { headers })).error_code).toBe(ErrorCodes.CONTENT_DIGEST_MALFORMED);
  });

  it('rejects an invalid base64 sha-256 value', async () => {
    const fx = buildFixture();
    const headers = { ...fx.headers, 'content-digest': 'sha-256=:not*base64*:' };
    expect((await verify(fx, { headers })).error_code).toBe(ErrorCodes.CONTENT_DIGEST_MALFORMED);
  });

  // Structured Field Byte Sequences are RFC 4648 Section 4 base64, not
  // base64url, and invalid padding is rejected (RFC 9651 Section 3.3.5).
  it('rejects a base64url ("-"/"_") Content-Digest value', async () => {
    const fx = buildFixture();
    for (const bad of ['sha-256=:ab-d:', 'sha-256=:ab_d:']) {
      const headers = { ...fx.headers, 'content-digest': bad };
      expect((await verify(fx, { headers })).error_code).toBe(ErrorCodes.CONTENT_DIGEST_MALFORMED);
    }
  });

  it('rejects non-canonical padding in a Content-Digest value', async () => {
    const fx = buildFixture();
    // padding in the middle, length % 4 === 1, and too much padding
    for (const bad of ['sha-256=:YW==YWI=:', 'sha-256=:YWJjZ:', 'sha-256=:YQ===:']) {
      const headers = { ...fx.headers, 'content-digest': bad };
      expect((await verify(fx, { headers })).error_code).toBe(ErrorCodes.CONTENT_DIGEST_MALFORMED);
    }
  });

  it('accepts a valid unpadded Content-Digest signed over the exact header', async () => {
    const fx = buildFixture();
    const body = fx.body_bytes!;
    // SHA-256 base64 carries one '=' pad; strip it for a valid unpadded value
    // (RFC 9651 synthesizes the absent padding on decode).
    const unpadded = createHash('sha256').update(body).digest('base64').replace(/=+$/g, '');
    const headers = { ...fx.headers, 'content-digest': `sha-256=:${unpadded}:` };

    // Re-sign over the exact updated headers so the covered-component binding holds.
    const paramsValue = fx.signature_input.slice('sig1='.length);
    const signerParams: ParsedSignatureParams = {
      keyid: fx.kid,
      coveredComponents: fx.covered,
      signatureParamsValue: paramsValue,
    };
    const base = buildSignatureBase({ method: fx.method, url: fx.url, headers }, signerParams, {
      preferSerializedParams: true,
    });
    const sig = nodeSign('sha256', signatureBaseToBytes(base), {
      key: fx.privateKey,
      dsaEncoding: 'ieee-p1363',
    });

    const result = await verify(fx, {
      headers,
      signature: `sig1=:${sig.toString('base64')}:`,
    });
    expect(result.valid).toBe(true);
    expect(result.content_digest_verified).toBe(true);
  });

  it('rejects a Content-Digest without sha-256 (only sha-512)', async () => {
    const fx = buildFixture();
    const headers = { ...fx.headers, 'content-digest': 'sha-512=:dGVzdA==:' };
    expect((await verify(fx, { headers })).error_code).toBe(ErrorCodes.CONTENT_DIGEST_UNSUPPORTED);
  });

  it('fails closed when content-digest is signed but no body is provided', async () => {
    const fx = buildFixture();
    expect((await verify(fx, { body_bytes: undefined })).error_code).toBe(ErrorCodes.BODY_REQUIRED);
  });
});

describe('verifyUcpHttpSignature: signature integrity and binding', () => {
  it('rejects a tampered covered component (signature base mismatch)', async () => {
    const fx = buildFixture();
    expect((await verify(fx, { url: 'https://merchant.example.com/ucp/OTHER' })).error_code).toBe(
      ErrorCodes.SIGNATURE_INVALID
    );
  });

  it('does not fall back to legacy when verified against a different key', async () => {
    const fx = buildFixture();
    const other = makeKeypair('P-256', fx.kid);
    const profile: UcpProfile = { ...fx.profile, signing_keys: [other.signingKey] };
    expect((await verify(fx, { profile })).error_code).toBe(ErrorCodes.SIGNATURE_INVALID);
  });

  it('binds a signed UCP-Agent profile when expected_profile_url matches', async () => {
    const fx = buildFixture();
    expect((await verify(fx, { expected_profile_url: DEFAULT_PROFILE_URL })).valid).toBe(true);
  });

  it('rejects when the signed UCP-Agent profile does not match expected', async () => {
    const fx = buildFixture();
    expect(
      (
        await verify(fx, {
          expected_profile_url: 'https://attacker.example.com/.well-known/ucp',
        })
      ).error_code
    ).toBe(ErrorCodes.AGENT_MISMATCH);
  });

  it('rejects a non-HTTPS UCP-Agent profile', async () => {
    const fx = buildFixture({ agent: 'profile="http://platform.example.com/.well-known/ucp"' });
    expect(
      (await verify(fx, { expected_profile_url: 'http://platform.example.com/.well-known/ucp' }))
        .error_code
    ).toBe(ErrorCodes.AGENT_MISMATCH);
  });

  it('rejects a UCP-Agent header with no profile member', async () => {
    const fx = buildFixture({ agent: 'version="1.0"' });
    expect((await verify(fx, { expected_profile_url: DEFAULT_PROFILE_URL })).error_code).toBe(
      ErrorCodes.AGENT_MISMATCH
    );
  });

  it('rejects an unquoted (malformed) UCP-Agent profile value', async () => {
    const fx = buildFixture({ agent: `profile=${DEFAULT_PROFILE_URL}` });
    expect((await verify(fx, { expected_profile_url: DEFAULT_PROFILE_URL })).error_code).toBe(
      ErrorCodes.AGENT_MISMATCH
    );
  });

  it('rejects expected_profile_url when ucp-agent is not a signed component', async () => {
    const fx = buildFixture({ method: 'GET', body: null, agent: null });
    expect((await verify(fx, { expected_profile_url: DEFAULT_PROFILE_URL })).error_code).toBe(
      ErrorCodes.AGENT_MISMATCH
    );
  });

  it('returns signer_profile_url for a valid signed UCP-Agent', async () => {
    const fx = buildFixture();
    const result = await verify(fx);
    expect(result.valid).toBe(true);
    expect(result.signer_profile_url).toBe(DEFAULT_PROFILE_URL);
  });
});

describe('verifyUcpHttpSignature: strict UCP-Agent dictionary', () => {
  // Under ucp-request a present UCP-Agent is validated even without expected_profile_url.
  it('rejects a duplicate profile member', async () => {
    const fx = buildFixture({
      agent: `profile="${DEFAULT_PROFILE_URL}", profile="https://evil.example/.well-known/ucp"`,
    });
    expect((await verify(fx)).error_code).toBe(ErrorCodes.AGENT_MISMATCH);
  });

  it('rejects a malformed extra member', async () => {
    const fx = buildFixture({ agent: `profile="${DEFAULT_PROFILE_URL}", garbage` });
    expect((await verify(fx)).error_code).toBe(ErrorCodes.AGENT_MISMATCH);
  });

  it('rejects an empty profile value', async () => {
    const fx = buildFixture({ agent: 'profile=""' });
    expect((await verify(fx)).error_code).toBe(ErrorCodes.AGENT_MISMATCH);
  });

  it('rejects a non-HTTPS profile even without expected_profile_url', async () => {
    const fx = buildFixture({ agent: 'profile="http://platform.example.com/.well-known/ucp"' });
    expect((await verify(fx)).error_code).toBe(ErrorCodes.AGENT_MISMATCH);
  });

  it('rejects a missing profile member', async () => {
    const fx = buildFixture({ agent: 'version="1.0"' });
    expect((await verify(fx)).error_code).toBe(ErrorCodes.AGENT_MISMATCH);
  });

  it('accepts a valid profile alongside a well-formed extra member', async () => {
    const fx = buildFixture({ agent: `version="1.0", profile="${DEFAULT_PROFILE_URL}"` });
    const result = await verify(fx);
    expect(result.valid).toBe(true);
    expect(result.signer_profile_url).toBe(DEFAULT_PROFILE_URL);
  });

  it('rejects profile="https:///" (no host)', async () => {
    const fx = buildFixture({ agent: 'profile="https:///"' });
    expect((await verify(fx)).error_code).toBe(ErrorCodes.AGENT_MISMATCH);
  });

  it('rejects a profile URL containing whitespace', async () => {
    const fx = buildFixture({
      agent: 'profile="https://platform.example.com/.well-known/ucp ok"',
    });
    expect((await verify(fx)).error_code).toBe(ErrorCodes.AGENT_MISMATCH);
  });

  it('rejects a profile URL with embedded credentials', async () => {
    const fx = buildFixture({
      agent: 'profile="https://user:pass@platform.example.com/.well-known/ucp"',
    });
    expect((await verify(fx)).error_code).toBe(ErrorCodes.AGENT_MISMATCH);
  });
});

describe('verifyUcpHttpSignature: request preflight + mixed-case headers', () => {
  it('rejects an empty method', async () => {
    const fx = buildFixture();
    expect((await verify(fx, { method: '   ' })).error_code).toBe(
      ErrorCodes.HTTP_SIGNATURE_MALFORMED
    );
  });

  it('rejects a method with surrounding whitespace', async () => {
    const fx = buildFixture();
    expect((await verify(fx, { method: ' POST ' })).error_code).toBe(
      ErrorCodes.HTTP_SIGNATURE_MALFORMED
    );
  });

  it('rejects a method with an internal space', async () => {
    const fx = buildFixture();
    expect((await verify(fx, { method: 'PO ST' })).error_code).toBe(
      ErrorCodes.HTTP_SIGNATURE_MALFORMED
    );
  });

  it('accepts a valid PATCH method', async () => {
    const fx = buildFixture({ method: 'PATCH' });
    expect((await verify(fx)).valid).toBe(true);
  });

  it('rejects a relative (non-absolute) URL', async () => {
    const fx = buildFixture();
    expect((await verify(fx, { url: '/ucp/webhooks' })).error_code).toBe(
      ErrorCodes.HTTP_SIGNATURE_MALFORMED
    );
  });

  it('rejects a non-HTTPS request URL', async () => {
    const fx = buildFixture();
    expect((await verify(fx, { url: 'http://merchant.example.com/ucp/webhooks' })).error_code).toBe(
      ErrorCodes.HTTP_SIGNATURE_MALFORMED
    );
  });

  it('handles mixed-case required header names', async () => {
    const fx = buildFixture();
    const headers: Record<string, string> = {
      'Content-Type': fx.headers['content-type'],
      'Content-Digest': fx.headers['content-digest'],
      'UCP-Agent': fx.headers['ucp-agent'],
      'Idempotency-Key': fx.headers['idempotency-key'],
    };
    expect((await verify(fx, { headers })).valid).toBe(true);
  });

  it('maps a duplicate covered component to a malformed result (not a throw)', async () => {
    const fx = buildFixture();
    const dupInput = fx.signature_input.replace('("@method"', '("@method" "@method"');
    const result = await verify(fx, { signature_input: dupInput });
    expect(result.valid).toBe(false);
    expect(result.error_code).toBe(ErrorCodes.HTTP_SIGNATURE_MALFORMED);
  });
});

describe('legacy Request-Signature path remains intact (no-fallback)', () => {
  it('verifyUcpWebhookSignature still verifies a valid detached JWS (RFC 7797)', async () => {
    const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
    const body = new TextEncoder().encode(JSON.stringify({ hello: 'world' }));
    const jws = await new jose.FlattenedSign(body)
      .setProtectedHeader({ alg: 'ES256', kid: 'legacy-key', b64: false, crit: ['b64'] })
      .sign(privateKey);
    const detached = `${jws.protected}..${jws.signature}`;
    const jwk = await jose.exportJWK(publicKey);
    const profile: UcpProfile = {
      version: '1.0',
      business_id: 'merchant.example.com',
      signing_keys: [
        {
          kty: 'EC',
          crv: jwk.crv as UcpSigningKey['crv'],
          kid: 'legacy-key',
          x: jwk.x!,
          y: jwk.y!,
        },
      ],
    };

    const result = await verifyUcpWebhookSignature({
      signature_header: detached,
      body_bytes: body,
      profile_url: 'https://merchant.example.com/.well-known/ucp',
      profile,
    });
    expect(result.valid).toBe(true);
  });

  it('the RFC 9421 verifier does not accept a legacy detached JWS in the Signature header', async () => {
    const fx = buildFixture();
    const result = await verifyUcpHttpSignature({
      signature_input: '',
      signature: 'eyJhbGciOiJFUzI1NiJ9..AbCdEf',
      method: fx.method,
      url: fx.url,
      headers: fx.headers,
      body_bytes: fx.body_bytes,
      profile: fx.profile,
    });
    expect(result.valid).toBe(false);
    expect(result.error_code).toBe(ErrorCodes.HTTP_SIGNATURE_INPUT_MISSING);
  });
});
