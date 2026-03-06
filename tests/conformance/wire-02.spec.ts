/**
 * Wire 0.2 Conformance Tests (v0.12.0-preview.1, DD-156)
 *
 * Validates Wire 0.2 conformance fixtures against the schemas and protocol.
 *
 * Fixture types:
 *   - full-pipeline: issue with issueWire02() + verify with verifyLocal()
 *   - schema: validate claims with Wire02ClaimsSchema.safeParse()
 *   - jws-security: sign with signRawJWS() + verify with verifyLocal()
 *   - coherence: sign with signRawJWS() + verify with verifyLocal()
 *   - warning: sign + verify, assert warning code + pointer only (never message)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeypair, base64urlEncode, base64urlEncodeString } from '@peac/crypto';
import { Wire02ClaimsSchema } from '@peac/schema';
import { issueWire02, verifyLocal } from '@peac/protocol';
import {
  loadFixtureFile,
  assertUniqueNames,
  type BaseFixture,
  type BaseFixtureFile,
} from './_harness';

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

interface Wire02Fixture extends BaseFixture {
  type: 'full-pipeline' | 'schema' | 'jws-security' | 'coherence' | 'warning';
  input: {
    claims: Record<string, unknown>;
    header_overrides?: Record<string, unknown>;
    options?: {
      strictness?: 'strict' | 'interop';
      now?: number;
    };
  };
  expected: {
    valid: boolean;
    /** Exact error code from JOSE mapping (JWS security, coherence) */
    error_code?: string;
    /** Schema issue message must contain this string (custom Zod messages) */
    issue_contains?: string;
    /** Schema parse must fail (pure Zod enum/shape errors with generic messages) */
    must_fail?: boolean;
    /** Expected Zod issue path field (for must_fail assertions) */
    path?: string;
    warnings?: Array<{ code: string; pointer?: string }>;
    [key: string]: unknown;
  };
}

type Wire02FixtureFile = BaseFixtureFile<Wire02Fixture>;

// ---------------------------------------------------------------------------
// Raw JWS sign helper (for invalid/coherence vectors)
// ---------------------------------------------------------------------------

/**
 * Sign arbitrary header + payload as a compact JWS with Ed25519.
 *
 * Unlike signWire02(), this function does NOT enforce JOSE hardening rules.
 * It is used to construct invalid JWS tokens for negative test vectors.
 *
 * Uses crypto.subtle.sign() (Node.js built-in) to avoid importing @noble/ed25519
 * directly from test code (pnpm strict mode restriction).
 *
 * @param header - Arbitrary JWS header object
 * @param payload - Arbitrary JWS payload object
 * @param privateKey - Ed25519 private key (32 bytes, seed)
 * @returns Compact JWS string (header.payload.signature)
 */
async function signRawJWS(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: Uint8Array
): Promise<string> {
  const headerB64 = base64urlEncodeString(JSON.stringify(header));
  const payloadB64 = base64urlEncodeString(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signingInputBytes = new TextEncoder().encode(signingInput);

  // Import Ed25519 private key into CryptoKey for signing.
  // Ed25519 CryptoKey import uses PKCS#8 format, which wraps the 32-byte seed.
  // Construct PKCS#8 wrapper: ASN.1 prefix + 32-byte seed.
  const pkcs8Prefix = new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ]);
  const pkcs8 = new Uint8Array(pkcs8Prefix.length + privateKey.length);
  pkcs8.set(pkcs8Prefix);
  pkcs8.set(privateKey, pkcs8Prefix.length);

  const cryptoKey = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, false, [
    'sign',
  ]);
  const signatureBuffer = await crypto.subtle.sign('Ed25519', cryptoKey, signingInputBytes);
  const signatureB64 = base64urlEncode(new Uint8Array(signatureBuffer));
  return `${signingInput}.${signatureB64}`;
}

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

function loadWire02Fixtures(filename: string): Wire02FixtureFile {
  return loadFixtureFile<Wire02Fixture>('wire-02', filename);
}

// ---------------------------------------------------------------------------
// Shared test state
// ---------------------------------------------------------------------------

const testKid = '2026-03-03T00:00:00Z';
let privateKey: Uint8Array;
let publicKey: Uint8Array;

beforeAll(async () => {
  const keypair = await generateKeypair();
  privateKey = keypair.privateKey;
  publicKey = keypair.publicKey;
});

// ---------------------------------------------------------------------------
// Fixture hygiene
// ---------------------------------------------------------------------------

describe('Wire 0.2 Conformance: fixture hygiene', () => {
  it('valid.json: all fixture names are unique', () => {
    const file = loadWire02Fixtures('valid.json');
    assertUniqueNames(file.fixtures, 'wire-02/valid.json');
  });

  it('invalid.json: all fixture names are unique', () => {
    const file = loadWire02Fixtures('invalid.json');
    assertUniqueNames(file.fixtures, 'wire-02/invalid.json');
  });

  it('warnings.json: all fixture names are unique', () => {
    const file = loadWire02Fixtures('warnings.json');
    assertUniqueNames(file.fixtures, 'wire-02/warnings.json');
  });

  it('valid.json: fixture count matches manifest', () => {
    const file = loadWire02Fixtures('valid.json');
    expect(file.fixtures.length).toBe(28);
  });

  it('invalid.json: fixture count matches manifest', () => {
    const file = loadWire02Fixtures('invalid.json');
    expect(file.fixtures.length).toBe(27);
  });

  it('warnings.json: fixture count matches manifest', () => {
    const file = loadWire02Fixtures('warnings.json');
    expect(file.fixtures.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Valid fixtures (full-pipeline)
// ---------------------------------------------------------------------------

describe('Wire 0.2 Conformance: valid fixtures', () => {
  const file = loadWire02Fixtures('valid.json');

  for (const fixture of file.fixtures) {
    it(`${fixture.name}: issues and verifies successfully`, async () => {
      expect(fixture.type).toBe('full-pipeline');

      const claims = fixture.input.claims;

      // Issue with issueWire02
      const { jws } = await issueWire02({
        iss: claims.iss as string,
        kind: claims.kind as 'evidence' | 'challenge',
        type: claims.type as string,
        sub: claims.sub as string | undefined,
        pillars: claims.pillars as string[] | undefined,
        extensions: claims.extensions as Record<string, Record<string, unknown>> | undefined,
        actor: claims.actor as Record<string, unknown> | undefined,
        policy: claims.policy as { digest: string; uri?: string; version?: string } | undefined,
        representation: claims.representation as Record<string, unknown> | undefined,
        occurred_at: claims.occurred_at as string | undefined,
        purpose_declared: claims.purpose_declared as string | undefined,
        privateKey,
        kid: testKid,
      });

      // Verify locally
      const result = await verifyLocal(jws, publicKey);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.variant).toBe('wire-02');
        expect(result.wireVersion).toBe('0.2');
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Invalid: schema-level fixtures
// ---------------------------------------------------------------------------

describe('Wire 0.2 Conformance: invalid schema fixtures', () => {
  const file = loadWire02Fixtures('invalid.json');
  const schemaFixtures = file.fixtures.filter((f) => f.type === 'schema');

  for (const fixture of schemaFixtures) {
    const label = fixture.expected.issue_contains ?? fixture.expected.path ?? 'schema error';
    it(`${fixture.name}: schema rejects (${label})`, () => {
      const claims = fixture.input.claims;
      const result = Wire02ClaimsSchema.safeParse(claims);

      expect(result.success).toBe(false);

      if (result.error && fixture.expected.issue_contains) {
        // Custom Zod messages embed the error code string; assert it appears
        const issueMessages = result.error.issues.map((i) => i.message).join('; ');
        expect(issueMessages).toContain(fixture.expected.issue_contains);
      }

      if (result.error && fixture.expected.path) {
        // Pure enum/shape errors: assert at least one issue targets the expected path
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(
          paths.some(
            (p) => p === fixture.expected.path || p.startsWith(`${fixture.expected.path}.`)
          )
        ).toBe(true);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Invalid: JWS security fixtures
// ---------------------------------------------------------------------------

describe('Wire 0.2 Conformance: invalid JWS security fixtures', () => {
  const file = loadWire02Fixtures('invalid.json');
  const jwsFixtures = file.fixtures.filter((f) => f.type === 'jws-security');

  for (const fixture of jwsFixtures) {
    it(`${fixture.name}: verifyLocal rejects with ${fixture.expected.error_code}`, async () => {
      const overrides = fixture.input.header_overrides ?? {};
      const claims = fixture.input.claims;

      // Build base Wire 0.2 header
      const baseHeader: Record<string, unknown> = {
        typ: 'interaction-record+jwt',
        alg: 'EdDSA',
        kid: testKid,
      };

      // Apply overrides
      for (const [key, value] of Object.entries(overrides)) {
        if (value === null) {
          // null means "remove the field"
          delete baseHeader[key];
        } else {
          baseHeader[key] = value;
        }
      }

      // Sign the raw JWS
      const jws = await signRawJWS(baseHeader, claims, privateKey);

      // Verify and expect failure
      const result = await verifyLocal(jws, publicKey);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(fixture.expected.error_code);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Invalid: coherence fixtures
// ---------------------------------------------------------------------------

describe('Wire 0.2 Conformance: invalid coherence fixtures', () => {
  const file = loadWire02Fixtures('invalid.json');
  const coherenceFixtures = file.fixtures.filter((f) => f.type === 'coherence');

  for (const fixture of coherenceFixtures) {
    it(`${fixture.name}: verifyLocal rejects with ${fixture.expected.error_code}`, async () => {
      const claims = fixture.input.claims;

      // Coherence test: Wire 0.2 typ header with non-Wire-0.2 claims
      const header: Record<string, unknown> = {
        typ: 'interaction-record+jwt',
        alg: 'EdDSA',
        kid: testKid,
      };

      const jws = await signRawJWS(header, claims, privateKey);

      const result = await verifyLocal(jws, publicKey);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe(fixture.expected.error_code);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Warning fixtures
// ---------------------------------------------------------------------------

describe('Wire 0.2 Conformance: warning fixtures', () => {
  const file = loadWire02Fixtures('warnings.json');

  for (const fixture of file.fixtures) {
    it(`${fixture.name}: emits expected warnings`, async () => {
      const claims = fixture.input.claims;
      const options = fixture.input.options;

      // Determine sign method based on fixture requirements.
      // Some fixtures need raw JWS for controlled headers or claims:
      //   - typ-missing-interop: sign WITHOUT typ header
      //   - occurred-at-skew: needs controlled iat (issueWire02 uses wall clock)
      //   - Any fixture with explicit iat or header requirements
      let jws: string;
      const needsRawJWS = options?.strictness === 'interop' || claims.occurred_at !== undefined; // occurred_at tests need controlled iat

      if (needsRawJWS) {
        const header: Record<string, unknown> = {
          alg: 'EdDSA',
          kid: testKid,
        };
        // Only add typ for non-interop tests (interop tests omit typ)
        if (options?.strictness !== 'interop') {
          header.typ = 'interaction-record+jwt';
        }
        jws = await signRawJWS(header, claims, privateKey);
      } else {
        // Normal sign with issueWire02
        const { jws: issuedJws } = await issueWire02({
          iss: claims.iss as string,
          kind: claims.kind as 'evidence' | 'challenge',
          type: claims.type as string,
          pillars: claims.pillars as string[] | undefined,
          extensions: claims.extensions as Record<string, Record<string, unknown>> | undefined,
          privateKey,
          kid: testKid,
        });
        jws = issuedJws;
      }

      // Verify with optional now and strictness
      const result = await verifyLocal(jws, publicKey, {
        strictness: options?.strictness as 'strict' | 'interop' | undefined,
        now: options?.now,
      });

      expect(result.valid).toBe(true);
      if (result.valid && result.variant === 'wire-02') {
        // Exact set match: (code, pointer) pairs must match exactly after sorting.
        // This catches both missing and unexpected warnings.
        const expectedWarnings = fixture.expected.warnings ?? [];
        const actualPairs = result.warnings
          .map((w) => ({ code: w.code, pointer: w.pointer }))
          .sort(
            (a, b) =>
              (a.pointer ?? '').localeCompare(b.pointer ?? '') || a.code.localeCompare(b.code)
          );
        const expectedPairs = expectedWarnings
          .map((w) => ({ code: w.code, pointer: w.pointer }))
          .sort(
            (a, b) =>
              (a.pointer ?? '').localeCompare(b.pointer ?? '') || a.code.localeCompare(b.code)
          );

        expect(actualPairs.length).toBe(expectedPairs.length);
        for (let i = 0; i < expectedPairs.length; i++) {
          expect(actualPairs[i].code).toBe(expectedPairs[i].code);
          if (expectedPairs[i].pointer !== undefined) {
            expect(actualPairs[i].pointer).toBe(expectedPairs[i].pointer);
          }
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Dual-stack regression: Wire 0.1 still works
// ---------------------------------------------------------------------------

describe('Wire 0.2 Conformance: dual-stack regression', () => {
  it('Wire 0.1 receipt verifies with wireVersion 0.1 via verifyLocalWire01', async () => {
    // Wire 0.1 issue() produces Wire 0.1 JWS; verifyLocal() is now Wire 0.2 only.
    // Use verifyLocalWire01() (internal, not barrel-exported) for Wire 0.1 verification.
    const { issue } = await import('@peac/protocol');
    const { verifyLocalWire01 } = await import('../../packages/protocol/src/verify-local-wire01');

    const { jws } = await issue({
      iss: 'https://api.example.com',
      aud: 'https://verifier.example.com',
      sub: 'user:alice',
      amt: 1000,
      cur: 'USD',
      rail: 'x402',
      reference: 'tx-001',
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocalWire01(jws, publicKey);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.wireVersion).toBe('0.1');
    }
  });
});
