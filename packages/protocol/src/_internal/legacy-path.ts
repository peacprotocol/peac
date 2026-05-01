/**
 * Internal rollback-path flag.
 *
 * INTERNAL ONLY. Both flag values currently use the same protocol path.
 * The flag reader is exercised so rollback-path plumbing can be validated
 * without changing public behavior.
 *
 * Public option types MUST NOT declare `_internal.legacyPath`; callers
 * inside this package access the programmatic option only through
 * internal casts. Flag identifiers are forbidden on the public TypeScript
 * surface by `scripts/verify-dist-private-leaks.mjs` (Tier 1 + scoped
 * runtime allowlist for `@peac/protocol` runtime files only) and by
 * `scripts/verify-no-semantic-widening.mjs`.
 */

/**
 * Programmatic-flag shape. Internal-only; never appears on any
 * exported public option type. Mirrors the existing shadow-flag
 * pattern at `_internal/shadow.ts` so the dist-leak gates and the
 * semantic-widening gates apply uniformly.
 *
 * @internal
 */
export interface LegacyPathOptions {
  readonly _internal?: {
    readonly legacyPath?: boolean;
  };
}

/**
 * Read the rollback-path flag from environment or programmatic
 * options. Read once per call, NOT cached at module scope, so tests
 * can toggle the env var dynamically. Strict semantics: only the
 * literal string `'1'` activates the flag, mirroring
 * `PEAC_INTERNAL_SHADOW_CORE`.
 *
 * Environment access is guarded for browser / edge runtimes that do
 * not expose `process`; the function never throws.
 *
 * Caller pattern at protocol hot paths:
 *
 *   void readLegacyPathFlag(options as unknown as LegacyPathOptions);
 *
 * The `void` discards the returned boolean intentionally: both flag
 * values currently use the same protocol path, and the call exists
 * so the read path is exercised.
 *
 * @internal
 */
export function readLegacyPathFlag(options?: LegacyPathOptions): boolean {
  if (options?._internal?.legacyPath === true) return true;
  if (typeof process === 'undefined' || process === null) return false;
  const env = (process as { env?: Record<string, string | undefined> }).env;
  return env?.PEAC_INTERNAL_LEGACY_PATH === '1';
}
