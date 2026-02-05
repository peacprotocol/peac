/**
 * Receipt Generation
 *
 * Creates PEAC receipts from request/response context.
 *
 * This module produces **attestation receipts** - lightweight signed tokens
 * that attest to API interactions. For full payment receipts with amt/cur/payment
 * fields, use @peac/protocol directly.
 *
 * @packageDocumentation
 */

import { uuidv7 } from 'uuidv7';
import { sign, base64urlDecode } from '@peac/crypto';
import type {
  MiddlewareConfig,
  RequestContext,
  ResponseContext,
  ReceiptResult,
  ReceiptClaimsInput,
} from './types.js';
import { validateConfig, applyDefaults } from './config.js';
import { selectTransport, buildReceiptResult } from './transport.js';

/**
 * PEAC Attestation Receipt claims structure
 *
 * This is an attestation receipt format for middleware use - it attests to
 * API interactions without payment fields. For full payment receipts with
 * amt/cur/payment, use @peac/protocol issue() directly.
 *
 * Claims structure:
 * - Core JWT claims: iss, aud, iat, exp
 * - PEAC claims: rid (UUIDv7 receipt ID)
 * - Optional: sub, ext (extensions including interaction binding)
 */
interface AttestationReceiptClaims {
  /** Issuer URL (normalized, no trailing slash) */
  iss: string;
  /** Audience URL */
  aud: string;
  /** Issued at (Unix seconds) */
  iat: number;
  /** Expiration (Unix seconds) */
  exp: number;
  /** Receipt ID (UUIDv7) */
  rid: string;
  /** Subject identifier (optional) */
  sub?: string;
  /** Extensions (optional) */
  ext?: Record<string, unknown>;
}

/**
 * Interaction binding data included in ext by default
 */
interface InteractionBinding {
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** Response status code */
  status: number;
}

/**
 * Create a lowercase header lookup map for case-insensitive access
 *
 * HTTP headers are case-insensitive per RFC 7230, but different frameworks
 * may provide them with different casing. This normalizes to lowercase.
 */
function normalizeHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string | string[] | undefined> {
  const normalized: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

/**
 * Get a header value (case-insensitive)
 */
function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const value = headers[name.toLowerCase()];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Normalize issuer URL (remove trailing slash for consistency)
 */
function normalizeIssuer(issuer: string): string {
  return issuer.replace(/\/+$/, '');
}

/**
 * Extract audience from request context
 *
 * Derives audience from the request host or origin header (case-insensitive).
 */
function extractAudience(
  normalizedHeaders: Record<string, string | string[] | undefined>
): string {
  // Try to get from Host header (case-insensitive)
  const host = getHeader(normalizedHeaders, 'host');
  if (host) {
    // Assume HTTPS for audience
    return `https://${host}`;
  }

  // Fallback to origin header
  const origin = getHeader(normalizedHeaders, 'origin');
  if (origin) {
    return origin;
  }

  // Should not happen with proper request context
  return 'https://localhost';
}

/**
 * Convert JWK private key to raw bytes
 */
function jwkToPrivateKeyBytes(jwk: { d: string }): Uint8Array {
  return base64urlDecode(jwk.d);
}

/**
 * Create a receipt for a request/response pair
 *
 * This is the main function for middleware receipt generation.
 * It validates configuration, builds claims, signs the receipt,
 * and determines the appropriate transport profile.
 *
 * By default, includes minimal interaction binding (method, path, status)
 * in the `ext['peac.interaction']` field for evidentiary value.
 *
 * @param config - Middleware configuration
 * @param request - Request context
 * @param response - Response context
 * @returns Receipt result with JWS, headers, and optional body wrapper
 *
 * @example
 * ```typescript
 * const result = await createReceipt(config, requestCtx, responseCtx);
 *
 * // Add headers to response
 * for (const [key, value] of Object.entries(result.headers)) {
 *   res.setHeader(key, value);
 * }
 *
 * // If body transport, use wrapped body
 * if (result.bodyWrapper) {
 *   res.json(result.bodyWrapper);
 * }
 * ```
 */
export async function createReceipt(
  config: MiddlewareConfig,
  request: RequestContext,
  response: ResponseContext
): Promise<ReceiptResult> {
  // Validate configuration
  validateConfig(config);

  // Apply defaults
  const fullConfig = applyDefaults(config);

  // Normalize headers for case-insensitive access
  const normalizedHeaders = normalizeHeaders(request.headers);

  // Generate receipt ID (UUIDv7 for time-ordering)
  const rid = uuidv7();

  // Get current timestamp
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + fullConfig.expiresIn;

  // Normalize issuer and extract audience
  const normalizedIssuer = normalizeIssuer(config.issuer);
  const audience = extractAudience(normalizedHeaders);

  // Build interaction binding (minimal evidentiary data)
  const interactionBinding: InteractionBinding = {
    method: request.method.toUpperCase(),
    path: request.path,
    status: response.statusCode,
  };

  // Build base claims with interaction binding
  const claims: AttestationReceiptClaims = {
    iss: normalizedIssuer,
    aud: audience,
    iat,
    exp,
    rid,
    ext: {
      'peac.interaction': interactionBinding,
    },
  };

  // Apply custom claims if generator is provided
  if (config.claimsGenerator) {
    const customClaims = await config.claimsGenerator(request);

    // Override audience if provided
    if (customClaims.aud) {
      claims.aud = customClaims.aud;
    }

    // Add subject if provided
    if (customClaims.sub) {
      claims.sub = customClaims.sub;
    }

    // Merge extensions (custom claims override defaults)
    if (customClaims.ext) {
      claims.ext = { ...claims.ext, ...customClaims.ext };
    }
  }

  // Sign the receipt
  const privateKeyBytes = jwkToPrivateKeyBytes(config.signingKey);
  const receipt = await sign(claims, privateKeyBytes, config.keyId);

  // Determine transport profile
  const transport = selectTransport(receipt, fullConfig);

  // Generate pointer URL if needed
  let pointerUrl: string | undefined;
  if (transport === 'pointer' && config.pointerUrlGenerator) {
    pointerUrl = await config.pointerUrlGenerator(receipt);
  }

  // Build complete result
  return buildReceiptResult({
    receipt,
    transport,
    pointerUrl,
    originalBody: response.body,
  });
}

/**
 * Create a receipt with explicit claims (bypasses context extraction)
 *
 * Use this when you have explicit claims and don't need context extraction.
 * Does NOT include automatic interaction binding.
 *
 * @param config - Middleware configuration
 * @param claims - Explicit claims to include
 * @param responseBody - Optional response body for body transport
 * @returns Receipt result
 */
export async function createReceiptWithClaims(
  config: MiddlewareConfig,
  claims: ReceiptClaimsInput & { aud: string },
  responseBody?: unknown
): Promise<ReceiptResult> {
  // Validate configuration
  validateConfig(config);

  // Apply defaults
  const fullConfig = applyDefaults(config);

  // Generate receipt ID
  const rid = uuidv7();

  // Get current timestamp
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + fullConfig.expiresIn;

  // Normalize issuer
  const normalizedIssuer = normalizeIssuer(config.issuer);

  // Build claims
  const receiptClaims: AttestationReceiptClaims = {
    iss: normalizedIssuer,
    aud: claims.aud,
    iat,
    exp,
    rid,
    ...(claims.sub && { sub: claims.sub }),
    ...(claims.ext && { ext: claims.ext }),
  };

  // Sign the receipt
  const privateKeyBytes = jwkToPrivateKeyBytes(config.signingKey);
  const receipt = await sign(receiptClaims, privateKeyBytes, config.keyId);

  // Determine transport profile
  const transport = selectTransport(receipt, fullConfig);

  // Generate pointer URL if needed
  let pointerUrl: string | undefined;
  if (transport === 'pointer' && config.pointerUrlGenerator) {
    pointerUrl = await config.pointerUrlGenerator(receipt);
  }

  // Build complete result
  return buildReceiptResult({
    receipt,
    transport,
    pointerUrl,
    originalBody: responseBody,
  });
}
