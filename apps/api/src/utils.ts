/**
 * Shared utilities for the PEAC reference verifier API.
 *
 * Extracted from verify-v1.ts and hosted-issue.ts to avoid
 * duplication of deterministic serialization logic.
 */

/**
 * Deterministic JSON serialization: sort keys at every nesting level.
 * Same input always produces byte-identical output for the same data.
 */
export function deterministicStringify(obj: unknown): string {
  return JSON.stringify(obj, (_key, value) => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      );
    }
    return value;
  });
}
