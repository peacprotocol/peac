import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeypair, base64urlEncode } from '@peac/crypto';
import { loadIssuerKey } from '../../src/infra/key-loader.js';
import { KeyLoadError } from '../../src/infra/errors.js';

describe('infra/key-loader', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'peac-key-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  async function makeJwk() {
    const { privateKey, publicKey } = await generateKeypair();
    return {
      kty: 'OKP' as const,
      crv: 'Ed25519' as const,
      x: base64urlEncode(publicKey),
      d: base64urlEncode(privateKey),
      kid: 'test-key-1',
    };
  }

  describe('file: scheme', () => {
    it('loads a valid Ed25519 JWK from file', async () => {
      const jwk = await makeJwk();
      const filePath = join(tmpDir, 'key.json');
      await writeFile(filePath, JSON.stringify(jwk));

      const loaded = await loadIssuerKey(`file:${filePath}`);
      expect(loaded.privateKey).toBeInstanceOf(Uint8Array);
      expect(loaded.privateKey.length).toBe(32);
      expect(loaded.publicKey).toBeInstanceOf(Uint8Array);
      expect(loaded.publicKey.length).toBe(32);
      expect(loaded.kid).toBe('test-key-1');
    });

    it('throws for non-existent file', async () => {
      await expect(loadIssuerKey('file:/nonexistent/key.json')).rejects.toThrow(KeyLoadError);
    });

    it('throws for invalid JSON', async () => {
      const filePath = join(tmpDir, 'bad.json');
      await writeFile(filePath, 'not json');
      await expect(loadIssuerKey(`file:${filePath}`)).rejects.toThrow(KeyLoadError);
    });

    it('throws for non-Ed25519 key', async () => {
      const filePath = join(tmpDir, 'rsa.json');
      await writeFile(filePath, JSON.stringify({ kty: 'RSA', n: 'abc', e: 'AQAB' }));
      await expect(loadIssuerKey(`file:${filePath}`)).rejects.toThrow(KeyLoadError);
    });

    it('throws for mismatched keypair', async () => {
      const pair1 = await generateKeypair();
      const pair2 = await generateKeypair();
      const filePath = join(tmpDir, 'mismatch.json');
      await writeFile(
        filePath,
        JSON.stringify({
          kty: 'OKP',
          crv: 'Ed25519',
          x: base64urlEncode(pair1.publicKey),
          d: base64urlEncode(pair2.privateKey),
          kid: 'mismatch',
        })
      );
      await expect(loadIssuerKey(`file:${filePath}`)).rejects.toThrow(KeyLoadError);
    });
  });

  describe('env: scheme', () => {
    it('loads from environment variable', async () => {
      const jwk = await makeJwk();
      vi.stubEnv('TEST_PEAC_KEY', JSON.stringify(jwk));

      const loaded = await loadIssuerKey('env:TEST_PEAC_KEY');
      expect(loaded.kid).toBe('test-key-1');
      expect(loaded.privateKey.length).toBe(32);
    });

    it('throws for unset env var', async () => {
      await expect(loadIssuerKey('env:NONEXISTENT_VAR_XYZ')).rejects.toThrow(KeyLoadError);
    });

    it('falls back to ISO timestamp for kid when not in JWK', async () => {
      const { privateKey, publicKey } = await generateKeypair();
      const jwk = {
        kty: 'OKP',
        crv: 'Ed25519',
        x: base64urlEncode(publicKey),
        d: base64urlEncode(privateKey),
      };
      vi.stubEnv('TEST_PEAC_KEY_NOKID', JSON.stringify(jwk));

      const loaded = await loadIssuerKey('env:TEST_PEAC_KEY_NOKID');
      expect(loaded.kid).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('unsupported scheme', () => {
    it('throws for unknown scheme', async () => {
      await expect(loadIssuerKey('https://example.com/key')).rejects.toThrow(KeyLoadError);
    });
  });
});
