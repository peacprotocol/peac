/**
 * x402 adapter error codes and error class
 *
 * Error codes follow PEAC adapter convention: lowercase snake_case.
 * These are adapter-level errors; kernel-level errors use E_* prefix.
 */

/**
 * x402 adapter error codes
 *
 * Categories:
 * - offer_*: Offer validation/verification errors
 * - receipt_*: Receipt validation/verification errors
 * - accept_*: Accept selection/matching errors
 * - payload_*: Generic payload errors
 * - amount_*: Amount validation errors
 * - network_*: Network validation errors
 */
export type X402ErrorCode =
  | 'offer_invalid_format'
  | 'offer_expired'
  | 'offer_version_unsupported'
  | 'offer_signature_invalid'
  | 'receipt_invalid_format'
  | 'receipt_signature_invalid'
  | 'receipt_version_unsupported'
  | 'accept_index_out_of_range'
  | 'accept_no_match'
  | 'accept_ambiguous'
  | 'accept_term_mismatch'
  | 'accept_too_many_entries'
  | 'payload_missing_field'
  | 'payload_tampered'
  | 'amount_invalid'
  | 'network_invalid';

/**
 * HTTP status mapping for error codes
 */
const ERROR_HTTP_STATUS: Record<X402ErrorCode, number> = {
  offer_invalid_format: 400,
  offer_expired: 400,
  offer_version_unsupported: 400,
  offer_signature_invalid: 401,
  receipt_invalid_format: 400,
  receipt_signature_invalid: 401,
  receipt_version_unsupported: 400,
  accept_index_out_of_range: 400,
  accept_no_match: 400,
  accept_ambiguous: 400,
  accept_term_mismatch: 400,
  accept_too_many_entries: 400,
  payload_missing_field: 400,
  payload_tampered: 401,
  amount_invalid: 400,
  network_invalid: 400,
};

/**
 * Custom error class for x402 adapter operations
 *
 * Provides structured error information with code, HTTP status,
 * and optional field/details for debugging.
 */
export class X402Error extends Error {
  readonly code: X402ErrorCode;
  readonly httpStatus: number;
  readonly field?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: X402ErrorCode,
    message: string,
    options?: { field?: string; details?: Record<string, unknown> }
  ) {
    super(message);
    this.name = 'X402Error';
    this.code = code;
    this.httpStatus = ERROR_HTTP_STATUS[code] ?? 400;
    this.field = options?.field;
    this.details = options?.details;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      ...(this.field !== undefined && { field: this.field }),
      ...(this.details !== undefined && { details: this.details }),
    };
  }
}
