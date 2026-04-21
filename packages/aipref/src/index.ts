/**
 * @peac/pref - DEPRECATED facade over @peac/mappings-content-signals.
 *
 * @deprecated @peac/pref is deprecated as of v0.12.14. Use
 * `@peac/mappings-content-signals` directly for RFC 8941/9651
 * Structured-Fields `Content-Usage` parsing, RFC 9309 robots.txt parsing,
 * tdmrep parsing, and `resolveSignals()`. Emits a one-shot structured
 * `PEAC_DEPRECATED_PREF` warning on first `PrefResolver` instantiation.
 * Removal target: next cleanup release.
 */

export { PrefResolver } from './resolver.js';
export { parseRobots, robotsToAIPref, fetchRobots, robotsToPeacStarter } from './robots.js';
export type { RobotsToPeacResult } from './robots.js';
export type {
  AIPrefSnapshot,
  AIPrefPolicy,
  AIPrefDigest,
  RobotsRule,
  PrefSource,
  ResolveContext,
} from './types.js';

/**
 * @deprecated Use `@peac/mappings-content-signals.createObservation` or
 * instantiate a `PrefResolver` and pass pre-fetched content via
 * `ResolveContext`. The v0.12.14+ facade does not perform network I/O;
 * `headers` is the only input consulted via this convenience helper.
 * Removal target: next cleanup release.
 */
export async function resolveAIPref(
  uri: string,
  headers?: Record<string, string>
): Promise<import('./types.js').AIPrefPolicy> {
  const { PrefResolver } = await import('./resolver.js');
  const resolver = new PrefResolver();
  return resolver.resolve({ uri, headers });
}
