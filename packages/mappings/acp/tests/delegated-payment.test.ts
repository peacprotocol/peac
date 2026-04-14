/**
 * Integration tests for fromACPDelegatedPaymentObservation.
 *
 * Verifies:
 *  - default (interop) mode preserves expected behavior
 *  - strict mode rejects missing or out-of-enum env, missing currency
 *  - terminal states (pending/failed/revoked) MUST NOT emit a commerce event
 *  - authorized/settled emit the corresponding commerce events
 *  - upstream artifact is preserved verbatim under proofs.acp.delegated_payment
 *  - thrown errors carry the stable mapper-boundary code
 */

import { describe, it, expect, vi } from 'vitest';
import { MapperBoundaryError, COMMERCE_FINALITY_SYNTHESIS_CODE } from '@peac/adapter-core';
import {
  fromACPDelegatedPaymentObservation,
  type ACPDelegatedPaymentObservation,
  type DelegatedPaymentState,
} from '../src/index.js';

function makeObservation(
  overrides: Partial<ACPDelegatedPaymentObservation> = {}
): ACPDelegatedPaymentObservation {
  return {
    delegation_id: 'del_test_001',
    resource_uri: 'https://merchant.example.com/checkout/abc',
    principal: 'user_123',
    delegate: 'agent_xyz',
    payment_method_token_ref: 'pmt_ref_opaque',
    authorized_amount_minor: '2599',
    currency: 'USD',
    env: 'live',
    observed_payment_state: 'authorized',
    artifact_kind: 'authorization',
    upstream_artifact: { source: 'acp.delegated_payment.v1', raw: { x: 1 } },
    session_id: 'sess_001',
    ...overrides,
  };
}

describe('fromACPDelegatedPaymentObservation: positive path', () => {
  it('emits authorization commerce event for observed_payment_state=authorized', () => {
    const out = fromACPDelegatedPaymentObservation(makeObservation());
    expect(out.payment.evidence?.commerce_event).toBe('authorization');
    expect(out.payment.evidence?.observed_payment_state).toBe('authorized');
    expect(out.payment.currency).toBe('USD');
    expect(out.payment.env).toBe('live');
  });

  it('emits settlement commerce event for observed_payment_state=settled with matching artifact_kind', () => {
    const out = fromACPDelegatedPaymentObservation(
      makeObservation({ observed_payment_state: 'settled', artifact_kind: 'settlement' })
    );
    expect(out.payment.evidence?.commerce_event).toBe('settlement');
  });

  it('preserves the raw upstream artifact verbatim under proofs.acp.delegated_payment', () => {
    const upstream = { vendor: 'opaque', nested: { v: 42 } };
    const out = fromACPDelegatedPaymentObservation(
      makeObservation({ upstream_artifact: upstream })
    );
    const proofs = out.payment.evidence?.proofs as {
      acp: { delegated_payment: { upstream_artifact: unknown } };
    };
    expect(proofs.acp.delegated_payment.upstream_artifact).toEqual(upstream);
  });
});

describe('fromACPDelegatedPaymentObservation: settlement-proof discriminator', () => {
  it('rejects settled with no artifact_kind in ALL modes (rule 1 finality violation)', () => {
    const obs = makeObservation({
      observed_payment_state: 'settled',
      artifact_kind: undefined,
    });
    for (const mode of ['strict', 'interop', 'legacy'] as const) {
      expect(() => fromACPDelegatedPaymentObservation(obs, { mode })).toThrow(MapperBoundaryError);
    }
  });

  it('rejects settled with artifact_kind=authorization in ALL modes', () => {
    const obs = makeObservation({
      observed_payment_state: 'settled',
      artifact_kind: 'authorization',
    });
    for (const mode of ['strict', 'interop', 'legacy'] as const) {
      expect(() => fromACPDelegatedPaymentObservation(obs, { mode })).toThrow(MapperBoundaryError);
    }
  });

  it('rejects authorized with artifact_kind=settlement in ALL modes', () => {
    const obs = makeObservation({
      observed_payment_state: 'authorized',
      artifact_kind: 'settlement',
    });
    for (const mode of ['strict', 'interop', 'legacy'] as const) {
      expect(() => fromACPDelegatedPaymentObservation(obs, { mode })).toThrow(MapperBoundaryError);
    }
  });

  it('thrown error carries the stable code and pointer for mismatch', () => {
    try {
      fromACPDelegatedPaymentObservation(
        makeObservation({
          observed_payment_state: 'settled',
          artifact_kind: 'authorization',
        })
      );
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MapperBoundaryError);
      expect((err as MapperBoundaryError).code).toBe(COMMERCE_FINALITY_SYNTHESIS_CODE);
      expect((err as MapperBoundaryError).pointer).toBe('/proofs/acp/delegated_payment');
    }
  });

  it('preserves artifact_kind under proofs.acp.delegated_payment', () => {
    const out = fromACPDelegatedPaymentObservation(
      makeObservation({
        observed_payment_state: 'settled',
        artifact_kind: 'settlement',
      })
    );
    const block = (
      out.payment.evidence as { proofs: { acp: { delegated_payment: Record<string, unknown> } } }
    ).proofs.acp.delegated_payment;
    expect(block.artifact_kind).toBe('settlement');
  });
});

describe('fromACPDelegatedPaymentObservation: amount semantics (minor units)', () => {
  it('payment.amount is the integer minor-unit value parsed from authorized_amount_minor', () => {
    const out = fromACPDelegatedPaymentObservation(
      makeObservation({ authorized_amount_minor: '12345' })
    );
    expect(out.payment.amount).toBe(12345);
    expect(out.amt).toBe(12345);
  });

  it('preserves the canonical authorized_amount_minor string under evidence', () => {
    const out = fromACPDelegatedPaymentObservation(
      makeObservation({ authorized_amount_minor: '99999999999' })
    );
    expect(out.payment.evidence?.authorized_amount_minor).toBe('99999999999');
  });

  it('does not apply currency-aware scaling (no division by 100)', () => {
    const usd = fromACPDelegatedPaymentObservation(
      makeObservation({ currency: 'USD', authorized_amount_minor: '1000' })
    );
    const jpy = fromACPDelegatedPaymentObservation(
      makeObservation({ currency: 'JPY', authorized_amount_minor: '1000' })
    );
    expect(usd.payment.amount).toBe(1000);
    expect(jpy.payment.amount).toBe(1000);
  });
});

describe('fromACPDelegatedPaymentObservation: terminal/non-finality states', () => {
  for (const state of ['pending', 'failed', 'revoked'] as DelegatedPaymentState[]) {
    it(`MUST NOT emit a commerce event for observed_payment_state=${state}`, () => {
      const out = fromACPDelegatedPaymentObservation(
        makeObservation({ observed_payment_state: state })
      );
      expect(out.payment.evidence?.commerce_event).toBeUndefined();
    });
  }
});

describe('fromACPDelegatedPaymentObservation: strict-mode rejection', () => {
  it('strict rejects missing currency', () => {
    expect(() =>
      fromACPDelegatedPaymentObservation(makeObservation({ currency: '' }), { mode: 'strict' })
    ).toThrow(MapperBoundaryError);
  });

  it('strict rejects UNKNOWN currency fallback', () => {
    expect(() =>
      fromACPDelegatedPaymentObservation(makeObservation({ currency: 'UNKNOWN' }), {
        mode: 'strict',
      })
    ).toThrow(MapperBoundaryError);
  });

  it('strict rejects out-of-enum env', () => {
    expect(() =>
      fromACPDelegatedPaymentObservation(
        makeObservation({ env: 'production' as 'live' | 'test' }),
        { mode: 'strict' }
      )
    ).toThrow(MapperBoundaryError);
  });

  it('thrown error carries the stable mapper-boundary code and pointer', () => {
    try {
      fromACPDelegatedPaymentObservation(makeObservation({ currency: '' }), { mode: 'strict' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MapperBoundaryError);
      const e = err as MapperBoundaryError;
      expect(e.code).toBe(COMMERCE_FINALITY_SYNTHESIS_CODE);
      expect(e.pointer).toBe('/proofs/acp/delegated_payment');
    }
  });
});

describe('fromACPDelegatedPaymentObservation: interop default behavior', () => {
  it('does not throw with valid input under default (interop) mode', () => {
    const warn = vi.fn();
    const out = fromACPDelegatedPaymentObservation(makeObservation(), { warn });
    expect(out.payment.rail).toBe('acp-delegated-payment');
    // Valid input does not warn.
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns under interop for fallback currency without throwing', () => {
    const warn = vi.fn();
    fromACPDelegatedPaymentObservation(makeObservation({ currency: 'UNKNOWN' }), {
      mode: 'interop',
      warn,
    });
    expect(warn).toHaveBeenCalled();
  });
});

describe('fromACPDelegatedPaymentObservation: input validation', () => {
  it('rejects missing delegation_id', () => {
    expect(() =>
      fromACPDelegatedPaymentObservation(makeObservation({ delegation_id: '' }))
    ).toThrow(/delegation_id/);
  });

  it('rejects non-https resource_uri', () => {
    expect(() =>
      fromACPDelegatedPaymentObservation(makeObservation({ resource_uri: 'http://x' }))
    ).toThrow(/resource_uri/);
  });

  it('rejects non-integer authorized_amount_minor', () => {
    expect(() =>
      fromACPDelegatedPaymentObservation(makeObservation({ authorized_amount_minor: '12.34' }))
    ).toThrow(/authorized_amount_minor/);
  });

  it('rejects missing payment_method_token_ref', () => {
    expect(() =>
      fromACPDelegatedPaymentObservation(makeObservation({ payment_method_token_ref: '' }))
    ).toThrow(/payment_method_token_ref/);
  });
});
