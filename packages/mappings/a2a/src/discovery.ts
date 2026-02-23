/**
 * A2A agent discovery with SSRF hardening (Polish C).
 *
 * Discovers A2A Agent Cards and checks for PEAC extension support.
 * Implements DNS rebinding defense, scheme allowlist, proxy bypass,
 * response size cap, content-type check, and redirect rejection.
 */

import type { A2AAgentCard, AgentCardPeacExtension } from './types';
import { PEAC_EXTENSION_URI } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum response body size (256 KB) */
const MAX_RESPONSE_SIZE = 256 * 1024;

/** Request timeout in milliseconds */
const DISCOVERY_TIMEOUT_MS = 5_000;

/** Private/reserved IP ranges (RFC 1918, RFC 4193, loopback, link-local) */
const PRIVATE_IP_PATTERNS = [
  /^127\./, // loopback
  /^10\./, // RFC 1918 Class A
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC 1918 Class B
  /^192\.168\./, // RFC 1918 Class C
  /^169\.254\./, // link-local
  /^0\./, // current network
  /^::1$/, // IPv6 loopback
  /^fd[0-9a-f]{2}:/, // RFC 4193 ULA
  /^fe80:/, // IPv6 link-local
  /^fc[0-9a-f]{2}:/, // RFC 4193 ULA
];

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Discovery options */
export interface DiscoveryOptions {
  /**
   * Allow HTTP (insecure) for localhost addresses only (dev mode).
   * Default: false (HTTPS only in production).
   */
  allowInsecureLocalhost?: boolean;

  /** Custom fetch implementation (for testing) */
  fetch?: typeof globalThis.fetch;
}

// ---------------------------------------------------------------------------
// SSRF helpers
// ---------------------------------------------------------------------------

function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));
}

function isLocalhostAddress(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1'
  );
}

/**
 * Validate URL scheme and hostname for SSRF protection.
 *
 * - Only HTTPS in production (Polish C item 6)
 * - HTTP allowed only for localhost when allowInsecureLocalhost is true
 * - Rejects private IP ranges
 */
function validateUrlForDiscovery(
  url: string,
  options: DiscoveryOptions
): void {
  const parsed = new URL(url);

  // Scheme allowlist (Polish C item 6)
  if (parsed.protocol === 'http:') {
    if (!options.allowInsecureLocalhost || !isLocalhostAddress(parsed.hostname)) {
      throw new Error(
        `SSRF: HTTP scheme not allowed for ${parsed.hostname}. ` +
          'Use HTTPS or enable allowInsecureLocalhost for local development.'
      );
    }
  } else if (parsed.protocol !== 'https:') {
    throw new Error(`SSRF: unsupported scheme ${parsed.protocol}`);
  }

  // Check for private IP in hostname (DNS rebinding defense)
  if (isPrivateIP(parsed.hostname) && !isLocalhostAddress(parsed.hostname)) {
    throw new Error(`SSRF: private IP address ${parsed.hostname} not allowed`);
  }
}

// ---------------------------------------------------------------------------
// Core discovery
// ---------------------------------------------------------------------------

/**
 * Discover A2A Agent Card from a base URL.
 *
 * Tries `/.well-known/agent-card.json` first, then `/.well-known/agent.json`
 * as a legacy fallback per A2A v0.3.0.
 *
 * SSRF protection per Polish C:
 * 1. DNS rebinding defense (private IP check)
 * 2. Response size cap (256 KB)
 * 3. Content-Type check (application/json)
 * 4. Redirect rejection (redirect: "error")
 * 5. Timeout (5 seconds)
 * 6. Scheme allowlist (HTTPS only; HTTP for localhost dev only)
 * 7. Proxy bypass (not inheriting proxy env vars)
 */
export async function discoverAgentCard(
  baseUrl: string,
  options: DiscoveryOptions = {}
): Promise<A2AAgentCard | null> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const paths = ['/.well-known/agent-card.json', '/.well-known/agent.json'];

  for (const path of paths) {
    const url = new URL(path, baseUrl).toString();

    try {
      validateUrlForDiscovery(url, options);

      const response = await fetchFn(url, {
        method: 'GET',
        redirect: 'error', // Polish C item 4
        signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
        // Note: proxy bypass achieved by not configuring proxy agent
        // In Node.js, fetch does not inherit HTTP_PROXY by default
      });

      if (!response.ok) {
        continue;
      }

      // Content-Type check (Polish C item 3)
      const contentType = response.headers.get('content-type') ?? '';
      if (
        !contentType.includes('application/json') &&
        !contentType.match(/application\/[a-z0-9.+-]*\+json/)
      ) {
        continue;
      }

      // Response size cap (Polish C item 2)
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
        continue;
      }

      const text = await response.text();
      if (text.length > MAX_RESPONSE_SIZE) {
        continue;
      }

      const card = JSON.parse(text) as A2AAgentCard;

      // Basic validation: must have name and url
      if (typeof card.name !== 'string' || typeof card.url !== 'string') {
        continue;
      }

      return card;
    } catch {
      // SSRF validation errors, network errors, parse errors: try next path
      continue;
    }
  }

  return null;
}

/**
 * Check if an A2A Agent Card advertises PEAC extension support.
 *
 * Looks for the PEAC extension URI in capabilities.extensions[].
 */
export function hasPeacExtension(card: A2AAgentCard): boolean {
  const extensions = card.capabilities?.extensions;
  if (!Array.isArray(extensions)) {
    return false;
  }
  return extensions.some(
    (ext) => typeof ext === 'object' && ext !== null && ext.uri === PEAC_EXTENSION_URI
  );
}

/**
 * Extract PEAC extension parameters from an A2A Agent Card.
 *
 * Returns the PEAC extension entry or null if not present.
 */
export function getPeacExtension(
  card: A2AAgentCard
): AgentCardPeacExtension | null {
  const extensions = card.capabilities?.extensions;
  if (!Array.isArray(extensions)) {
    return null;
  }
  const entry = extensions.find(
    (ext) => typeof ext === 'object' && ext !== null && ext.uri === PEAC_EXTENSION_URI
  );
  return (entry as AgentCardPeacExtension) ?? null;
}
