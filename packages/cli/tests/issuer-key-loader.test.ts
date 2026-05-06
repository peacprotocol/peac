/**
 * Direct tests for `lib/issuer-key-loader.ts`.
 *
 * Key loading is a security-sensitive boundary. These tests cover the
 * loader's behavior independently of `record command` so a regression
 * in scheme handling, JWK parsing, or error wording is caught at the
 * narrowest possible surface.
 *
 * Hard rule asserted by every failure case: the loader's error
 * messages MUST NOT contain private-key bytes.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadIssuerKey,
  deriveKidFromPublicKey,
  IssuerKeyLoadError,
  IssuerKeyInvalidError,
} from '../src/lib/issuer-key-loader';
import { generateKeypair, base64urlEncode } from '@peac/crypto';

async function freshJwk(kid?: string): Promise<{
  jwk: Record<string, string>;
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  d: string;
}> {
  const { privateKey, publicKey } = await generateKeypair();
  const d = base64urlEncode(privateKey);
  const x = base64urlEncode(publicKey);
  const jwk: Record<string, string> = { kty: 'OKP', crv: 'Ed25519', x, d };
  if (kid) jwk.kid = kid;
  return { jwk, privateKey, publicKey, d };
}

/** Asserts no private-key bytes appear anywhere in the error message. */
function expectNoSecretLeak(err: unknown, secretD: string): void {
  const msg = err instanceof Error ? err.message : String(err);
  expect(msg.includes(secretD)).toBe(false);
  // Defensive: also reject the first 8 chars of the secret (a partial leak).
  if (secretD.length >= 8) {
    expect(msg.includes(secretD.slice(0, 8))).toBe(false);
  }
}

describe('loadIssuerKey: env: success path', () => {
  it('loads a valid JWK from env:VAR', async () => {
    const { jwk, privateKey } = await freshJwk('env-success-001');
    const result = await loadIssuerKey('env:PEAC_TEST_KEY_ENV', {
      PEAC_TEST_KEY_ENV: JSON.stringify(jwk),
    });
    expect(result.privateKey).toEqual(privateKey);
    expect(result.kid).toBe('env-success-001');
  });
});

describe('loadIssuerKey: file: success path', () => {
  it('loads a valid JWK from file:/path', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'peac-loader-file-'));
    const path = join(tmp, 'issuer.jwk.json');
    try {
      const { jwk, privateKey } = await freshJwk('file-success-001');
      writeFileSync(path, JSON.stringify(jwk));
      const result = await loadIssuerKey(`file:${path}`);
      expect(result.privateKey).toEqual(privateKey);
      expect(result.kid).toBe('file-success-001');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('derives kid when JWK omits the kid field', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'peac-loader-nokid-'));
    const path = join(tmp, 'issuer.jwk.json');
    try {
      const { jwk, publicKey } = await freshJwk();
      delete jwk.kid;
      writeFileSync(path, JSON.stringify(jwk));
      const result = await loadIssuerKey(`file:${path}`);
      const expected = await deriveKidFromPublicKey(publicKey);
      expect(result.kid).toBe(expected);
      expect(result.kid.length).toBe(16);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('loadIssuerKey: scheme failures', () => {
  it('rejects an unsupported scheme with cli.issuer_key_load_failed', async () => {
    await expect(loadIssuerKey('http://issuer.example/key.json')).rejects.toMatchObject({
      name: 'IssuerKeyLoadError',
      code: 'cli.issuer_key_load_failed',
    });
  });

  it('rejects a bare empty env: scheme', async () => {
    await expect(loadIssuerKey('env:')).rejects.toMatchObject({
      name: 'IssuerKeyLoadError',
      code: 'cli.issuer_key_load_failed',
    });
  });

  it('rejects env:VAR when the variable is missing', async () => {
    await expect(loadIssuerKey('env:NEVER_SET_PEAC_KEY', {})).rejects.toMatchObject({
      name: 'IssuerKeyLoadError',
      code: 'cli.issuer_key_load_failed',
    });
  });

  it('rejects a bare empty file: scheme', async () => {
    await expect(loadIssuerKey('file:')).rejects.toMatchObject({
      name: 'IssuerKeyLoadError',
      code: 'cli.issuer_key_load_failed',
    });
  });

  it('rejects a missing file', async () => {
    await expect(
      loadIssuerKey('file:/definitely/missing/peac/issuer.jwk.json')
    ).rejects.toMatchObject({
      name: 'IssuerKeyLoadError',
      code: 'cli.issuer_key_load_failed',
    });
  });
});

describe('loadIssuerKey: JWK structural failures', () => {
  it('rejects non-JSON content with cli.issuer_key_invalid', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'peac-loader-nonjson-'));
    const path = join(tmp, 'issuer.jwk.json');
    try {
      writeFileSync(path, 'this is not json');
      await expect(loadIssuerKey(`file:${path}`)).rejects.toMatchObject({
        name: 'IssuerKeyInvalidError',
        code: 'cli.issuer_key_invalid',
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects a JWK missing the `d` field', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'peac-loader-no-d-'));
    const path = join(tmp, 'issuer.jwk.json');
    try {
      const { jwk } = await freshJwk();
      delete jwk.d;
      writeFileSync(path, JSON.stringify(jwk));
      await expect(loadIssuerKey(`file:${path}`)).rejects.toMatchObject({
        name: 'IssuerKeyInvalidError',
        code: 'cli.issuer_key_invalid',
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects a JWK missing the `x` field', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'peac-loader-no-x-'));
    const path = join(tmp, 'issuer.jwk.json');
    try {
      const { jwk } = await freshJwk();
      delete jwk.x;
      writeFileSync(path, JSON.stringify(jwk));
      await expect(loadIssuerKey(`file:${path}`)).rejects.toMatchObject({
        name: 'IssuerKeyInvalidError',
        code: 'cli.issuer_key_invalid',
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects a non-Ed25519 JWK (kty=EC)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'peac-loader-ec-'));
    const path = join(tmp, 'issuer.jwk.json');
    try {
      writeFileSync(
        path,
        JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'aaaa', y: 'bbbb', d: 'cccc' })
      );
      await expect(loadIssuerKey(`file:${path}`)).rejects.toMatchObject({
        name: 'IssuerKeyInvalidError',
        code: 'cli.issuer_key_invalid',
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects malformed base64url in `d`', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'peac-loader-bad-d-'));
    const path = join(tmp, 'issuer.jwk.json');
    try {
      const { jwk } = await freshJwk();
      jwk.d = '!!!not-base64url!!!';
      writeFileSync(path, JSON.stringify(jwk));
      await expect(loadIssuerKey(`file:${path}`)).rejects.toBeInstanceOf(IssuerKeyInvalidError);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects a JWK with mismatched `x` and `d` (d does not derive to x)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'peac-loader-mismatched-'));
    const path = join(tmp, 'issuer.jwk.json');
    try {
      const a = await freshJwk();
      const b = await freshJwk();
      const tampered = { kty: 'OKP', crv: 'Ed25519', d: a.jwk.d, x: b.jwk.x };
      writeFileSync(path, JSON.stringify(tampered));
      await expect(loadIssuerKey(`file:${path}`)).rejects.toMatchObject({
        name: 'IssuerKeyInvalidError',
        code: 'cli.issuer_key_invalid',
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('loadIssuerKey: secret-leak invariant', () => {
  it('error messages do not include the private key bytes (mismatched x/d case)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'peac-loader-leak-'));
    const path = join(tmp, 'issuer.jwk.json');
    try {
      const a = await freshJwk();
      const b = await freshJwk();
      const tampered = { kty: 'OKP', crv: 'Ed25519', d: a.jwk.d, x: b.jwk.x };
      writeFileSync(path, JSON.stringify(tampered));
      try {
        await loadIssuerKey(`file:${path}`);
        throw new Error('expected loader to reject');
      } catch (err) {
        expect(err).toBeInstanceOf(IssuerKeyInvalidError);
        expectNoSecretLeak(err, a.d);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('error messages do not include the private key bytes (env: missing var case)', async () => {
    try {
      await loadIssuerKey('env:NEVER_SET_PEAC_KEY', {});
      throw new Error('expected loader to reject');
    } catch (err) {
      expect(err).toBeInstanceOf(IssuerKeyLoadError);
      // No secret to leak here, but the variable name should appear so
      // the operator can fix the call site without the bytes.
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toContain('NEVER_SET_PEAC_KEY');
    }
  });
});

describe('deriveKidFromPublicKey', () => {
  it('returns a 16-character hex prefix', async () => {
    const { publicKey } = await generateKeypair();
    const kid = await deriveKidFromPublicKey(publicKey);
    expect(kid).toMatch(/^[a-f0-9]{16}$/);
  });

  it('is deterministic for a given public key', async () => {
    const { publicKey } = await generateKeypair();
    const kid1 = await deriveKidFromPublicKey(publicKey);
    const kid2 = await deriveKidFromPublicKey(publicKey);
    expect(kid1).toBe(kid2);
  });
});
