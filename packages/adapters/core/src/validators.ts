/**
 * Shared validators for PEAC payment rail adapters
 *
 * These validators enforce consistent validation logic across all adapters.
 * They follow the "never throws" pattern using Result types.
 */

import { adapterErr, ok, type Result } from './result.js';
import type { AdapterError } from './types.js';

/**
 * Validate required string field
 *
 * @param value - Value to validate
 * @param fieldName - Field name for error messages
 * @returns Result with string value or error
 */
export function requireString(
  value: unknown,
  fieldName: string
): Result<string, AdapterError> {
  if (typeof value !== 'string' || value.trim() === '') {
    return adapterErr(
      `${fieldName} is required and must be a non-empty string`,
      'missing_required_field',
      fieldName
    );
  }
  return ok(value);
}

/**
 * Validate optional string field
 *
 * @param value - Value to validate
 * @param fieldName - Field name for error messages
 * @returns Result with string value, undefined, or error
 */
export function optionalString(
  value: unknown,
  fieldName: string
): Result<string | undefined, AdapterError> {
  if (value === undefined || value === null) {
    return ok(undefined);
  }
  if (typeof value !== 'string') {
    return adapterErr(
      `${fieldName} must be a string if provided`,
      'validation_error',
      fieldName
    );
  }
  return ok(value);
}

/**
 * Validate required number field
 *
 * @param value - Value to validate
 * @param fieldName - Field name for error messages
 * @returns Result with number value or error
 */
export function requireNumber(
  value: unknown,
  fieldName: string
): Result<number, AdapterError> {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return adapterErr(
      `${fieldName} must be a finite number`,
      'validation_error',
      fieldName
    );
  }
  return ok(value);
}

/**
 * Validate amount (must be safe non-negative integer in minor units)
 *
 * @param value - Value to validate
 * @returns Result with amount or error
 */
export function requireAmount(value: unknown): Result<number, AdapterError> {
  if (typeof value !== 'number') {
    return adapterErr('amount must be a number', 'invalid_amount', 'amount');
  }
  if (!Number.isSafeInteger(value)) {
    return adapterErr('amount must be a safe integer', 'invalid_amount', 'amount');
  }
  if (value < 0) {
    return adapterErr('amount must be non-negative', 'invalid_amount', 'amount');
  }
  return ok(value);
}

/**
 * Validate currency code (ISO 4217, uppercase)
 *
 * @param value - Value to validate
 * @returns Result with normalized currency code or error
 */
export function requireCurrency(value: unknown): Result<string, AdapterError> {
  if (typeof value !== 'string') {
    return adapterErr('currency must be a string', 'invalid_currency', 'currency');
  }
  const normalized = value.toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    return adapterErr(
      'currency must be a valid ISO 4217 code (3 uppercase letters)',
      'invalid_currency',
      'currency'
    );
  }
  return ok(normalized);
}

/**
 * Validate optional network identifier (CAIP-2 format preferred)
 *
 * @param value - Value to validate
 * @returns Result with network string, undefined, or error
 */
export function optionalNetwork(value: unknown): Result<string | undefined, AdapterError> {
  if (value === undefined || value === null) {
    return ok(undefined);
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return adapterErr(
      'network must be a non-empty string if provided',
      'invalid_network',
      'network'
    );
  }
  return ok(value);
}

/**
 * Parse object safely (for webhook payloads)
 *
 * @param value - Value to validate
 * @param fieldName - Field name for error messages
 * @returns Result with object or error
 */
export function requireObject(
  value: unknown,
  fieldName: string = 'input'
): Result<Record<string, unknown>, AdapterError> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return adapterErr(
      `${fieldName} must be a non-null object`,
      'parse_error',
      fieldName
    );
  }
  return ok(value as Record<string, unknown>);
}

/**
 * Validate optional timestamp (ISO 8601 string or Unix seconds)
 *
 * @param value - Value to validate
 * @returns Result with ISO 8601 string, undefined, or error
 */
export function optionalTimestamp(value: unknown): Result<string | undefined, AdapterError> {
  if (value === undefined || value === null) {
    return ok(undefined);
  }
  if (typeof value === 'string') {
    // Accept ISO 8601 strings as-is
    return ok(value);
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    // Convert Unix seconds to ISO string
    return ok(new Date(value * 1000).toISOString());
  }
  return adapterErr(
    'timestamp must be an ISO 8601 string or Unix seconds',
    'validation_error',
    'timestamp'
  );
}

/**
 * Validate optional boolean field
 *
 * @param value - Value to validate
 * @param fieldName - Field name for error messages
 * @returns Result with boolean value, undefined, or error
 */
export function optionalBoolean(
  value: unknown,
  fieldName: string
): Result<boolean | undefined, AdapterError> {
  if (value === undefined || value === null) {
    return ok(undefined);
  }
  if (typeof value !== 'boolean') {
    return adapterErr(
      `${fieldName} must be a boolean if provided`,
      'validation_error',
      fieldName
    );
  }
  return ok(value);
}

/**
 * Validate enum value
 *
 * @param value - Value to validate
 * @param allowed - Array of allowed values
 * @param fieldName - Field name for error messages
 * @returns Result with validated value or error
 */
export function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fieldName: string
): Result<T, AdapterError> {
  if (typeof value !== 'string') {
    return adapterErr(
      `${fieldName} must be a string`,
      'validation_error',
      fieldName
    );
  }
  if (!allowed.includes(value as T)) {
    return adapterErr(
      `${fieldName} must be one of: ${allowed.join(', ')}`,
      'validation_error',
      fieldName
    );
  }
  return ok(value as T);
}

/**
 * Validate optional enum value
 *
 * @param value - Value to validate
 * @param allowed - Array of allowed values
 * @param fieldName - Field name for error messages
 * @returns Result with validated value, undefined, or error
 */
export function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fieldName: string
): Result<T | undefined, AdapterError> {
  if (value === undefined || value === null) {
    return ok(undefined);
  }
  return requireEnum(value, allowed, fieldName);
}
