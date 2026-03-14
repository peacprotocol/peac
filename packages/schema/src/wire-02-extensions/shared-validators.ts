/**
 * Wire 0.2 Shared Validator Schemas (DD-173.2)
 *
 * Protocol-grade Zod validators for common field patterns reused across
 * multiple extension groups. Consolidated to prevent drift, improve interop,
 * and keep Layer 1 clean.
 *
 * All validators are pure Zod schemas with zero I/O (DD-141).
 *
 * @see HASH.pattern from @peac/kernel for SHA-256 digest grammar
 * @see PolicyBlockSchema.uri for HTTPS URI hint pattern origin
 */

import { z } from 'zod';
import { HASH } from '@peac/kernel';

// ---------------------------------------------------------------------------
// SHA-256 Digest (DD-138: hash-first content references)
// ---------------------------------------------------------------------------

/**
 * Validates a SHA-256 digest string in the canonical PEAC format.
 *
 * Format: `sha256:<64 lowercase hex chars>`
 * Max length: 71 chars ("sha256:" = 7 chars + 64 hex chars = 71 total)
 *
 * Reuses `HASH.pattern` from `@peac/kernel` (same regex used in
 * `PolicyBlockSchema.digest` and `ReceiptRefSchema`).
 *
 * INTEROPERABILITY NOTE: This is a PEAC-internal self-describing digest
 * string grammar. It is NOT the same as:
 *   - RFC 9530 `Content-Digest` / `Repr-Digest`, which use structured
 *     HTTP fields with base64 encoding (e.g., `sha-256=:base64:`)
 *   - RFC 9421 HTTP Message Signatures digest components
 * PEAC digest strings are used within JWS payloads and extension fields,
 * not as HTTP headers. When bridging to HTTP digest headers, adapters
 * (Layer 4+) must convert between formats.
 */
export const Sha256DigestSchema = z
  .string()
  .max(71)
  .regex(HASH.pattern, 'must be a valid SHA-256 digest (sha256:<64 lowercase hex>)');

// ---------------------------------------------------------------------------
// HTTPS URI Hint (DD-55, DD-135: locator hints only, SSRF prevention)
// ---------------------------------------------------------------------------

/**
 * Control character ranges that must not appear in URI hints.
 * Covers C0 controls (U+0000-U+001F) and DEL (U+007F).
 */
const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/;

/**
 * Validates an HTTPS URI hint field.
 *
 * Security hardening beyond basic URL validation:
 * - MUST be https:// scheme (rejects http, ftp, data, javascript, file)
 * - MUST NOT contain embedded credentials (userinfo@)
 * - MUST NOT contain fragment identifiers (#)
 * - MUST NOT contain ASCII control characters (U+0000-U+001F, U+007F)
 * - Max 2048 chars (aligned with POLICY_BLOCK.uriMaxLength)
 *
 * These are locator hints only: callers MUST NOT auto-fetch (DD-55).
 *
 * NORMATIVE: Localhost and private-network hosts (e.g., 10.x, 192.168.x,
 * localhost) are intentionally accepted at Layer 1 (schema). URI hints
 * are metadata, not fetch targets; restricting to public hosts would
 * break enterprise/internal deployments without improving security at
 * this layer. SSRF prevention is enforced by the non-fetch invariant
 * (DD-55), not by host filtering in schema validation.
 *
 * Test suite covers: IDN/punycode, IPv6 literals, localhost-style
 * hosts, percent-encoded confusion, and parser ambiguity cases.
 */
export const HttpsUriHintSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine(
    (value) => {
      // Reject control characters before URL parsing (prevents parser confusion)
      if (CONTROL_CHAR_PATTERN.test(value)) return false;

      // Reject fragments (not meaningful for locator hints)
      if (value.includes('#')) return false;

      try {
        const url = new URL(value);

        // MUST be https:// only
        if (url.protocol !== 'https:') return false;

        // MUST NOT contain embedded credentials
        if (url.username !== '' || url.password !== '') return false;

        // MUST have a non-empty hostname
        if (!url.hostname) return false;

        return true;
      } catch {
        return false;
      }
    },
    {
      message: 'must be a valid HTTPS URI (no credentials, no fragments, no control characters)',
    }
  );

// ---------------------------------------------------------------------------
// ISO 8601 Duration (parser-grade, strict)
// ---------------------------------------------------------------------------

/**
 * ISO 8601 duration component descriptor.
 */
interface DurationComponents {
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Valid date-part designators in canonical order.
 * ISO 8601 requires Y before M before W before D.
 */
const DATE_DESIGNATOR_ORDER = ['Y', 'M', 'W', 'D'] as const;

/**
 * Valid time-part designators in canonical order.
 * ISO 8601 requires H before M before S.
 */
const TIME_DESIGNATOR_ORDER = ['H', 'M', 'S'] as const;

/**
 * Parse an ISO 8601 duration string into components.
 *
 * Enforces:
 * - No duplicate designators (P1Y2Y rejected)
 * - Canonical component ordering (P1D1Y rejected; must be P1Y1D)
 * - Weeks cannot be combined with other date components (ISO 8601)
 * - At least one component must be present (bare P rejected)
 * - At least one time component after T (bare PT rejected)
 * - Zero-value durations are accepted (P0D, PT0S are valid ISO 8601)
 *
 * Zero durations: P0D and PT0S are valid per ISO 8601. The spec says
 * "a zero duration" is representable. Consumers decide if a zero
 * duration is semantically meaningful for their use case.
 *
 * @param value - String to parse
 * @returns Parsed components, or null if invalid
 */
export function parseIso8601Duration(value: string): DurationComponents | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) {
    return null;
  }

  if (value.charAt(0) !== 'P') return null;

  let pos = 1;
  const len = value.length;

  // Bare "P" is invalid
  if (pos >= len) return null;

  const result: DurationComponents = {
    years: 0,
    months: 0,
    weeks: 0,
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  };

  let inTimePart = false;
  let hasAnyComponent = false;

  // Track seen designators to reject duplicates
  const seenDesignators = new Set<string>();

  // Track ordering: index into the relevant order array
  let dateOrderIdx = 0;
  let timeOrderIdx = 0;

  while (pos < len) {
    if (value.charAt(pos) === 'T') {
      if (inTimePart) return null; // Double T
      inTimePart = true;
      pos++;
      if (pos >= len) return null; // Bare "PT"
      continue;
    }

    // Parse digits
    const numStart = pos;
    while (pos < len && value.charAt(pos) >= '0' && value.charAt(pos) <= '9') {
      pos++;
    }
    if (pos === numStart) return null; // No digits before designator

    const digits = value.slice(numStart, pos);
    // Reject components that would lose precision as JS numbers.
    // Number.MAX_SAFE_INTEGER = 9007199254740991 (16 digits).
    // Duration components beyond this are structurally malformed for any
    // real-world use and would silently truncate.
    if (digits.length > 15) return null;
    const num = parseInt(digits, 10);
    if (!Number.isFinite(num) || num < 0) return null;

    if (pos >= len) return null; // No designator after number

    const designator = value.charAt(pos);
    pos++;

    // Reject duplicate designators
    const designatorKey = (inTimePart ? 'T' : '') + designator;
    if (seenDesignators.has(designatorKey)) return null;
    seenDesignators.add(designatorKey);

    if (inTimePart) {
      // Enforce canonical time ordering: H before M before S
      const timeIdx = TIME_DESIGNATOR_ORDER.indexOf(designator as 'H' | 'M' | 'S');
      if (timeIdx === -1) return null; // Invalid time designator
      if (timeIdx < timeOrderIdx) return null; // Out of order
      timeOrderIdx = timeIdx + 1;

      switch (designator) {
        case 'H':
          result.hours = num;
          break;
        case 'M':
          result.minutes = num;
          break;
        case 'S':
          result.seconds = num;
          break;
      }
    } else {
      // Enforce canonical date ordering: Y before M before W before D
      const dateIdx = DATE_DESIGNATOR_ORDER.indexOf(designator as 'Y' | 'M' | 'W' | 'D');
      if (dateIdx === -1) return null; // Invalid date designator
      if (dateIdx < dateOrderIdx) return null; // Out of order
      dateOrderIdx = dateIdx + 1;

      switch (designator) {
        case 'Y':
          result.years = num;
          break;
        case 'M':
          result.months = num;
          break;
        case 'W':
          result.weeks = num;
          break;
        case 'D':
          result.days = num;
          break;
      }
    }

    hasAnyComponent = true;
  }

  if (!hasAnyComponent) return null;

  // ISO 8601: weeks cannot be combined with other date components
  if (result.weeks > 0 && (result.years > 0 || result.months > 0 || result.days > 0)) {
    return null;
  }

  return result;
}

/**
 * Validates an ISO 8601 duration string.
 *
 * Parser-grade strict validation:
 * - Rejects bare P, bare PT
 * - Rejects duplicate designators (P1Y2Y)
 * - Enforces canonical component ordering (P1D1Y rejected)
 * - Rejects mixed weeks and other date components
 * - Accepts zero-value durations (P0D, PT0S are valid ISO 8601)
 * - Only non-negative integer components (no decimals, no negatives)
 *
 * Examples:
 *   Valid: "P30D", "P1Y", "P1Y6M", "PT1H30M", "P1W", "P0D", "PT0S"
 *   Invalid: "P", "PT", "30D", "", "P1D1Y", "P1Y2Y", "P1WD3", "P-1D"
 */
export const Iso8601DurationSchema = z
  .string()
  .min(2)
  .max(64)
  .refine((value) => parseIso8601Duration(value) !== null, {
    message: 'must be a valid ISO 8601 duration (e.g., P30D, P1Y6M, PT1H30M)',
  });

// ---------------------------------------------------------------------------
// ISO 8601 Date String (YYYY-MM-DD, structural only)
// ---------------------------------------------------------------------------

/**
 * Validates a structurally valid ISO 8601 date string (YYYY-MM-DD).
 *
 * Structural validation only: checks 4-digit year, 2-digit month 01-12,
 * 2-digit day 01-31. Does NOT validate calendar correctness (e.g.,
 * Feb 30 or Jun 31 would pass structural check). Calendar validation
 * is left to the application layer since this is an evidence record,
 * not a scheduling system.
 *
 * Named "StructuralDate" to avoid implying full calendar validation.
 */
export const Iso8601DateStringSchema = z
  .string()
  .length(10)
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/, {
    message: 'must be a structurally valid date string (YYYY-MM-DD)',
  });

/**
 * @deprecated Use Iso8601DateStringSchema. Alias preserved for backward compat.
 */
export const Iso8601DateSchema = Iso8601DateStringSchema;

// ---------------------------------------------------------------------------
// ISO 8601 DateTime with Offset (Zod 4 top-level API)
// ---------------------------------------------------------------------------

/**
 * Validates an ISO 8601 datetime string with timezone offset.
 *
 * Uses Zod 4 top-level `z.iso.datetime({ offset: true })` (preferred
 * over the deprecated method-style `z.string().datetime()`).
 *
 * This is NOT strictly RFC 3339: it accepts minute-precision timestamps
 * (e.g., `2026-03-14T12:00+05:30` without seconds), which ISO 8601
 * allows but RFC 3339 does not. Use Rfc3339DateTimeSchema for strict
 * RFC 3339 compliance.
 *
 * Consistent with Wire 0.2 `occurred_at` field validation semantics.
 */
export const Iso8601OffsetDateTimeSchema = z.iso.datetime({ offset: true });

// ---------------------------------------------------------------------------
// RFC 3339 DateTime (strict: offset + seconds required, fractional optional)
// ---------------------------------------------------------------------------

/**
 * RFC 3339 seconds-presence pattern.
 * Matches the `T<HH>:<MM>:<SS>` portion, ensuring seconds are present.
 * Fractional seconds (.nnn) are optional per RFC 3339 Section 5.6.
 */
const RFC3339_SECONDS_PATTERN = /T\d{2}:\d{2}:\d{2}/;

/**
 * Validates a datetime string against a practical strict RFC 3339 profile.
 *
 * Enforces the key RFC 3339 Section 5.6 constraints:
 * - Timezone offset always present (Z or +/-HH:MM)
 * - Seconds always present (minute-only timestamps rejected)
 * - Fractional seconds optional (after the seconds component)
 * - No local timestamps
 *
 * This is a practical strict profile, not a proven ABNF implementation.
 * It uses `z.iso.datetime({ offset: true })` as the base (which handles
 * most RFC 3339 grammar) plus a seconds-presence refine. Edge cases
 * like leap seconds or two-digit year forms are not explicitly tested.
 *
 * @see https://www.rfc-editor.org/rfc/rfc3339#section-5.6
 */
export const Rfc3339DateTimeSchema = z.iso
  .datetime({ offset: true })
  .refine((value: string) => RFC3339_SECONDS_PATTERN.test(value), {
    message: 'RFC 3339 requires seconds precision (e.g., 2026-03-14T12:00:00Z)',
  });

/**
 * @deprecated Use Iso8601OffsetDateTimeSchema or Rfc3339DateTimeSchema.
 * This alias points to Iso8601OffsetDateTimeSchema (which accepts
 * minute-precision and is therefore NOT strictly RFC 3339). Preserved
 * for backward compatibility only. Remove-not-before: v0.13.0.
 */
export const Rfc3339TimestampSchema = Iso8601OffsetDateTimeSchema;

// ---------------------------------------------------------------------------
// SPDX License Expression (documented structural subset)
// ---------------------------------------------------------------------------

/**
 * SPDX License Expression validator: documented structural subset.
 *
 * This is a structural subset validator for v0.12.2, NOT full SPDX 3.0.1
 * support. It validates expression grammar without checking license IDs
 * against the SPDX license list.
 *
 * Supported subset:
 *   - Simple license IDs: MIT, Apache-2.0, GPL-3.0-only
 *   - LicenseRef custom references: LicenseRef-custom
 *   - Or-later suffix: GPL-2.0+
 *   - Compound expressions: MIT AND Apache-2.0, MIT OR GPL-2.0-only
 *   - Exception clauses: Apache-2.0 WITH Classpath-exception-2.0
 *   - Parenthesized sub-expressions: (MIT OR Apache-2.0) AND GPL-3.0-only
 *
 * NOT supported (deferred to attribution extension PR, v0.12.2 PR 4):
 *   - DocumentRef-*: prefixes (rare in practice; not seen in npm/PyPI/crates.io)
 *
 * @see https://spdx.github.io/spdx-spec/v3.0.1/annexes/spdx-license-expressions/
 */
function isValidSpdxSubsetExpression(expr: string): boolean {
  if (typeof expr !== 'string' || expr.length === 0 || expr.length > 128) {
    return false;
  }

  // Tokenize: split on whitespace, preserving parentheses as separate tokens
  const tokens: string[] = [];
  let current = '';

  for (let i = 0; i < expr.length; i++) {
    const ch = expr.charAt(i);
    if (ch === '(' || ch === ')') {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      tokens.push(ch);
    } else if (ch === ' ' || ch === '\t') {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) {
    tokens.push(current);
  }

  if (tokens.length === 0) return false;

  // Recursive-descent parser
  let pos = 0;

  function peek(): string | undefined {
    return tokens[pos];
  }

  function advance(): string {
    return tokens[pos++];
  }

  // license-id: [A-Za-z0-9][A-Za-z0-9.-]* with optional + suffix
  // LicenseRef-: LicenseRef-[A-Za-z0-9.-]+
  function isLicenseId(token: string): boolean {
    const base = token.endsWith('+') ? token.slice(0, -1) : token;
    if (base.length === 0) return false;

    if (base.startsWith('LicenseRef-')) {
      const ref = base.slice(11);
      return ref.length > 0 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(ref);
    }

    return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(base);
  }

  function isExceptionId(token: string): boolean {
    return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(token);
  }

  // expr = term ((AND | OR) term)*
  function parseExpr(): boolean {
    if (!parseTerm()) return false;
    while (pos < tokens.length) {
      const op = peek();
      if (op === 'AND' || op === 'OR') {
        advance();
        if (!parseTerm()) return false;
      } else {
        break;
      }
    }
    return true;
  }

  // term = atom (WITH exception-id)?
  function parseTerm(): boolean {
    if (!parseAtom()) return false;
    if (peek() === 'WITH') {
      advance();
      const exception = peek();
      if (exception === undefined || !isExceptionId(exception)) return false;
      advance();
    }
    return true;
  }

  // atom = '(' expr ')' | license-id
  function parseAtom(): boolean {
    const token = peek();
    if (token === undefined) return false;

    if (token === '(') {
      advance();
      if (!parseExpr()) return false;
      if (peek() !== ')') return false;
      advance();
      return true;
    }

    if (token === ')' || token === 'AND' || token === 'OR' || token === 'WITH') {
      return false;
    }

    if (!isLicenseId(token)) return false;
    advance();
    return true;
  }

  const result = parseExpr();
  return result && pos === tokens.length;
}

/**
 * Validates an SPDX license expression (documented structural subset).
 *
 * Uses a recursive-descent parser for the supported grammar subset.
 * Does NOT validate against the SPDX license list (structure only).
 * Does NOT support DocumentRef-* prefixes (deferred).
 *
 * @see isValidSpdxSubsetExpression for the supported grammar
 */
export const SpdxExpressionSchema = z.string().min(1).max(128).refine(isValidSpdxSubsetExpression, {
  message:
    'must be a valid SPDX license expression (e.g., MIT, Apache-2.0, MIT AND Apache-2.0). DocumentRef-* not yet supported.',
});

// ---------------------------------------------------------------------------
// Exported internals for testing
// ---------------------------------------------------------------------------

/** @internal Exported for testing only */
export { parseIso8601Duration as _parseIso8601Duration };

/** @internal Exported for testing only */
export { isValidSpdxSubsetExpression as _isValidSpdxExpression };
