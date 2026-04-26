/**
 * Inertness proofs for the shadow-call boundary.
 *
 * The shadow hook in v0.13.1 is a no-op by construction. These tests
 * pin every observable property of the inert contract:
 *
 *   - returns undefined on every call
 *   - never throws on weird / malformed / circular inputs
 *   - never mutates the input claims object (frozen-input round-trip)
 *   - the type system enforces that the only declared mode is 'disabled'
 *
 * The hook imports nothing from the bounded validators (verified by
 * inspecting the source file's imports in this test). PR D wires the
 * actual flag plumbing; until then the boundary exists only to give
 * verify-local.ts a stable call site that PR D can extend.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  maybeRunShadowValidation,
  type ShadowValidationInput,
} from '../../src/_internal/record-core/shadow-hook';

describe('shadow-hook (inert; v0.13.1)', () => {
  describe('always returns undefined', () => {
    it('disabled with empty claims object', () => {
      expect(maybeRunShadowValidation({ mode: 'disabled', claims: {} })).toBe(undefined);
    });

    it('disabled with null claims', () => {
      expect(maybeRunShadowValidation({ mode: 'disabled', claims: null })).toBe(undefined);
    });

    it('disabled with undefined claims', () => {
      expect(maybeRunShadowValidation({ mode: 'disabled', claims: undefined })).toBe(undefined);
    });

    it('disabled with primitive claims', () => {
      expect(maybeRunShadowValidation({ mode: 'disabled', claims: 'string' })).toBe(undefined);
      expect(maybeRunShadowValidation({ mode: 'disabled', claims: 42 })).toBe(undefined);
      expect(maybeRunShadowValidation({ mode: 'disabled', claims: true })).toBe(undefined);
    });

    it('disabled with array claims', () => {
      expect(maybeRunShadowValidation({ mode: 'disabled', claims: [1, 2, 3] })).toBe(undefined);
    });

    it('disabled with valid Wire 0.2 claims shape', () => {
      const claims = {
        peac_version: '0.2',
        kind: 'evidence',
        type: 'org.peacprotocol/payment',
        iss: 'https://api.example.com',
        iat: 1735689600,
        jti: 'inert-001',
      };
      expect(maybeRunShadowValidation({ mode: 'disabled', claims })).toBe(undefined);
    });
  });

  describe('does not throw on malformed inputs', () => {
    it('disabled with circular claims object', () => {
      const claims: Record<string, unknown> = { a: 1 };
      claims.self = claims;
      expect(() =>
        maybeRunShadowValidation({ mode: 'disabled', claims } as ShadowValidationInput)
      ).not.toThrow();
    });

    it('disabled with claims containing non-JSON values (Symbol, BigInt)', () => {
      const claims = { sym: Symbol('x'), big: 10n, fn: () => 1 };
      expect(() =>
        maybeRunShadowValidation({ mode: 'disabled', claims } as ShadowValidationInput)
      ).not.toThrow();
    });

    it('disabled with deeply nested claims', () => {
      let v: unknown = 'leaf';
      for (let i = 0; i < 200; i++) v = { a: v };
      expect(() =>
        maybeRunShadowValidation({ mode: 'disabled', claims: v } as ShadowValidationInput)
      ).not.toThrow();
    });
  });

  describe('does not mutate input claims', () => {
    it('disabled with frozen claims: round-trips the same reference unchanged', () => {
      const claims = Object.freeze({
        peac_version: '0.2',
        kind: 'evidence',
        type: 'org.peacprotocol/payment',
        iss: 'https://api.example.com',
        iat: 1735689600,
        jti: 'mutate-001',
      });
      maybeRunShadowValidation({ mode: 'disabled', claims });
      // Frozen-object property assignments would throw in strict mode;
      // the call returning normally is itself a mutation-free proof.
      expect(claims.kind).toBe('evidence');
      expect(claims.type).toBe('org.peacprotocol/payment');
      expect(Object.isFrozen(claims)).toBe(true);
    });

    it('disabled with deep-frozen nested claims: nested values unchanged', () => {
      const inner = Object.freeze({ b: 'leaf' });
      const claims = Object.freeze({
        peac_version: '0.2',
        kind: 'evidence',
        type: 'org.peacprotocol/payment',
        iss: 'https://api.example.com',
        iat: 1735689600,
        jti: 'mutate-002',
        nested: inner,
      });
      maybeRunShadowValidation({ mode: 'disabled', claims });
      expect(claims.nested).toBe(inner);
      expect(claims.nested.b).toBe('leaf');
    });
  });

  describe('does not import any bounded validator (zero runtime weight)', () => {
    it('shadow-hook.ts source contains no import from validators/', () => {
      // The runtime guarantee: a fresh import of this module doesn't
      // pull the bounded validators into the module graph, so even if
      // the call site exists in verify-local.ts the cold-start cost
      // of the validator pipeline is not paid until PR D wires it.
      const here = dirname(new URL(import.meta.url).pathname);
      const sourcePath = resolve(
        here,
        '..',
        '..',
        'src',
        '_internal',
        'record-core',
        'shadow-hook.ts'
      );
      const source = readFileSync(sourcePath, 'utf8');
      expect(source).not.toMatch(/from\s+['"]\.\/validators['"]|from\s+['"]\.\/validators\//);
      expect(source).not.toMatch(/from\s+['"]\.\/bounded-validator/);
      expect(source).not.toMatch(/validateKernelConstraintsInternal/);
      expect(source).not.toMatch(/validateJoseHardeningInternal/);
      expect(source).not.toMatch(/validateIssuerFormInternal/);
      expect(source).not.toMatch(/validateTemporalInternal/);
      expect(source).not.toMatch(/validateTypeExtensionMappingInternal/);
      expect(source).not.toMatch(/validateExtensionBudgetInternal/);
      expect(source).not.toMatch(/runBoundedValidatorShadow/);
    });
  });
});
