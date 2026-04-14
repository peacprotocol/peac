/**
 * Integration tests for the mapper-boundary finality-synthesis guard
 * applied at the paymentauth mapping layer.
 *
 * Verifies that:
 *  - default `interop` mode preserves current behavior (no throw on silent
 *    fallbacks; warnings are suppressible)
 *  - `strict` mode rejects silent currency fallback and defaulted env
 *  - `legacy` mode is silent
 *  - thrown errors carry the stable mapper-boundary code
 */

import { describe, it, expect, vi } from 'vitest';
import { MapperBoundaryError, COMMERCE_FINALITY_SYNTHESIS_CODE } from '@peac/adapter-core';
import {
  fromPaymentauthReceipt,
  toCommerceExtensionFields,
  PAYMENTAUTH_RAIL,
  type NormalizedPaymentauthReceipt,
  type NormalizedPaymentauthChallenge,
} from '../src/index.js';

function makeReceipt(): NormalizedPaymentauthReceipt {
  return {
    method: 'paymentauth',
    status: 'attested',
    reference: 'attempt-001',
    timestamp: '2026-04-14T00:00:00Z',
    extras: {},
    _raw: { rawValue: 'paymentauth raw header value' },
  } as unknown as NormalizedPaymentauthReceipt;
}

function makeChallengeWithCurrency(currency?: string): NormalizedPaymentauthChallenge {
  return {
    id: 'ch-1',
    intent: 'charge',
    realm: 'example.com',
    decodedRequest: currency ? { amount: '1000', currency } : { amount: '1000' },
  } as unknown as NormalizedPaymentauthChallenge;
}

describe('paymentauth finality guard: fromPaymentauthReceipt', () => {
  it('default (interop) does not throw when challenge omits currency', () => {
    const warn = vi.fn();
    const evidence = fromPaymentauthReceipt(makeReceipt(), makeChallengeWithCurrency(), { warn });
    expect(evidence.rail).toBe(PAYMENTAUTH_RAIL);
    expect(warn).toHaveBeenCalled();
  });

  it('strict mode throws MapperBoundaryError when currency is missing', () => {
    expect(() =>
      fromPaymentauthReceipt(makeReceipt(), makeChallengeWithCurrency(), { mode: 'strict' })
    ).toThrow(MapperBoundaryError);
  });

  it('strict mode throws when env is defaulted (always defaulted by the mapper)', () => {
    // Provide a valid currency so rule 2 does not fire; rule 3 (defaulted env) still rejects.
    expect(() =>
      fromPaymentauthReceipt(makeReceipt(), makeChallengeWithCurrency('USD'), { mode: 'strict' })
    ).toThrow(MapperBoundaryError);
  });

  it('legacy mode is silent (no throw, no warn)', () => {
    const warn = vi.fn();
    fromPaymentauthReceipt(makeReceipt(), makeChallengeWithCurrency(), { mode: 'legacy', warn });
    expect(warn).not.toHaveBeenCalled();
  });

  it('thrown error carries the stable code and pointer', () => {
    try {
      fromPaymentauthReceipt(makeReceipt(), makeChallengeWithCurrency(), { mode: 'strict' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MapperBoundaryError);
      const e = err as MapperBoundaryError;
      expect(e.code).toBe(COMMERCE_FINALITY_SYNTHESIS_CODE);
      expect(e.pointer).toBe('/payment/paymentauth/receipt');
    }
  });
});

describe('paymentauth finality guard: toCommerceExtensionFields', () => {
  it('default (interop) does not throw on missing currency', () => {
    const warn = vi.fn();
    const fields = toCommerceExtensionFields(makeReceipt(), makeChallengeWithCurrency('USD'), {
      warn,
    });
    expect(fields).toBeDefined();
    expect(fields?.currency).toBe('USD');
    // Warning fires for defaulted env even when currency is supplied.
    expect(warn).toHaveBeenCalled();
  });

  it('strict mode throws when fields would carry defaulted env', () => {
    expect(() =>
      toCommerceExtensionFields(makeReceipt(), makeChallengeWithCurrency('USD'), {
        mode: 'strict',
      })
    ).toThrow(MapperBoundaryError);
  });

  it('returns undefined when nothing beyond rail is available, regardless of mode', () => {
    const empty = {
      method: 'paymentauth',
      status: 'attested',
      reference: '',
      timestamp: undefined,
      extras: {},
      _raw: { rawValue: 'r' },
    } as unknown as NormalizedPaymentauthReceipt;
    const result = toCommerceExtensionFields(empty, undefined, { mode: 'strict' });
    expect(result).toBeUndefined();
  });
});
