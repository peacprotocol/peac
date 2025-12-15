/**
 * SSRF protection for JWKS fetching.
 *
 * Edge runtimes cannot reliably block private IPs via DNS resolution.
 * This module implements what IS possible at the edge.
 */

import { ErrorCodes, JwksError } from './errors.js';

/**
 * Validate URL for SSRF protection.
 *
 * @param url - URL to validate
 * @param options - Validation options
 * @throws JwksError if URL is blocked
 */
export function validateUrl(
  url: string,
  options: {
    allowLocalhost?: boolean;
    isAllowedHost?: (host: string) => boolean;
  } = {}
): void {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new JwksError(ErrorCodes.SSRF_BLOCKED, `Invalid URL: ${url}`);
  }

  // HTTPS required (except localhost in dev)
  if (parsed.protocol !== 'https:') {
    if (parsed.protocol === 'http:' && options.allowLocalhost && isLocalhostHost(parsed.hostname)) {
      // Allow http://localhost in dev mode
    } else {
      throw new JwksError(
        ErrorCodes.SSRF_BLOCKED,
        `HTTPS required, got ${parsed.protocol}`
      );
    }
  }

  // Block localhost variants (unless explicitly allowed)
  if (isLocalhostHost(parsed.hostname) && !options.allowLocalhost) {
    throw new JwksError(
      ErrorCodes.SSRF_BLOCKED,
      `Localhost blocked: ${parsed.hostname}`
    );
  }

  // Block literal IP addresses in URL
  if (isLiteralIp(parsed.hostname)) {
    throw new JwksError(
      ErrorCodes.SSRF_BLOCKED,
      `Literal IP addresses blocked: ${parsed.hostname}`
    );
  }

  // Check enterprise allowlist if provided
  if (options.isAllowedHost && !options.isAllowedHost(parsed.hostname)) {
    throw new JwksError(
      ErrorCodes.SSRF_BLOCKED,
      `Host not in allowlist: ${parsed.hostname}`
    );
  }
}

/**
 * Check if hostname is localhost variant.
 */
function isLocalhostHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower === '[::1]' ||
    lower.endsWith('.localhost')
  );
}

/**
 * Check if hostname is a literal IP address.
 */
function isLiteralIp(hostname: string): boolean {
  // IPv4 pattern
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    return true;
  }

  // IPv6 pattern (with or without brackets)
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return true;
  }

  // Colon indicates IPv6 (no brackets)
  if (hostname.includes(':')) {
    return true;
  }

  return false;
}

/**
 * Check if hostname is a metadata IP.
 */
export function isMetadataIp(hostname: string): boolean {
  // AWS/GCP/Azure metadata service
  if (hostname === '169.254.169.254') {
    return true;
  }

  // Link-local range (169.254.x.x)
  if (hostname.startsWith('169.254.')) {
    return true;
  }

  return false;
}
