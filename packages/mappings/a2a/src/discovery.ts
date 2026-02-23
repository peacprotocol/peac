/**
 * A2A agent discovery with SSRF hardening (Polish C).
 *
 * Discovers A2A Agent Cards and checks for PEAC extension support.
 * Implements literal-IP blocking, optional DNS resolution checks,
 * scheme allowlist, userinfo rejection, response size cap,
 * content-type check, and redirect rejection.
 */

import type { CarrierFormat } from '@peac/kernel';
import { PEAC_RECEIPT_HEADER } from '@peac/kernel';

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

  /** Custom fetch implementation (for testing or strict environments) */
  fetch?: typeof globalThis.fetch;

  /**
   * Optional DNS resolver for DNS rebinding defense.
   *
   * When provided, discovery resolves the hostname and checks all returned
   * IP addresses against private ranges before connecting. This provides
   * full DNS rebinding protection.
   *
   * When omitted, discovery checks only literal IP addresses in the URL
   * hostname (weaker posture, but portable across runtimes).
   */
  resolveHostname?: (hostname: string) => Promise<string[]>;
}

// ---------------------------------------------------------------------------
// SSRF helpers
// ---------------------------------------------------------------------------

function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));
}

function isLocalhostAddress(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/**
 * Validate URL scheme, hostname, and credentials for SSRF protection.
 *
 * - Only HTTPS in production (Polish C item 6)
 * - HTTP allowed only for localhost when allowInsecureLocalhost is true
 * - Rejects private IP ranges (literal check always; DNS resolution when resolver provided)
 * - Rejects URLs with userinfo (user:pass@host) to prevent confusion in allowlists
 */
async function validateUrlForDiscovery(url: string, options: DiscoveryOptions): Promise<void> {
  const parsed = new URL(url);

  // Reject URLs with userinfo (user:pass@host)
  if (parsed.username || parsed.password) {
    throw new Error('SSRF: URLs with userinfo (credentials) are not allowed');
  }

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

  // Check for private IP in hostname (literal IP check)
  if (isPrivateIP(parsed.hostname) && !isLocalhostAddress(parsed.hostname)) {
    throw new Error(`SSRF: private IP address ${parsed.hostname} not allowed`);
  }

  // DNS rebinding defense: resolve hostname and check all IPs (when resolver provided)
  if (options.resolveHostname && !isLocalhostAddress(parsed.hostname)) {
    const resolvedIPs = await options.resolveHostname(parsed.hostname);
    for (const ip of resolvedIPs) {
      if (isPrivateIP(ip)) {
        throw new Error(`SSRF: hostname ${parsed.hostname} resolved to private IP ${ip}`);
      }
    }
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
 * 1. Private IP blocking (literal check; DNS resolution when resolveHostname provided)
 * 2. Response size cap (256 KB)
 * 3. Content-Type check (application/json)
 * 4. Redirect rejection (redirect: "error")
 * 5. Timeout (5 seconds)
 * 6. Scheme allowlist (HTTPS only; HTTP for localhost dev only)
 * 7. Userinfo rejection (no credentials in URLs)
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
      await validateUrlForDiscovery(url, options);

      const response = await fetchFn(url, {
        method: 'GET',
        redirect: 'error', // Polish C item 4
        signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
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
export function getPeacExtension(card: A2AAgentCard): AgentCardPeacExtension | null {
  const extensions = card.capabilities?.extensions;
  if (!Array.isArray(extensions)) {
    return null;
  }
  const entry = extensions.find(
    (ext) => typeof ext === 'object' && ext !== null && ext.uri === PEAC_EXTENSION_URI
  );
  return (entry as AgentCardPeacExtension) ?? null;
}

// ---------------------------------------------------------------------------
// PEAC discovery result
// ---------------------------------------------------------------------------

/** Source of PEAC capability discovery */
export type PeacDiscoverySource = 'agent_card' | 'well_known' | 'header_probe';

/** Result of PEAC capability discovery */
export interface PeacDiscoveryResult {
  source: PeacDiscoverySource;
  kinds: string[];
  carrier_formats: CarrierFormat[];
  issuer_config_url?: string;
}

// ---------------------------------------------------------------------------
// 3-step discovery (DD-110)
// ---------------------------------------------------------------------------

/**
 * Discover PEAC capabilities from a base URL using a 3-step algorithm:
 *
 * 1. Agent Card: check `/.well-known/agent-card.json` for PEAC extension
 * 2. Well-known: check `/.well-known/peac.json` (standalone PEAC discovery)
 * 3. Header probe: HEAD request to base URL, check for `PEAC-Receipt` header
 *
 * Returns the first successful result or null if PEAC is not supported.
 * All steps apply SSRF protections per Polish C.
 */
export async function discoverPeacCapabilities(
  baseUrl: string,
  options: DiscoveryOptions = {}
): Promise<PeacDiscoveryResult | null> {
  // Step 1: Agent Card
  const card = await discoverAgentCard(baseUrl, options);
  if (card) {
    const ext = getPeacExtension(card);
    if (ext) {
      return {
        source: 'agent_card',
        kinds: ext.params?.supported_kinds ?? ['peac-receipt/0.1'],
        carrier_formats: ext.params?.carrier_formats ?? ['embed'],
        ...(ext.params?.issuer_config_url && {
          issuer_config_url: ext.params.issuer_config_url,
        }),
      };
    }
  }

  // Step 2: /.well-known/peac.json
  const wellKnown = await discoverPeacWellKnown(baseUrl, options);
  if (wellKnown) {
    return wellKnown;
  }

  // Step 3: Header probe
  const headerProbe = await discoverPeacViaHeaderProbe(baseUrl, options);
  if (headerProbe) {
    return headerProbe;
  }

  return null;
}

/**
 * Step 2: Discover PEAC support via `/.well-known/peac.json`.
 */
async function discoverPeacWellKnown(
  baseUrl: string,
  options: DiscoveryOptions
): Promise<PeacDiscoveryResult | null> {
  const fetchFn = options.fetch ?? globalThis.fetch;
  const url = new URL('/.well-known/peac.json', baseUrl).toString();

  try {
    await validateUrlForDiscovery(url, options);

    const response = await fetchFn(url, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') ?? '';
    if (
      !contentType.includes('application/json') &&
      !contentType.match(/application\/[a-z0-9.+-]*\+json/)
    ) {
      return null;
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
      return null;
    }

    const text = await response.text();
    if (text.length > MAX_RESPONSE_SIZE) return null;

    const data = JSON.parse(text) as Record<string, unknown>;

    return {
      source: 'well_known',
      kinds: Array.isArray(data.supported_kinds)
        ? (data.supported_kinds as string[])
        : ['peac-receipt/0.1'],
      carrier_formats: Array.isArray(data.carrier_formats)
        ? (data.carrier_formats as CarrierFormat[])
        : ['embed'],
      ...(typeof data.issuer_config_url === 'string' && {
        issuer_config_url: data.issuer_config_url,
      }),
    };
  } catch {
    return null;
  }
}

/**
 * Step 3: Discover PEAC support via header probe.
 *
 * Sends a HEAD request and checks for the presence of a PEAC-Receipt header.
 * This is a lightweight probe; it indicates support but provides minimal detail.
 */
async function discoverPeacViaHeaderProbe(
  baseUrl: string,
  options: DiscoveryOptions
): Promise<PeacDiscoveryResult | null> {
  const fetchFn = options.fetch ?? globalThis.fetch;

  try {
    await validateUrlForDiscovery(baseUrl, options);

    const response = await fetchFn(baseUrl, {
      method: 'HEAD',
      redirect: 'error',
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });

    const headerKey = [...response.headers.keys()].find(
      (k) => k.toLowerCase() === PEAC_RECEIPT_HEADER.toLowerCase()
    );

    if (headerKey) {
      return {
        source: 'header_probe',
        kinds: ['peac-receipt/0.1'],
        carrier_formats: ['embed'],
      };
    }
  } catch {
    // Network errors, SSRF: no PEAC support detected
  }

  return null;
}
