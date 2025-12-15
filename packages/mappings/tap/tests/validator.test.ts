import { describe, it, expect } from 'vitest';
import {
  validateTapTimeConstraints,
  validateTapAlgorithm,
  validateTapTag,
  isKnownTapTag,
} from '../src/validator.js';
import { TapError, ErrorCodes } from '../src/errors.js';
import type { ParsedSignatureParams } from '@peac/http-signatures';

describe('validateTapTimeConstraints', () => {
  const now = 1000;

  const baseParams: ParsedSignatureParams = {
    keyid: 'test-key',
    alg: 'ed25519',
    created: 900,
    expires: 1100,
    coveredComponents: ['@method'],
  };

  it('accepts valid time window', () => {
    expect(() => validateTapTimeConstraints(baseParams, now)).not.toThrow();
  });

  it('rejects missing expires', () => {
    const params = { ...baseParams, expires: undefined };
    expect(() => validateTapTimeConstraints(params, now)).toThrow(TapError);
  });

  it('rejects window > 8 minutes', () => {
    const params = { ...baseParams, created: 100, expires: 700 }; // 600s window
    expect(() => validateTapTimeConstraints(params, now)).toThrow(TapError);
    try {
      validateTapTimeConstraints(params, now);
    } catch (e) {
      expect((e as TapError).code).toBe(ErrorCodes.TAP_WINDOW_TOO_LARGE);
    }
  });

  it('rejects signature from future', () => {
    const params = { ...baseParams, created: 2000, expires: 2100 };
    expect(() => validateTapTimeConstraints(params, now)).toThrow(TapError);
    try {
      validateTapTimeConstraints(params, now);
    } catch (e) {
      expect((e as TapError).code).toBe(ErrorCodes.TAP_TIME_INVALID);
    }
  });

  it('rejects expired signature', () => {
    const params = { ...baseParams, created: 100, expires: 500 };
    expect(() => validateTapTimeConstraints(params, now)).toThrow(TapError);
  });

  it('allows created within clock skew', () => {
    // Created is slightly in the future but within 60s tolerance
    const params = { ...baseParams, created: 1050, expires: 1400 };
    expect(() => validateTapTimeConstraints(params, now)).not.toThrow();
  });
});

describe('validateTapAlgorithm', () => {
  it('accepts ed25519', () => {
    expect(() => validateTapAlgorithm('ed25519')).not.toThrow();
  });

  it('rejects other algorithms', () => {
    expect(() => validateTapAlgorithm('rsa-sha256')).toThrow(TapError);
    expect(() => validateTapAlgorithm('hs256')).toThrow(TapError);
  });
});

describe('validateTapTag', () => {
  it('accepts known tags', () => {
    expect(() => validateTapTag('agent-browser-auth', false)).not.toThrow();
    expect(() => validateTapTag('agent-payer-auth', false)).not.toThrow();
  });

  it('rejects unknown tags by default', () => {
    expect(() => validateTapTag('unknown-tag', false)).toThrow(TapError);
    try {
      validateTapTag('unknown-tag', false);
    } catch (e) {
      expect((e as TapError).code).toBe(ErrorCodes.TAP_TAG_UNKNOWN);
    }
  });

  it('allows unknown tags when enabled', () => {
    expect(() => validateTapTag('unknown-tag', true)).not.toThrow();
  });

  it('allows undefined tag', () => {
    expect(() => validateTapTag(undefined, false)).not.toThrow();
  });
});

describe('isKnownTapTag', () => {
  it('returns true for known tags', () => {
    expect(isKnownTapTag('agent-browser-auth')).toBe(true);
    expect(isKnownTapTag('agent-payer-auth')).toBe(true);
  });

  it('returns false for unknown tags', () => {
    expect(isKnownTapTag('unknown')).toBe(false);
    expect(isKnownTapTag('')).toBe(false);
  });
});
