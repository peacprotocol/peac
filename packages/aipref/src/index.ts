/**
 * @peac/pref - AIPREF resolver with robots.txt bridge
 * Implements strict merge order for effective policy resolution
 */

export { PrefResolver } from './resolver';
export { parseRobots, robotsToAIPref, fetchRobots } from './robots';
export type { AIPrefSnapshot, AIPrefPolicy, RobotsRule, PrefSource, ResolveContext } from './types';

// Convenience function for single-use resolution
export async function resolveAIPref(
  uri: string,
  headers?: Record<string, string>
): Promise<import('./types').AIPrefPolicy> {
  const { PrefResolver } = await import('./resolver');
  const resolver = new PrefResolver();
  return resolver.resolve({ uri, headers });
}
