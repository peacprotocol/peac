import { describe, it, expect } from 'vitest';
import {
  ok,
  err,
  adapterErr,
  isOk,
  isErr,
  map,
  mapErr,
  chain,
  unwrap,
  unwrapOr,
  type Result,
} from '../src/result.js';

describe('Result utilities', () => {
  describe('ok()', () => {
    it('creates a success result', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      expect(result).toEqual({ ok: true, value: 42 });
    });

    it('works with objects', () => {
      const result = ok({ foo: 'bar' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ foo: 'bar' });
      }
    });

    it('works with undefined', () => {
      const result = ok(undefined);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeUndefined();
      }
    });
  });

  describe('err()', () => {
    it('creates an error result', () => {
      const result = err('something went wrong');
      expect(result.ok).toBe(false);
      expect(result).toEqual({ ok: false, error: 'something went wrong' });
    });

    it('works with error objects', () => {
      const result = err({ code: 'FAIL', message: 'oops' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toEqual({ code: 'FAIL', message: 'oops' });
      }
    });
  });

  describe('adapterErr()', () => {
    it('creates an adapter error result', () => {
      const result = adapterErr('invalid value', 'validation_error');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toEqual({
          code: 'validation_error',
          message: 'invalid value',
          field: undefined,
        });
      }
    });

    it('includes field name when provided', () => {
      const result = adapterErr('missing', 'missing_required_field', 'amount');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.field).toBe('amount');
      }
    });
  });

  describe('isOk()', () => {
    it('returns true for success results', () => {
      expect(isOk(ok(1))).toBe(true);
    });

    it('returns false for error results', () => {
      expect(isOk(err('fail'))).toBe(false);
    });

    it('type narrows correctly', () => {
      const result: Result<number, string> = ok(42);
      if (isOk(result)) {
        // TypeScript knows result.value exists here
        expect(result.value).toBe(42);
      }
    });
  });

  describe('isErr()', () => {
    it('returns true for error results', () => {
      expect(isErr(err('fail'))).toBe(true);
    });

    it('returns false for success results', () => {
      expect(isErr(ok(1))).toBe(false);
    });

    it('type narrows correctly', () => {
      const result: Result<number, string> = err('oops');
      if (isErr(result)) {
        // TypeScript knows result.error exists here
        expect(result.error).toBe('oops');
      }
    });
  });

  describe('map()', () => {
    it('transforms success values', () => {
      const result = map(ok(5), (x) => x * 2);
      expect(result).toEqual({ ok: true, value: 10 });
    });

    it('passes through errors unchanged', () => {
      const result = map(err('fail'), (x: number) => x * 2);
      expect(result).toEqual({ ok: false, error: 'fail' });
    });

    it('works with type changes', () => {
      const result = map(ok(42), (x) => x.toString());
      expect(result).toEqual({ ok: true, value: '42' });
    });
  });

  describe('mapErr()', () => {
    it('transforms error values', () => {
      const result = mapErr(err('fail'), (e) => `Error: ${e}`);
      expect(result).toEqual({ ok: false, error: 'Error: fail' });
    });

    it('passes through success unchanged', () => {
      const result = mapErr(ok(42), (e: string) => `Error: ${e}`);
      expect(result).toEqual({ ok: true, value: 42 });
    });
  });

  describe('chain()', () => {
    const parseNumber = (s: string): Result<number, string> => {
      const n = parseInt(s, 10);
      return isNaN(n) ? err('not a number') : ok(n);
    };

    it('chains successful operations', () => {
      const result = chain(ok('42'), parseNumber);
      expect(result).toEqual({ ok: true, value: 42 });
    });

    it('short-circuits on first error', () => {
      const result = chain(ok('abc'), parseNumber);
      expect(result).toEqual({ ok: false, error: 'not a number' });
    });

    it('passes through initial errors', () => {
      const result = chain(err('initial'), parseNumber);
      expect(result).toEqual({ ok: false, error: 'initial' });
    });
  });

  describe('unwrap()', () => {
    it('returns value for success', () => {
      expect(unwrap(ok(42))).toBe(42);
    });

    it('throws for error', () => {
      expect(() => unwrap(err('oops'))).toThrow('oops');
    });

    it('throws error object directly', () => {
      const error = { code: 'FAIL' };
      try {
        unwrap(err(error));
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBe(error);
      }
    });
  });

  describe('unwrapOr()', () => {
    it('returns value for success', () => {
      expect(unwrapOr(ok(42), 0)).toBe(42);
    });

    it('returns default for error', () => {
      expect(unwrapOr(err('fail'), 0)).toBe(0);
    });
  });
});
