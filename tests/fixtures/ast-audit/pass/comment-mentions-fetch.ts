// Comments mentioning forbidden APIs should not be flagged.
// We do not use fetch() here because the no-network invariant forbids it.
// globalThis.fetch is also banned in validation-only packages.
// import http from 'node:http'; -- this is just a comment

/**
 * This function does not use fetch().
 * It validates data locally.
 */
export function validate(data: unknown): boolean {
  return data !== undefined;
}
