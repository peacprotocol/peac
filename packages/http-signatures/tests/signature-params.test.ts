/**
 * RFC 9421 signature-parameter handling: optional alg/created and exact
 * @signature-params preservation.
 *
 * These cover the parser/base capabilities relied on by profiles that omit alg
 * and created (e.g. UCP derives the algorithm from the key) and that require the
 * signature base to reuse the exact serialized Signature-Input value rather than
 * a reconstructed one. The default (strict, reconstruct) behavior used by the
 * PEAC/TAP path is unchanged and is asserted here too.
 */

import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, sign as nodeSign, verify as nodeVerify } from 'node:crypto';
import { parseSignature, parseSignatureInput, parseSignatureHeader } from '../src/parser.js';
import { buildSignatureBase, signatureBaseToBytes } from '../src/base.js';
import { HttpSignatureError } from '../src/errors.js';

const DUMMY_SIG = 'sig1=:dGVzdHNpZ25hdHVyZQ==:';
const REQUEST = { method: 'POST', url: 'https://merchant.example.com/p', headers: {} };

describe('parseSignature: optional alg/created', () => {
  it('requires alg and created by default (strict PEAC/TAP path)', () => {
    const noAlg = 'sig1=("@method");created=1700000000;keyid="k1"';
    const noCreated = 'sig1=("@method");keyid="k1";alg="ed25519"';
    expect(() => parseSignature(noAlg, DUMMY_SIG)).toThrow(HttpSignatureError);
    expect(() => parseSignature(noCreated, DUMMY_SIG)).toThrow(HttpSignatureError);
  });

  it('allows missing alg and created when opted out (UCP derives alg from key crv)', () => {
    const input = 'sig1=("@method" "@authority" "@path");keyid="k1"';
    const parsed = parseSignature(input, DUMMY_SIG, undefined, {
      requireAlg: false,
      requireCreated: false,
    });
    expect(parsed.params.alg).toBeUndefined();
    expect(parsed.params.created).toBeUndefined();
    expect(parsed.params.keyid).toBe('k1');
  });

  it('still requires keyid even in lenient mode', () => {
    const input = 'sig1=("@method");alg="ecdsa-p256-sha256"';
    expect(() =>
      parseSignature(input, DUMMY_SIG, undefined, { requireAlg: false, requireCreated: false })
    ).toThrow(HttpSignatureError);
  });

  it('does not fabricate created=0 / alg="" when absent', () => {
    const input = 'sig1=("@method");keyid="k1"';
    const parsed = parseSignature(input, DUMMY_SIG, undefined, {
      requireAlg: false,
      requireCreated: false,
    });
    expect(parsed.params.created).not.toBe(0);
    expect(parsed.params.alg).not.toBe('');
  });
});

describe('exact @signature-params preservation', () => {
  it('captures the exact serialized signature params value', () => {
    const value = '("@method" "@path");keyid="k1";created=1700000000';
    const map = parseSignatureInput(`sig1=${value}`);
    expect(map.get('sig1')?.signatureParamsValue).toBe(value);
  });

  it('preserves exact param order with preferSerializedParams=true', () => {
    const orderA = '("@method" "@path");keyid="k1";created=1700000000;alg="ed25519"';
    const orderB = '("@method" "@path");created=1700000000;alg="ed25519";keyid="k1"';
    const reqA = parseSignature(`sig1=${orderA}`, DUMMY_SIG);
    const reqB = parseSignature(`sig1=${orderB}`, DUMMY_SIG);

    const baseA = buildSignatureBase(REQUEST, reqA.params, { preferSerializedParams: true });
    const baseB = buildSignatureBase(REQUEST, reqB.params, { preferSerializedParams: true });

    expect(baseA.endsWith(`"@signature-params": ${orderA}`)).toBe(true);
    expect(baseB.endsWith(`"@signature-params": ${orderB}`)).toBe(true);
    expect(baseA).not.toBe(baseB);
  });

  it('default (reconstruction) yields canonical order regardless of input order', () => {
    const orderB = '("@method");created=1700000000;alg="ed25519";keyid="k1"';
    const reqB = parseSignature(`sig1=${orderB}`, DUMMY_SIG);
    const base = buildSignatureBase(REQUEST, reqB.params);
    expect(
      base.endsWith('"@signature-params": ("@method");created=1700000000;keyid="k1";alg="ed25519"')
    ).toBe(true);
  });

  it('Ed25519 roundtrip: a non-canonical param order verifies only with exact preservation', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    // Non-canonical order: keyid precedes created (reconstruction would reorder).
    const value = '("@method" "@path");keyid="k1";created=1700000000;alg="ed25519"';
    const parsed = parseSignature(`sig1=${value}`, DUMMY_SIG);

    const exactBase = buildSignatureBase(REQUEST, parsed.params, { preferSerializedParams: true });
    const sigBytes = nodeSign(null, signatureBaseToBytes(exactBase), privateKey);

    // Exact preservation: verifies.
    expect(nodeVerify(null, signatureBaseToBytes(exactBase), publicKey, sigBytes)).toBe(true);

    // Reconstruction produces a different base, so the same signature fails there.
    const reconBase = buildSignatureBase(REQUEST, parsed.params);
    expect(reconBase).not.toBe(exactBase);
    expect(nodeVerify(null, signatureBaseToBytes(reconBase), publicKey, sigBytes)).toBe(false);
  });
});

describe('duplicate / mismatched signature labels (RFC 9421)', () => {
  it('rejects a duplicate label in Signature-Input', () => {
    const input =
      'sig1=("@method");keyid="k1";created=1;alg="ed25519", sig1=("@path");keyid="k2";created=2;alg="ed25519"';
    expect(() => parseSignatureInput(input)).toThrow(HttpSignatureError);
  });

  it('rejects a duplicate label in Signature', () => {
    expect(() => parseSignatureHeader('sig1=:dGVzdA==:, sig1=:b3RoZXJzaWc=:')).toThrow(
      HttpSignatureError
    );
  });

  it('rejects mismatched labels across Signature-Input and Signature', () => {
    const input = 'sig1=("@method");keyid="k1";created=1;alg="ed25519"';
    expect(() => parseSignature(input, 'sig2=:dGVzdA==:')).toThrow(HttpSignatureError);
  });

  it('accepts multiple unique labels and resolves the requested one', () => {
    const input =
      'sig1=("@method");keyid="k1";created=1;alg="ed25519", sig2=("@path");keyid="k2";created=2;alg="ed25519"';
    const sig = 'sig1=:dGVzdA==:, sig2=:b3RoZXJzaWc=:';
    const parsed = parseSignature(input, sig, 'sig2');
    expect(parsed.params.keyid).toBe('k2');
  });
});

describe('duplicate covered components (RFC 9421 Section 2.5)', () => {
  it('rejects a duplicate derived component', () => {
    expect(() =>
      buildSignatureBase(REQUEST, { keyid: 'k1', coveredComponents: ['@method', '@method'] })
    ).toThrow(HttpSignatureError);
  });

  it('rejects a duplicate header component', () => {
    expect(() =>
      buildSignatureBase(REQUEST, {
        keyid: 'k1',
        coveredComponents: ['@method', 'content-type', 'content-type'],
      })
    ).toThrow(HttpSignatureError);
  });

  it('accepts a unique component set', () => {
    expect(() =>
      buildSignatureBase(REQUEST, {
        keyid: 'k1',
        coveredComponents: ['@method', '@authority', '@path'],
      })
    ).not.toThrow();
  });
});

describe('fail-closed parsing of malformed members (RFC 8941)', () => {
  it('rejects Signature-Input with a trailing malformed member', () => {
    const input = 'sig1=("@method");keyid="k1";created=1;alg="ed25519", garbage';
    expect(() => parseSignatureInput(input)).toThrow(HttpSignatureError);
  });

  it('rejects a malformed member in the Signature header', () => {
    expect(() => parseSignatureHeader('sig1=:dGVzdA==:, garbage')).toThrow(HttpSignatureError);
  });

  it('rejects a Signature value that is not a byte sequence', () => {
    expect(() => parseSignatureHeader('sig1=not-byte-sequence')).toThrow(HttpSignatureError);
  });

  it('rejects an inner list containing an unquoted token', () => {
    const input = 'sig1=("@method" garbage);keyid="k1";created=1;alg="ed25519"';
    expect(() => parseSignatureInput(input)).toThrow(HttpSignatureError);
  });

  it('still parses a well-formed multi-signature header', () => {
    const input =
      'sig1=("@method");keyid="k1";created=1;alg="ed25519", sig2=("@path");keyid="k2";created=2;alg="ed25519"';
    expect(parseSignatureInput(input).size).toBe(2);
  });
});
