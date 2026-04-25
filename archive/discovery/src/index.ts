/**
 * @peac/disc - DEPRECATED. Thin peac.txt policy-document loader/validator and
 * remote fetcher. Retained as a published deprecated compatibility package
 * so that existing workspace and external consumers continue to resolve.
 *
 * @deprecated Prefer {@link "@peac/policy-kit"} for policy-document parsing
 * and validation (`parsePolicyDocument`, `loadPolicyDocument`,
 * `validatePolicy`, `serializePolicyYaml`). Remote discovery behavior in
 * `discover()` (SSRF-aware fetch with a byte cap, timeout policy, and
 * redirect policy) has no direct equivalent in `@peac/policy-kit` and
 * remains compatibility-only here until an equivalent replacement ships.
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

// One-shot structured deprecation warning on module load. Use
// process.emitWarning with a stable code plus DeprecationWarning type so
// operators can filter on NODE_OPTIONS=--no-deprecation if needed. Single
// shot per process to avoid log spam in hot paths.
let __peacDiscDeprecationEmitted = false;
function __emitPeacDiscDeprecation(): void {
  if (__peacDiscDeprecationEmitted) return;
  __peacDiscDeprecationEmitted = true;
  if (typeof process !== 'undefined' && typeof process.emitWarning === 'function') {
    process.emitWarning(
      '@peac/disc is deprecated. Use loadPolicyDocument from @peac/policy-kit. ' +
        'See https://peacprotocol.org/docs/migration for migration steps.',
      { type: 'DeprecationWarning', code: 'PEAC_DISC_DEPRECATED' }
    );
  }
}
__emitPeacDiscDeprecation();

/** @internal test-only hook to reset the one-shot deprecation flag. */
export function __resetDiscDeprecationWarningForTests(): void {
  __peacDiscDeprecationEmitted = false;
}

export { parse, emit, validate, __resetLegacyWarningForTests } from './parser.js';
export type { ParseResult, ValidationOptions, PolicyDocument } from './types.js';

/**
 * @deprecated Retained for one minor to keep existing import paths
 * compiling. peac.txt policy documents now resolve to a `PolicyDocument`
 * (re-exported from `@peac/policy-kit`).
 */
export type { PeacDiscovery, PublicKeyInfo } from './types.js';

export const MAX_BYTES = 262144; // 256 KiB, per docs/specs/PEAC-TXT.md §6.1
export const WELL_KNOWN_PATH = '/.well-known/peac.txt';
export const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_USER_AGENT = 'peac-disc';

/**
 * Minimal fetch signature accepted by `discover`. `undici` / `node-fetch` /
 * browser / test-double implementations all satisfy this.
 */
export type DiscoverFetch = (
  input: string,
  init?: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    redirect?: 'follow' | 'error' | 'manual';
  }
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
}>;

export interface DiscoverOptions {
  /**
   * HTTP fetch implementation. Defaults to the ambient `fetch` global.
   * Supply `undici.fetch`, a test double, or a policy-wrapping client as
   * needed.
   */
  fetchImpl?: DiscoverFetch;
  /**
   * User-agent string. Precedence (highest first): this option, the
   * `PEAC_USER_AGENT` environment variable, then `peac-disc`.
   */
  userAgent?: string;
  /** Caller-supplied abort signal. */
  signal?: AbortSignal;
  /**
   * Millisecond timeout. Ignored when `signal` is supplied (the caller
   * owns cancellation). Defaults to 5_000 when neither is provided.
   */
  timeoutMs?: number;
  /** Override the 256 KiB body cap from docs/specs/PEAC-TXT.md §6.1. */
  maxBytes?: number;
  /**
   * Redirect policy. Defaults to `error` to avoid cross-origin surprise
   * on a well-known discovery endpoint; set to `follow` explicitly if the
   * deployment relies on server-side redirects.
   */
  redirect?: 'follow' | 'error' | 'manual';
}

/**
 * Fetch and parse a remote peac.txt policy document. On success returns a
 * `ParseResult` whose `data` is the validated `peac-policy/0.1`
 * `PolicyDocument`. Legacy key-discovery lines in the fetched bytes are
 * surfaced as warnings but never populate `data`.
 */
export async function discover(
  origin: string,
  options: DiscoverOptions = {}
): Promise<import('./types.js').ParseResult> {
  const fetchImpl = (options.fetchImpl ?? (globalThis as { fetch?: DiscoverFetch }).fetch) as
    | DiscoverFetch
    | undefined;
  if (typeof fetchImpl !== 'function') {
    return {
      valid: false,
      errors: [
        'Discovery failed: no fetch implementation available (supply options.fetchImpl or provide a global fetch)',
      ],
    };
  }

  const envUa =
    typeof process !== 'undefined' && typeof process.env === 'object'
      ? process.env.PEAC_USER_AGENT
      : undefined;
  const userAgent = options.userAgent ?? envUa ?? DEFAULT_USER_AGENT;
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  const redirect = options.redirect ?? 'error';

  // If the caller did not supply an AbortSignal, install a local one driven by timeoutMs.
  let localController: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let signal = options.signal;
  if (!signal) {
    localController = new AbortController();
    signal = localController.signal;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
      timer = setTimeout(() => localController?.abort(), timeoutMs);
    }
  }

  try {
    const url = new URL(WELL_KNOWN_PATH, origin);
    const response = await fetchImpl(url.toString(), {
      headers: { 'User-Agent': userAgent },
      signal,
      redirect,
    });

    if (!response.ok) {
      return {
        valid: false,
        errors: [`HTTP ${response.status}: ${response.statusText}`],
      };
    }

    const content = await response.text();
    if (content.length > maxBytes) {
      return {
        valid: false,
        errors: [`peac.txt exceeds ${maxBytes} bytes (got ${content.length})`],
      };
    }
    const { parse } = await import('./parser.js');
    return parse(content);
  } catch (error) {
    return {
      valid: false,
      errors: [`Discovery failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
