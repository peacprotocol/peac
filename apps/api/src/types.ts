/**
 * @peac/api/types - RFC 9457 Problem Details types for PEAC verify API
 */

// RFC 9457 Problem Details structure
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [key: string]: unknown; // Extension fields
}

// PEAC-specific verify request/response types
export interface VerifyRequest {
  receipt: string; // JWS compact serialization
  keys?: Record<string, any>; // Optional key set override
}

export interface VerifyResponse {
  valid: boolean;
  receipt: {
    header: Record<string, unknown>;
    payload: Record<string, unknown>;
  };
  verification: {
    signature: 'valid' | 'invalid';
    schema: 'valid' | 'invalid';
    timestamp: string;
    key_id: string;
  };
}

export interface VerifyErrorDetails extends ProblemDetails {
  'peac-error-code': string;
  'peac-trace-id'?: string;
  'validation-failures'?: string[];
}

// HTTP status code mappings
export type HttpStatus = 200 | 400 | 401 | 403 | 422 | 500;

// Error categories for structured responses
export interface ErrorContext {
  code: string;
  category: 'validation' | 'authentication' | 'authorization' | 'processing';
  details?: string[];
  traceId?: string;
}
