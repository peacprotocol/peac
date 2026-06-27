/**
 * Runtime-support tests for the browser verifier.
 *
 * PEAC Ed25519 verification requires a runtime with WebCrypto Ed25519. The
 * verifier must (a) detect support up front, and (b) report an unsupported
 * runtime as exactly that -- never as an invalid receipt.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { generateKeypair, sign, base64urlEncode } from '@peac/crypto';

import { verifyReceipt, ed25519WebCryptoSupported } from '../src/verify.js';
import { addIssuer, clearStore } from '../src/lib/trust-store.js';

// Mock localStorage so the trust store works in the test runtime.
const storage = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  get length() {
    return storage.size;
  },
  key: (_index: number) => null,
};
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
});

const KID = 'runtime-test-kid';

async function buildReceiptAndTrustKey(): Promise<string> {
  const { privateKey, publicKey } = await generateKeypair();
  const claims = {
    iss: 'https://issuer.example.com',
    aud: 'https://aud.example.com',
    iat: 1000,
    exp: 2000,
    rid: 'runtime-test',
  };
  const jws = await sign(claims, privateKey, KID);
  addIssuer({
    issuer: 'https://issuer.example.com',
    keys: [{ kid: KID, kty: 'OKP', crv: 'Ed25519', x: base64urlEncode(publicKey) }],
  });
  return jws;
}

describe('verifier runtime support', () => {
  const realCrypto = globalThis.crypto;

  beforeEach(() => {
    storage.clear();
    clearStore();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true });
  });

  it('ed25519WebCryptoSupported() is true on a supporting runtime', async () => {
    expect(await ed25519WebCryptoSupported()).toBe(true);
  });

  it('ed25519WebCryptoSupported() is false when importKey raises NotSupportedError', async () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        ...realCrypto,
        subtle: {
          importKey: async () => {
            const err = new Error('Ed25519 unsupported');
            err.name = 'NotSupportedError';
            throw err;
          },
          verify: async () => {
            throw new Error('verify must not run after a failed import');
          },
        },
      },
      configurable: true,
    });
    expect(await ed25519WebCryptoSupported()).toBe(false);
  });

  it('ed25519WebCryptoSupported() is false when verify raises NotSupportedError', async () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        ...realCrypto,
        subtle: {
          importKey: async () => ({}) as never,
          verify: async () => {
            const err = new Error('Ed25519 verify unsupported');
            err.name = 'NotSupportedError';
            throw err;
          },
        },
      },
      configurable: true,
    });
    expect(await ed25519WebCryptoSupported()).toBe(false);
  });

  it('ed25519WebCryptoSupported() is false when the known-good vector does not verify', async () => {
    // A runtime that imports and runs verify but returns false for the RFC 8032
    // known-good vector is not a runtime we can trust to verify Ed25519.
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        ...realCrypto,
        subtle: {
          importKey: async () => ({}) as never,
          verify: async () => false,
        },
      },
      configurable: true,
    });
    expect(await ed25519WebCryptoSupported()).toBe(false);
  });

  it('reports an unsupported runtime as unsupported-runtime, not invalid', async () => {
    const jws = await buildReceiptAndTrustKey();

    Object.defineProperty(globalThis, 'crypto', {
      value: {
        ...realCrypto,
        subtle: {
          importKey: async () => {
            const err = new Error('Ed25519 unsupported');
            err.name = 'NotSupportedError';
            throw err;
          },
        },
      },
      configurable: true,
    });

    const result = await verifyReceipt(jws);
    expect(result.status).toBe('unsupported-runtime');
    expect(result.status).not.toBe('invalid');
    expect(result.message).toMatch(/does not support Ed25519 WebCrypto/i);
  });

  it('reaches verification (not unsupported-runtime) on a supporting runtime', async () => {
    // On a runtime that supports Ed25519, the probe must NOT short-circuit; the
    // result is a real verification outcome. (Full valid/invalid verification is
    // covered by the crypto round-trip and conformance suites; here we only
    // assert the runtime gate let the request through.)
    const jws = await buildReceiptAndTrustKey();
    const result = await verifyReceipt(jws);
    expect(result.status).not.toBe('unsupported-runtime');
  });
});
