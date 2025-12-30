import { describe, it, expect } from 'vitest';
import {
  requireString,
  optionalString,
  requireNumber,
  requireAmount,
  requireCurrency,
  optionalNetwork,
  requireObject,
  optionalTimestamp,
  optionalBoolean,
  requireEnum,
  optionalEnum,
} from '../src/validators.js';

describe('Validators', () => {
  describe('requireString()', () => {
    it('accepts non-empty strings', () => {
      const result = requireString('hello', 'name');
      expect(result).toEqual({ ok: true, value: 'hello' });
    });

    it('rejects empty strings', () => {
      const result = requireString('', 'name');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('missing_required_field');
        expect(result.error.field).toBe('name');
      }
    });

    it('rejects whitespace-only strings', () => {
      const result = requireString('   ', 'name');
      expect(result.ok).toBe(false);
    });

    it('rejects undefined', () => {
      const result = requireString(undefined, 'name');
      expect(result.ok).toBe(false);
    });

    it('rejects null', () => {
      const result = requireString(null, 'name');
      expect(result.ok).toBe(false);
    });

    it('rejects numbers', () => {
      const result = requireString(42, 'name');
      expect(result.ok).toBe(false);
    });
  });

  describe('optionalString()', () => {
    it('accepts non-empty strings', () => {
      const result = optionalString('hello', 'name');
      expect(result).toEqual({ ok: true, value: 'hello' });
    });

    it('accepts undefined', () => {
      const result = optionalString(undefined, 'name');
      expect(result).toEqual({ ok: true, value: undefined });
    });

    it('accepts null', () => {
      const result = optionalString(null, 'name');
      expect(result).toEqual({ ok: true, value: undefined });
    });

    it('rejects non-string values', () => {
      const result = optionalString(42, 'name');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('validation_error');
      }
    });
  });

  describe('requireNumber()', () => {
    it('accepts finite numbers', () => {
      const result = requireNumber(42, 'count');
      expect(result).toEqual({ ok: true, value: 42 });
    });

    it('accepts zero', () => {
      const result = requireNumber(0, 'count');
      expect(result).toEqual({ ok: true, value: 0 });
    });

    it('accepts negative numbers', () => {
      const result = requireNumber(-5, 'count');
      expect(result).toEqual({ ok: true, value: -5 });
    });

    it('accepts decimals', () => {
      const result = requireNumber(3.14, 'rate');
      expect(result).toEqual({ ok: true, value: 3.14 });
    });

    it('rejects Infinity', () => {
      const result = requireNumber(Infinity, 'count');
      expect(result.ok).toBe(false);
    });

    it('rejects NaN', () => {
      const result = requireNumber(NaN, 'count');
      expect(result.ok).toBe(false);
    });

    it('rejects strings', () => {
      const result = requireNumber('42', 'count');
      expect(result.ok).toBe(false);
    });
  });

  describe('requireAmount()', () => {
    it('accepts positive integers', () => {
      const result = requireAmount(1000);
      expect(result).toEqual({ ok: true, value: 1000 });
    });

    it('accepts zero', () => {
      const result = requireAmount(0);
      expect(result).toEqual({ ok: true, value: 0 });
    });

    it('accepts max safe integer', () => {
      const result = requireAmount(Number.MAX_SAFE_INTEGER);
      expect(result.ok).toBe(true);
    });

    it('rejects negative amounts', () => {
      const result = requireAmount(-100);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('invalid_amount');
        expect(result.error.message).toContain('non-negative');
      }
    });

    it('rejects decimal amounts', () => {
      const result = requireAmount(10.5);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('invalid_amount');
        expect(result.error.message).toContain('safe integer');
      }
    });

    it('rejects unsafe integers', () => {
      const result = requireAmount(Number.MAX_SAFE_INTEGER + 1);
      expect(result.ok).toBe(false);
    });

    it('rejects strings', () => {
      const result = requireAmount('1000');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('invalid_amount');
      }
    });
  });

  describe('requireCurrency()', () => {
    it('accepts valid ISO 4217 codes', () => {
      const result = requireCurrency('USD');
      expect(result).toEqual({ ok: true, value: 'USD' });
    });

    it('normalizes to uppercase', () => {
      const result = requireCurrency('usd');
      expect(result).toEqual({ ok: true, value: 'USD' });
    });

    it('accepts EUR, GBP, JPY, INR', () => {
      expect(requireCurrency('EUR').ok).toBe(true);
      expect(requireCurrency('GBP').ok).toBe(true);
      expect(requireCurrency('JPY').ok).toBe(true);
      expect(requireCurrency('INR').ok).toBe(true);
    });

    it('rejects 2-letter codes', () => {
      const result = requireCurrency('US');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('invalid_currency');
      }
    });

    it('rejects 4-letter codes', () => {
      const result = requireCurrency('USDC');
      expect(result.ok).toBe(false);
    });

    it('rejects codes with numbers', () => {
      const result = requireCurrency('US1');
      expect(result.ok).toBe(false);
    });

    it('rejects non-strings', () => {
      const result = requireCurrency(123);
      expect(result.ok).toBe(false);
    });
  });

  describe('optionalNetwork()', () => {
    it('accepts CAIP-2 identifiers', () => {
      const result = optionalNetwork('eip155:8453');
      expect(result).toEqual({ ok: true, value: 'eip155:8453' });
    });

    it('accepts undefined', () => {
      const result = optionalNetwork(undefined);
      expect(result).toEqual({ ok: true, value: undefined });
    });

    it('accepts null', () => {
      const result = optionalNetwork(null);
      expect(result).toEqual({ ok: true, value: undefined });
    });

    it('rejects empty strings', () => {
      const result = optionalNetwork('');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('invalid_network');
      }
    });

    it('rejects non-strings', () => {
      const result = optionalNetwork(123);
      expect(result.ok).toBe(false);
    });
  });

  describe('requireObject()', () => {
    it('accepts plain objects', () => {
      const result = requireObject({ foo: 'bar' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ foo: 'bar' });
      }
    });

    it('accepts empty objects', () => {
      const result = requireObject({});
      expect(result.ok).toBe(true);
    });

    it('rejects null', () => {
      const result = requireObject(null, 'event');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('parse_error');
        expect(result.error.field).toBe('event');
      }
    });

    it('rejects undefined', () => {
      const result = requireObject(undefined);
      expect(result.ok).toBe(false);
    });

    it('rejects arrays', () => {
      const result = requireObject([1, 2, 3]);
      expect(result.ok).toBe(false);
    });

    it('rejects primitives', () => {
      expect(requireObject('string').ok).toBe(false);
      expect(requireObject(42).ok).toBe(false);
      expect(requireObject(true).ok).toBe(false);
    });
  });

  describe('optionalTimestamp()', () => {
    it('accepts ISO 8601 strings', () => {
      const result = optionalTimestamp('2025-12-30T12:00:00.000Z');
      expect(result).toEqual({ ok: true, value: '2025-12-30T12:00:00.000Z' });
    });

    it('converts Unix seconds to ISO', () => {
      const result = optionalTimestamp(1735560000); // 2024-12-30T12:00:00Z
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });

    it('accepts undefined', () => {
      const result = optionalTimestamp(undefined);
      expect(result).toEqual({ ok: true, value: undefined });
    });

    it('accepts null', () => {
      const result = optionalTimestamp(null);
      expect(result).toEqual({ ok: true, value: undefined });
    });

    it('rejects negative timestamps', () => {
      const result = optionalTimestamp(-1000);
      expect(result.ok).toBe(false);
    });

    it('rejects non-integer Unix times', () => {
      const result = optionalTimestamp(1735560000.5);
      expect(result.ok).toBe(false);
    });
  });

  describe('optionalBoolean()', () => {
    it('accepts true', () => {
      const result = optionalBoolean(true, 'enabled');
      expect(result).toEqual({ ok: true, value: true });
    });

    it('accepts false', () => {
      const result = optionalBoolean(false, 'enabled');
      expect(result).toEqual({ ok: true, value: false });
    });

    it('accepts undefined', () => {
      const result = optionalBoolean(undefined, 'enabled');
      expect(result).toEqual({ ok: true, value: undefined });
    });

    it('rejects strings', () => {
      const result = optionalBoolean('true', 'enabled');
      expect(result.ok).toBe(false);
    });

    it('rejects numbers', () => {
      const result = optionalBoolean(1, 'enabled');
      expect(result.ok).toBe(false);
    });
  });

  describe('requireEnum()', () => {
    const colors = ['red', 'green', 'blue'] as const;

    it('accepts valid enum values', () => {
      const result = requireEnum('red', colors, 'color');
      expect(result).toEqual({ ok: true, value: 'red' });
    });

    it('rejects invalid values', () => {
      const result = requireEnum('yellow', colors, 'color');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('red, green, blue');
      }
    });

    it('rejects non-strings', () => {
      const result = requireEnum(123, colors, 'color');
      expect(result.ok).toBe(false);
    });
  });

  describe('optionalEnum()', () => {
    const modes = ['direct', 'callback'] as const;

    it('accepts valid values', () => {
      const result = optionalEnum('direct', modes, 'mode');
      expect(result).toEqual({ ok: true, value: 'direct' });
    });

    it('accepts undefined', () => {
      const result = optionalEnum(undefined, modes, 'mode');
      expect(result).toEqual({ ok: true, value: undefined });
    });

    it('accepts null', () => {
      const result = optionalEnum(null, modes, 'mode');
      expect(result).toEqual({ ok: true, value: undefined });
    });

    it('rejects invalid values', () => {
      const result = optionalEnum('invalid', modes, 'mode');
      expect(result.ok).toBe(false);
    });
  });
});
