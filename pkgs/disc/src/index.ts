/**
 * @peac/disc - PEAC discovery with ≤20 lines enforcement
 * ABNF-compliant .well-known/peac.txt parser and generator
 */

export { parse, emit, validate } from './parser.js';
export type { PeacDiscovery, PublicKeyInfo, ParseResult, ValidationOptions } from './types.js';

// Constants
export const MAX_LINES = 20;
export const WELL_KNOWN_PATH = '/.well-known/peac.txt';

// Convenience function for fetching and parsing discovery documents
export async function discover(origin: string): Promise<import('./types.js').ParseResult> {
  try {
    const url = new URL(WELL_KNOWN_PATH, origin);
    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'PEAC/0.9.12 (+https://peac.dev)' },
    });

    if (!response.ok) {
      return {
        valid: false,
        errors: [`HTTP ${response.status}: ${response.statusText}`],
      };
    }

    const content = await response.text();
    const { parse } = await import('./parser.js');
    return parse(content);
  } catch (error) {
    return {
      valid: false,
      errors: [`Discovery failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}
