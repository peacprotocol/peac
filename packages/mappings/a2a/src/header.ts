/**
 * A2A extension header utilities.
 *
 * Handles the A2A-Extensions header for advertising supported extensions
 * per DD-86 (no X- prefix headers).
 */

/**
 * Parse comma-separated A2A extension URIs from header value.
 *
 * @param header - Raw header value (e.g. "https://example.com/ext/a, https://example.com/ext/b")
 * @returns Array of trimmed, non-empty extension URIs
 */
export function parseA2AExtensionsHeader(header: string): string[] {
  return header
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Build comma-separated A2A-Extensions header value from URIs.
 *
 * @param extensions - Array of extension URIs
 * @returns Comma-separated header value
 */
export function buildA2AExtensionsHeader(extensions: string[]): string {
  return extensions.join(', ');
}
