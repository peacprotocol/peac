/**
 * PEAC Middleware Core Types
 *
 * Framework-agnostic type definitions for PEAC receipt issuance middleware.
 *
 * @packageDocumentation
 */

/**
 * Ed25519 private key in JWK format
 */
export interface Ed25519PrivateJwk {
  kty: 'OKP';
  crv: 'Ed25519';
  /** Public key (base64url, 32 bytes) */
  x: string;
  /** Private key (base64url, 32 bytes) */
  d: string;
}

/**
 * Middleware configuration for PEAC receipt issuance
 */
export interface MiddlewareConfig {
  /** Issuer URL (becomes `iss` claim). Must be HTTPS. */
  issuer: string;

  /** Ed25519 private key in JWK format */
  signingKey: Ed25519PrivateJwk;

  /** Key ID for JWKS lookup (appears in JWS header `kid`) */
  keyId: string;

  /** Receipt expiration in seconds (default: 300) */
  expiresIn?: number;

  /** Transport profile preference (default: 'header') */
  transport?: 'header' | 'body' | 'pointer';

  /** Maximum header size in bytes before fallback to body (default: 4096) */
  maxHeaderSize?: number;

  /** Pointer URL generator for 'pointer' transport */
  pointerUrlGenerator?: (receipt: string) => Promise<string>;

  /** Custom claims generator */
  claimsGenerator?: (context: RequestContext) => Promise<Partial<ReceiptClaimsInput>>;
}

/**
 * Request context captured for receipt generation
 */
export interface RequestContext {
  /** HTTP method (GET, POST, etc.) */
  method: string;

  /** Request path (e.g., '/api/data') */
  path: string;

  /** Request headers */
  headers: Record<string, string | string[] | undefined>;

  /** Request body (if available) */
  body?: unknown;

  /** Request timestamp (Unix milliseconds) */
  timestamp: number;
}

/**
 * Response context for receipt generation
 */
export interface ResponseContext {
  /** HTTP status code */
  statusCode: number;

  /** Response headers */
  headers: Record<string, string | string[] | undefined>;

  /** Response body (if available) */
  body?: unknown;
}

/**
 * Custom claims that can be added to receipts
 */
export interface ReceiptClaimsInput {
  /** Subject identifier (optional) */
  sub?: string;

  /** Audience override (defaults to request origin) */
  aud?: string;

  /** Additional extensions */
  ext?: Record<string, unknown>;
}

/**
 * Result of receipt creation
 */
export interface ReceiptResult {
  /** JWS compact serialization of the receipt */
  receipt: string;

  /** Transport profile used */
  transport: 'header' | 'body' | 'pointer';

  /** Headers to add to the response */
  headers: Record<string, string>;

  /** Wrapped body (for body transport profile) */
  bodyWrapper?: {
    data: unknown;
    peac_receipt: string;
  };
}

/**
 * Validation error for middleware configuration
 */
export interface ConfigValidationError {
  field: string;
  message: string;
}

/**
 * Transport profile selection input
 */
export interface TransportSelectionInput {
  /** Receipt JWS string */
  receipt: string;

  /** Preferred transport from config */
  transport?: 'header' | 'body' | 'pointer';

  /** Maximum header size */
  maxHeaderSize?: number;
}
