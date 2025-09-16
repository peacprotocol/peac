/**
 * HTTP utility functions for consistent header handling
 * Ensures peac-version and other standard headers on all responses
 */

export const WIRE_VERSION = '0.9.13';

export function peacHeaders(extra: Record<string, string> = {}) {
  return {
    'peac-version': WIRE_VERSION,
    'X-Request-ID': extra['X-Request-ID'] ?? '',
    ...extra,
  };
}
