/**
 * @peac/worker-core - Error codes and HTTP status mapping tests
 */

import { describe, it, expect } from 'vitest';
import {
  ErrorCodes,
  ERROR_STATUS_MAP,
  getStatusForError,
  createProblemDetails,
  mapTapErrorCode,
} from '../src/errors.js';

describe('ErrorCodes', () => {
  it('should have all required error codes', () => {
    // Canonical E_* error codes from @peac/contracts
    expect(ErrorCodes.TAP_SIGNATURE_MISSING).toBe('E_TAP_SIGNATURE_MISSING');
    expect(ErrorCodes.TAP_SIGNATURE_INVALID).toBe('E_TAP_SIGNATURE_INVALID');
    expect(ErrorCodes.TAP_TIME_INVALID).toBe('E_TAP_TIME_INVALID');
    expect(ErrorCodes.TAP_KEY_NOT_FOUND).toBe('E_TAP_KEY_NOT_FOUND');
    expect(ErrorCodes.TAP_TAG_UNKNOWN).toBe('E_TAP_TAG_UNKNOWN');
    expect(ErrorCodes.TAP_ALGORITHM_INVALID).toBe('E_TAP_ALGORITHM_INVALID');
    expect(ErrorCodes.TAP_WINDOW_TOO_LARGE).toBe('E_TAP_WINDOW_TOO_LARGE');
    expect(ErrorCodes.TAP_NONCE_REPLAY).toBe('E_TAP_NONCE_REPLAY');
    expect(ErrorCodes.TAP_REPLAY_PROTECTION_REQUIRED).toBe('E_TAP_REPLAY_PROTECTION_REQUIRED');
    expect(ErrorCodes.ISSUER_NOT_ALLOWED).toBe('E_ISSUER_NOT_ALLOWED');
    expect(ErrorCodes.RECEIPT_MISSING).toBe('E_RECEIPT_MISSING');
    expect(ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED).toBe('E_CONFIG_ISSUER_ALLOWLIST_REQUIRED');
    expect(ErrorCodes.INTERNAL_ERROR).toBe('E_INTERNAL_ERROR');
  });
});

describe('ERROR_STATUS_MAP', () => {
  it('should map TAP_SIGNATURE_MISSING to 401', () => {
    expect(ERROR_STATUS_MAP[ErrorCodes.TAP_SIGNATURE_MISSING]).toBe(401);
  });

  it('should map TAP auth errors to 401', () => {
    expect(ERROR_STATUS_MAP[ErrorCodes.TAP_SIGNATURE_INVALID]).toBe(401);
    expect(ERROR_STATUS_MAP[ErrorCodes.TAP_TIME_INVALID]).toBe(401);
    expect(ERROR_STATUS_MAP[ErrorCodes.TAP_KEY_NOT_FOUND]).toBe(401);
    expect(ERROR_STATUS_MAP[ErrorCodes.TAP_REPLAY_PROTECTION_REQUIRED]).toBe(401);
  });

  it('should map malformed TAP errors to 400', () => {
    expect(ERROR_STATUS_MAP[ErrorCodes.TAP_TAG_UNKNOWN]).toBe(400);
    expect(ERROR_STATUS_MAP[ErrorCodes.TAP_ALGORITHM_INVALID]).toBe(400);
    expect(ERROR_STATUS_MAP[ErrorCodes.TAP_WINDOW_TOO_LARGE]).toBe(400);
  });

  it('should map RECEIPT_MISSING to 402 (payment remedy only)', () => {
    expect(ERROR_STATUS_MAP[ErrorCodes.RECEIPT_MISSING]).toBe(402);
  });

  it('should map ISSUER_NOT_ALLOWED to 403', () => {
    expect(ERROR_STATUS_MAP[ErrorCodes.ISSUER_NOT_ALLOWED]).toBe(403);
  });

  it('should map TAP_NONCE_REPLAY to 409', () => {
    expect(ERROR_STATUS_MAP[ErrorCodes.TAP_NONCE_REPLAY]).toBe(409);
  });

  it('should map config errors to 500', () => {
    expect(ERROR_STATUS_MAP[ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED]).toBe(500);
    expect(ERROR_STATUS_MAP[ErrorCodes.INTERNAL_ERROR]).toBe(500);
  });
});

describe('getStatusForError', () => {
  it('should return correct status for known error codes', () => {
    expect(getStatusForError(ErrorCodes.TAP_SIGNATURE_MISSING)).toBe(401);
    expect(getStatusForError(ErrorCodes.RECEIPT_MISSING)).toBe(402);
    expect(getStatusForError(ErrorCodes.ISSUER_NOT_ALLOWED)).toBe(403);
    expect(getStatusForError(ErrorCodes.TAP_NONCE_REPLAY)).toBe(409);
    expect(getStatusForError(ErrorCodes.INTERNAL_ERROR)).toBe(500);
  });

  it('should return 500 for unknown error codes', () => {
    expect(getStatusForError('unknown_error')).toBe(500);
  });
});

describe('createProblemDetails', () => {
  it('should create RFC 9457 problem details', () => {
    const problem = createProblemDetails(
      ErrorCodes.TAP_SIGNATURE_MISSING,
      'TAP signature headers are required.'
    );

    expect(problem.type).toBe('https://peacprotocol.org/problems/E_TAP_SIGNATURE_MISSING');
    expect(problem.title).toBe('Signature Missing');
    expect(problem.status).toBe(401);
    expect(problem.detail).toBe('TAP signature headers are required.');
    expect(problem.instance).toBeUndefined();
  });

  it('should include instance when request URL provided', () => {
    const problem = createProblemDetails(
      ErrorCodes.TAP_SIGNATURE_MISSING,
      'TAP signature headers are required.',
      'https://example.com/api/resource'
    );

    expect(problem.instance).toBe('https://example.com/api/resource');
  });

  it('should handle error codes with title from canonical error catalog', () => {
    const problem = createProblemDetails(
      ErrorCodes.TAP_REPLAY_PROTECTION_REQUIRED,
      'Replay protection required'
    );

    expect(problem.title).toBe('Replay Protection Required');
  });

  it('should create problem for 402 receipt missing', () => {
    const problem = createProblemDetails(
      ErrorCodes.RECEIPT_MISSING,
      'A valid PEAC receipt is required.'
    );

    expect(problem.status).toBe(402);
    expect(problem.type).toBe('https://peacprotocol.org/problems/E_RECEIPT_MISSING');
  });
});

describe('mapTapErrorCode', () => {
  it('should map legacy snake_case TAP error codes to canonical E_* codes', () => {
    expect(mapTapErrorCode('tap_signature_invalid')).toBe('E_TAP_SIGNATURE_INVALID');
    expect(mapTapErrorCode('tap_time_invalid')).toBe('E_TAP_TIME_INVALID');
    expect(mapTapErrorCode('tap_key_not_found')).toBe('E_TAP_KEY_NOT_FOUND');
  });

  it('should map unknown codes to default E_TAP_SIGNATURE_INVALID', () => {
    // Unknown codes default to E_TAP_SIGNATURE_INVALID as fallback
    expect(mapTapErrorCode('some_unknown_code')).toBe('E_TAP_SIGNATURE_INVALID');
  });

  it('should map undefined to default E_TAP_SIGNATURE_INVALID', () => {
    // Undefined defaults to E_TAP_SIGNATURE_INVALID as fallback
    expect(mapTapErrorCode(undefined)).toBe('E_TAP_SIGNATURE_INVALID');
  });

  it('should pass through canonical TAP library E_* error codes', () => {
    expect(mapTapErrorCode('E_TAP_WINDOW_TOO_LARGE')).toBe('E_TAP_WINDOW_TOO_LARGE');
    expect(mapTapErrorCode('E_TAP_TIME_INVALID')).toBe('E_TAP_TIME_INVALID');
    expect(mapTapErrorCode('E_TAP_ALGORITHM_INVALID')).toBe('E_TAP_ALGORITHM_INVALID');
    expect(mapTapErrorCode('E_TAP_TAG_UNKNOWN')).toBe('E_TAP_TAG_UNKNOWN');
    expect(mapTapErrorCode('E_SIGNATURE_INVALID')).toBe('E_TAP_SIGNATURE_INVALID');
    expect(mapTapErrorCode('E_KEY_NOT_FOUND')).toBe('E_TAP_KEY_NOT_FOUND');
  });
});
