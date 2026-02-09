/**
 * Schema Normalization Unit Tests
 *
 * Tests for toCoreClaims() - the projection function that extracts
 * minimal semantic fields from receipt claims.
 *
 * NOTE: Cross-mapping parity tests (using real mapping outputs) are in
 * tests/parity/core-claims.test.ts to avoid workspace cycles.
 */

import { describe, it, expect } from 'vitest';
import {
  toCoreClaims,
  parseReceiptClaims,
  type PEACReceiptClaims,
  type PaymentEvidence,
  type ControlBlock,
  type ParseSuccess,
} from '../src/index.js';

/**
 * JCS Canonicalization (RFC 8785) - inlined to avoid cyclic dependency.
 * This is a copy of the implementation from @peac/crypto.
 */
function canonicalize(obj: unknown): string {
  if (obj === null) {
    return 'null';
  }

  if (typeof obj === 'boolean') {
    return obj ? 'true' : 'false';
  }

  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) {
      throw new Error('Cannot canonicalize non-finite number');
    }
    if (Object.is(obj, -0)) {
      return '0';
    }
    const str = JSON.stringify(obj);
    if (Number.isInteger(obj) && str.includes('e')) {
      return obj.toString();
    }
    return str;
  }

  if (typeof obj === 'string') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const elements = obj.map(canonicalize);
    return `[${elements.join(',')}]`;
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    const pairs = keys.map((key) => {
      const value = (obj as Record<string, unknown>)[key];
      return `${JSON.stringify(key)}:${canonicalize(value)}`;
    });
    return `{${pairs.join(',')}}`;
  }

  throw new Error(`Cannot canonicalize type: ${typeof obj}`);
}

/**
 * Create a base payment evidence object.
 */
function createPayment(overrides: Partial<PaymentEvidence> = {}): PaymentEvidence {
  return {
    rail: 'x402',
    reference: 'pay_123',
    amount: 1000,
    currency: 'USD',
    asset: 'USD',
    env: 'live' as const,
    evidence: { payment_intent: 'pi_123' },
    ...overrides,
  };
}

/**
 * Create a base receipt claims object.
 */
function createReceipt(overrides: Partial<PEACReceiptClaims> = {}): PEACReceiptClaims {
  return {
    iss: 'https://issuer.example.com',
    aud: 'https://resource.example.com/article/1',
    iat: 1703000000,
    rid: '0191234567890abc',
    amt: 1000,
    cur: 'USD',
    payment: createPayment(),
    ...overrides,
  };
}

describe('toCoreClaims', () => {
  it('extracts core claims from minimal receipt', () => {
    const claims = createReceipt();
    const core = toCoreClaims(claims);

    expect(core.iss).toBe('https://issuer.example.com');
    expect(core.aud).toBe('https://resource.example.com/article/1');
    expect(core.iat).toBe(1703000000);
    expect(core.rid).toBe('0191234567890abc');
    expect(core.amt).toBe(1000);
    expect(core.cur).toBe('USD');
    expect(core.payment!.rail).toBe('x402');
    expect(core.payment!.reference).toBe('pay_123');
    expect(core.exp).toBeUndefined();
    expect(core.subject).toBeUndefined();
    expect(core.control).toBeUndefined();
  });

  it('includes optional exp when present', () => {
    const claims = createReceipt({ exp: 1703003600 });
    const core = toCoreClaims(claims);

    expect(core.exp).toBe(1703003600);
  });

  it('includes subject when present', () => {
    const claims = createReceipt({
      subject: { uri: 'https://resource.example.com/article/1' },
    });
    const core = toCoreClaims(claims);

    expect(core.subject).toEqual({ uri: 'https://resource.example.com/article/1' });
  });

  it('normalizes control block - strips non-semantic fields', () => {
    const control: ControlBlock = {
      chain: [
        { engine: 'tap', result: 'allow', policy_id: 'policy_123', reason: 'Valid TAP' },
        { engine: 'spend-control', result: 'allow', limits_snapshot: { daily: 10000 } },
      ],
      decision: 'allow',
      combinator: 'any_can_veto',
    };
    const claims = createReceipt({ ext: { control } });
    const core = toCoreClaims(claims);

    expect(core.control).toBeDefined();
    expect(core.control!.chain).toHaveLength(2);
    // Normalized control only includes engine and result
    expect(core.control!.chain[0]).toEqual({ engine: 'tap', result: 'allow' });
    expect(core.control!.chain[1]).toEqual({ engine: 'spend-control', result: 'allow' });
  });

  it('strips rail-specific evidence from payment', () => {
    const payment = createPayment({
      evidence: {
        preimage: 'abc123',
        invoice: 'lnbc...',
        settled_at: 1703000000,
        node_id: '03...',
      },
    });
    const claims = createReceipt({ payment });
    const core = toCoreClaims(claims);

    // Normalized payment should not have evidence field
    expect((core.payment! as unknown as Record<string, unknown>).evidence).toBeUndefined();
  });

  it('includes optional payment fields when present', () => {
    const payment = createPayment({
      network: 'lightning',
      aggregator: 'marketplace_abc',
      routing: 'direct',
    });
    const claims = createReceipt({ payment });
    const core = toCoreClaims(claims);

    expect(core.payment!.network).toBe('lightning');
    expect(core.payment!.aggregator).toBe('marketplace_abc');
    expect(core.payment!.routing).toBe('direct');
  });

  it('is stable when optional blocks are absent', () => {
    // Minimal receipt with no optional fields
    const minimal: PEACReceiptClaims = {
      iss: 'https://issuer.example.com',
      aud: 'https://resource.example.com',
      iat: 1703000000,
      rid: 'receipt-001',
      amt: 100,
      cur: 'USD',
      payment: {
        rail: 'x402',
        reference: 'ref-001',
        amount: 100,
        currency: 'USD',
        asset: 'USD',
        env: 'live',
        evidence: {},
      },
    };

    const core = toCoreClaims(minimal);
    const canonical = canonicalize(core);

    // Should be deterministic and not contain undefined
    expect(canonical).not.toContain('undefined');
    expect(canonical).not.toContain('null');
    expect(core.exp).toBeUndefined();
    expect(core.subject).toBeUndefined();
    expect(core.control).toBeUndefined();
  });
});

describe('JCS Canonical Output', () => {
  it('produces byte-identical JCS output for equivalent receipts with different field order', () => {
    // Receipt with one field order
    const receiptA: PEACReceiptClaims = {
      iss: 'https://issuer.example.com',
      aud: 'https://resource.example.com/article/1',
      iat: 1703000000,
      rid: '0191234567890abc',
      amt: 1000,
      cur: 'USD',
      payment: {
        rail: 'x402',
        reference: 'pay_123',
        amount: 1000,
        currency: 'USD',
        asset: 'USD',
        env: 'live',
        evidence: { payment_intent: 'pi_123', extra: 'field' },
      },
    };

    // Same receipt with different field ordering and different evidence
    const receiptB: PEACReceiptClaims = {
      cur: 'USD',
      amt: 1000,
      aud: 'https://resource.example.com/article/1',
      iss: 'https://issuer.example.com',
      rid: '0191234567890abc',
      iat: 1703000000,
      payment: {
        evidence: { different: 'evidence', nested: { deep: true } },
        currency: 'USD',
        amount: 1000,
        reference: 'pay_123',
        rail: 'x402',
        asset: 'USD',
        env: 'live',
      },
    };

    const coreA = toCoreClaims(receiptA);
    const coreB = toCoreClaims(receiptB);

    const canonicalA = canonicalize(coreA);
    const canonicalB = canonicalize(coreB);

    expect(canonicalA).toBe(canonicalB);
  });

  it('produces different JCS output for different core fields', () => {
    const receiptA = createReceipt({ amt: 1000 });
    const receiptB = createReceipt({ amt: 1001 });

    const coreA = toCoreClaims(receiptA);
    const coreB = toCoreClaims(receiptB);

    const canonicalA = canonicalize(coreA);
    const canonicalB = canonicalize(coreB);

    expect(canonicalA).not.toBe(canonicalB);
  });

  it('control blocks with same engine/result but different metadata produce identical output', () => {
    const controlA: ControlBlock = {
      chain: [
        {
          engine: 'tap',
          result: 'allow',
          policy_id: 'visa-tap-001',
          reason: 'Signature valid',
          evidence_ref: 'https://visa.com/evidence/abc',
        },
      ],
      decision: 'allow',
      combinator: 'any_can_veto',
    };

    const controlB: ControlBlock = {
      chain: [
        {
          engine: 'tap',
          result: 'allow',
          version: '1.0',
          purpose: 'inference',
          scope: ['https://example.com/*'],
          limits_snapshot: { window: 480 },
        },
      ],
      decision: 'allow',
    };

    const receiptA = createReceipt({ ext: { control: controlA } });
    const receiptB = createReceipt({ ext: { control: controlB } });

    const canonicalA = canonicalize(toCoreClaims(receiptA));
    const canonicalB = canonicalize(toCoreClaims(receiptB));

    // Both should produce identical core claims
    expect(canonicalA).toBe(canonicalB);
  });
});

describe('toCoreClaims with ParseSuccess', () => {
  it('normalizes a parsed attestation receipt', () => {
    const parsed = parseReceiptClaims({
      iss: 'https://issuer.example.com',
      aud: 'https://resource.example.com',
      iat: 1703000000,
      exp: 1703003600,
      rid: '019abc12-3456-7890-abcd-ef0123456789',
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.variant).toBe('attestation');
    const core = toCoreClaims(parsed);

    expect(core.iss).toBe('https://issuer.example.com');
    expect(core.aud).toBe('https://resource.example.com');
    expect(core.iat).toBe(1703000000);
    expect(core.exp).toBe(1703003600);
    expect(core.rid).toBe('019abc12-3456-7890-abcd-ef0123456789');
    // Attestation receipts have no payment fields
    expect(core.amt).toBeUndefined();
    expect(core.cur).toBeUndefined();
    expect(core.payment).toBeUndefined();
    expect(core.control).toBeUndefined();
  });

  it('maps attestation sub to subject.uri', () => {
    const parsed = parseReceiptClaims({
      iss: 'https://issuer.example.com',
      aud: 'https://resource.example.com',
      iat: 1703000000,
      exp: 1703003600,
      rid: '019abc12-3456-7890-abcd-ef0123456789',
      sub: 'https://api.example.com/inference/v1',
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const core = toCoreClaims(parsed);
    expect(core.subject).toEqual({ uri: 'https://api.example.com/inference/v1' });
  });

  it('normalizes a parsed commerce receipt via ParseSuccess', () => {
    const parsed = parseReceiptClaims({
      iss: 'https://issuer.example.com',
      aud: 'https://resource.example.com/article/1',
      iat: 1703000000,
      rid: '019abc12-3456-7890-abcd-ef0123456789',
      amt: 1000,
      cur: 'USD',
      payment: {
        rail: 'x402',
        reference: 'pay_123',
        amount: 1000,
        currency: 'USD',
        asset: 'USD',
        env: 'live',
        evidence: { payment_intent: 'pi_123' },
      },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.variant).toBe('commerce');
    const core = toCoreClaims(parsed);

    expect(core.iss).toBe('https://issuer.example.com');
    expect(core.amt).toBe(1000);
    expect(core.cur).toBe('USD');
    expect(core.payment?.rail).toBe('x402');
  });

  it('backward compat: bare PEACReceiptClaims still works', () => {
    const claims = createReceipt();
    const core = toCoreClaims(claims);

    expect(core.iss).toBe('https://issuer.example.com');
    expect(core.amt).toBe(1000);
    expect(core.payment?.rail).toBe('x402');
  });

  it('produces deterministic output for both variants', () => {
    const attestation = parseReceiptClaims({
      iss: 'https://issuer.example.com',
      aud: 'https://resource.example.com',
      iat: 1703000000,
      exp: 1703003600,
      rid: '019abc12-3456-7890-abcd-ef0123456789',
    }) as ParseSuccess;

    const core = toCoreClaims(attestation);
    const canonical = canonicalize(core);

    // No undefined values in canonical output
    expect(canonical).not.toContain('undefined');
    expect(canonical).not.toContain('null');

    // Re-run produces identical output
    const core2 = toCoreClaims(attestation);
    expect(canonicalize(core2)).toBe(canonical);
  });
});
