/**
 * @peac/disc/parser - thin peac.txt policy-document loader/validator.
 *
 * peac.txt is a POLICY DOCUMENT surface per docs/specs/PEAC-TXT.md.
 * Full parsing is delegated to `@peac/policy-kit.parsePolicyDocument`;
 * this module only provides:
 *
 *   - format detection (YAML vs JSON) per PEAC-TXT.md §5.1
 *   - a tolerant `parse()` wrapper that returns a structured `ParseResult`
 *     (rather than throwing)
 *   - structured warnings for legacy key-discovery lines (`verify`,
 *     `public_keys`, `jwks`) that appeared in pre-v0.12.14 peac.txt
 *     examples. Those lines are NEVER honored here: key discovery flows
 *     through `iss` -> /.well-known/peac-issuer.json -> `jwks_uri` -> JWKS
 *     (docs/specs/PEAC-ISSUER.md).
 *   - a tiny `emit()` helper that serializes a `PolicyDocument` via
 *     `@peac/policy-kit.serializePolicyYaml`
 *
 * @see docs/specs/PEAC-TXT.md
 * @see docs/specs/PEAC-ISSUER.md
 */

import {
  PolicyLoadError,
  PolicyValidationError,
  parsePolicyDocument,
  serializePolicyYaml,
  type PolicyDocument,
} from '@peac/policy-kit';
import type { ParseResult } from './types.js';

const LEGACY_KEY_LINE = /^\s*(verify|public_keys|jwks)\s*:/m;
/** Strips the whole line (including the trailing newline) when matched. */
const LEGACY_KEY_FULL_LINE_GLOBAL = /^\s*(verify|public_keys|jwks)\s*:.*\r?\n?/gm;

let legacyWarningFired = false;

function fireLegacyWarning(field: string): void {
  if (legacyWarningFired) return;
  legacyWarningFired = true;
  if (typeof process !== 'undefined' && typeof process.emitWarning === 'function') {
    process.emitWarning(
      `peac.txt legacy key-discovery field "${field}" is deprecated and ignored. ` +
        `peac.txt is a policy-document surface (docs/specs/PEAC-TXT.md). ` +
        `Key resolution uses iss -> /.well-known/peac-issuer.json -> jwks_uri -> JWKS.`,
      { code: 'PEAC_LEGACY_PEAC_TXT_KEY_FIELD', type: 'DeprecationWarning' }
    );
  }
}

/**
 * Reset the one-shot legacy-warning flag. Exposed for tests that need to
 * observe the warning more than once per process.
 */
export function __resetLegacyWarningForTests(): void {
  legacyWarningFired = false;
}

function collectLegacyWarnings(text: string): { warnings: string[]; firstField: string | null } {
  const warnings: string[] = [];
  let firstField: string | null = null;
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const match = line.match(/^\s*(verify|public_keys|jwks)\s*:/);
    if (match) {
      if (firstField === null) firstField = match[1];
      warnings.push(
        `Line ${idx + 1}: legacy key-discovery field "${match[1]}" ignored ` +
          `(peac.txt is policy-only; use peac-issuer.json for keys)`
      );
    }
  });
  return { warnings, firstField };
}

/**
 * Parse a peac.txt policy document. Accepts YAML or JSON per
 * `docs/specs/PEAC-TXT.md` §5.1. On success, `data` is the validated
 * `peac-policy/0.1` `PolicyDocument`.
 *
 * Legacy key-discovery lines (`verify:`, `public_keys:`, `jwks:`) are
 * tolerated via a two-pass strategy: first the raw bytes are handed to
 * `parsePolicyDocument`; if validation fails AND top-level legacy lines
 * are present, the legacy lines are stripped and parsing is retried
 * once. Detected legacy lines are listed in `warnings` and surface a
 * structured `PEAC_LEGACY_PEAC_TXT_KEY_FIELD` `DeprecationWarning` once
 * per process. They never populate the parsed result. This preserves
 * the original bytes when a policy document happens to mention those
 * tokens inside comments, block scalars, or rule text.
 */
export function parse(text: string): ParseResult {
  const warnings: string[] = [];

  if (text.trim().length === 0) {
    return {
      valid: false,
      errors: ['Empty policy document. Expected peac-policy/0.1 YAML or JSON.'],
    };
  }

  const hasLegacyLines = LEGACY_KEY_LINE.test(text);

  // First pass: try the raw bytes. If they parse cleanly, legacy-looking
  // substrings inside block scalars / comments / rule text are not
  // mutated.
  try {
    const data = parsePolicyDocument(text);
    if (hasLegacyLines) {
      const legacy = collectLegacyWarnings(text);
      warnings.push(...legacy.warnings);
      if (legacy.firstField) fireLegacyWarning(legacy.firstField);
    }
    return {
      valid: true,
      data,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (firstErr) {
    if (!hasLegacyLines) {
      return failure(firstErr, warnings);
    }
    // Second pass: strip top-level legacy key-discovery lines and retry.
    const legacy = collectLegacyWarnings(text);
    warnings.push(...legacy.warnings);
    if (legacy.firstField) fireLegacyWarning(legacy.firstField);

    const stripped = text.replace(LEGACY_KEY_FULL_LINE_GLOBAL, '');
    if (stripped.trim().length === 0) {
      return {
        valid: false,
        errors: ['Empty policy document after stripping legacy key-discovery lines.'],
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }
    try {
      const data = parsePolicyDocument(stripped);
      return {
        valid: true,
        data,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (retryErr) {
      return failure(retryErr, warnings);
    }
  }
}

function failure(err: unknown, warnings: string[]): ParseResult {
  if (err instanceof PolicyValidationError || err instanceof PolicyLoadError) {
    return {
      valid: false,
      errors: [err.message],
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
  return {
    valid: false,
    errors: [err instanceof Error ? err.message : String(err)],
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Serialize a `peac-policy/0.1` `PolicyDocument` as YAML suitable for
 * serving at `/.well-known/peac.txt`. Delegates to
 * `@peac/policy-kit.serializePolicyYaml`.
 */
export function emit(doc: PolicyDocument): string {
  return serializePolicyYaml(doc);
}

/**
 * Convenience predicate: returns `true` iff `text` parses as a valid
 * `peac-policy/0.1` document.
 */
export function validate(text: string): boolean {
  return parse(text).valid;
}
