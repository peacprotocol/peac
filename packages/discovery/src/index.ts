/**
 * @peac/disc - thin peac.txt policy-document loader/validator and remote fetcher.
 *
 * peac.txt is a POLICY DOCUMENT surface per docs/specs/PEAC-TXT.md. Full
 * parsing is delegated to `@peac/policy-kit.parsePolicyDocument`; this
 * package provides a tolerant `parse()` wrapper, a `discover()` remote
 * fetcher, and structured warnings for legacy key-discovery lines that
 * appeared in older peac.txt examples.
 *
 * `peac.txt` is NOT a key discovery surface. Cryptographic key resolution
 * flows through `iss` -> /.well-known/peac-issuer.json -> `jwks_uri` -> JWKS
 * (docs/specs/PEAC-ISSUER.md). Callers that need key material MUST use
 * `parseIssuerConfig` / `fetchIssuerConfig` from `@peac/protocol`.
 *
 * Legacy key-discovery lines (`verify:`, `public_keys:`, `jwks:`) are
 * tolerated on parse: they are stripped before validation, surfaced on
 * `ParseResult.warnings`, and fire a structured `process.emitWarning`
 * with code `PEAC_LEGACY_PEAC_TXT_KEY_FIELD` once per process.
 */

export { parse, emit, validate, __resetLegacyWarningForTests } from './parser.js';
export type { ParseResult, ValidationOptions, PolicyDocument } from './types.js';

/**
 * @deprecated Retained for one minor to keep existing import paths
 * compiling. peac.txt policy documents now resolve to a `PolicyDocument`
 * (re-exported from `@peac/policy-kit`). Removal target: next cleanup
 * release.
 */
export type { PeacDiscovery, PublicKeyInfo } from './types.js';

export const MAX_BYTES = 262144; // 256 KiB, per docs/specs/PEAC-TXT.md §6.1
export const WELL_KNOWN_PATH = '/.well-known/peac.txt';

/**
 * Fetch and parse a remote peac.txt policy document. On success returns a
 * `ParseResult` whose `data` is the validated `peac-policy/0.1`
 * `PolicyDocument`. Legacy key-discovery lines in the fetched bytes are
 * surfaced as warnings but never populate `data`.
 *
 * Callers supply the user-agent via the `PEAC_USER_AGENT` environment
 * variable if needed; this package does not hard-code a version string
 * (that belongs in release-prep metadata, not a feature package).
 */
export async function discover(origin: string): Promise<import('./types.js').ParseResult> {
  try {
    const url = new URL(WELL_KNOWN_PATH, origin);
    const ua = (typeof process !== 'undefined' && process.env?.PEAC_USER_AGENT) || 'peac-disc';
    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': ua },
    });

    if (!response.ok) {
      return {
        valid: false,
        errors: [`HTTP ${response.status}: ${response.statusText}`],
      };
    }

    const content = await response.text();
    if (content.length > MAX_BYTES) {
      return {
        valid: false,
        errors: [`peac.txt exceeds ${MAX_BYTES} bytes (got ${content.length})`],
      };
    }
    const { parse } = await import('./parser.js');
    return parse(content);
  } catch (error) {
    return {
      valid: false,
      errors: [`Discovery failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}
