/**
 * Receipt Generation
 *
 * Creates PEAC receipts from request/response context.
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
 * PEAC Receipt claims structure (minimal for middleware)
 *
 * This is a simplified claims structure for middleware use.
 * Full claims with payment evidence should use @peac/protocol directly.
 */
interface ReceiptClaims {
  /** Issuer URL */
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
 * Extract audience from request context
 *
 * Derives audience from the request origin or host header.
 */
function extractAudience(request: RequestContext): string {
  // Try to get from Host header
  const host = request.headers['host'];
  if (host) {
    const hostValue = Array.isArray(host) ? host[0] : host;
    if (hostValue) {
      // Assume HTTPS for audience
      return `https://${hostValue}`;
    }
  }

  // Fallback to origin header
  const origin = request.headers['origin'];
  if (origin) {
    const originValue = Array.isArray(origin) ? origin[0] : origin;
    if (originValue) {
      return originValue;
    }
  }

  // Last resort: use the request path as a relative audience
  // This is not ideal but ensures we always have an audience
  return `https://localhost${request.path}`;
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

  // Generate receipt ID (UUIDv7 for time-ordering)
  const rid = uuidv7();

  // Get current timestamp
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + fullConfig.expiresIn;

  // Extract audience from request
  const audience = extractAudience(request);

  // Build base claims
  const claims: ReceiptClaims = {
    iss: config.issuer,
    aud: audience,
    iat,
    exp,
    rid,
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

    // Merge extensions
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

  // Build claims
  const receiptClaims: ReceiptClaims = {
    iss: config.issuer,
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
