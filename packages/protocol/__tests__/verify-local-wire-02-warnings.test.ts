/**
 * Wire 0.2 warning emission tests for verifyLocal() (v0.12.0-preview.1, DD-155)
 *
 * Tests: type_unregistered and unknown_extension_preserved warning emission,
 * RFC 6901 pointer construction, conformance-safe assertion (code + pointer only).
 */

import { describe, it, expect } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import {
  WARNING_TYPE_UNREGISTERED,
  WARNING_UNKNOWN_EXTENSION,
  REGISTERED_RECEIPT_TYPES,
} from '@peac/schema';
import { issueWire02, verifyLocal } from '../src/index';

// Shared test constants
const testKid = '2026-03-03T00:00:00Z';
const testIss = 'https://api.example.com';

// ---------------------------------------------------------------------------
// type_unregistered warning
// ---------------------------------------------------------------------------

describe('verifyLocal(): type_unregistered warning', () => {
  it('emits type_unregistered for unregistered type value', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'com.example/custom-flow',
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const w = result.warnings.find((w) => w.code === WARNING_TYPE_UNREGISTERED);
      expect(w).toBeDefined();
      expect(w!.code).toBe('type_unregistered');
      expect(w!.pointer).toBe('/type');
    }
  });

  it('does NOT emit type_unregistered for registered type (org.peacprotocol/payment)', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings.some((w) => w.code === WARNING_TYPE_UNREGISTERED)).toBe(false);
    }
  });

  it('does NOT emit type_unregistered for all registered types', async () => {
    const { privateKey, publicKey } = await generateKeypair();

    for (const type of REGISTERED_RECEIPT_TYPES) {
      const { jws } = await issueWire02({
        iss: testIss,
        kind: 'evidence',
        type,
        privateKey,
        kid: testKid,
      });

      const result = await verifyLocal(jws, publicKey);
      expect(result.valid).toBe(true);
      if (result.valid && result.variant === 'wire-02') {
        expect(result.warnings.some((w) => w.code === WARNING_TYPE_UNREGISTERED)).toBe(false);
      }
    }
  });

  it('conformance: asserts only code + pointer, not message', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'com.example/unregistered-type',
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const w = result.warnings.find((w) => w.code === WARNING_TYPE_UNREGISTERED);
      expect(w).toBeDefined();
      // Conformance-safe: only assert code + pointer
      expect(w!.code).toBe('type_unregistered');
      expect(w!.pointer).toBe('/type');
      // Message exists but its content is implementation-defined
      expect(typeof w!.message).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// unknown_extension_preserved warning
// ---------------------------------------------------------------------------

describe('verifyLocal(): unknown_extension_preserved warning', () => {
  it('emits unknown_extension_preserved for unrecognized extension key', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'com.example/custom-data': { foo: 'bar' },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const w = result.warnings.find((w) => w.code === WARNING_UNKNOWN_EXTENSION);
      expect(w).toBeDefined();
      expect(w!.code).toBe('unknown_extension_preserved');
      expect(w!.pointer).toBe('/extensions/com.example~1custom-data');
    }
  });

  it('emits correct RFC 6901 pointer with ~1 escaping for key containing slash', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'io.vendor/my-ext': { value: 1 },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const w = result.warnings.find((w) => w.code === WARNING_UNKNOWN_EXTENSION);
      expect(w).toBeDefined();
      // '/' in key escaped as '~1' per RFC 6901
      expect(w!.pointer).toBe('/extensions/io.vendor~1my-ext');
    }
  });

  it('does not emit warning for known extension keys', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      pillars: ['commerce'],
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'x402',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings.some((w) => w.code === WARNING_UNKNOWN_EXTENSION)).toBe(false);
    }
  });

  it('does not emit warning when extensions is absent', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings.some((w) => w.code === WARNING_UNKNOWN_EXTENSION)).toBe(false);
    }
  });

  it('does not emit warning when extensions is empty', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {},
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings.some((w) => w.code === WARNING_UNKNOWN_EXTENSION)).toBe(false);
    }
  });

  it('emits multiple warnings for multiple unknown keys (sorted by pointer)', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'com.alpha/ext-a': { a: 1 },
        'com.beta/ext-b': { b: 2 },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const unknownWarnings = result.warnings.filter((w) => w.code === WARNING_UNKNOWN_EXTENSION);
      expect(unknownWarnings.length).toBe(2);
      // Sorted by pointer ascending
      expect(unknownWarnings[0].pointer).toBe('/extensions/com.alpha~1ext-a');
      expect(unknownWarnings[1].pointer).toBe('/extensions/com.beta~1ext-b');
    }
  });

  it('underscore-containing segment key accepted with warning', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'com.example/custom_data': { value: 'test' },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const w = result.warnings.find((w) => w.code === WARNING_UNKNOWN_EXTENSION);
      expect(w).toBeDefined();
      expect(w!.pointer).toBe('/extensions/com.example~1custom_data');
    }
  });
});

// ---------------------------------------------------------------------------
// Combined warnings
// ---------------------------------------------------------------------------

describe('verifyLocal(): combined warning scenarios', () => {
  it('emits both type_unregistered and unknown_extension_preserved', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'com.example/custom-flow',
      extensions: {
        'com.example/custom-ext': { x: 1 },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.warnings.some((w) => w.code === WARNING_TYPE_UNREGISTERED)).toBe(true);
      expect(result.warnings.some((w) => w.code === WARNING_UNKNOWN_EXTENSION)).toBe(true);
      // Verify sorting: unknown_extension (/extensions/...) before type_unregistered (/type)
      // because 'e' < 't' in lexicographic pointer order
      const extIdx = result.warnings.findIndex((w) => w.code === WARNING_UNKNOWN_EXTENSION);
      const typeIdx = result.warnings.findIndex((w) => w.code === WARNING_TYPE_UNREGISTERED);
      expect(extIdx).toBeLessThan(typeIdx);
    }
  });

  it('known extension key alongside unknown key: only unknown key warns', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      pillars: ['commerce'],
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '5000',
          currency: 'USD',
        },
        'com.vendor/audit-trail': { ts: '2026-03-03' },
      },
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      const unknownWarnings = result.warnings.filter((w) => w.code === WARNING_UNKNOWN_EXTENSION);
      expect(unknownWarnings.length).toBe(1);
      expect(unknownWarnings[0].pointer).toBe('/extensions/com.vendor~1audit-trail');
    }
  });
});
