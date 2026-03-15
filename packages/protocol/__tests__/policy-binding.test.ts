/**
 * Policy binding tests (v0.12.0-preview.1, DD-49, DD-151)
 *
 * Tests for:
 *   - verifyPolicyBinding() (Layer 1 pure comparison, from @peac/schema)
 *   - computePolicyDigestJcs() (Layer 3 JCS+SHA-256, from @peac/protocol)
 *   - checkPolicyBinding() (Layer 3 3-state logic, from @peac/protocol)
 *   - verifyLocal() Wire 0.2 policy binding integration
 *   - Wire 0.1 regression: policy_binding always 'unavailable'
 *
 * Tests assert on code and policy_binding status only; no message string fragments.
 */

import { describe, it, expect } from 'vitest';
import { generateKeypair } from '@peac/crypto';
import type { JsonValue } from '@peac/kernel';
import { verifyPolicyBinding } from '@peac/schema';
import {
  computePolicyDigestJcs,
  checkPolicyBinding,
  issueWire02,
  issueWire01,
  verifyLocal,
} from '../src/index';
import { verifyLocalWire01 } from '../src/verify-local-wire01';

// Shared test constants
const testKid = '2026-01-15T10:30:00Z';
const testIss = 'https://api.example.com';
const testType = 'org.peacprotocol/payment';
const testExtensions = {
  'org.peacprotocol/commerce': {
    payment_rail: 'stripe',
    amount_minor: '1000',
    currency: 'USD',
  },
};

// ---------------------------------------------------------------------------
// verifyPolicyBinding() (Layer 1 pure comparison)
// ---------------------------------------------------------------------------

describe('verifyPolicyBinding(): Layer 1 pure comparison', () => {
  it('returns verified when both digests are identical strings', () => {
    const digest = 'sha256:' + 'a'.repeat(64);
    expect(verifyPolicyBinding(digest, digest)).toBe('verified');
  });

  it('returns failed when digests differ', () => {
    const d1 = 'sha256:' + 'a'.repeat(64);
    const d2 = 'sha256:' + 'b'.repeat(64);
    expect(verifyPolicyBinding(d1, d2)).toBe('failed');
  });

  it('returns failed when one digit differs', () => {
    const d1 = 'sha256:' + 'a'.repeat(63) + 'b';
    const d2 = 'sha256:' + 'a'.repeat(63) + 'c';
    expect(verifyPolicyBinding(d1, d2)).toBe('failed');
  });

  it('is case-sensitive: same hex in different case returns failed', () => {
    const dLower = 'sha256:' + 'abcdef'.repeat(10) + 'abcd';
    const dUpper = 'sha256:' + 'ABCDEF'.repeat(10) + 'ABCD';
    expect(verifyPolicyBinding(dLower, dUpper)).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// computePolicyDigestJcs() (Layer 3 JCS+SHA-256)
// ---------------------------------------------------------------------------

describe('computePolicyDigestJcs(): JCS+SHA-256 canonicalization', () => {
  it('returns a string in sha256:<64 hex> format', async () => {
    const policy: JsonValue = { version: '1.0', allow: true };
    const digest = await computePolicyDigestJcs(policy);
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('is deterministic: same input produces same digest on multiple calls', async () => {
    const policy: JsonValue = { resource: 'https://example.com', action: 'read' };
    const d1 = await computePolicyDigestJcs(policy);
    const d2 = await computePolicyDigestJcs(policy);
    expect(d1).toBe(d2);
  });

  it('is key-order independent: same fields in different order produce same digest', async () => {
    const p1: JsonValue = { a: 1, b: 2, c: 3 };
    const p2: JsonValue = { c: 3, a: 1, b: 2 };
    const d1 = await computePolicyDigestJcs(p1);
    const d2 = await computePolicyDigestJcs(p2);
    expect(d1).toBe(d2);
  });

  it('nested objects are also key-order independent', async () => {
    const p1: JsonValue = { outer: { y: 2, x: 1 }, z: 3 };
    const p2: JsonValue = { z: 3, outer: { x: 1, y: 2 } };
    const d1 = await computePolicyDigestJcs(p1);
    const d2 = await computePolicyDigestJcs(p2);
    expect(d1).toBe(d2);
  });

  it('different values produce different digests', async () => {
    const p1: JsonValue = { allow: true };
    const p2: JsonValue = { allow: false };
    const d1 = await computePolicyDigestJcs(p1);
    const d2 = await computePolicyDigestJcs(p2);
    expect(d1).not.toBe(d2);
  });

  it('handles null values in JSON', async () => {
    const policy: JsonValue = { reason: null, version: '1' };
    const digest = await computePolicyDigestJcs(policy);
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('handles arrays in policy values', async () => {
    const policy: JsonValue = { allowed_actions: ['read', 'list'], deny: [] };
    const digest = await computePolicyDigestJcs(policy);
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('handles a string policy value', async () => {
    const policy: JsonValue = 'allow-all';
    const digest = await computePolicyDigestJcs(policy);
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('golden vector: {b:2,a:1} sorts to {"a":1,"b":2} under JCS', async () => {
    // Frozen cross-language test vector.
    // JCS of {b:2,a:1} -> '{"a":1,"b":2}' -> sha256(UTF-8 bytes) = value below.
    // If this fails, the JCS canonicalization or SHA-256 pipeline changed.
    const digest = await computePolicyDigestJcs({ b: 2, a: 1 } as JsonValue);
    expect(digest).toBe('sha256:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777');
  });

  it('golden vector: {version:"1.0",allow:true} sorts to {"allow":true,"version":"1.0"}', async () => {
    // Frozen: key order in source is irrelevant; JCS always sorts lexicographically.
    // '{"allow":true,"version":"1.0"}' -> sha256(UTF-8) = value below.
    const digest = await computePolicyDigestJcs({ version: '1.0', allow: true } as JsonValue);
    expect(digest).toBe('sha256:432a29aa96491286bbc4039e7c8650a264eafd4746aab497de454baf9be1b70a');
  });

  it('throws for non-finite number values (RFC 8785 rejects NaN)', async () => {
    // RFC 8785 (JCS) section 3.2.2: IEEE 754 infinity and NaN are not permitted.
    // canonicalize() throws "Cannot canonicalize non-finite number" for NaN values.
    await expect(computePolicyDigestJcs({ x: NaN } as unknown as JsonValue)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// checkPolicyBinding() (3-state logic)
// ---------------------------------------------------------------------------

describe('checkPolicyBinding(): 3-state logic', () => {
  it('returns unavailable when both arguments are undefined', () => {
    expect(checkPolicyBinding(undefined, undefined)).toBe('unavailable');
  });

  it('returns unavailable when receiptDigest is undefined', () => {
    expect(checkPolicyBinding(undefined, 'sha256:' + 'a'.repeat(64))).toBe('unavailable');
  });

  it('returns unavailable when localDigest is undefined', () => {
    expect(checkPolicyBinding('sha256:' + 'a'.repeat(64), undefined)).toBe('unavailable');
  });

  it('returns verified when both digests match', () => {
    const digest = 'sha256:' + 'f'.repeat(64);
    expect(checkPolicyBinding(digest, digest)).toBe('verified');
  });

  it('returns failed when digests do not match', () => {
    const d1 = 'sha256:' + 'a'.repeat(64);
    const d2 = 'sha256:' + 'b'.repeat(64);
    expect(checkPolicyBinding(d1, d2)).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// verifyLocal() Wire 0.2 policy binding integration
// ---------------------------------------------------------------------------

describe('verifyLocal(): Wire 0.2 policy binding', () => {
  it('policy_binding is unavailable when no policy block in receipt and no policyDigest option', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      extensions: testExtensions,
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.policy_binding).toBe('unavailable');
    }
  });

  it('policy_binding is unavailable when receipt has no policy block but caller provides policyDigest', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      extensions: testExtensions,
      privateKey,
      kid: testKid,
      // no policy block
    });

    const localPolicy: JsonValue = { version: '1.0', allow: true };
    const policyDigest = await computePolicyDigestJcs(localPolicy);

    const result = await verifyLocal(jws, publicKey, { policyDigest });

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      // receipt has no policy.digest; binding is unavailable
      expect(result.policy_binding).toBe('unavailable');
    }
  });

  it('policy_binding is unavailable when receipt has policy block but caller provides no policyDigest', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const localPolicy: JsonValue = { version: '1.0', resource: 'https://example.com' };
    const policyDigest = await computePolicyDigestJcs(localPolicy);

    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      extensions: testExtensions,
      privateKey,
      kid: testKid,
      policy: { digest: policyDigest },
    });

    // caller does not pass policyDigest option
    const result = await verifyLocal(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.policy_binding).toBe('unavailable');
    }
  });

  it('policy_binding is verified when receipt digest matches local policy digest', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const localPolicy: JsonValue = { version: '1.0', allow: ['read', 'write'] };
    const policyDigest = await computePolicyDigestJcs(localPolicy);

    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      extensions: testExtensions,
      privateKey,
      kid: testKid,
      policy: { digest: policyDigest },
    });

    const result = await verifyLocal(jws, publicKey, { policyDigest });

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.policy_binding).toBe('verified');
    }
  });

  it('policy_binding verified: key order in policy is irrelevant (JCS normalization)', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    // Issue with policy in one key order
    const policyAtIssue: JsonValue = { b: 2, a: 1, c: 'foo' };
    const policyDigestAtIssue = await computePolicyDigestJcs(policyAtIssue);

    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      extensions: testExtensions,
      privateKey,
      kid: testKid,
      policy: { digest: policyDigestAtIssue },
    });

    // Verify with same policy in different key order
    const policyAtVerify: JsonValue = { c: 'foo', a: 1, b: 2 };
    const policyDigestAtVerify = await computePolicyDigestJcs(policyAtVerify);

    const result = await verifyLocal(jws, publicKey, { policyDigest: policyDigestAtVerify });

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.policy_binding).toBe('verified');
    }
  });

  it('returns E_INVALID_FORMAT when policyDigest option is malformed', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      extensions: testExtensions,
      privateKey,
      kid: testKid,
    });

    const result = await verifyLocal(jws, publicKey, {
      policyDigest: 'not-a-valid-digest',
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_INVALID_FORMAT');
    }
  });

  it('returns E_INVALID_FORMAT for policyDigest with uppercase hex (not lowercase)', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      extensions: testExtensions,
      privateKey,
      kid: testKid,
    });

    // uppercase hex is not valid per HASH.pattern (/^sha256:[0-9a-f]{64}$/)
    const upperCaseDigest = 'sha256:' + 'A'.repeat(64);
    const result = await verifyLocal(jws, publicKey, { policyDigest: upperCaseDigest });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_INVALID_FORMAT');
    }
  });

  it('returns E_POLICY_BINDING_FAILED when receipt digest does not match local policy digest', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const issuedPolicy: JsonValue = { version: '1.0', allow: true };
    const policyDigestInReceipt = await computePolicyDigestJcs(issuedPolicy);

    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      extensions: testExtensions,
      privateKey,
      kid: testKid,
      policy: { digest: policyDigestInReceipt },
    });

    // Provide a DIFFERENT local policy
    const differentPolicy: JsonValue = { version: '1.0', allow: false };
    const differentDigest = await computePolicyDigestJcs(differentPolicy);

    const result = await verifyLocal(jws, publicKey, { policyDigest: differentDigest });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_POLICY_BINDING_FAILED');
    }
  });

  it('E_POLICY_BINDING_FAILED even when all other receipt fields are valid', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const p1: JsonValue = { rule: 'allow', scope: 'global' };
    const p2: JsonValue = { rule: 'deny', scope: 'global' };
    const d1 = await computePolicyDigestJcs(p1);
    const d2 = await computePolicyDigestJcs(p2);

    // Issue with p1 digest but verify with p2 digest
    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      extensions: testExtensions,
      pillars: ['access', 'commerce'],
      privateKey,
      kid: testKid,
      policy: { digest: d1 },
    });

    const result = await verifyLocal(jws, publicKey, {
      policyDigest: d2,
      issuer: testIss,
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('E_POLICY_BINDING_FAILED');
    }
  });

  it('challenge kind: policy_binding is verified when digest matches', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const localPolicy: JsonValue = { challenge_policy: 'strict' };
    const policyDigest = await computePolicyDigestJcs(localPolicy);

    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'challenge',
      type: 'org.peacprotocol/payment',
      privateKey,
      kid: testKid,
      policy: { digest: policyDigest },
    });

    const result = await verifyLocal(jws, publicKey, { policyDigest });

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.claims.kind).toBe('challenge');
      expect(result.policy_binding).toBe('verified');
    }
  });

  it('policy block with uri hint: uri is preserved in claims, binding computed from digest only', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const localPolicy: JsonValue = { version: '2.0' };
    const policyDigest = await computePolicyDigestJcs(localPolicy);

    const { jws } = await issueWire02({
      iss: testIss,
      kind: 'evidence',
      type: testType,
      extensions: testExtensions,
      privateKey,
      kid: testKid,
      policy: {
        digest: policyDigest,
        uri: 'https://example.com/policy/v2',
        version: '2.0',
      },
    });

    const result = await verifyLocal(jws, publicKey, { policyDigest });

    expect(result.valid).toBe(true);
    if (result.valid && result.variant === 'wire-02') {
      expect(result.policy_binding).toBe('verified');
      expect(result.claims.policy?.uri).toBe('https://example.com/policy/v2');
    }
  });
});

// ---------------------------------------------------------------------------
// Wire 0.1 regression: policy_binding always 'unavailable'
// ---------------------------------------------------------------------------

describe('Wire 0.1 regression: policy_binding is always unavailable', () => {
  const issueOpts = {
    iss: 'https://api.example.com',
    aud: 'https://client.example.com',
    amt: 1000,
    cur: 'USD',
    rail: 'x402',
    reference: 'tx_abc123',
    asset: 'USD',
    env: 'test' as const,
    evidence: {},
  };

  it('commerce receipt without policyDigest option: policy_binding is unavailable', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire01({ ...issueOpts, privateKey, kid: testKid });

    const result = await verifyLocalWire01(jws, publicKey);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.wireVersion).toBe('0.1');
      expect(result.policy_binding).toBe('unavailable');
    }
  });

  it('commerce receipt with policyDigest option: policy_binding still unavailable (Wire 0.1 ignores option)', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const { jws } = await issueWire01({ ...issueOpts, privateKey, kid: testKid });

    const localPolicy: JsonValue = { version: '1.0' };
    const policyDigest = await computePolicyDigestJcs(localPolicy);

    const result = await verifyLocalWire01(jws, publicKey, { policyDigest });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.wireVersion).toBe('0.1');
      expect(result.policy_binding).toBe('unavailable');
    }
  });
});
