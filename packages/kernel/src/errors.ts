/**
 * PEAC Protocol Error Codes
 * Derived from specs/kernel/errors.json
 *
 * NOTE: This file is manually synced for v0.9.15.
 * From v0.9.16+, this will be auto-generated via codegen.
 */

import type { ErrorDefinition } from './types.js';

/**
 * Error code constants
 */
export const ERROR_CODES = {
  E_INVALID_SIGNATURE: 'E_INVALID_SIGNATURE',
  E_INVALID_FORMAT: 'E_INVALID_FORMAT',
  E_EXPIRED: 'E_EXPIRED',
  E_NOT_YET_VALID: 'E_NOT_YET_VALID',
  E_INVALID_ISSUER: 'E_INVALID_ISSUER',
  E_INVALID_AUDIENCE: 'E_INVALID_AUDIENCE',
  E_JWKS_FETCH_FAILED: 'E_JWKS_FETCH_FAILED',
  E_KEY_NOT_FOUND: 'E_KEY_NOT_FOUND',
  E_INVALID_AMOUNT: 'E_INVALID_AMOUNT',
  E_INVALID_CURRENCY: 'E_INVALID_CURRENCY',
  E_INVALID_RAIL: 'E_INVALID_RAIL',
  E_MISSING_REQUIRED_CLAIM: 'E_MISSING_REQUIRED_CLAIM',
  E_RATE_LIMITED: 'E_RATE_LIMITED',
  E_CIRCUIT_BREAKER_OPEN: 'E_CIRCUIT_BREAKER_OPEN',
  E_CONTROL_DENIED: 'E_CONTROL_DENIED',
  E_CONTROL_REVIEW_REQUIRED: 'E_CONTROL_REVIEW_REQUIRED',
  E_EVIDENCE_NOT_JSON: 'E_EVIDENCE_NOT_JSON',
  // Agent Identity error codes (v0.9.25+)
  E_IDENTITY_MISSING: 'E_IDENTITY_MISSING',
  E_IDENTITY_INVALID_FORMAT: 'E_IDENTITY_INVALID_FORMAT',
  E_IDENTITY_EXPIRED: 'E_IDENTITY_EXPIRED',
  E_IDENTITY_NOT_YET_VALID: 'E_IDENTITY_NOT_YET_VALID',
  E_IDENTITY_SIG_INVALID: 'E_IDENTITY_SIG_INVALID',
  E_IDENTITY_KEY_UNKNOWN: 'E_IDENTITY_KEY_UNKNOWN',
  E_IDENTITY_KEY_EXPIRED: 'E_IDENTITY_KEY_EXPIRED',
  E_IDENTITY_KEY_REVOKED: 'E_IDENTITY_KEY_REVOKED',
  E_IDENTITY_BINDING_MISMATCH: 'E_IDENTITY_BINDING_MISMATCH',
  E_IDENTITY_BINDING_STALE: 'E_IDENTITY_BINDING_STALE',
  E_IDENTITY_BINDING_FUTURE: 'E_IDENTITY_BINDING_FUTURE',
  E_IDENTITY_PROOF_UNSUPPORTED: 'E_IDENTITY_PROOF_UNSUPPORTED',
  E_IDENTITY_DIRECTORY_UNAVAILABLE: 'E_IDENTITY_DIRECTORY_UNAVAILABLE',
} as const;

/**
 * Error definitions map
 */
export const ERRORS: Record<string, ErrorDefinition> = {
  E_INVALID_SIGNATURE: {
    code: 'E_INVALID_SIGNATURE',
    http_status: 400,
    title: 'Invalid Signature',
    description: 'Receipt signature verification failed',
    retriable: false,
    category: 'verification',
  },
  E_INVALID_FORMAT: {
    code: 'E_INVALID_FORMAT',
    http_status: 400,
    title: 'Invalid Format',
    description: 'Receipt does not conform to JWS format',
    retriable: false,
    category: 'validation',
  },
  E_EXPIRED: {
    code: 'E_EXPIRED',
    http_status: 400,
    title: 'Receipt Expired',
    description: 'Receipt has exceeded its expiration time',
    retriable: false,
    category: 'validation',
  },
  E_NOT_YET_VALID: {
    code: 'E_NOT_YET_VALID',
    http_status: 400,
    title: 'Not Yet Valid',
    description: 'Receipt nbf (not before) time is in the future',
    retriable: true,
    category: 'validation',
  },
  E_INVALID_ISSUER: {
    code: 'E_INVALID_ISSUER',
    http_status: 400,
    title: 'Invalid Issuer',
    description: 'Receipt issuer claim is invalid or untrusted',
    retriable: false,
    category: 'validation',
  },
  E_INVALID_AUDIENCE: {
    code: 'E_INVALID_AUDIENCE',
    http_status: 400,
    title: 'Invalid Audience',
    description: 'Receipt audience claim does not match expected value',
    retriable: false,
    category: 'validation',
  },
  E_JWKS_FETCH_FAILED: {
    code: 'E_JWKS_FETCH_FAILED',
    http_status: 503,
    title: 'JWKS Fetch Failed',
    description: 'Failed to fetch public keys from JWKS endpoint',
    retriable: true,
    category: 'infrastructure',
  },
  E_KEY_NOT_FOUND: {
    code: 'E_KEY_NOT_FOUND',
    http_status: 400,
    title: 'Key Not Found',
    description: 'Public key with specified kid not found in JWKS',
    retriable: false,
    category: 'verification',
  },
  E_INVALID_AMOUNT: {
    code: 'E_INVALID_AMOUNT',
    http_status: 400,
    title: 'Invalid Amount',
    description: 'Payment amount is invalid or out of allowed range',
    retriable: false,
    category: 'validation',
  },
  E_INVALID_CURRENCY: {
    code: 'E_INVALID_CURRENCY',
    http_status: 400,
    title: 'Invalid Currency',
    description: 'Currency code is not a valid ISO 4217 code',
    retriable: false,
    category: 'validation',
  },
  E_INVALID_RAIL: {
    code: 'E_INVALID_RAIL',
    http_status: 400,
    title: 'Invalid Payment Rail',
    description: 'Payment rail identifier is not recognized',
    retriable: false,
    category: 'validation',
  },
  E_MISSING_REQUIRED_CLAIM: {
    code: 'E_MISSING_REQUIRED_CLAIM',
    http_status: 400,
    title: 'Missing Required Claim',
    description: 'Receipt is missing a required JWT claim',
    retriable: false,
    category: 'validation',
  },
  E_RATE_LIMITED: {
    code: 'E_RATE_LIMITED',
    http_status: 429,
    title: 'Rate Limited',
    description: 'Too many requests, please retry later',
    retriable: true,
    category: 'infrastructure',
  },
  E_CIRCUIT_BREAKER_OPEN: {
    code: 'E_CIRCUIT_BREAKER_OPEN',
    http_status: 503,
    title: 'Circuit Breaker Open',
    description: 'Service temporarily unavailable due to circuit breaker',
    retriable: true,
    category: 'infrastructure',
  },
  E_CONTROL_DENIED: {
    code: 'E_CONTROL_DENIED',
    http_status: 403,
    title: 'Control Decision Denied',
    description: 'Control engine denied authorization',
    retriable: false,
    category: 'control',
  },
  E_CONTROL_REVIEW_REQUIRED: {
    code: 'E_CONTROL_REVIEW_REQUIRED',
    http_status: 202,
    title: 'Review Required',
    description: 'Control engine requires manual review',
    retriable: true,
    category: 'control',
  },
  E_EVIDENCE_NOT_JSON: {
    code: 'E_EVIDENCE_NOT_JSON',
    http_status: 400,
    title: 'Evidence Not JSON-Safe',
    description:
      'Evidence contains non-JSON-safe values (NaN, Infinity, undefined, BigInt, Date, Map, Set, functions, symbols, class instances, or cycles)',
    retriable: false,
    category: 'validation',
  },
  // Agent Identity error codes (v0.9.25+)
  E_IDENTITY_MISSING: {
    code: 'E_IDENTITY_MISSING',
    http_status: 401,
    title: 'Identity Missing',
    description: 'No agent identity attestation provided in request',
    retriable: false,
    category: 'identity',
  },
  E_IDENTITY_INVALID_FORMAT: {
    code: 'E_IDENTITY_INVALID_FORMAT',
    http_status: 400,
    title: 'Identity Invalid Format',
    description: 'Agent identity attestation does not conform to schema',
    retriable: false,
    category: 'identity',
  },
  E_IDENTITY_EXPIRED: {
    code: 'E_IDENTITY_EXPIRED',
    http_status: 401,
    title: 'Identity Expired',
    description: 'Agent identity attestation has exceeded its expiration time',
    retriable: false,
    category: 'identity',
  },
  E_IDENTITY_NOT_YET_VALID: {
    code: 'E_IDENTITY_NOT_YET_VALID',
    http_status: 401,
    title: 'Identity Not Yet Valid',
    description: 'Agent identity attestation issued_at time is in the future',
    retriable: true,
    category: 'identity',
  },
  E_IDENTITY_SIG_INVALID: {
    code: 'E_IDENTITY_SIG_INVALID',
    http_status: 401,
    title: 'Identity Signature Invalid',
    description: 'Agent identity proof signature verification failed',
    retriable: false,
    category: 'identity',
  },
  E_IDENTITY_KEY_UNKNOWN: {
    code: 'E_IDENTITY_KEY_UNKNOWN',
    http_status: 401,
    title: 'Identity Key Unknown',
    description: 'Key ID not found in agent key directory',
    retriable: true,
    category: 'identity',
  },
  E_IDENTITY_KEY_EXPIRED: {
    code: 'E_IDENTITY_KEY_EXPIRED',
    http_status: 401,
    title: 'Identity Key Expired',
    description: 'Agent signing key has expired per directory metadata',
    retriable: false,
    category: 'identity',
  },
  E_IDENTITY_KEY_REVOKED: {
    code: 'E_IDENTITY_KEY_REVOKED',
    http_status: 401,
    title: 'Identity Key Revoked',
    description: 'Agent signing key has been explicitly revoked',
    retriable: false,
    category: 'identity',
  },
  E_IDENTITY_BINDING_MISMATCH: {
    code: 'E_IDENTITY_BINDING_MISMATCH',
    http_status: 400,
    title: 'Identity Binding Mismatch',
    description: 'Identity binding does not match the request being verified',
    retriable: false,
    category: 'identity',
  },
  E_IDENTITY_BINDING_STALE: {
    code: 'E_IDENTITY_BINDING_STALE',
    http_status: 401,
    title: 'Identity Binding Stale',
    description: 'Identity binding is too old and requires fresh binding',
    retriable: true,
    category: 'identity',
  },
  E_IDENTITY_BINDING_FUTURE: {
    code: 'E_IDENTITY_BINDING_FUTURE',
    http_status: 400,
    title: 'Identity Binding Future',
    description: 'Identity binding signed_at timestamp is in the future',
    retriable: false,
    category: 'identity',
  },
  E_IDENTITY_PROOF_UNSUPPORTED: {
    code: 'E_IDENTITY_PROOF_UNSUPPORTED',
    http_status: 400,
    title: 'Identity Proof Unsupported',
    description: 'Agent identity proof method is not supported',
    retriable: false,
    category: 'identity',
  },
  E_IDENTITY_DIRECTORY_UNAVAILABLE: {
    code: 'E_IDENTITY_DIRECTORY_UNAVAILABLE',
    http_status: 503,
    title: 'Identity Directory Unavailable',
    description: 'Failed to fetch agent key directory',
    retriable: true,
    category: 'identity',
  },
};

/**
 * Get error definition by code
 */
export function getError(code: string): ErrorDefinition | undefined {
  return ERRORS[code];
}

/**
 * Check if error is retriable
 */
export function isRetriable(code: string): boolean {
  return ERRORS[code]?.retriable ?? false;
}
