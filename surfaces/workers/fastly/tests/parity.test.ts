/**
 * @peac/worker-fastly - Parity tests
 *
 * Verify that Fastly worker matches Cloudflare worker behavior.
 * Uses shared error contract to ensure consistent error codes and status mappings.
 */

import { describe, it, expect } from 'vitest';
import {
  CANONICAL_ERROR_CODES,
  CANONICAL_STATUS_MAPPINGS,
  MODE_BEHAVIOR,
} from '../../../_shared/contracts/index.js';
import { ErrorCodes, createProblemDetails } from '../src/errors.js';

describe('Error Code Parity', () => {
  it('exports all canonical error codes', () => {
    // Verify that ErrorCodes matches CANONICAL_ERROR_CODES
    for (const [key, value] of Object.entries(CANONICAL_ERROR_CODES)) {
      expect(ErrorCodes[key as keyof typeof ErrorCodes]).toBe(value);
    }
  });
});

describe('Status Code Parity', () => {
  it('maps error codes to correct HTTP status codes', () => {
    for (const [code, expectedStatus] of Object.entries(CANONICAL_STATUS_MAPPINGS)) {
      const problem = createProblemDetails(code);
      expect(problem.status).toBe(expectedStatus);
    }
  });

  it('returns 402 for missing receipt', () => {
    const problem = createProblemDetails(ErrorCodes.RECEIPT_MISSING);
    expect(problem.status).toBe(402);
  });

  it('returns 401 for authentication errors', () => {
    const authErrors = [
      ErrorCodes.TAP_SIGNATURE_MISSING,
      ErrorCodes.TAP_SIGNATURE_INVALID,
      ErrorCodes.TAP_TIME_INVALID,
      ErrorCodes.TAP_KEY_NOT_FOUND,
      ErrorCodes.TAP_REPLAY_PROTECTION_REQUIRED,
    ];

    for (const code of authErrors) {
      const problem = createProblemDetails(code);
      expect(problem.status).toBe(401);
    }
  });

  it('returns 400 for malformed request errors', () => {
    const clientErrors = [
      ErrorCodes.TAP_WINDOW_TOO_LARGE,
      ErrorCodes.TAP_TAG_UNKNOWN,
      ErrorCodes.TAP_ALGORITHM_INVALID,
    ];

    for (const code of clientErrors) {
      const problem = createProblemDetails(code);
      expect(problem.status).toBe(400);
    }
  });

  it('returns 403 for forbidden errors', () => {
    const problem = createProblemDetails(ErrorCodes.ISSUER_NOT_ALLOWED);
    expect(problem.status).toBe(403);
  });

  it('returns 409 for replay errors', () => {
    const problem = createProblemDetails(ErrorCodes.TAP_NONCE_REPLAY);
    expect(problem.status).toBe(409);
  });

  it('returns 500 for config/internal errors', () => {
    const serverErrors = [
      ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED,
      ErrorCodes.INTERNAL_ERROR,
    ];

    for (const code of serverErrors) {
      const problem = createProblemDetails(code);
      expect(problem.status).toBe(500);
    }
  });
});

describe('Mode Behavior Parity', () => {
  it('receipt_or_tap mode returns 402 for missing TAP headers', () => {
    const behavior = MODE_BEHAVIOR.receipt_or_tap;
    expect(behavior.noTapHeadersStatus).toBe(402);
    expect(behavior.noTapHeadersCode).toBe(CANONICAL_ERROR_CODES.RECEIPT_MISSING);
  });

  it('tap_only mode returns 401 for missing TAP headers', () => {
    const behavior = MODE_BEHAVIOR.tap_only;
    expect(behavior.noTapHeadersStatus).toBe(401);
    expect(behavior.noTapHeadersCode).toBe(CANONICAL_ERROR_CODES.TAP_SIGNATURE_MISSING);
  });
});
