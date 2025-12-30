/**
 * Shared types for PEAC payment rail adapters
 */

/**
 * Adapter error codes (extensible)
 *
 * Core codes that all adapters should use for consistency.
 * Adapters may extend with additional codes as needed.
 */
export type AdapterErrorCode =
  | 'missing_required_field'
  | 'invalid_amount'
  | 'invalid_currency'
  | 'invalid_network'
  | 'parse_error'
  | 'validation_error'
  | string; // Allow extension

/**
 * Adapter error with code and message
 *
 * Provides structured error information for adapter operations.
 */
export interface AdapterError {
  /** Machine-readable error code */
  code: AdapterErrorCode;
  /** Human-readable error message */
  message: string;
  /** Optional field name that caused the error */
  field?: string;
}
