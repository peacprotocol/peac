/**
 * Shared ACP mapper validation helpers.
 */

/**
 * Type guard for an https:// URL string with a non-empty hostname.
 *
 * Requires the literal "https://" prefix in addition to a parsed `https:`
 * protocol so opaque-path forms like "https:example.com" are rejected.
 * Embedded credentials (userinfo) are rejected to avoid signing a
 * resource_uri that carries secrets.
 */
export function isValidHttpsResourceUri(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (!value.startsWith('https://')) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname.length > 0 &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}
