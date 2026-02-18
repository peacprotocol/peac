import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeypair, base64urlEncode } from '@peac/crypto';
import { loadJwksFile, resolveKeyByKid } from '../../src/infra/jwks-loader.js';
import { JwksLoadError } from '../../src/infra/errors.js';

describe('infra/jwks-loader', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'peac-jwks-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('loads Ed25519 keys from JWKS file', async () => {
    const { publicKey } = await generateKeypair();
    const jwks = {
      keys: [{ kty: 'OKP', crv: 'Ed25519', x: base64urlEncode(publicKey), kid: 'key-1' }],
    };
    const filePath = join(tmpDir, 'jwks.json');
    await writeFile(filePath, JSON.stringify(jwks));

    const entries = await loadJwksFile(filePath);
    expect(entries).toHaveLength(1);
    expect(entries[0].kid).toBe('key-1');
    expect(entries[0].publicKey.length).toBe(32);
  });

  it('filters out non-Ed25519 keys', async () => {
    const { publicKey } = await generateKeypair();
    const jwks = {
      keys: [
        { kty: 'RSA', n: 'abc', e: 'AQAB', kid: 'rsa-key' },
        { kty: 'OKP', crv: 'Ed25519', x: base64urlEncode(publicKey), kid: 'ed-key' },
        { kty: 'OKP', crv: 'X25519', x: base64urlEncode(publicKey), kid: 'x25519-key' },
      ],
    };
    const filePath = join(tmpDir, 'mixed.json');
    await writeFile(filePath, JSON.stringify(jwks));

    const entries = await loadJwksFile(filePath);
    expect(entries).toHaveLength(1);
    expect(entries[0].kid).toBe('ed-key');
  });

  it('handles multiple Ed25519 keys', async () => {
    const pair1 = await generateKeypair();
    const pair2 = await generateKeypair();
    const jwks = {
      keys: [
        { kty: 'OKP', crv: 'Ed25519', x: base64urlEncode(pair1.publicKey), kid: 'k1' },
        { kty: 'OKP', crv: 'Ed25519', x: base64urlEncode(pair2.publicKey), kid: 'k2' },
      ],
    };
    const filePath = join(tmpDir, 'multi.json');
    await writeFile(filePath, JSON.stringify(jwks));

    const entries = await loadJwksFile(filePath);
    expect(entries).toHaveLength(2);
  });

  it('filters out keys with non-EdDSA alg', async () => {
    const { publicKey } = await generateKeypair();
    const x = base64urlEncode(publicKey);
    const jwks = {
      keys: [
        { kty: 'OKP', crv: 'Ed25519', x, kid: 'eddsa-key', alg: 'EdDSA' },
        { kty: 'OKP', crv: 'Ed25519', x, kid: 'no-alg-key' },
        { kty: 'OKP', crv: 'Ed25519', x, kid: 'wrong-alg-key', alg: 'ES256' },
      ],
    };
    const filePath = join(tmpDir, 'alg-filter.json');
    await writeFile(filePath, JSON.stringify(jwks));

    const entries = await loadJwksFile(filePath);
    expect(entries).toHaveLength(2);
    const kids = entries.map((e) => e.kid);
    expect(kids).toContain('eddsa-key');
    expect(kids).toContain('no-alg-key');
    expect(kids).not.toContain('wrong-alg-key');
  });

  it('throws JwksLoadError for non-existent file', async () => {
    await expect(loadJwksFile('/nonexistent/jwks.json')).rejects.toThrow(JwksLoadError);
  });

  it('throws JwksLoadError for invalid JSON', async () => {
    const filePath = join(tmpDir, 'bad.json');
    await writeFile(filePath, 'not json');
    await expect(loadJwksFile(filePath)).rejects.toThrow(JwksLoadError);
  });

  describe('resolveKeyByKid', () => {
    it('finds key by kid', async () => {
      const { publicKey } = await generateKeypair();
      const entries = [{ kid: 'target', publicKey }];
      const resolved = resolveKeyByKid(entries, 'target');
      expect(resolved).toBe(publicKey);
    });

    it('returns undefined for unknown kid', () => {
      const resolved = resolveKeyByKid([], 'unknown');
      expect(resolved).toBeUndefined();
    });
  });
});
