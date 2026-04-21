/**
 * @peac/pref/types - AIPREF types with robots.txt bridge.
 *
 * @deprecated @peac/pref is deprecated. Use @peac/mappings-content-signals
 * directly for RFC 8941/9651 Structured-Fields `Content-Usage` parsing,
 * RFC 9309 robots.txt parsing, tdmrep parsing, and `resolveSignals()`.
 * Removal target: next cleanup release.
 */

export interface AIPrefSnapshot {
  crawl?: boolean;
  'train-ai'?: boolean;
  commercial?: boolean;
  [key: string]: boolean | undefined;
}

/**
 * Digest of an AIPrefSnapshot.
 *
 * Pre-v0.12.14: `val` was a truncated 12-character hex string (fake "JCS-SHA256").
 * v0.12.14+: `val` is a full 64-character hex string of the RFC 8785 JCS
 * canonicalization + SHA-256 (canonical PEAC discipline). The `alg` literal is
 * retained for backward-compat of the `AIPrefPolicy` shape; new consumers
 * should prefer the lowercase `sha-256` scheme from @peac/mappings-content-signals.
 */
export interface AIPrefDigest {
  alg: 'JCS-SHA256';
  val: string;
}

export interface AIPrefPolicy {
  status: 'active' | 'not_found' | 'error' | 'not_applicable';
  checked_at: string;
  snapshot?: AIPrefSnapshot;
  digest?: AIPrefDigest;
  reason?: string;
  source?: 'header' | 'aipref' | 'peac' | 'robots' | 'tdmrep' | 'default';
}

export interface RobotsRule {
  userAgent: string;
  directives: Array<{
    field: string;
    value: string;
  }>;
}

/**
 * @deprecated v0.12.14 facade does not maintain an internal source registry.
 * This type is retained to preserve the @peac/pref public API shape for one
 * minor. Removal target: next cleanup release.
 */
export interface PrefSource {
  priority: number;
  name: string;
  fetch(uri: string): Promise<AIPrefSnapshot | null>;
}

/**
 * Context for resolving AI preferences. Callers MUST pass pre-fetched content
 * via the optional fields; the v0.12.14+ facade does not perform network I/O.
 */
export interface ResolveContext {
  uri: string;
  headers?: Record<string, string>;
  /** Pre-fetched robots.txt bytes, if available. */
  robotsTxt?: string;
  /** Pre-fetched tdmrep.json bytes, if available. */
  tdmrep?: string;
  /**
   * @deprecated Retained for API compatibility; ignored by the v0.12.14+
   * facade. Set an outer `AbortSignal` on the fetch that provides
   * `robotsTxt` / `tdmrep` instead.
   */
  timeout?: number;
}
