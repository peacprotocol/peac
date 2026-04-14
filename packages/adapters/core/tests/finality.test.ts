import { describe, it, expect, vi } from 'vitest';
import {
  assertExplicitFinality,
  MapperBoundaryError,
  COMMERCE_FINALITY_SYNTHESIS_CODE,
  isFinalityEvent,
  type FinalityGuardInput,
} from '../src/finality.js';

const baseValid: FinalityGuardInput = {
  event: 'authorization',
  hasExplicitUpstreamArtifact: true,
  currency: 'USD',
  env: 'live',
  envExplicit: true,
};

describe('assertExplicitFinality(): rule 1 - finality event without upstream artifact', () => {
  for (const event of [
    'authorization',
    'capture',
    'settlement',
    'refund',
    'void',
    'chargeback',
  ] as const) {
    it(`rejects event=${event} when hasExplicitUpstreamArtifact is false (strict)`, () => {
      expect(() =>
        assertExplicitFinality(
          { ...baseValid, event, hasExplicitUpstreamArtifact: false },
          { mode: 'strict' }
        )
      ).toThrow(MapperBoundaryError);
    });
    it(`rejects event=${event} when hasExplicitUpstreamArtifact is false (interop)`, () => {
      expect(() =>
        assertExplicitFinality(
          { ...baseValid, event, hasExplicitUpstreamArtifact: false },
          { mode: 'interop' }
        )
      ).toThrow(MapperBoundaryError);
    });
    it(`rejects event=${event} when hasExplicitUpstreamArtifact is false (legacy)`, () => {
      expect(() =>
        assertExplicitFinality(
          { ...baseValid, event, hasExplicitUpstreamArtifact: false },
          { mode: 'legacy' }
        )
      ).toThrow(MapperBoundaryError);
    });
  }

  it('thrown error carries the stable code and pointer', () => {
    try {
      assertExplicitFinality(
        { ...baseValid, hasExplicitUpstreamArtifact: false },
        { pointer: '/proofs/x402/offer' }
      );
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(MapperBoundaryError);
      const e = err as MapperBoundaryError;
      expect(e.code).toBe(COMMERCE_FINALITY_SYNTHESIS_CODE);
      expect(e.pointer).toBe('/proofs/x402/offer');
    }
  });

  it('no-op when event is unset (discovery / capability path)', () => {
    expect(() =>
      assertExplicitFinality(
        {
          event: undefined,
          hasExplicitUpstreamArtifact: false,
          currency: 'USD',
          env: 'live',
          envExplicit: true,
        },
        { mode: 'strict' }
      )
    ).not.toThrow();
  });
});

describe('assertExplicitFinality(): rule 2 - silent currency fallback', () => {
  for (const bad of [undefined, '', 'UNKNOWN']) {
    it(`rejects currency=${JSON.stringify(bad)} in strict mode`, () => {
      expect(() =>
        assertExplicitFinality({ ...baseValid, currency: bad as string }, { mode: 'strict' })
      ).toThrow(MapperBoundaryError);
    });
    it(`warns (does not throw) for currency=${JSON.stringify(bad)} in interop mode`, () => {
      const warn = vi.fn();
      assertExplicitFinality({ ...baseValid, currency: bad as string }, { mode: 'interop', warn });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toMatch(/currency/);
    });
    it(`silent for currency=${JSON.stringify(bad)} in legacy mode`, () => {
      const warn = vi.fn();
      assertExplicitFinality({ ...baseValid, currency: bad as string }, { mode: 'legacy', warn });
      expect(warn).not.toHaveBeenCalled();
    });
  }
});

describe('assertExplicitFinality(): rule 3 - defaulted env', () => {
  it('rejects env=undefined in strict mode', () => {
    expect(() =>
      assertExplicitFinality(
        { ...baseValid, env: undefined, envExplicit: false },
        { mode: 'strict' }
      )
    ).toThrow(MapperBoundaryError);
  });
  it('rejects envExplicit=false in strict mode even if env is "live"', () => {
    expect(() =>
      assertExplicitFinality({ ...baseValid, env: 'live', envExplicit: false }, { mode: 'strict' })
    ).toThrow(MapperBoundaryError);
  });
  it('rejects env="production" in strict mode (closed enum live|test)', () => {
    expect(() =>
      assertExplicitFinality(
        { ...baseValid, env: 'production', envExplicit: true },
        { mode: 'strict' }
      )
    ).toThrow(MapperBoundaryError);
  });
  it('warns in interop mode for unset env', () => {
    const warn = vi.fn();
    assertExplicitFinality(
      { ...baseValid, env: undefined, envExplicit: false },
      { mode: 'interop', warn }
    );
    expect(warn).toHaveBeenCalled();
  });
  it('silent in legacy mode for unset env', () => {
    const warn = vi.fn();
    assertExplicitFinality(
      { ...baseValid, env: undefined, envExplicit: false },
      { mode: 'legacy', warn }
    );
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('assertExplicitFinality(): combined valid input', () => {
  it('does not throw or warn when all fields are explicit', () => {
    const warn = vi.fn();
    assertExplicitFinality(baseValid, { mode: 'strict', warn });
    expect(warn).not.toHaveBeenCalled();
  });
  it('does not throw for non-finality event with explicit fields', () => {
    expect(() =>
      assertExplicitFinality({ ...baseValid, event: 'discovery' }, { mode: 'strict' })
    ).not.toThrow();
  });
});

describe('isFinalityEvent()', () => {
  it('returns true for known finality events', () => {
    expect(isFinalityEvent('authorization')).toBe(true);
    expect(isFinalityEvent('settlement')).toBe(true);
    expect(isFinalityEvent('chargeback')).toBe(true);
  });
  it('returns false for unknown or undefined', () => {
    expect(isFinalityEvent(undefined)).toBe(false);
    expect(isFinalityEvent('discovery')).toBe(false);
    expect(isFinalityEvent('settled')).toBe(false);
  });
});

describe('MapperBoundaryError shape', () => {
  it('preserves code, pointer, upstreamArtifactHash', () => {
    const err = new MapperBoundaryError({
      code: COMMERCE_FINALITY_SYNTHESIS_CODE,
      pointer: '/p',
      upstreamArtifactHash: 'sha256:abc',
      reason: 'test',
    });
    expect(err.name).toBe('MapperBoundaryError');
    expect(err.code).toBe(COMMERCE_FINALITY_SYNTHESIS_CODE);
    expect(err.pointer).toBe('/p');
    expect(err.upstreamArtifactHash).toBe('sha256:abc');
    expect(err.message).toContain('commerce.finality_synthesis_blocked');
    expect(err.message).toContain('test');
  });
});
