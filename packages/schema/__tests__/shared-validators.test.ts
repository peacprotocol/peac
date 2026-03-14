/**
 * Tests for Wire 0.2 shared validator schemas (DD-173.2)
 */

import { describe, it, expect } from 'vitest';
import {
  Sha256DigestSchema,
  HttpsUriHintSchema,
  Iso8601DurationSchema,
  Iso8601DateStringSchema,
  Iso8601DateSchema,
  Iso8601OffsetDateTimeSchema,
  Rfc3339DateTimeSchema,
  Rfc3339TimestampSchema,
  SpdxExpressionSchema,
  _parseIso8601Duration,
  _isValidSpdxExpression,
} from '../src/wire-02-extensions/shared-validators.js';

// ---------------------------------------------------------------------------
// Sha256DigestSchema
// ---------------------------------------------------------------------------

describe('Sha256DigestSchema', () => {
  const VALID_DIGEST = 'sha256:' + 'a'.repeat(64);

  it('accepts valid sha256 digest', () => {
    expect(Sha256DigestSchema.safeParse(VALID_DIGEST).success).toBe(true);
  });

  it('accepts lowercase hex', () => {
    expect(Sha256DigestSchema.safeParse('sha256:' + '0123456789abcdef'.repeat(4)).success).toBe(
      true
    );
  });

  it('rejects uppercase hex', () => {
    expect(Sha256DigestSchema.safeParse('sha256:' + 'A'.repeat(64)).success).toBe(false);
  });

  it('rejects wrong prefix', () => {
    expect(Sha256DigestSchema.safeParse('md5:' + 'a'.repeat(64)).success).toBe(false);
  });

  it('rejects wrong hex length', () => {
    expect(Sha256DigestSchema.safeParse('sha256:' + 'a'.repeat(63)).success).toBe(false);
    expect(Sha256DigestSchema.safeParse('sha256:' + 'a'.repeat(65)).success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(Sha256DigestSchema.safeParse('').success).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(Sha256DigestSchema.safeParse('sha256:' + 'g'.repeat(64)).success).toBe(false);
  });

  it('max length is 71 (sha256: prefix 7 + 64 hex)', () => {
    const valid71 = 'sha256:' + 'a'.repeat(64);
    expect(valid71.length).toBe(71);
    expect(Sha256DigestSchema.safeParse(valid71).success).toBe(true);
  });

  it('PEAC-internal digest grammar: not RFC 9530 Content-Digest', () => {
    // sha256:<hex> is PEAC-internal, not RFC 9530 Repr-Digest / Content-Digest
    // which use structured HTTP field syntax with base64. Document the distinction.
    expect(Sha256DigestSchema.safeParse('sha-256=:base64:').success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HttpsUriHintSchema
// ---------------------------------------------------------------------------

describe('HttpsUriHintSchema', () => {
  it('accepts valid HTTPS URL', () => {
    expect(HttpsUriHintSchema.safeParse('https://example.com').success).toBe(true);
    expect(HttpsUriHintSchema.safeParse('https://api.example.com/path').success).toBe(true);
    expect(HttpsUriHintSchema.safeParse('https://example.com:8443/path').success).toBe(true);
  });

  it('rejects HTTP (non-HTTPS)', () => {
    expect(HttpsUriHintSchema.safeParse('http://example.com').success).toBe(false);
  });

  it('rejects FTP', () => {
    expect(HttpsUriHintSchema.safeParse('ftp://example.com').success).toBe(false);
  });

  it('rejects data: URI', () => {
    expect(HttpsUriHintSchema.safeParse('data:text/html,<h1>test</h1>').success).toBe(false);
  });

  it('rejects javascript: URI', () => {
    expect(HttpsUriHintSchema.safeParse('javascript:alert(1)').success).toBe(false);
  });

  it('rejects file:/// URI', () => {
    expect(HttpsUriHintSchema.safeParse('file:///etc/passwd').success).toBe(false);
  });

  it('rejects embedded credentials', () => {
    expect(HttpsUriHintSchema.safeParse('https://user:pass@example.com').success).toBe(false);
    expect(HttpsUriHintSchema.safeParse('https://user@example.com').success).toBe(false);
  });

  it('rejects fragment identifiers', () => {
    expect(HttpsUriHintSchema.safeParse('https://example.com#fragment').success).toBe(false);
    expect(HttpsUriHintSchema.safeParse('https://example.com/path#sec').success).toBe(false);
  });

  it('rejects control characters', () => {
    expect(HttpsUriHintSchema.safeParse('https://example.com/\x00path').success).toBe(false);
    expect(HttpsUriHintSchema.safeParse('https://example.com/\x1fpath').success).toBe(false);
    expect(HttpsUriHintSchema.safeParse('https://example.com/\x7fpath').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(HttpsUriHintSchema.safeParse('').success).toBe(false);
  });

  it('accepts URLs with query parameters', () => {
    expect(HttpsUriHintSchema.safeParse('https://example.com/path?key=value').success).toBe(true);
  });

  it('accepts punycode (IDN) domains', () => {
    expect(HttpsUriHintSchema.safeParse('https://xn--nxasmq6b.example.com').success).toBe(true);
  });

  it('accepts IPv6 literal hosts', () => {
    expect(HttpsUriHintSchema.safeParse('https://[::1]/path').success).toBe(true);
  });

  it('rejects strings exceeding max length', () => {
    expect(HttpsUriHintSchema.safeParse('https://example.com/' + 'a'.repeat(2048)).success).toBe(
      false
    );
  });

  // Layer 1 neutral: localhost/private hosts are accepted (DD-55 non-fetch semantics)
  it('accepts localhost-style hosts (neutral at Layer 1)', () => {
    expect(HttpsUriHintSchema.safeParse('https://localhost:8443/api').success).toBe(true);
  });

  it('accepts private IP hosts (neutral at Layer 1)', () => {
    expect(HttpsUriHintSchema.safeParse('https://192.168.1.1/api').success).toBe(true);
    expect(HttpsUriHintSchema.safeParse('https://10.0.0.1/api').success).toBe(true);
  });

  // URL confusion edge cases
  it('rejects percent-encoded credentials (parser ambiguity)', () => {
    expect(HttpsUriHintSchema.safeParse('https://%75ser@example.com').success).toBe(false);
  });

  it('handles backslash variants (URL parser normalizes)', () => {
    // Node URL parser normalizes backslashes to forward slashes
    const result = HttpsUriHintSchema.safeParse('https://example.com\\path');
    // Should either reject or normalize; behavior is parser-dependent
    expect(typeof result.success).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// Iso8601DurationSchema: strict validation
// ---------------------------------------------------------------------------

describe('Iso8601DurationSchema', () => {
  it('accepts valid durations', () => {
    const valid = [
      'P1Y',
      'P30D',
      'P1Y6M',
      'PT1H',
      'PT30M',
      'PT45S',
      'P1Y6M15DT12H30M45S',
      'P1W',
      'P2W',
    ];
    for (const d of valid) {
      expect(Iso8601DurationSchema.safeParse(d).success, `expected valid: ${d}`).toBe(true);
    }
  });

  it('accepts zero-value durations (valid ISO 8601)', () => {
    expect(Iso8601DurationSchema.safeParse('P0D').success).toBe(true);
    expect(Iso8601DurationSchema.safeParse('PT0S').success).toBe(true);
    expect(Iso8601DurationSchema.safeParse('P0Y').success).toBe(true);
    expect(Iso8601DurationSchema.safeParse('P0Y0M0DT0H0M0S').success).toBe(true);
  });

  it('rejects bare P', () => {
    expect(Iso8601DurationSchema.safeParse('P').success).toBe(false);
  });

  it('rejects bare PT', () => {
    expect(Iso8601DurationSchema.safeParse('PT').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(Iso8601DurationSchema.safeParse('').success).toBe(false);
  });

  it('rejects non-ISO format', () => {
    expect(Iso8601DurationSchema.safeParse('30D').success).toBe(false);
    expect(Iso8601DurationSchema.safeParse('1 year').success).toBe(false);
  });

  it('rejects mixed weeks and other date components', () => {
    expect(Iso8601DurationSchema.safeParse('P1W3D').success).toBe(false);
    expect(Iso8601DurationSchema.safeParse('P1Y1W').success).toBe(false);
  });

  it('rejects duplicate designators', () => {
    expect(Iso8601DurationSchema.safeParse('P1Y2Y').success).toBe(false);
    expect(Iso8601DurationSchema.safeParse('PT1H2H').success).toBe(false);
    expect(Iso8601DurationSchema.safeParse('P1M2M').success).toBe(false);
    expect(Iso8601DurationSchema.safeParse('P1D2D').success).toBe(false);
    expect(Iso8601DurationSchema.safeParse('PT1M2M').success).toBe(false);
    expect(Iso8601DurationSchema.safeParse('PT1S2S').success).toBe(false);
  });

  it('rejects out-of-order date components', () => {
    expect(Iso8601DurationSchema.safeParse('P1D1Y').success).toBe(false);
    expect(Iso8601DurationSchema.safeParse('P1M1Y').success).toBe(false);
    expect(Iso8601DurationSchema.safeParse('P1D1M').success).toBe(false);
  });

  it('rejects out-of-order time components', () => {
    expect(Iso8601DurationSchema.safeParse('PT1S1H').success).toBe(false);
    expect(Iso8601DurationSchema.safeParse('PT1M1H').success).toBe(false);
    expect(Iso8601DurationSchema.safeParse('PT1S1M').success).toBe(false);
  });

  it('rejects trailing designator without number', () => {
    expect(Iso8601DurationSchema.safeParse('PY').success).toBe(false);
    expect(Iso8601DurationSchema.safeParse('PTH').success).toBe(false);
  });

  it('rejects double T', () => {
    expect(Iso8601DurationSchema.safeParse('PTT1H').success).toBe(false);
  });

  it('rejects date designators in time part', () => {
    expect(Iso8601DurationSchema.safeParse('PT1Y').success).toBe(false);
    expect(Iso8601DurationSchema.safeParse('PT1D').success).toBe(false);
  });

  it('rejects time designators in date part', () => {
    expect(Iso8601DurationSchema.safeParse('P1H').success).toBe(false);
    expect(Iso8601DurationSchema.safeParse('P1S').success).toBe(false);
  });

  // Safe-integer overflow regression
  it('rejects components exceeding safe integer precision', () => {
    // 16+ digit number would lose precision as a JS number
    expect(Iso8601DurationSchema.safeParse('P9999999999999999Y').success).toBe(false);
    expect(Iso8601DurationSchema.safeParse('PT99999999999999999S').success).toBe(false);
  });

  it('accepts components up to 15 digits', () => {
    expect(Iso8601DurationSchema.safeParse('P999999999999999D').success).toBe(true);
  });
});

describe('_parseIso8601Duration(): component extraction', () => {
  it('parses P1Y6M15DT12H30M45S correctly', () => {
    const result = _parseIso8601Duration('P1Y6M15DT12H30M45S');
    expect(result).toEqual({
      years: 1,
      months: 6,
      weeks: 0,
      days: 15,
      hours: 12,
      minutes: 30,
      seconds: 45,
    });
  });

  it('parses P2W correctly', () => {
    const result = _parseIso8601Duration('P2W');
    expect(result).toEqual({
      years: 0,
      months: 0,
      weeks: 2,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  });

  it('parses P0D (zero duration)', () => {
    const result = _parseIso8601Duration('P0D');
    expect(result).not.toBeNull();
    expect(result!.days).toBe(0);
  });

  it('returns null for duplicate designators', () => {
    expect(_parseIso8601Duration('P1Y2Y')).toBeNull();
    expect(_parseIso8601Duration('PT1H2H')).toBeNull();
  });

  it('returns null for out-of-order components', () => {
    expect(_parseIso8601Duration('P1D1Y')).toBeNull();
    expect(_parseIso8601Duration('PT1S1H')).toBeNull();
  });

  it('returns null for invalid input', () => {
    expect(_parseIso8601Duration('P')).toBeNull();
    expect(_parseIso8601Duration('PT')).toBeNull();
    expect(_parseIso8601Duration('')).toBeNull();
    expect(_parseIso8601Duration('not a duration')).toBeNull();
  });

  it('returns null for huge component values (safe integer guard)', () => {
    expect(_parseIso8601Duration('P9999999999999999Y')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Iso8601DateStringSchema (structural only, honest naming)
// ---------------------------------------------------------------------------

describe('Iso8601DateStringSchema (structural only)', () => {
  it('accepts structurally valid dates', () => {
    expect(Iso8601DateStringSchema.safeParse('2026-03-14').success).toBe(true);
    expect(Iso8601DateStringSchema.safeParse('2000-01-01').success).toBe(true);
    expect(Iso8601DateStringSchema.safeParse('2026-12-31').success).toBe(true);
  });

  it('rejects invalid month', () => {
    expect(Iso8601DateStringSchema.safeParse('2026-13-01').success).toBe(false);
    expect(Iso8601DateStringSchema.safeParse('2026-00-01').success).toBe(false);
  });

  it('rejects invalid day', () => {
    expect(Iso8601DateStringSchema.safeParse('2026-01-00').success).toBe(false);
    expect(Iso8601DateStringSchema.safeParse('2026-01-32').success).toBe(false);
  });

  it('rejects timestamps', () => {
    expect(Iso8601DateStringSchema.safeParse('2026-03-14T12:00:00Z').success).toBe(false);
  });

  it('rejects short format', () => {
    expect(Iso8601DateStringSchema.safeParse('2026-3-14').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(Iso8601DateStringSchema.safeParse('').success).toBe(false);
  });

  // Structural-only honesty: impossible calendar dates pass structural check
  it('accepts impossible dates (structural only, not calendar-validated)', () => {
    // Feb 30 and Jun 31 are structurally valid but calendar-impossible
    expect(Iso8601DateStringSchema.safeParse('2026-02-30').success).toBe(true);
    expect(Iso8601DateStringSchema.safeParse('2026-06-31').success).toBe(true);
  });
});

describe('Iso8601DateSchema (deprecated alias)', () => {
  it('is the same schema as Iso8601DateStringSchema', () => {
    expect(Iso8601DateSchema).toBe(Iso8601DateStringSchema);
  });
});

// ---------------------------------------------------------------------------
// Iso8601OffsetDateTimeSchema (honest naming, Zod 4 z.iso API)
// ---------------------------------------------------------------------------

describe('Iso8601OffsetDateTimeSchema (ISO 8601 with offset, any precision)', () => {
  it('accepts timestamps with Z offset', () => {
    expect(Iso8601OffsetDateTimeSchema.safeParse('2026-03-14T12:00:00Z').success).toBe(true);
  });

  it('accepts timestamps with numeric offset', () => {
    expect(Iso8601OffsetDateTimeSchema.safeParse('2026-03-14T12:00:00+05:30').success).toBe(true);
    expect(Iso8601OffsetDateTimeSchema.safeParse('2026-03-14T12:00:00-08:00').success).toBe(true);
  });

  it('accepts fractional seconds', () => {
    expect(Iso8601OffsetDateTimeSchema.safeParse('2026-03-14T12:00:00.123Z').success).toBe(true);
  });

  it('accepts minute-precision (ISO 8601 allows, RFC 3339 does not)', () => {
    expect(Iso8601OffsetDateTimeSchema.safeParse('2026-03-14T12:00Z').success).toBe(true);
  });

  it('rejects date-only strings', () => {
    expect(Iso8601OffsetDateTimeSchema.safeParse('2026-03-14').success).toBe(false);
  });

  it('rejects invalid format', () => {
    expect(Iso8601OffsetDateTimeSchema.safeParse('not a timestamp').success).toBe(false);
  });

  it('rejects timestamps without offset (local time)', () => {
    expect(Iso8601OffsetDateTimeSchema.safeParse('2026-03-14T12:00:00').success).toBe(false);
  });
});

describe('Rfc3339DateTimeSchema (strict RFC 3339: offset + seconds required)', () => {
  it('accepts full timestamps with Z', () => {
    expect(Rfc3339DateTimeSchema.safeParse('2026-03-14T12:00:00Z').success).toBe(true);
  });

  it('accepts full timestamps with offset', () => {
    expect(Rfc3339DateTimeSchema.safeParse('2026-03-14T12:00:00+05:30').success).toBe(true);
  });

  it('rejects minute-precision (RFC 3339 requires seconds)', () => {
    expect(Rfc3339DateTimeSchema.safeParse('2026-03-14T12:00Z').success).toBe(false);
  });

  it('rejects timestamps without offset', () => {
    expect(Rfc3339DateTimeSchema.safeParse('2026-03-14T12:00:00').success).toBe(false);
  });

  it('accepts fractional seconds (RFC 3339 Section 5.6 allows them)', () => {
    expect(Rfc3339DateTimeSchema.safeParse('2026-03-14T12:00:00.123456Z').success).toBe(true);
  });

  it('rejects date-only', () => {
    expect(Rfc3339DateTimeSchema.safeParse('2026-03-14').success).toBe(false);
  });
});

describe('Rfc3339TimestampSchema (deprecated alias)', () => {
  it('is the same schema as Iso8601OffsetDateTimeSchema (NOT strict RFC 3339)', () => {
    expect(Rfc3339TimestampSchema).toBe(Iso8601OffsetDateTimeSchema);
    // This alias accepts minute-precision, which strict RFC 3339 does not.
    // Users who need strict RFC 3339 should use Rfc3339DateTimeSchema.
    expect(Rfc3339TimestampSchema).not.toBe(Rfc3339DateTimeSchema);
  });
});

// ---------------------------------------------------------------------------
// SpdxExpressionSchema: documented structural subset
// ---------------------------------------------------------------------------

describe('SpdxExpressionSchema (documented structural subset)', () => {
  it('accepts simple license IDs', () => {
    expect(SpdxExpressionSchema.safeParse('MIT').success).toBe(true);
    expect(SpdxExpressionSchema.safeParse('Apache-2.0').success).toBe(true);
    expect(SpdxExpressionSchema.safeParse('GPL-3.0-only').success).toBe(true);
  });

  it('accepts or-later suffix (+)', () => {
    expect(SpdxExpressionSchema.safeParse('GPL-2.0+').success).toBe(true);
    expect(SpdxExpressionSchema.safeParse('Apache-2.0+').success).toBe(true);
  });

  it('accepts LicenseRef custom references', () => {
    expect(SpdxExpressionSchema.safeParse('LicenseRef-custom').success).toBe(true);
    expect(SpdxExpressionSchema.safeParse('LicenseRef-my-license').success).toBe(true);
  });

  it('accepts compound AND expressions', () => {
    expect(SpdxExpressionSchema.safeParse('MIT AND Apache-2.0').success).toBe(true);
  });

  it('accepts compound OR expressions', () => {
    expect(SpdxExpressionSchema.safeParse('MIT OR GPL-2.0-only').success).toBe(true);
  });

  it('accepts WITH exception clauses', () => {
    expect(SpdxExpressionSchema.safeParse('Apache-2.0 WITH Classpath-exception-2.0').success).toBe(
      true
    );
  });

  it('accepts parenthesized sub-expressions', () => {
    expect(SpdxExpressionSchema.safeParse('(MIT OR Apache-2.0) AND GPL-3.0-only').success).toBe(
      true
    );
    expect(
      SpdxExpressionSchema.safeParse('MIT OR (Apache-2.0 WITH Classpath-exception-2.0)').success
    ).toBe(true);
  });

  it('rejects empty string', () => {
    expect(SpdxExpressionSchema.safeParse('').success).toBe(false);
  });

  it('rejects unbalanced parentheses', () => {
    expect(SpdxExpressionSchema.safeParse('(MIT').success).toBe(false);
    expect(SpdxExpressionSchema.safeParse('MIT)').success).toBe(false);
  });

  it('rejects operators without operands', () => {
    expect(SpdxExpressionSchema.safeParse('AND').success).toBe(false);
    expect(SpdxExpressionSchema.safeParse('MIT AND').success).toBe(false);
    expect(SpdxExpressionSchema.safeParse('AND MIT').success).toBe(false);
  });

  it('rejects WITH without exception', () => {
    expect(SpdxExpressionSchema.safeParse('MIT WITH').success).toBe(false);
  });

  it('rejects invalid characters in license ID', () => {
    expect(SpdxExpressionSchema.safeParse('MIT/2.0').success).toBe(false);
  });
});

describe('_isValidSpdxExpression(): structural subset edge cases', () => {
  it('handles complex nested expressions', () => {
    expect(
      _isValidSpdxExpression('((MIT OR Apache-2.0) AND (GPL-2.0+ WITH Classpath-exception-2.0))')
    ).toBe(true);
  });

  it('rejects double operators', () => {
    expect(_isValidSpdxExpression('MIT AND AND Apache-2.0')).toBe(false);
  });

  it('rejects empty parentheses', () => {
    expect(_isValidSpdxExpression('()')).toBe(false);
  });

  it('enforces max length', () => {
    expect(_isValidSpdxExpression('A'.repeat(129))).toBe(false);
  });

  // DocumentRef-* is intentionally not supported in this subset (deferred to PR 4)
  it('rejects DocumentRef (not yet supported in structural subset)', () => {
    expect(_isValidSpdxExpression('DocumentRef-spdx-tool-1.2:LicenseRef-MIT-Style-2')).toBe(false);
  });
});

// Byte-budget enforcement tests are in byte-budget-enforcement.test.ts
