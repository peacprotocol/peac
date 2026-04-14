/**
 * Integration tests for x402 settlement-proof extraction and observation.
 *
 * Covers:
 *   - dual-header extraction precedence (PEAC-Receipt -> PAYMENT-RESPONSE
 *     v2 -> X-PAYMENT-RESPONSE v1)
 *   - duplicate-proof handling (multiple headers present)
 *   - offer-only rejection (no settlement proof)
 *   - empty-proof rejection
 *   - strict-mode currency / env enforcement
 *   - mapper-boundary code + pointer on thrown errors
 *   - amount semantics (minor units, no currency-aware scaling)
 *   - case-insensitive header matching + multi-value header join
 */

import { describe, it, expect, vi } from 'vitest';
import { MapperBoundaryError, COMMERCE_FINALITY_SYNTHESIS_CODE } from '@peac/adapter-core';
import {
  extractSettlementProofFromHeaders,
  fromX402SettlementObservation,
  type ExtractedSettlementProof,
  type X402SettlementObservationInput,
} from '../src/index.js';

function input(
  overrides: Partial<X402SettlementObservationInput> = {}
): X402SettlementObservationInput {
  return {
    proof: { source: 'PEAC-Receipt', wire_version: 'peac', raw_value: 'eyJraWQ.opaque' },
    scheme: 'exact',
    network: 'base-sepolia',
    asset: '0xUSDC',
    currency: 'USD',
    amount_minor: '1500',
    env: 'live',
    pay_to: '0xRecipient',
    facilitator: 'fac.example',
    offer_reference: 'offer_001',
    ...overrides,
  };
}

describe('extractSettlementProofFromHeaders: precedence + multi-source', () => {
  it('PEAC-Receipt only', () => {
    const out = extractSettlementProofFromHeaders({ 'PEAC-Receipt': 'eyJ.peac' });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source: 'PEAC-Receipt', wire_version: 'peac' });
  });

  it('PAYMENT-RESPONSE (v2) only', () => {
    const out = extractSettlementProofFromHeaders({ 'PAYMENT-RESPONSE': 'v2-bytes' });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source: 'PAYMENT-RESPONSE', wire_version: 'v2' });
  });

  it('X-PAYMENT-RESPONSE (v1) only', () => {
    const out = extractSettlementProofFromHeaders({ 'X-PAYMENT-RESPONSE': 'v1-bytes' });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source: 'X-PAYMENT-RESPONSE', wire_version: 'v1' });
  });

  it('returns all three in precedence order when all present', () => {
    const out = extractSettlementProofFromHeaders({
      'PEAC-Receipt': 'a',
      'PAYMENT-RESPONSE': 'b',
      'X-PAYMENT-RESPONSE': 'c',
    });
    expect(out.map((p) => p.source)).toEqual([
      'PEAC-Receipt',
      'PAYMENT-RESPONSE',
      'X-PAYMENT-RESPONSE',
    ]);
  });

  it('empty bag produces empty array (no synthesis)', () => {
    expect(extractSettlementProofFromHeaders({})).toEqual([]);
  });

  it('case-insensitive header matching', () => {
    const out = extractSettlementProofFromHeaders({ 'peac-receipt': 'lower' });
    expect(out).toHaveLength(1);
    expect(out[0]?.raw_value).toBe('lower');
  });

  it('multi-value header is joined preserving content', () => {
    const out = extractSettlementProofFromHeaders({ 'PAYMENT-RESPONSE': ['part1', 'part2'] });
    expect(out[0]?.raw_value).toBe('part1, part2');
  });
});

describe('fromX402SettlementObservation: positive path', () => {
  it('emits commerce.event=settlement with the supplied proof preserved', () => {
    const proof: ExtractedSettlementProof = {
      source: 'PAYMENT-RESPONSE',
      wire_version: 'v2',
      raw_value: 'v2-bytes',
    };
    const out = fromX402SettlementObservation(input({ proof }));
    expect(out.rail).toBe('x402');
    expect(out.evidence.commerce_event).toBe('settlement');
    expect(out.evidence.proofs.x402.settlement.raw_value).toBe('v2-bytes');
    expect(out.evidence.proofs.x402.settlement.source).toBe('PAYMENT-RESPONSE');
    expect(out.evidence.proofs.x402.settlement.wire_version).toBe('v2');
  });

  it('preserves scheme, network, pay_to, facilitator, offer_reference verbatim', () => {
    const out = fromX402SettlementObservation(
      input({ scheme: 'upto', network: 'base', pay_to: '0xX', facilitator: 'cdp.coinbase' })
    );
    expect(out.evidence.x402_scheme).toBe('upto');
    expect(out.evidence.x402_network).toBe('base');
    expect(out.evidence.x402_pay_to).toBe('0xX');
    expect(out.evidence.x402_facilitator).toBe('cdp.coinbase');
    expect(out.evidence.x402_offer_reference).toBe('offer_001');
  });
});

describe('fromX402SettlementObservation: rejection paths', () => {
  it('rejects offer-only data (empty raw_value) in ALL modes', () => {
    const offerOnly: ExtractedSettlementProof = {
      source: 'PAYMENT-RESPONSE',
      wire_version: 'v2',
      raw_value: '',
    };
    for (const mode of ['strict', 'interop', 'legacy'] as const) {
      expect(() => fromX402SettlementObservation(input({ proof: offerOnly }), { mode })).toThrow(
        MapperBoundaryError
      );
    }
  });

  it('strict rejects UNKNOWN currency', () => {
    expect(() =>
      fromX402SettlementObservation(input({ currency: 'UNKNOWN' }), { mode: 'strict' })
    ).toThrow(MapperBoundaryError);
  });

  it('strict rejects out-of-enum env', () => {
    expect(() =>
      fromX402SettlementObservation(input({ env: 'production' as 'live' | 'test' }), {
        mode: 'strict',
      })
    ).toThrow(MapperBoundaryError);
  });

  it('thrown error carries stable code and pointer', () => {
    const offerOnly: ExtractedSettlementProof = {
      source: 'PEAC-Receipt',
      wire_version: 'peac',
      raw_value: '',
    };
    try {
      fromX402SettlementObservation(input({ proof: offerOnly }));
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MapperBoundaryError);
      expect((err as MapperBoundaryError).code).toBe(COMMERCE_FINALITY_SYNTHESIS_CODE);
      expect((err as MapperBoundaryError).pointer).toBe('/proofs/x402/settlement');
    }
  });

  it('interop warns on UNKNOWN currency without throwing', () => {
    const warn = vi.fn();
    fromX402SettlementObservation(input({ currency: 'UNKNOWN' }), { mode: 'interop', warn });
    expect(warn).toHaveBeenCalled();
  });
});

describe('fromX402SettlementObservation: amount semantics (minor units)', () => {
  it('payment.amount is integer minor-unit value', () => {
    const out = fromX402SettlementObservation(input({ amount_minor: '99999' }));
    expect(out.amount).toBe(99999);
  });

  it('does not apply currency-aware scaling', () => {
    const usd = fromX402SettlementObservation(input({ currency: 'USD', amount_minor: '1000' }));
    const jpy = fromX402SettlementObservation(input({ currency: 'JPY', amount_minor: '1000' }));
    expect(usd.amount).toBe(1000);
    expect(jpy.amount).toBe(1000);
  });
});
