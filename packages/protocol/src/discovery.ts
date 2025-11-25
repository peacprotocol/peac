/**
 * PEAC discovery manifest parsing (/.well-known/peac.txt)
 */

import { PEACDiscovery, PEAC_DISCOVERY_MAX_BYTES } from '@peac/schema';

/**
 * Parse a PEAC discovery manifest from YAML-like text
 *
 * @param text - PEAC discovery text (≤20 lines, ≤2000 bytes)
 * @returns Parsed discovery manifest
 */
export function parseDiscovery(text: string): PEACDiscovery {
  // Validate size
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > PEAC_DISCOVERY_MAX_BYTES) {
    throw new Error(`Discovery manifest exceeds ${PEAC_DISCOVERY_MAX_BYTES} bytes (got ${bytes})`);
  }

  const lines = text.trim().split('\n');
  if (lines.length > 20) {
    throw new Error(`Discovery manifest exceeds 20 lines (got ${lines.length})`);
  }

  const discovery: Partial<PEACDiscovery> = {
    payments: [],
  };

  let inPayments = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue; // Skip empty lines and comments
    }

    if (trimmed === 'payments:') {
      inPayments = true;
      continue;
    }

    if (inPayments) {
      // Support both "rail:" (new) and "scheme:" (deprecated) for backward compatibility
      if (trimmed.startsWith('- rail:') || trimmed.startsWith('- scheme:')) {
        const rail = trimmed.replace(/^- (rail|scheme):/, '').trim();
        discovery.payments!.push({ rail });
      } else if (trimmed.startsWith('info:')) {
        const info = trimmed.replace('info:', '').trim();
        if (discovery.payments!.length > 0) {
          discovery.payments![discovery.payments!.length - 1].info = info;
        }
      } else if (!trimmed.startsWith(' ') && trimmed.includes(':')) {
        // New top-level key, exit payments section
        inPayments = false;
      }
    }

    if (!inPayments && trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();

      switch (key.trim()) {
        case 'version':
          discovery.version = value;
          break;
        case 'issuer':
          discovery.issuer = value;
          break;
        case 'verify':
          discovery.verify = value;
          break;
        case 'jwks':
          discovery.jwks = value;
          break;
        case 'aipref':
          discovery.aipref = value;
          break;
        case 'slos':
          discovery.slos = value;
          break;
        case 'security':
          discovery.security = value;
          break;
      }
    }
  }

  // Validate required fields
  if (!discovery.version) throw new Error('Missing required field: version');
  if (!discovery.issuer) throw new Error('Missing required field: issuer');
  if (!discovery.verify) throw new Error('Missing required field: verify');
  if (!discovery.jwks) throw new Error('Missing required field: jwks');

  return discovery as PEACDiscovery;
}

/**
 * Fetch and parse PEAC discovery from an issuer URL
 *
 * @param issuerUrl - Issuer URL (https://)
 * @returns Parsed discovery manifest
 */
export async function fetchDiscovery(issuerUrl: string): Promise<PEACDiscovery> {
  if (!issuerUrl.startsWith('https://')) {
    throw new Error('Issuer URL must be https://');
  }

  const discoveryUrl = `${issuerUrl}/.well-known/peac.txt`;

  try {
    const resp = await fetch(discoveryUrl, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) {
      throw new Error(`Discovery fetch failed: ${resp.status}`);
    }

    const text = await resp.text();
    return parseDiscovery(text);
  } catch (err) {
    throw new Error(
      `Failed to fetch discovery from ${issuerUrl}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}
