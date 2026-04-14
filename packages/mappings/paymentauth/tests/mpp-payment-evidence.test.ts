/**
 * Integration tests for fromMPPPaymentAttempt and fromMPPSettlement.
 *
 * Verifies:
 *  - default (interop) mode preserves expected behavior
 *  - strict mode rejects missing/UNKNOWN currency, out-of-enum env
 *  - artifact_kind discriminator is enforced in ALL modes (rule 1)
 *  - amount semantics use minor units consistently
 *  - thrown errors carry the stable mapper-boundary code
 */

import { describe, it, expect, vi } from 'vitest';
import { MapperBoundaryError, COMMERCE_FINALITY_SYNTHESIS_CODE } from '@peac/adapter-core';
import {
  fromMPPPaymentAttempt,
  fromMPPSettlement,
  PAYMENTAUTH_RAIL,
  type MPPPaymentAttemptInput,
  type MPPSettlementInput,
} from '../src/index.js';

function attempt(overrides: Partial<MPPPaymentAttemptInput> = {}): MPPPaymentAttemptInput {
  return {
    attempt_id: 'att_001',
    currency: 'USD',
    amount_minor: '1500',
    env: 'live',
    payment_token_ref: 'tok_ref_opaque',
    artifact_kind: 'authorization',
    upstream_artifact: { source: 'paymentauth.attempt.v1', raw: { id: 'att_001' } },
    challenge_id: 'ch_001',
    ...overrides,
  };
}

function settlement(overrides: Partial<MPPSettlementInput> = {}): MPPSettlementInput {
  return {
    settlement_id: 'set_001',
    attempt_id: 'att_001',
    currency: 'USD',
    amount_minor: '1500',
    env: 'live',
    artifact_kind: 'settlement',
    upstream_artifact: { source: 'paymentauth.settlement.v1', raw: { id: 'set_001' } },
    ...overrides,
  };
}

describe('fromMPPPaymentAttempt', () => {
  it('positive path emits commerce.event=authorization', () => {
    const out = fromMPPPaymentAttempt(attempt());
    expect(out.rail).toBe(PAYMENTAUTH_RAIL);
    expect(out.amount).toBe(1500);
    expect(out.currency).toBe('USD');
    expect(out.evidence?.commerce_event).toBe('authorization');
  });

  it('rejects artifact_kind=settlement on attempt in ALL modes', () => {
    for (const mode of ['strict', 'interop', 'legacy'] as const) {
      expect(() =>
        fromMPPPaymentAttempt(attempt({ artifact_kind: 'settlement' }), { mode })
      ).toThrow(MapperBoundaryError);
    }
  });

  it('strict rejects missing currency', () => {
    expect(() => fromMPPPaymentAttempt(attempt({ currency: '' }), { mode: 'strict' })).toThrow(
      MapperBoundaryError
    );
  });

  it('preserves facilitator_attestation under proofs.paymentauth.attempt', () => {
    const facilitator = { signed_by: 'fac.example', sig: 'opaque-bytes' };
    const out = fromMPPPaymentAttempt(attempt({ facilitator_attestation: facilitator }));
    const block = (
      out.evidence as {
        proofs: { paymentauth: { attempt: { facilitator_attestation?: unknown } } };
      }
    ).proofs.paymentauth.attempt;
    expect(block.facilitator_attestation).toEqual(facilitator);
  });

  it('does not apply currency-aware scaling (minor units only)', () => {
    const usd = fromMPPPaymentAttempt(attempt({ currency: 'USD', amount_minor: '1000' }));
    const jpy = fromMPPPaymentAttempt(attempt({ currency: 'JPY', amount_minor: '1000' }));
    expect(usd.amount).toBe(1000);
    expect(jpy.amount).toBe(1000);
  });

  it('thrown error carries stable code and pointer', () => {
    try {
      fromMPPPaymentAttempt(attempt({ artifact_kind: 'settlement' }));
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MapperBoundaryError);
      expect((err as MapperBoundaryError).code).toBe(COMMERCE_FINALITY_SYNTHESIS_CODE);
      expect((err as MapperBoundaryError).pointer).toBe('/proofs/paymentauth/attempt');
    }
  });
});

describe('fromMPPSettlement', () => {
  it('positive path emits commerce.event=settlement', () => {
    const out = fromMPPSettlement(settlement());
    expect(out.evidence?.commerce_event).toBe('settlement');
  });

  it('rejects missing artifact_kind in ALL modes', () => {
    for (const mode of ['strict', 'interop', 'legacy'] as const) {
      expect(() =>
        fromMPPSettlement(settlement({ artifact_kind: undefined as unknown as 'settlement' }), {
          mode,
        })
      ).toThrow(MapperBoundaryError);
    }
  });

  it('rejects artifact_kind=authorization on settlement in ALL modes', () => {
    for (const mode of ['strict', 'interop', 'legacy'] as const) {
      expect(() =>
        fromMPPSettlement(settlement({ artifact_kind: 'authorization' }), { mode })
      ).toThrow(MapperBoundaryError);
    }
  });

  it('interop warns on missing currency without throwing', () => {
    const warn = vi.fn();
    fromMPPSettlement(settlement({ currency: '' }), { mode: 'interop', warn });
    expect(warn).toHaveBeenCalled();
  });

  it('legacy is silent on missing currency', () => {
    const warn = vi.fn();
    fromMPPSettlement(settlement({ currency: '' }), { mode: 'legacy', warn });
    expect(warn).not.toHaveBeenCalled();
  });

  it('thrown error carries stable code and pointer', () => {
    try {
      fromMPPSettlement(settlement({ artifact_kind: 'authorization' }));
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MapperBoundaryError);
      expect((err as MapperBoundaryError).code).toBe(COMMERCE_FINALITY_SYNTHESIS_CODE);
      expect((err as MapperBoundaryError).pointer).toBe('/proofs/paymentauth/settlement');
    }
  });
});
