/**
 * Wire 0.2 Extension Key Grammar Validator
 *
 * Validates that extension keys conform to the Wire 0.2 reverse-DNS
 * extension key grammar: `<domain>/<segment>`.
 *
 * Extracted from the monolithic wire-02-extensions.ts for maintainability.
 */

import { EXTENSION_LIMITS } from './limits.js';

/**
 * DNS label pattern: lowercase alphanumeric, may contain hyphens but not at
 * start or end. Single-char labels are valid (e.g., "a").
 */
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Segment pattern: lowercase alphanumeric start, may contain lowercase
 * alphanumeric, underscores, and hyphens.
 */
const SEGMENT_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * Validate that an extension key conforms to the Wire 0.2 extension key
 * grammar: `<domain>/<segment>`.
 *
 * Domain rules:
 *   - At least one dot (distinguishes from single-label paths)
 *   - Each label matches [a-z0-9]([a-z0-9-]*[a-z0-9])? (lowercase only)
 *   - No uppercase letters anywhere in the domain
 *
 * Segment rules:
 *   - Matches [a-z0-9][a-z0-9_-]* (lowercase only)
 *   - Underscores are permitted (for extension names like credential_event)
 *
 * @param key - Extension key to validate
 * @returns true if valid extension key grammar; false otherwise
 */
export function isValidExtensionKey(key: string): boolean {
  if (key.length === 0 || key.length > EXTENSION_LIMITS.maxExtensionKeyLength) return false;

  const slashIdx = key.indexOf('/');
  if (slashIdx <= 0) return false;

  const domain = key.slice(0, slashIdx);
  const segment = key.slice(slashIdx + 1);

  if (!domain.includes('.')) return false;
  if (domain.length > EXTENSION_LIMITS.maxDnsDomainLength) return false;

  if (segment.length === 0) return false;
  if (!SEGMENT_PATTERN.test(segment)) return false;

  const labels = domain.split('.');
  for (const label of labels) {
    if (label.length === 0 || label.length > EXTENSION_LIMITS.maxDnsLabelLength) return false;
    if (!DNS_LABEL.test(label)) return false;
  }

  return true;
}

/**
 * Escape a single path segment per RFC 6901.
 * '~' -> '~0', '/' -> '~1'
 */
export function escapePointerSegment(s: string): string {
  return s.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Build a leaf-precise RFC 6901 JSON Pointer from a group key and Zod
 * issue path.
 *
 * @param groupKey - Extension group key (e.g., 'org.peacprotocol/commerce')
 * @param zodPath - Path array from the first Zod issue
 * @returns RFC 6901 pointer string
 */
export function zodPathToPointer(groupKey: string, zodPath: readonly PropertyKey[]): string {
  const escaped = escapePointerSegment(groupKey);
  const segments = zodPath.map((s) => escapePointerSegment(String(s)));
  return `/extensions/${escaped}` + (segments.length > 0 ? '/' + segments.join('/') : '');
}
