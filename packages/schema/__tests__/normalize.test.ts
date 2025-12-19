/**
 * Schema Normalization Tests
 *
 * Verifies that toCoreClaims() produces byte-identical output
 * regardless of how the receipt was created.
 */

import { describe, it, expect } from 'vitest';
import {
  toCoreClaims,
  coreClaimsEqual,
  type CoreClaims,
  type PEACReceiptClaims,
  type PaymentEvidence,
  type ControlBlock,
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
    expect(core.payment.rail).toBe('x402');
    expect(core.payment.reference).toBe('pay_123');
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

  it('normalizes control block', () => {
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
    expect((core.payment as unknown as Record<string, unknown>).evidence).toBeUndefined();
  });

  it('includes optional payment fields when present', () => {
    const payment = createPayment({
      network: 'lightning',
      aggregator: 'marketplace_abc',
      routing: 'direct',
    });
    const claims = createReceipt({ payment });
    const core = toCoreClaims(claims);

    expect(core.payment.network).toBe('lightning');
    expect(core.payment.aggregator).toBe('marketplace_abc');
    expect(core.payment.routing).toBe('direct');
  });
});

describe('coreClaimsEqual', () => {
  it('returns true for identical receipts', () => {
    const a = createReceipt();
    const b = createReceipt();

    expect(coreClaimsEqual(a, b)).toBe(true);
  });

  it('returns false for different amounts', () => {
    const a = createReceipt({ amt: 1000 });
    const b = createReceipt({ amt: 2000 });

    expect(coreClaimsEqual(a, b)).toBe(false);
  });

  it('returns true when rail-specific evidence differs', () => {
    const a = createReceipt({
      payment: createPayment({ evidence: { payment_intent: 'pi_123' } }),
    });
    const b = createReceipt({
      payment: createPayment({ evidence: { payment_intent: 'pi_456' } }),
    });

    // Core claims should be equal because evidence is stripped
    expect(coreClaimsEqual(a, b)).toBe(true);
  });

  it('returns true when extra ext fields differ', () => {
    const a = createReceipt({
      ext: { aipref_snapshot: { url: 'https://a.com', hash: 'abc' } },
    });
    const b = createReceipt({
      ext: { aipref_snapshot: { url: 'https://b.com', hash: 'def' } },
    });

    // Core claims don't include aipref_snapshot
    expect(coreClaimsEqual(a, b)).toBe(true);
  });

  it('returns false when control decisions differ', () => {
    const controlA: ControlBlock = {
      chain: [{ engine: 'tap', result: 'allow' }],
      decision: 'allow',
    };
    const controlB: ControlBlock = {
      chain: [{ engine: 'tap', result: 'deny' }],
      decision: 'deny',
    };
    const a = createReceipt({ ext: { control: controlA } });
    const b = createReceipt({ ext: { control: controlB } });

    expect(coreClaimsEqual(a, b)).toBe(false);
  });
});

describe('JCS Canonical Parity', () => {
  it('produces byte-identical JCS output for equivalent receipts', () => {
    // Create two receipts with different field ordering and extra fields
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

    // Same receipt with different ordering and different evidence
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
});

describe('Cross-Mapping Parity', () => {
  /**
   * These tests verify that receipts created from different sources
   * (ACP, TAP, RSL) produce identical core claims when they represent
   * the same semantic payment.
   */

  it('ACP and x402 receipts with same payment produce identical core claims', () => {
    // Simulating a receipt created via ACP mapping
    const acpReceipt: PEACReceiptClaims = {
      iss: 'https://publisher.example.com',
      aud: 'https://publisher.example.com/article/123',
      iat: 1703000000,
      rid: 'acp-receipt-001',
      amt: 500,
      cur: 'USD',
      payment: {
        rail: 'x402',
        reference: 'checkout_abc',
        amount: 500,
        currency: 'USD',
        asset: 'USD',
        env: 'live',
        evidence: {
          checkout_id: 'checkout_abc',
          customer_id: 'cust_123',
          acp_metadata: { source: 'acp' },
        },
      },
    };

    // Simulating the same receipt created directly via x402
    const x402Receipt: PEACReceiptClaims = {
      iss: 'https://publisher.example.com',
      aud: 'https://publisher.example.com/article/123',
      iat: 1703000000,
      rid: 'acp-receipt-001',
      amt: 500,
      cur: 'USD',
      payment: {
        rail: 'x402',
        reference: 'checkout_abc',
        amount: 500,
        currency: 'USD',
        asset: 'USD',
        env: 'live',
        evidence: {
          payment_intent: 'pi_xyz',
          session_id: 'cs_xyz',
        },
      },
    };

    const canonicalAcp = canonicalize(toCoreClaims(acpReceipt));
    const canonicalX402 = canonicalize(toCoreClaims(x402Receipt));

    expect(canonicalAcp).toBe(canonicalX402);
  });

  it('receipts with TAP control produce consistent core claims', () => {
    const tapControlA: ControlBlock = {
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

    const tapControlB: ControlBlock = {
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

    const receiptA = createReceipt({ ext: { control: tapControlA } });
    const receiptB = createReceipt({ ext: { control: tapControlB } });

    const canonicalA = canonicalize(toCoreClaims(receiptA));
    const canonicalB = canonicalize(toCoreClaims(receiptB));

    // Both should have same core claims - only engine and result matter
    expect(canonicalA).toBe(canonicalB);
  });

  it('receipts with RSL-derived control have consistent normalization', () => {
    // RSL might set different purposes but if engine and result match, core is same
    const rslControlA: ControlBlock = {
      chain: [{ engine: 'rsl', result: 'allow', purpose: 'ai_index' }],
      decision: 'allow',
    };

    const rslControlB: ControlBlock = {
      chain: [{ engine: 'rsl', result: 'allow', purpose: 'train' }],
      decision: 'allow',
    };

    const receiptA = createReceipt({ ext: { control: rslControlA } });
    const receiptB = createReceipt({ ext: { control: rslControlB } });

    const canonicalA = canonicalize(toCoreClaims(receiptA));
    const canonicalB = canonicalize(toCoreClaims(receiptB));

    // Core claims are identical - purpose is not in core normalization
    expect(canonicalA).toBe(canonicalB);
  });
});
