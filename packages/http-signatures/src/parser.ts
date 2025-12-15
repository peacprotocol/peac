/**
 * Parser for RFC 9421 Signature-Input and Signature headers.
 *
 * Implements minimal RFC 8941 Structured Fields parsing for
 * Dictionary and Inner List types as needed by HTTP Signatures.
 */

import { ParsedSignatureParams, ParsedSignature } from './types.js';
import { ErrorCodes, HttpSignatureError } from './errors.js';

/**
 * Parse Signature-Input header value into structured parameters.
 *
 * Format: label=("component1" "component2");param1=value1;param2=value2
 *
 * @param headerValue - Raw Signature-Input header value
 * @returns Map of label to parsed parameters
 */
export function parseSignatureInput(
  headerValue: string
): Map<string, ParsedSignatureParams> {
  const results = new Map<string, ParsedSignatureParams>();

  // Split by comma for multiple signatures (outer dictionary members)
  const members = splitDictionaryMembers(headerValue);

  for (const member of members) {
    const parsed = parseDictionaryMember(member.trim());
    if (parsed) {
      results.set(parsed.label, parsed.params);
    }
  }

  return results;
}

/**
 * Parse Signature header value into raw signature bytes.
 *
 * Format: label=:base64signature:
 *
 * @param headerValue - Raw Signature header value
 * @returns Map of label to signature bytes
 */
export function parseSignatureHeader(
  headerValue: string
): Map<string, { bytes: Uint8Array; base64: string }> {
  const results = new Map<string, { bytes: Uint8Array; base64: string }>();

  const members = splitDictionaryMembers(headerValue);

  for (const member of members) {
    const [label, value] = splitKeyValue(member.trim());
    if (!label || !value) continue;

    // Extract base64 from :...: byte sequence format
    const match = value.match(/^:([A-Za-z0-9+/=_-]+):$/);
    if (!match) continue;

    const base64 = match[1];
    try {
      const bytes = base64ToBytes(base64);
      results.set(label, { bytes, base64 });
    } catch {
      // Skip invalid base64
    }
  }

  return results;
}

/**
 * Parse complete signature from both headers.
 *
 * @param signatureInput - Signature-Input header value
 * @param signature - Signature header value
 * @param label - Optional specific label to parse (defaults to first)
 * @returns Parsed signature or throws HttpSignatureError
 */
export function parseSignature(
  signatureInput: string,
  signature: string,
  label?: string
): ParsedSignature {
  if (!signatureInput) {
    throw new HttpSignatureError(
      ErrorCodes.SIGNATURE_INPUT_MALFORMED,
      'Missing Signature-Input header'
    );
  }

  if (!signature) {
    throw new HttpSignatureError(
      ErrorCodes.SIGNATURE_MISSING,
      'Missing Signature header'
    );
  }

  const inputMap = parseSignatureInput(signatureInput);
  const sigMap = parseSignatureHeader(signature);

  if (inputMap.size === 0) {
    throw new HttpSignatureError(
      ErrorCodes.SIGNATURE_INPUT_MALFORMED,
      'Failed to parse Signature-Input header'
    );
  }

  // Use specified label or first available
  const targetLabel = label ?? inputMap.keys().next().value;
  if (!targetLabel) {
    throw new HttpSignatureError(
      ErrorCodes.SIGNATURE_INPUT_MALFORMED,
      'No signature label found'
    );
  }

  const params = inputMap.get(targetLabel);
  if (!params) {
    throw new HttpSignatureError(
      ErrorCodes.SIGNATURE_INPUT_MALFORMED,
      `Signature label "${targetLabel}" not found in Signature-Input`
    );
  }

  const sigData = sigMap.get(targetLabel);
  if (!sigData) {
    throw new HttpSignatureError(
      ErrorCodes.SIGNATURE_MISSING,
      `Signature label "${targetLabel}" not found in Signature header`
    );
  }

  // Validate required parameters
  if (!params.keyid) {
    throw new HttpSignatureError(
      ErrorCodes.SIGNATURE_PARAM_MISSING,
      'Missing required parameter: keyid'
    );
  }

  if (!params.alg) {
    throw new HttpSignatureError(
      ErrorCodes.SIGNATURE_PARAM_MISSING,
      'Missing required parameter: alg'
    );
  }

  if (params.created === undefined || params.created === null) {
    throw new HttpSignatureError(
      ErrorCodes.SIGNATURE_PARAM_MISSING,
      'Missing required parameter: created'
    );
  }

  return {
    label: targetLabel,
    params,
    signatureBytes: sigData.bytes,
    signatureBase64: sigData.base64,
  };
}

// --- Internal parsing helpers ---

/**
 * Split dictionary members by comma, respecting inner lists and strings.
 */
function splitDictionaryMembers(value: string): string[] {
  const members: string[] = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let inByteSeq = false;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if (char === '"' && !inByteSeq) {
      inString = !inString;
      current += char;
    } else if (char === ':' && !inString) {
      inByteSeq = !inByteSeq;
      current += char;
    } else if (char === '(' && !inString && !inByteSeq) {
      depth++;
      current += char;
    } else if (char === ')' && !inString && !inByteSeq) {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0 && !inString && !inByteSeq) {
      if (current.trim()) {
        members.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    members.push(current.trim());
  }

  return members;
}

/**
 * Split a dictionary member into key=value pair.
 */
function splitKeyValue(member: string): [string, string] {
  const eqIndex = member.indexOf('=');
  if (eqIndex === -1) {
    return [member, ''];
  }
  return [member.slice(0, eqIndex), member.slice(eqIndex + 1)];
}

/**
 * Parse a single dictionary member (label=inner-list;params).
 */
function parseDictionaryMember(
  member: string
): { label: string; params: ParsedSignatureParams } | null {
  const [label, rest] = splitKeyValue(member);
  if (!label || !rest) return null;

  // Parse inner list and parameters
  // Format: ("component1" "component2");param1=value1;param2=value2
  const innerListMatch = rest.match(/^\(([^)]*)\)(.*)$/);
  if (!innerListMatch) return null;

  const innerListContent = innerListMatch[1];
  const paramsString = innerListMatch[2];

  // Parse covered components from inner list
  const coveredComponents = parseInnerList(innerListContent);

  // Parse parameters
  const rawParams = parseParameters(paramsString);

  const params: ParsedSignatureParams = {
    keyid: String(rawParams.keyid ?? ''),
    alg: String(rawParams.alg ?? ''),
    created: rawParams.created !== undefined ? Number(rawParams.created) : 0,
    coveredComponents,
  };

  if (rawParams.expires !== undefined) {
    params.expires = Number(rawParams.expires);
  }

  if (rawParams.nonce !== undefined) {
    params.nonce = String(rawParams.nonce);
  }

  if (rawParams.tag !== undefined) {
    params.tag = String(rawParams.tag);
  }

  return { label, params };
}

/**
 * Parse inner list content (space-separated quoted strings).
 */
function parseInnerList(content: string): string[] {
  const items: string[] = [];
  const regex = /"([^"]*)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    items.push(match[1]);
  }
  return items;
}

/**
 * Parse parameters from ;key=value;key2=value2 format.
 */
function parseParameters(paramsString: string): Record<string, string | number> {
  const params: Record<string, string | number> = {};

  // Split by semicolon
  const parts = paramsString.split(';').filter((p) => p.trim());

  for (const part of parts) {
    const [key, value] = splitKeyValue(part.trim());
    if (!key) continue;

    // Parse value - could be integer, string, or token
    if (!value) {
      params[key] = true as unknown as string;
    } else if (value.startsWith('"') && value.endsWith('"')) {
      // Quoted string
      params[key] = value.slice(1, -1);
    } else if (/^-?\d+$/.test(value)) {
      // Integer
      params[key] = parseInt(value, 10);
    } else {
      // Token or other
      params[key] = value;
    }
  }

  return params;
}

/**
 * Decode base64 (standard or URL-safe) to bytes.
 */
function base64ToBytes(base64: string): Uint8Array {
  // Handle URL-safe base64
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if needed
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '='
  );

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
