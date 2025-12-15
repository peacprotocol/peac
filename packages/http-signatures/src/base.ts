/**
 * Signature base construction per RFC 9421 Section 2.5.
 *
 * The signature base is a canonical string constructed from
 * covered components and signature parameters.
 */

import { ParsedSignatureParams, SignatureRequest } from './types.js';

/**
 * Build signature base string for verification.
 *
 * @param request - Request data
 * @param params - Parsed signature parameters
 * @returns Signature base string
 */
export function buildSignatureBase(
  request: SignatureRequest,
  params: ParsedSignatureParams
): string {
  const lines: string[] = [];

  // Add each covered component
  for (const component of params.coveredComponents) {
    const value = getComponentValue(request, component);
    lines.push(`"${component}": ${value}`);
  }

  // Add signature params line
  const paramsLine = buildSignatureParamsLine(params);
  lines.push(`"@signature-params": ${paramsLine}`);

  return lines.join('\n');
}

/**
 * Get the canonical value for a component identifier.
 */
function getComponentValue(request: SignatureRequest, component: string): string {
  // Derived components start with @
  if (component.startsWith('@')) {
    return getDerivedComponentValue(request, component);
  }

  // Otherwise it's a header field
  return getHeaderValue(request.headers, component);
}

/**
 * Get derived component value.
 */
function getDerivedComponentValue(request: SignatureRequest, component: string): string {
  switch (component) {
    case '@method':
      return request.method.toUpperCase();

    case '@target-uri':
      return request.url;

    case '@authority': {
      try {
        const url = new URL(request.url);
        return url.host;
      } catch {
        // If URL parsing fails, try to extract from headers
        return getHeaderValue(request.headers, 'host');
      }
    }

    case '@scheme': {
      try {
        const url = new URL(request.url);
        return url.protocol.replace(':', '');
      } catch {
        return 'https';
      }
    }

    case '@request-target': {
      try {
        const url = new URL(request.url);
        return url.pathname + url.search;
      } catch {
        // If not a full URL, assume it's already a path
        return request.url;
      }
    }

    case '@path': {
      try {
        const url = new URL(request.url);
        return url.pathname;
      } catch {
        const pathMatch = request.url.match(/^[^?]*/);
        return pathMatch ? pathMatch[0] : request.url;
      }
    }

    case '@query': {
      try {
        const url = new URL(request.url);
        return url.search || '?';
      } catch {
        const queryMatch = request.url.match(/\?.*/);
        return queryMatch ? queryMatch[0] : '?';
      }
    }

    default:
      // Unknown derived component - return empty
      return '';
  }
}

/**
 * Get header value by name (case-insensitive).
 */
function getHeaderValue(headers: Record<string, string>, name: string): string {
  const lowerName = name.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }

  return '';
}

/**
 * Build the signature-params line value.
 *
 * Format: ("component1" "component2");created=123;keyid="key";alg="ed25519"
 */
function buildSignatureParamsLine(params: ParsedSignatureParams): string {
  // Build inner list of components
  const components = params.coveredComponents.map((c) => `"${c}"`).join(' ');
  let line = `(${components})`;

  // Add required parameters in canonical order
  line += `;created=${params.created}`;

  if (params.expires !== undefined) {
    line += `;expires=${params.expires}`;
  }

  if (params.nonce !== undefined) {
    line += `;nonce="${params.nonce}"`;
  }

  line += `;keyid="${params.keyid}"`;
  line += `;alg="${params.alg}"`;

  if (params.tag !== undefined) {
    line += `;tag="${params.tag}"`;
  }

  return line;
}

/**
 * Convert signature base string to bytes for cryptographic verification.
 */
export function signatureBaseToBytes(signatureBase: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(signatureBase);
}
