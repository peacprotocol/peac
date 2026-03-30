/**
 * A2A auth error mapping to google.rpc.Status with ErrorInfo.
 *
 * A2A v1.0 uses gRPC-style status codes for transport errors. For
 * A2A-specific errors, implementations include `google.rpc.ErrorInfo`
 * in `status.details[]`. This module produces the full Status + ErrorInfo
 * shape for auth-related A2A errors.
 */

// ---------------------------------------------------------------------------
// google.rpc canonical codes (subset relevant to auth)
// ---------------------------------------------------------------------------

/**
 * gRPC canonical status codes used in A2A auth error responses.
 * Values match google.rpc.Code numeric assignments.
 */
export const GrpcStatusCode = {
  OK: 0,
  INVALID_ARGUMENT: 3,
  NOT_FOUND: 5,
  PERMISSION_DENIED: 7,
  INTERNAL: 13,
  UNAVAILABLE: 14,
  UNAUTHENTICATED: 16,
} as const;

export type GrpcStatusCodeValue = (typeof GrpcStatusCode)[keyof typeof GrpcStatusCode];

// ---------------------------------------------------------------------------
// google.rpc.ErrorInfo shape
// ---------------------------------------------------------------------------

/**
 * google.rpc.ErrorInfo per https://cloud.google.com/apis/design/errors.
 *
 * Included in `status.details[]` for A2A-specific auth errors.
 */
export interface GrpcErrorInfo {
  /** Fully-qualified type URL for ErrorInfo */
  readonly '@type': 'type.googleapis.com/google.rpc.ErrorInfo';
  /** Machine-readable error reason (SCREAMING_SNAKE_CASE) */
  readonly reason: string;
  /** Domain for the error (always 'a2a-protocol.org' per A2A spec) */
  readonly domain: string;
  /** Key-value metadata providing additional error context */
  readonly metadata: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// google.rpc.Status shape
// ---------------------------------------------------------------------------

/**
 * google.rpc.Status with typed ErrorInfo detail.
 *
 * This is the wire shape returned in A2A gRPC error responses and
 * JSON-RPC error data objects.
 */
export interface GrpcStatus {
  /** gRPC canonical status code */
  readonly code: GrpcStatusCodeValue;
  /** Human-readable error message */
  readonly message: string;
  /** Structured error details (contains ErrorInfo for A2A-specific errors) */
  readonly details: readonly GrpcErrorInfo[];
}

// ---------------------------------------------------------------------------
// A2A auth error definitions
// ---------------------------------------------------------------------------

/** A2A error domain per spec: implementations use the protocol domain */
const A2A_AUTH_DOMAIN = 'a2a-protocol.org';

interface AuthErrorDef {
  readonly grpcCode: GrpcStatusCodeValue;
  readonly message: string;
  readonly reason: string;
}

const AUTH_ERROR_DEFS = {
  PKCE_MISMATCH: {
    grpcCode: GrpcStatusCode.UNAUTHENTICATED,
    message: 'PKCE code challenge verification failed',
    reason: 'PKCE_CHALLENGE_MISMATCH',
  },
  PKCE_INVALID_VERIFIER: {
    grpcCode: GrpcStatusCode.INVALID_ARGUMENT,
    message: 'PKCE code verifier does not meet RFC 7636 requirements',
    reason: 'PKCE_INVALID_VERIFIER',
  },
  TOKEN_EXCHANGE_FAILED: {
    grpcCode: GrpcStatusCode.UNAUTHENTICATED,
    message: 'OAuth token exchange failed',
    reason: 'TOKEN_EXCHANGE_FAILED',
  },
  AUTH_SERVER_UNAVAILABLE: {
    grpcCode: GrpcStatusCode.UNAVAILABLE,
    message: 'Authorization server is unavailable',
    reason: 'AUTH_SERVER_UNAVAILABLE',
  },
  INVALID_AUTH_CODE: {
    grpcCode: GrpcStatusCode.UNAUTHENTICATED,
    message: 'Authorization code is invalid or expired',
    reason: 'INVALID_AUTH_CODE',
  },
  INVALID_CLIENT: {
    grpcCode: GrpcStatusCode.PERMISSION_DENIED,
    message: 'Client authentication failed',
    reason: 'INVALID_CLIENT',
  },
  SCOPE_DENIED: {
    grpcCode: GrpcStatusCode.PERMISSION_DENIED,
    message: 'Requested scope was denied by the authorization server',
    reason: 'SCOPE_DENIED',
  },
  DEVICE_CODE_EXPIRED: {
    grpcCode: GrpcStatusCode.UNAUTHENTICATED,
    message: 'Device authorization code has expired',
    reason: 'DEVICE_CODE_EXPIRED',
  },
} as const satisfies Record<string, AuthErrorDef>;

export type A2AAuthErrorCode = keyof typeof AUTH_ERROR_DEFS;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a google.rpc.Status with ErrorInfo for an A2A auth error.
 *
 * Returns the full Status shape with `details[]` containing a single
 * `google.rpc.ErrorInfo` entry, as required by the A2A spec for
 * implementation-specific errors.
 *
 * @param errorCode - A2A auth error code
 * @param metadata - Additional key-value context for ErrorInfo.metadata
 * @returns google.rpc.Status with embedded ErrorInfo
 */
export function createA2AAuthStatus(
  errorCode: A2AAuthErrorCode,
  metadata?: Record<string, string>
): GrpcStatus {
  const def = AUTH_ERROR_DEFS[errorCode];
  return {
    code: def.grpcCode,
    message: def.message,
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
        reason: def.reason,
        domain: A2A_AUTH_DOMAIN,
        metadata: metadata ?? {},
      },
    ],
  };
}
