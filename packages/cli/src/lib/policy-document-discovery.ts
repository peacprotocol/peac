/**
 * CLI-internal helper. Preserves the v0.13.0 @peac/disc behavior contract
 * (tolerant two-pass parse + SSRF-aware remote fetch) using public
 * @peac/policy-kit and @peac/net-node primitives, plus PUBLIC @peac/kernel
 * constants where the fields exist.
 *
 * NOT exported from @peac/cli's public surface. Used by:
 *   - packages/cli/src/commands/discover.ts
 *   - packages/cli/src/lib/conformance/validators.ts (validateDiscoveryInput)
 *
 * External consumers needing the same compatibility behavior should copy
 * this pattern; a packaged public helper may land in a later release if
 * external demand surfaces.
 */

// `@peac/net-node` is ESM-only (no "require" exports entry). The CLI bin
// emits a CommonJS bundle that loads this helper transitively via the
// conformance validator import chain, but only the conformance use case
// (parsePolicyDocumentCompat) is reachable from the bin -- not the
// fetch path. Importing `safeFetchRaw` at module load would force a CJS
// require() of an ESM-only package and fail at startup. Instead, load
// `@peac/net-node` lazily inside fetchPolicyDocumentText() via dynamic
// import so the conformance path resolves without touching it.
import type { SafeFetchOptions } from '@peac/net-node';
import {
  parsePolicyDocument,
  PolicyLoadError,
  PolicyValidationError,
  type PolicyDocument,
} from '@peac/policy-kit';
// @peac/kernel.POLICY exposes manifestPath + maxBytes (and other discovery
// surface defaults). @peac/kernel.DISCOVERY does NOT carry timeoutMs in
// v0.13.x; the CLI keeps its own DISCOVER_TIMEOUT_MS pinned to the value
// the retired @peac/disc used.
import { POLICY } from '@peac/kernel';

// CLI-local constants. These mirror v0.13.0 @peac/disc behavior verbatim.
// Pinned by tests in packages/cli/__tests__/discover-command.test.ts.
export const DISCOVER_TIMEOUT_MS = 5_000;
export const DISCOVER_MAX_BYTES = POLICY.maxBytes; // 262144 bytes (256 KiB)
export const PEAC_TXT_PATH = POLICY.manifestPath; // '/.well-known/peac.txt'
const DEFAULT_USER_AGENT = 'peac-cli';

const LEGACY_KEY_LINE = /^\s*(verify|public_keys|jwks)\s*:/m;
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

/** @internal - tests only; resets the one-shot legacy-warning flag. */
export function __resetLegacyWarningForTests(): void {
  legacyWarningFired = false;
}

export interface CompatParseResult {
  valid: boolean;
  data?: PolicyDocument;
  errors?: string[];
  warnings?: string[];
}

function collectLegacyWarnings(text: string, warnings: string[]): void {
  const lines = text.split(/\r?\n/);
  let firstField: string | null = null;
  lines.forEach((line, idx) => {
    const m = line.match(/^\s*(verify|public_keys|jwks)\s*:/);
    if (m) {
      if (firstField === null) firstField = m[1];
      warnings.push(
        `Line ${idx + 1}: legacy key-discovery field "${m[1]}" ignored ` +
          `(peac.txt is policy-only; use peac-issuer.json for keys)`
      );
    }
  });
  if (firstField) fireLegacyWarning(firstField);
}

function failureFrom(err: unknown, warnings: string[]): CompatParseResult {
  const errors: string[] = [];
  if (err instanceof PolicyValidationError) {
    const issues = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    errors.push(`Policy validation failed: ${issues}`);
  } else if (err instanceof PolicyLoadError) {
    errors.push(err.message);
  } else {
    errors.push(`Unexpected parse error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return {
    valid: false,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Tolerant two-pass parser preserving v0.13.0 @peac/disc.parse semantics.
 *
 * Pass 1: hand the raw text to parsePolicyDocument unmodified. Legacy-looking
 * substrings inside YAML comments / block scalars / rule text remain intact.
 *
 * Pass 2 (only if Pass 1 throws AND legacy `verify:` / `public_keys:` /
 * `jwks:` lines are present at top level): strip those lines and retry.
 * Detected legacy lines surface as warnings + a once-per-process structured
 * DeprecationWarning with code PEAC_LEGACY_PEAC_TXT_KEY_FIELD.
 *
 * Returns a structured ParseResult; never throws on policy validation /
 * load failure (those become `errors`). Throws only on programming errors.
 */
export function parsePolicyDocumentCompat(text: string): CompatParseResult {
  if (text.trim().length === 0) {
    return {
      valid: false,
      errors: ['Empty policy document. Expected peac-policy/0.1 YAML or JSON.'],
    };
  }

  const hasLegacyLines = LEGACY_KEY_LINE.test(text);
  const warnings: string[] = [];

  try {
    const data = parsePolicyDocument(text);
    if (hasLegacyLines) collectLegacyWarnings(text, warnings);
    return {
      valid: true,
      data,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (firstErr) {
    if (!hasLegacyLines) return failureFrom(firstErr, warnings);
    collectLegacyWarnings(text, warnings);
    const stripped = text.replace(LEGACY_KEY_FULL_LINE_GLOBAL, '');
    try {
      const data = parsePolicyDocument(stripped);
      return { valid: true, data, warnings };
    } catch (secondErr) {
      return failureFrom(secondErr, warnings);
    }
  }
}

export interface FetchPolicyDocumentSuccess {
  ok: true;
  text: string;
  warnings?: string[];
}

export interface FetchPolicyDocumentFailure {
  ok: false;
  error: string;
  code?: string;
}

export type FetchPolicyDocumentResult = FetchPolicyDocumentSuccess | FetchPolicyDocumentFailure;

export interface FetchPolicyDocumentOptions {
  /** Override the v0.13.0-equivalent 5_000 ms total timeout. */
  timeoutMs?: number;
  /** Override the v0.13.0-equivalent 256 KiB body cap. */
  maxBytes?: number;
  /** Override the User-Agent header. Defaults to `peac-cli`. */
  userAgent?: string;
}

/**
 * Fetch a peac.txt policy document via SSRF-aware HTTP with a body cap and
 * timeout. Returns the raw response text on success. Caller is responsible
 * for parsing via `parsePolicyDocumentCompat`. Always closes the underlying
 * raw response in a `finally` block (no socket leak).
 */
export async function fetchPolicyDocumentText(
  origin: string,
  options: FetchPolicyDocumentOptions = {}
): Promise<FetchPolicyDocumentResult> {
  let target: URL;
  try {
    target = new URL(PEAC_TXT_PATH, origin);
  } catch (err) {
    return {
      ok: false,
      code: 'INVALID_URL',
      error: `Invalid origin: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const fetchOptions: SafeFetchOptions = {
    timeoutMs: options.timeoutMs ?? DISCOVER_TIMEOUT_MS,
    maxResponseBytes: options.maxBytes ?? DISCOVER_MAX_BYTES,
    headers: { 'user-agent': options.userAgent ?? DEFAULT_USER_AGENT },
    allowedMethods: ['GET'],
  };

  // Lazy import: see the module-load comment above. Dynamic import works in
  // both CJS and ESM bundles; in CJS, Node can dynamically import the ESM-only
  // @peac/net-node at runtime even though `require()` cannot.
  const { safeFetchRaw } = await import('@peac/net-node');

  const raw = await safeFetchRaw(target.toString(), fetchOptions);
  if (!raw.ok) {
    return {
      ok: false,
      code: raw.code,
      error: `${raw.code}: ${raw.error}`,
    };
  }
  try {
    if (!raw.response.ok) {
      return {
        ok: false,
        code: `HTTP_${raw.response.status}`,
        error: `HTTP ${raw.response.status}: ${raw.response.statusText}`,
      };
    }
    const text = await raw.response.text();
    return { ok: true, text, warnings: raw.warnings };
  } finally {
    await raw.close();
  }
}
