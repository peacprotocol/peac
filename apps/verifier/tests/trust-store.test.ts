/**
 * Trust Store Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getIssuers,
  addIssuer,
  removeIssuer,
  findKeyForKid,
  clearStore,
  type TrustedIssuer,
} from '../src/lib/trust-store.js';

// Mock localStorage for tests
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
  writable: true,
});

const testIssuer: TrustedIssuer = {
  issuer: 'https://issuer.example.com',
  keys: [{ kid: 'key-1', kty: 'OKP', crv: 'Ed25519', x: 'dGVzdC1wdWJsaWMta2V5' }],
};

describe('Trust Store', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('should start empty', () => {
    expect(getIssuers()).toEqual([]);
  });

  it('should add an issuer', () => {
    addIssuer(testIssuer);
    const issuers = getIssuers();
    expect(issuers).toHaveLength(1);
    expect(issuers[0].issuer).toBe('https://issuer.example.com');
  });

  it('should update existing issuer', () => {
    addIssuer(testIssuer);
    const updated: TrustedIssuer = {
      ...testIssuer,
      keys: [
        {
          kid: 'key-2',
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'bmV3LXB1YmxpYy1rZXk',
        },
      ],
    };
    addIssuer(updated);
    const issuers = getIssuers();
    expect(issuers).toHaveLength(1);
    expect(issuers[0].keys[0].kid).toBe('key-2');
  });

  it('should remove an issuer', () => {
    addIssuer(testIssuer);
    removeIssuer('https://issuer.example.com');
    expect(getIssuers()).toEqual([]);
  });

  it('should find key by kid', () => {
    addIssuer(testIssuer);
    const key = findKeyForKid('key-1');
    expect(key).toBeDefined();
    expect(key?.kid).toBe('key-1');
  });

  it('should return undefined for unknown kid', () => {
    addIssuer(testIssuer);
    expect(findKeyForKid('nonexistent')).toBeUndefined();
  });

  it('should clear the store', () => {
    addIssuer(testIssuer);
    clearStore();
    expect(getIssuers()).toEqual([]);
  });

  it('should handle corrupted localStorage gracefully', () => {
    storage.set('peac-trust-store', 'not-json');
    expect(getIssuers()).toEqual([]);
  });
});
