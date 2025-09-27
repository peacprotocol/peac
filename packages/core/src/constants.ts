/**
 * PEAC Protocol canonical constants
 */

/** Canonical PEAC protocol origin (no trailing slash) */
export const PEAC_CANONICAL_ORIGIN = 'https://peacprotocol.org';

/** RFC 9457 Problem Details base URI for PEAC errors */
export const PROBLEM_BASE = 'https://peacprotocol.org/errors';

/** PEAC well-known paths */
export const WELL_KNOWN_PATHS = {
  PEAC_TXT: '/.well-known/peac.txt',
  AGREEMENTS: '/agreements',
} as const;
