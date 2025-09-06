/**
 * @peac/pref - AIPREF resolver with robots.txt bridge
 * Implements strict merge order for effective policy resolution
 */

export { PrefResolver } from './resolver.js';
export { parseRobots, robotsToAIPref, fetchRobots } from './robots.js';
export type { 
  AIPrefSnapshot, 
  AIPrefPolicy, 
  RobotsRule, 
  PrefSource, 
  ResolveContext 
} from './types.js';

// Convenience function for single-use resolution
export async function resolveAIPref(uri: string, headers?: Record<string, string>): Promise<import('./types.js').AIPrefPolicy> {
  const { PrefResolver } = await import('./resolver.js');
  const resolver = new PrefResolver();
  return resolver.resolve({ uri, headers });
}