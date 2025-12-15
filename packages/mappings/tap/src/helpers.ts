/**
 * Helper utilities for TAP mapping.
 */

/**
 * Convert Headers-like object or Map to Record<string, string>.
 *
 * Handles:
 * - Headers (browser/node fetch API)
 * - Map<string, string>
 * - Record<string, string> (passthrough)
 *
 * @param headers - Headers-like object
 * @returns Record<string, string>
 */
export function headersToRecord(
  headers:
    | { forEach: (callback: (value: string, key: string) => void) => void }
    | Record<string, string>
): Record<string, string> {
  // If it's already a plain object without forEach, return as-is
  if (!('forEach' in headers) || typeof headers.forEach !== 'function') {
    return headers as Record<string, string>;
  }

  // Convert Headers/Map to Record
  const record: Record<string, string> = {};
  headers.forEach((value: string, key: string) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

/**
 * Get header value by name (case-insensitive).
 *
 * @param headers - Headers as Record
 * @param name - Header name
 * @returns Header value or empty string
 */
export function getHeader(headers: Record<string, string>, name: string): string {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }
  return '';
}
