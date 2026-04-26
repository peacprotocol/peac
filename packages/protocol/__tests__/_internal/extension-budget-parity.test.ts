/**
 * Layer-isolated parity test: bounded internal extension-budget
 * validator vs the byte-budget portion (steps 4 + 5) of canonical
 * validateKnownExtensions in @peac/schema.
 *
 * Compares the normalized {accepted, violations} result byte-for-byte
 * across a synthetic edge-case set. Layer-isolated means: only the
 * byte-budget enforcement is exercised on either side; key grammar,
 * plain-JSON guard, typed extension schema parse, type-extension
 * mapping, JOSE hardening, kernel constraints, temporal warnings,
 * policy binding, and full-JWS verification are NOT in scope here.
 *
 * NO wire-02 fixture currently triggers E_EXTENSION_SIZE_EXCEEDED
 * (no payload would naturally hit 256 KB), so this test is fully
 * synthetic.
 *
 * LEFT side: invokes canonical validateKnownExtensions inside a
 *   minimal Zod schema's superRefine; filters returned issues to
 *   those whose message === 'E_EXTENSION_SIZE_EXCEEDED'; projects
 *   the Zod path array to a JSON pointer string with RFC 6901
 *   escaping. Synthetic test inputs use unregistered extension keys
 *   so the schema-parse step does not interfere; valid grammar so
 *   the key-grammar step does not interfere; plain JSON so the
 *   plain-JSON guard does not interfere. The only canonical issue
 *   class produced is E_EXTENSION_SIZE_EXCEEDED.
 *
 * RIGHT side: validateExtensionBudgetInternal(extensions).
 *
 * Any divergence is stop-the-line.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { EXTENSION_BUDGET, validateKnownExtensions } from '@peac/schema';
import {
  validateExtensionBudgetInternal,
  type ExtensionBudgetResult,
  type ExtensionBudgetViolation,
} from '../../src/_internal/record-core/validators';

// ---------------------------------------------------------------------------
// LEFT (canonical) helper — wraps validateKnownExtensions in a Zod
// superRefine, filters issues to budget-only, projects to the
// normalized ExtensionBudgetResult shape
// ---------------------------------------------------------------------------

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function pathArrayToPointer(path: ReadonlyArray<string | number>): string {
  return '/' + path.map((s) => escapeJsonPointerSegment(String(s))).join('/');
}

const wrapperSchema = z
  .record(z.string(), z.unknown())
  .superRefine((data, ctx) => validateKnownExtensions(data, ctx));

function runCanonicalExtensionBudget(
  extensions: Record<string, unknown> | undefined
): ExtensionBudgetResult {
  if (extensions === undefined) return { accepted: true, violations: [] };
  const result = wrapperSchema.safeParse(extensions);
  if (result.success) return { accepted: true, violations: [] };
  const budget: ExtensionBudgetViolation[] = [];
  for (const issue of result.error.issues) {
    if (issue.message === 'E_EXTENSION_SIZE_EXCEEDED') {
      budget.push({
        code: 'E_EXTENSION_SIZE_EXCEEDED',
        path: pathArrayToPointer(issue.path as Array<string | number>),
      });
    }
  }
  if (budget.length === 0) return { accepted: true, violations: [] };
  return { accepted: false, violations: budget };
}

function bothAgree(extensions: Record<string, unknown> | undefined): ExtensionBudgetResult {
  const left = runCanonicalExtensionBudget(extensions);
  const right = validateExtensionBudgetInternal(extensions);
  expect(right).toEqual(left);
  return left;
}

// ---------------------------------------------------------------------------
// Helpers for byte-precise payloads
// ---------------------------------------------------------------------------

/**
 * Build an extension group value whose JSON.stringify byte length is
 * exactly `bytes`. Shape: { v: '<filler>' }. JSON.stringify produces
 * `{"v":"<filler>"}` = 8 + filler.length bytes (ASCII filler).
 */
function makeGroupOfSize(bytes: number): { v: string } {
  if (bytes < 8) throw new Error(`makeGroupOfSize: minimum 8 bytes (got ${bytes})`);
  return { v: 'a'.repeat(bytes - 8) };
}

// ---------------------------------------------------------------------------
// Edge cases — synthetic only
// ---------------------------------------------------------------------------

describe('extension-budget parity (LEFT canonical-budget vs RIGHT internal)', () => {
  describe('absence and emptiness', () => {
    it('extensions undefined: accepted, no violations', () => {
      const r = bothAgree(undefined);
      expect(r).toEqual({ accepted: true, violations: [] });
    });

    it('extensions empty object: accepted, no violations', () => {
      const r = bothAgree({});
      expect(r).toEqual({ accepted: true, violations: [] });
    });

    it('one tiny well-formed extension below all limits: accepted', () => {
      const r = bothAgree({ 'com.example/test': { ok: true } });
      expect(r).toEqual({ accepted: true, violations: [] });
    });
  });

  describe('per-group budget (maxGroupBytes = 65536)', () => {
    it('group exactly at maxGroupBytes (65536): accepted (uses strict >)', () => {
      const r = bothAgree({ 'com.example/test': makeGroupOfSize(EXTENSION_BUDGET.maxGroupBytes) });
      expect(r).toEqual({ accepted: true, violations: [] });
    });

    it('group one byte over maxGroupBytes (65537): per-group violation', () => {
      const r = bothAgree({
        'com.example/test': makeGroupOfSize(EXTENSION_BUDGET.maxGroupBytes + 1),
      });
      expect(r).toEqual({
        accepted: false,
        violations: [{ code: 'E_EXTENSION_SIZE_EXCEEDED', path: '/extensions/com.example~1test' }],
      });
    });

    it('two groups each one over per-group but total still under: two per-group violations in iteration order', () => {
      // 65537 bytes per group; total ~131089 bytes (under 262144).
      const ext = {
        'com.example/alpha': makeGroupOfSize(EXTENSION_BUDGET.maxGroupBytes + 1),
        'com.example/beta': makeGroupOfSize(EXTENSION_BUDGET.maxGroupBytes + 1),
      };
      const r = bothAgree(ext);
      expect(r).toEqual({
        accepted: false,
        violations: [
          { code: 'E_EXTENSION_SIZE_EXCEEDED', path: '/extensions/com.example~1alpha' },
          { code: 'E_EXTENSION_SIZE_EXCEEDED', path: '/extensions/com.example~1beta' },
        ],
      });
    });
  });

  describe('total budget (maxTotalBytes = 262144) and early-stop', () => {
    it('multiple under-per-group groups whose total stays under: accepted', () => {
      // 4 groups of 60000 bytes = 240000 group bytes; total payload
      // (with keys, brackets, quotes, commas) stays under 262144.
      const ext: Record<string, unknown> = {};
      for (let i = 0; i < 4; i++) ext[`com.example/g${i}`] = makeGroupOfSize(60000);
      const r = bothAgree(ext);
      expect(r).toEqual({ accepted: true, violations: [] });
    });

    it('total over-budget triggers single /extensions violation; per-group checks not reached', () => {
      // 5 groups of 60000 bytes each => 300000 group bytes plus the
      // outer object overhead. Total > 262144. Each group is well
      // under 65536. Canonical early-stops after the total violation.
      const ext: Record<string, unknown> = {};
      for (let i = 0; i < 5; i++) ext[`com.example/g${i}`] = makeGroupOfSize(60000);
      const r = bothAgree(ext);
      expect(r).toEqual({
        accepted: false,
        violations: [{ code: 'E_EXTENSION_SIZE_EXCEEDED', path: '/extensions' }],
      });
    });

    it('total over-budget AND a group over per-group: still only the single total violation (early-stop)', () => {
      // 5 groups of 60000 + 1 oversized 70000 = 370000 bytes. Total
      // exceeds 262144 AND the last group exceeds 65536. Canonical
      // returns ONLY the total violation due to early stop.
      const ext: Record<string, unknown> = {};
      for (let i = 0; i < 5; i++) ext[`com.example/g${i}`] = makeGroupOfSize(60000);
      ext['com.example/oversized'] = makeGroupOfSize(70000);
      const r = bothAgree(ext);
      expect(r).toEqual({
        accepted: false,
        violations: [{ code: 'E_EXTENSION_SIZE_EXCEEDED', path: '/extensions' }],
      });
    });
  });

  describe('UTF-8 vs string-length distinction', () => {
    it('multibyte (4-byte UTF-8 emoji) value pushes group over per-group limit', () => {
      // 16384 emojis = 32768 JS code units (each emoji is 1 surrogate
      // pair) but 65536 UTF-8 bytes. Wrap as JSON string => 65538
      // bytes for the group value. Over per-group (65536).
      const emoji = '\u{1F600}';
      const value = { v: emoji.repeat(16384) };
      const r = bothAgree({ 'com.example/test': value });
      expect(r).toEqual({
        accepted: false,
        violations: [{ code: 'E_EXTENSION_SIZE_EXCEEDED', path: '/extensions/com.example~1test' }],
      });
    });

    it('same code-unit count of ASCII stays under per-group (proves the byte vs code-unit difference)', () => {
      // 32768 ASCII chars => 32768 bytes; well under 65536.
      const value = { v: 'a'.repeat(32768) };
      const r = bothAgree({ 'com.example/test': value });
      expect(r).toEqual({ accepted: true, violations: [] });
    });
  });

  describe('value shapes', () => {
    it('nested object/array values are byte-counted via JSON.stringify; well-formed nested under limit accepted', () => {
      const value = {
        nested: { a: [1, 2, 3], b: { c: 'x' } },
        items: ['alpha', 'beta', 'gamma'],
      };
      const r = bothAgree({ 'com.example/test': value });
      expect(r).toEqual({ accepted: true, violations: [] });
    });

    it('unknown extension group still counted (no schema-map match required)', () => {
      // The bounded validator counts every key's bytes regardless of
      // whether the key is in EXTENSION_SCHEMA_MAP. Canonical does
      // the same. Use an unregistered key over per-group.
      const r = bothAgree({
        'com.example/never-registered': makeGroupOfSize(EXTENSION_BUDGET.maxGroupBytes + 1),
      });
      expect(r).toEqual({
        accepted: false,
        violations: [
          {
            code: 'E_EXTENSION_SIZE_EXCEEDED',
            path: '/extensions/com.example~1never-registered',
          },
        ],
      });
    });

    it('iteration order: per-group violations emitted in Object.keys order', () => {
      // Insertion order is preserved for string keys in modern JS.
      const ext = {
        'com.example/zeta': makeGroupOfSize(EXTENSION_BUDGET.maxGroupBytes + 1),
        'com.example/alpha': makeGroupOfSize(EXTENSION_BUDGET.maxGroupBytes + 1),
      };
      const r = bothAgree(ext);
      // Order is insertion (zeta then alpha), not alphabetical.
      expect(r.violations.map((v) => v.path)).toEqual([
        '/extensions/com.example~1zeta',
        '/extensions/com.example~1alpha',
      ]);
    });
  });
});
