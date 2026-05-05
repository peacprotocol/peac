/**
 * v0.14.1 — OpaqueRefSchema grammar tests.
 *
 * Per the v0.14.1 plan amendments lock and the brutal-honest review's
 * grammar-based approach, OpaqueRefSchema rejects email shapes, raw human
 * names in any language, numeric strings, inline JSON, and free text without
 * language-specific or numeric-specific ad-hoc heuristics.
 */
import { describe, it, expect } from 'vitest';

import { OPAQUE_REF_PREFIXES, OpaqueRefSchema, createOpaqueRefSchema } from '../src/opaque-ref';

describe('OpaqueRefSchema: accepts recognized prefixes', () => {
  it.each([
    'ref:abc',
    'urn:peac:thing:1',
    'did:example:123',
    'sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    'peac:internal:thing',
    'https://example.com/thing',
  ])('accepts %s', (input) => {
    expect(OpaqueRefSchema.safeParse(input).success).toBe(true);
  });
});

describe('OpaqueRefSchema: rejects grammar violations', () => {
  it.each([
    ['empty string', ''],
    ['whitespace inside', 'urn:foo bar'],
    ['leading whitespace', '  urn:foo'],
    ['email shape', 'user@example.com'],
    ['leading {', '{"score":1}'],
    ['leading [', '[1,2,3]'],
    ['leading "', '"some-string"'],
    ['no prefix (bare token)', 'org.peacprotocol'],
    ['no prefix (free text)', 'Some Free Text'],
    ['numeric string', '0.92'],
    ['integer string', '1'],
    ['unrecognized prefix', 'mailto:foo'],
    // Blocker 3: https: without // is rejected (loose URL prefix tightened)
    ['loose https: prefix without //', 'https:example.com'],
    // Blocker 3: http:// is not a recognized prefix (only https:// is)
    ['http:// not in prefix set', 'http://example.com'],
    // Blocker 4: sha256: with non-strict suffix is rejected
    ['sha256: too short', 'sha256:abc'],
    [
      'sha256: uppercase hex',
      'sha256:ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789',
    ],
    [
      'sha256: 63 hex (off-by-one)',
      'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde',
    ],
    [
      'sha256: 65 hex (off-by-one)',
      'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0',
    ],
    // https:// requires a non-empty suffix
    ['https:// empty suffix', 'https://'],
  ])('rejects %s (%s)', (_label, input) => {
    expect(OpaqueRefSchema.safeParse(input).success).toBe(false);
  });
});

describe('OpaqueRefSchema: UTF-8 byte-length enforcement (Blocker 2)', () => {
  it('rejects ASCII string > 256 bytes by default', () => {
    const big = 'urn:' + 'x'.repeat(300);
    expect(OpaqueRefSchema.safeParse(big).success).toBe(false);
  });

  it('accepts ASCII string exactly 256 bytes', () => {
    // 'urn:' (4 bytes) + 252 ASCII bytes = 256 bytes total
    const exact = 'urn:' + 'x'.repeat(252);
    expect(new TextEncoder().encode(exact).byteLength).toBe(256);
    expect(OpaqueRefSchema.safeParse(exact).success).toBe(true);
  });

  it('rejects ASCII string at 257 bytes (one over)', () => {
    const over = 'urn:' + 'x'.repeat(253);
    expect(new TextEncoder().encode(over).byteLength).toBe(257);
    expect(OpaqueRefSchema.safeParse(over).success).toBe(false);
  });

  it('rejects multi-byte string under 256 chars but over 256 bytes', () => {
    // 'é' (e-acute) is 2 bytes in UTF-8. 'urn:' + 130 acutes = 4 + 260 bytes = 264 bytes,
    // but JavaScript .length is 4 + 130 = 134. Character-count would PASS; byte-count rejects.
    const multibyte = 'urn:' + 'é'.repeat(130);
    expect(multibyte.length).toBeLessThan(256);
    expect(new TextEncoder().encode(multibyte).byteLength).toBeGreaterThan(256);
    expect(OpaqueRefSchema.safeParse(multibyte).success).toBe(false);
  });

  it('createOpaqueRefSchema({ maxBytes: 64 }) enforces narrower byte limit', () => {
    const narrow = createOpaqueRefSchema({ maxBytes: 64 });
    expect(narrow.safeParse('urn:' + 'x'.repeat(65)).success).toBe(false);
    expect(narrow.safeParse('urn:' + 'x'.repeat(60)).success).toBe(true);
  });
});

describe('OPAQUE_REF_PREFIXES export', () => {
  it('lists exactly six prefixes (Blocker 3: https has // suffix)', () => {
    expect(OPAQUE_REF_PREFIXES.length).toBe(6);
    expect([...OPAQUE_REF_PREFIXES].sort()).toEqual(
      ['ref:', 'urn:', 'did:', 'sha256:', 'peac:', 'https://'].sort()
    );
  });
});
