/**
 * PEAC Discovery - Issuer Configuration and Policy Manifest
 *
 * This module provides functions for:
 * - Issuer configuration discovery (/.well-known/peac-issuer.json)
 * - Policy manifest parsing (/.well-known/peac.txt)
 *
 * @see docs/specs/PEAC-ISSUER.md
 * @see docs/specs/PEAC-TXT.md
 */

import {
  PEACIssuerConfig,
  PEACPolicyManifest,
  PEACDiscovery,
  PEAC_ISSUER_CONFIG_PATH,
  PEAC_ISSUER_CONFIG_MAX_BYTES,
  PEAC_POLICY_PATH,
  PEAC_POLICY_FALLBACK_PATH,
  PEAC_POLICY_MAX_BYTES,
} from '@peac/schema';

// ============================================================================
// Issuer Configuration (/.well-known/peac-issuer.json)
// ============================================================================

/**
 * Parse PEAC issuer configuration from JSON
 *
 * @param json - JSON string or object
 * @returns Parsed issuer configuration
 * @throws Error if validation fails
 */
export function parseIssuerConfig(json: string | object): PEACIssuerConfig {
  let config: unknown;

  if (typeof json === 'string') {
    const bytes = new TextEncoder().encode(json).length;
    if (bytes > PEAC_ISSUER_CONFIG_MAX_BYTES) {
      throw new Error(`Issuer config exceeds ${PEAC_ISSUER_CONFIG_MAX_BYTES} bytes (got ${bytes})`);
    }

    try {
      config = JSON.parse(json);
    } catch {
      throw new Error('Issuer config is not valid JSON');
    }
  } else {
    config = json;
  }

  if (typeof config !== 'object' || config === null) {
    throw new Error('Issuer config must be an object');
  }

  const obj = config as Record<string, unknown>;

  // Validate required fields
  if (typeof obj.version !== 'string' || !obj.version) {
    throw new Error('Missing required field: version');
  }
  if (typeof obj.issuer !== 'string' || !obj.issuer) {
    throw new Error('Missing required field: issuer');
  }
  if (typeof obj.jwks_uri !== 'string' || !obj.jwks_uri) {
    throw new Error('Missing required field: jwks_uri');
  }

  // Validate URL fields
  if (!obj.issuer.startsWith('https://')) {
    throw new Error('issuer must be an HTTPS URL');
  }
  if (!obj.jwks_uri.startsWith('https://')) {
    throw new Error('jwks_uri must be an HTTPS URL');
  }

  // Validate optional fields
  if (obj.verify_endpoint !== undefined) {
    if (typeof obj.verify_endpoint !== 'string') {
      throw new Error('verify_endpoint must be a string');
    }
    if (!obj.verify_endpoint.startsWith('https://')) {
      throw new Error('verify_endpoint must be an HTTPS URL');
    }
  }

  if (obj.receipt_versions !== undefined) {
    if (!Array.isArray(obj.receipt_versions)) {
      throw new Error('receipt_versions must be an array');
    }
  }

  if (obj.algorithms !== undefined) {
    if (!Array.isArray(obj.algorithms)) {
      throw new Error('algorithms must be an array');
    }
  }

  if (obj.payment_rails !== undefined) {
    if (!Array.isArray(obj.payment_rails)) {
      throw new Error('payment_rails must be an array');
    }
  }

  return {
    version: obj.version,
    issuer: obj.issuer,
    jwks_uri: obj.jwks_uri,
    verify_endpoint: obj.verify_endpoint as string | undefined,
    receipt_versions: obj.receipt_versions as string[] | undefined,
    algorithms: obj.algorithms as string[] | undefined,
    payment_rails: obj.payment_rails as string[] | undefined,
    security_contact: obj.security_contact as string | undefined,
  };
}

/**
 * Fetch PEAC issuer configuration from an issuer URL
 *
 * @param issuerUrl - Issuer URL (https://)
 * @returns Parsed issuer configuration
 * @throws Error if fetch or validation fails
 */
export async function fetchIssuerConfig(issuerUrl: string): Promise<PEACIssuerConfig> {
  if (!issuerUrl.startsWith('https://')) {
    throw new Error('Issuer URL must be https://');
  }

  // Remove trailing slash for consistent URL construction
  const baseUrl = issuerUrl.replace(/\/$/, '');
  const configUrl = `${baseUrl}${PEAC_ISSUER_CONFIG_PATH}`;

  try {
    const resp = await fetch(configUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      throw new Error(`Issuer config fetch failed: ${resp.status}`);
    }

    const text = await resp.text();
    const config = parseIssuerConfig(text);

    // Verify issuer matches
    const normalizedExpected = baseUrl.replace(/\/$/, '');
    const normalizedActual = config.issuer.replace(/\/$/, '');
    if (normalizedActual !== normalizedExpected) {
      throw new Error(`Issuer mismatch: expected ${normalizedExpected}, got ${normalizedActual}`);
    }

    return config;
  } catch (err) {
    throw new Error(
      `Failed to fetch issuer config from ${issuerUrl}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

// ============================================================================
// Policy Manifest (/.well-known/peac.txt)
// ============================================================================

/**
 * Detect if content is JSON or YAML
 */
function isJsonContent(text: string, contentType?: string): boolean {
  if (contentType?.includes('application/json')) {
    return true;
  }
  const firstChar = text.trimStart()[0];
  return firstChar === '{';
}

/**
 * Parse PEAC policy manifest from YAML or JSON
 *
 * @param text - Policy manifest text (YAML or JSON)
 * @param contentType - Optional Content-Type header value
 * @returns Parsed policy manifest
 * @throws Error if validation fails
 */
export function parsePolicyManifest(text: string, contentType?: string): PEACPolicyManifest {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > PEAC_POLICY_MAX_BYTES) {
    throw new Error(`Policy manifest exceeds ${PEAC_POLICY_MAX_BYTES} bytes (got ${bytes})`);
  }

  let manifest: Record<string, unknown>;

  if (isJsonContent(text, contentType)) {
    // Parse as JSON
    try {
      manifest = JSON.parse(text);
    } catch {
      throw new Error('Policy manifest is not valid JSON');
    }
  } else {
    // Parse as simple YAML (key: value format)
    manifest = parseSimpleYaml(text);
  }

  // Validate required fields
  if (typeof manifest.version !== 'string' || !manifest.version) {
    throw new Error('Missing required field: version');
  }

  // Validate version format: must be peac-policy/<major>.<minor>
  if (!manifest.version.startsWith('peac-policy/')) {
    throw new Error(
      `Invalid version format: "${manifest.version}". Must start with "peac-policy/" (e.g., "peac-policy/0.1")`
    );
  }

  if (manifest.usage !== 'open' && manifest.usage !== 'conditional') {
    throw new Error('Missing or invalid field: usage (must be "open" or "conditional")');
  }

  return {
    version: manifest.version,
    usage: manifest.usage as 'open' | 'conditional',
    purposes: manifest.purposes as string[] | undefined,
    receipts: manifest.receipts as 'required' | 'optional' | 'omit' | undefined,
    attribution: manifest.attribution as 'required' | 'optional' | 'none' | undefined,
    rate_limit: manifest.rate_limit as string | undefined,
    daily_limit: manifest.daily_limit as number | undefined,
    negotiate: manifest.negotiate as string | undefined,
    contact: manifest.contact as string | undefined,
    license: manifest.license as string | undefined,
    price: manifest.price as number | undefined,
    currency: manifest.currency as string | undefined,
    payment_methods: manifest.payment_methods as string[] | undefined,
    payment_endpoint: manifest.payment_endpoint as string | undefined,
  };
}

/**
 * Parse simple YAML (key: value format, no complex features)
 * Rejects YAML features that are security risks (anchors, aliases, tags)
 */
function parseSimpleYaml(text: string): Record<string, unknown> {
  const lines = text.split('\n');
  const result: Record<string, unknown> = {};

  // Security: reject YAML features that are dangerous
  // Check merge keys first (they contain * which would trigger anchor check)
  if (text.includes('<<:')) {
    throw new Error('YAML merge keys are not allowed');
  }
  if (text.includes('&') || text.includes('*')) {
    throw new Error('YAML anchors and aliases are not allowed');
  }
  if (/!\w+/.test(text)) {
    throw new Error('YAML custom tags are not allowed');
  }

  // Count document separators
  const docSeparators = text.match(/^---$/gm);
  if (docSeparators && docSeparators.length > 1) {
    throw new Error('Multi-document YAML is not allowed');
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines, comments, and document markers
    if (!trimmed || trimmed.startsWith('#') || trimmed === '---') {
      continue;
    }

    // Parse key: value
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value: unknown = trimmed.slice(colonIndex + 1).trim();

    // Parse value types
    if (value === '') {
      value = undefined;
    } else if (typeof value === 'string') {
      // Remove quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // Parse arrays [a, b, c]
      else if (value.startsWith('[') && value.endsWith(']')) {
        const inner = value.slice(1, -1);
        value = inner
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      }
      // Parse numbers
      else if (/^-?\d+(\.\d+)?$/.test(value)) {
        value = parseFloat(value);
      }
      // Parse booleans
      else if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      }
    }

    if (value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Fetch PEAC policy manifest from a domain
 *
 * @param baseUrl - Base URL (https://example.com)
 * @returns Parsed policy manifest
 * @throws Error if fetch or validation fails
 */
export async function fetchPolicyManifest(baseUrl: string): Promise<PEACPolicyManifest> {
  if (!baseUrl.startsWith('https://') && !baseUrl.startsWith('http://localhost')) {
    throw new Error('Base URL must be https://');
  }

  const normalizedBase = baseUrl.replace(/\/$/, '');
  const primaryUrl = `${normalizedBase}${PEAC_POLICY_PATH}`;
  const fallbackUrl = `${normalizedBase}${PEAC_POLICY_FALLBACK_PATH}`;

  // Try primary location first
  try {
    const resp = await fetch(primaryUrl, {
      headers: { Accept: 'text/plain, application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (resp.ok) {
      const text = await resp.text();
      const contentType = resp.headers.get('content-type') || undefined;
      return parsePolicyManifest(text, contentType);
    }

    // If 404, try fallback
    if (resp.status === 404) {
      const fallbackResp = await fetch(fallbackUrl, {
        headers: { Accept: 'text/plain, application/json' },
        signal: AbortSignal.timeout(5000),
      });

      if (fallbackResp.ok) {
        const text = await fallbackResp.text();
        const contentType = fallbackResp.headers.get('content-type') || undefined;
        return parsePolicyManifest(text, contentType);
      }

      throw new Error('Policy manifest not found at primary or fallback location');
    }

    throw new Error(`Policy manifest fetch failed: ${resp.status}`);
  } catch (err) {
    throw new Error(
      `Failed to fetch policy manifest from ${baseUrl}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

// ============================================================================
// Deprecated Legacy API (for backward compatibility)
// ============================================================================

/**
 * @deprecated Use parseIssuerConfig instead. Will be removed in v1.0.
 *
 * Parse a PEAC discovery manifest from YAML-like text.
 * This function is maintained for backward compatibility only.
 */
export function parseDiscovery(text: string): PEACDiscovery {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > 2000) {
    throw new Error(`Discovery manifest exceeds 2000 bytes (got ${bytes})`);
  }

  const lines = text.trim().split('\n');
  if (lines.length > 20) {
    throw new Error(`Discovery manifest exceeds 20 lines (got ${lines.length})`);
  }

  const discovery: Partial<PEACIssuerConfig> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (trimmed.includes(':')) {
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
          discovery.verify_endpoint = value;
          break;
        case 'jwks':
          discovery.jwks_uri = value;
          break;
        case 'security':
          discovery.security_contact = value;
          break;
      }
    }
  }

  // Validate required fields
  if (!discovery.version) throw new Error('Missing required field: version');
  if (!discovery.issuer) throw new Error('Missing required field: issuer');
  if (!discovery.verify_endpoint) throw new Error('Missing required field: verify');
  if (!discovery.jwks_uri) throw new Error('Missing required field: jwks');

  return discovery as PEACDiscovery;
}

/**
 * @deprecated Use fetchIssuerConfig instead. Will be removed in v1.0.
 *
 * Fetch and parse PEAC discovery from an issuer URL.
 * This function is maintained for backward compatibility only.
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
