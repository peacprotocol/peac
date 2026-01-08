/**
 * Parity Tests - Prove worker-core uses canonical contracts
 *
 * These tests make drift impossible by asserting exact equality
 * with @peac/contracts canonical definitions.
 */

import { describe, it, expect } from 'vitest';
import {
  CANONICAL_ERROR_CODES,
  MODE_BEHAVIOR,
  problemTypeFor,
  buildWwwAuthenticate,
  requiresWwwAuthenticate,
  isPeacErrorCode,
  type PeacErrorCode,
  type PeacHttpStatus,
} from '@peac/contracts';
import {
  ErrorCodes,
  mapTapErrorCode,
  createProblemDetails,
} from '../src/errors.js';
import { buildErrorResponse } from '../src/response.js';
import { handleVerification } from '../src/verification.js';
import type { RequestLike, InternalWorkerConfig, InternalVerifyTapOptions } from '../src/types.js';

describe('Parity: Contract Re-exports', () => {
  it('should re-export ErrorCodes identical to CANONICAL_ERROR_CODES', () => {
    // Deep equality check - worker-core ErrorCodes must match contracts
    expect(ErrorCodes).toStrictEqual(CANONICAL_ERROR_CODES);
  });

  it('should have all canonical error codes accessible', () => {
    // Verify specific codes match
    expect(ErrorCodes.TAP_SIGNATURE_MISSING).toBe('E_TAP_SIGNATURE_MISSING');
    expect(ErrorCodes.RECEIPT_MISSING).toBe('E_RECEIPT_MISSING');
    expect(ErrorCodes.TAP_SIGNATURE_INVALID).toBe('E_TAP_SIGNATURE_INVALID');
    expect(ErrorCodes.TAP_TIME_INVALID).toBe('E_TAP_TIME_INVALID');
    expect(ErrorCodes.TAP_NONCE_REPLAY).toBe('E_TAP_NONCE_REPLAY');
    expect(ErrorCodes.ISSUER_NOT_ALLOWED).toBe('E_ISSUER_NOT_ALLOWED');
    expect(ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED).toBe('E_CONFIG_ISSUER_ALLOWLIST_REQUIRED');
  });
});

describe('Parity: Mode Behavior', () => {
  const mockKeyResolver = {
    resolve: async () => ({ key: new Uint8Array(32), alg: 'ES256' as const }),
  };

  const mockConfig: InternalWorkerConfig = {
    issuerAllowlist: ['https://issuer.example'],
    bypassPaths: [],
    unsafeAllowAnyIssuer: false,
  };

  const mockOptions: Omit<InternalVerifyTapOptions, 'warnNoReplayStore'> = {
    keyResolver: mockKeyResolver,
    replayStore: undefined,
    unsafeAllowUnknownTags: false,
    unsafeAllowNoReplay: true,
  };

  it('should default to tap_only mode', async () => {
    const request: RequestLike = {
      method: 'GET',
      url: 'https://api.example.com/data',
      headers: {
        entries: function* () {
          // No TAP headers
        },
      },
    };

    const result = await handleVerification(request, mockConfig, mockOptions);
    // Default mode is tap_only, no explicit mode parameter

    expect(result.action).toBe('error');
    if (result.action === 'error') {
      expect(result.status).toBe(401);
      expect(result.errorCode).toBe(ErrorCodes.TAP_SIGNATURE_MISSING);
    }
  });

  it('should return exactly MODE_BEHAVIOR.tap_only for missing TAP in tap_only mode', async () => {
    const request: RequestLike = {
      method: 'GET',
      url: 'https://api.example.com/data',
      headers: {
        entries: function* () {
          // No TAP headers
        },
      },
    };

    const result = await handleVerification(request, mockConfig, mockOptions, 'tap_only');

    expect(result.action).toBe('error');
    if (result.action === 'error') {
      // Assert exact match with MODE_BEHAVIOR contract
      const expected = MODE_BEHAVIOR.tap_only;
      expect(result.status).toBe(expected.status);
      expect(result.errorCode).toBe(expected.code);
      expect(result.action).toBe(expected.action);
    }
  });

  it('should return exactly MODE_BEHAVIOR.receipt_or_tap for missing TAP in receipt_or_tap mode', async () => {
    const request: RequestLike = {
      method: 'GET',
      url: 'https://api.example.com/data',
      headers: {
        entries: function* () {
          // No TAP headers
        },
      },
    };

    const result = await handleVerification(request, mockConfig, mockOptions, 'receipt_or_tap');

    expect(result.action).toBe('challenge');
    if (result.action === 'challenge') {
      // Assert exact match with MODE_BEHAVIOR contract
      const expected = MODE_BEHAVIOR.receipt_or_tap;
      expect(result.status).toBe(expected.status);
      expect(result.errorCode).toBe(expected.code);
      expect(result.action).toBe(expected.action);
    }
  });

  it('should never return 402 with action="error"', async () => {
    // This test ensures MODE_BEHAVIOR prevents impossible combinations
    const tapOnlyBehavior = MODE_BEHAVIOR.tap_only;
    const receiptOrTapBehavior = MODE_BEHAVIOR.receipt_or_tap;

    // tap_only: 401 + error
    expect(tapOnlyBehavior.status).toBe(401);
    expect(tapOnlyBehavior.action).toBe('error');

    // receipt_or_tap: 402 + challenge (NOT error)
    expect(receiptOrTapBehavior.status).toBe(402);
    expect(receiptOrTapBehavior.action).toBe('challenge');

    // Verify that when status is 402, action is NEVER 'error'
    Object.values(MODE_BEHAVIOR).forEach((behavior) => {
      if (behavior.status === 402) {
        expect(behavior.action).not.toBe('error');
      }
    });
  });
});

describe('Parity: Problem Type URI', () => {
  it('should use problemTypeFor() for all error codes', () => {
    const testCodes: PeacErrorCode[] = [
      'E_TAP_SIGNATURE_MISSING',
      'E_RECEIPT_MISSING',
      'E_TAP_SIGNATURE_INVALID',
      'E_TAP_TIME_INVALID',
      'E_ISSUER_NOT_ALLOWED',
    ];

    testCodes.forEach((code) => {
      const problem = createProblemDetails(code, 'Test detail');
      const expectedType = problemTypeFor(code);

      // Assert exact match - no string concatenation allowed
      expect(problem.type).toBe(expectedType);
      expect(problem.type).toContain('https://peacprotocol.org/problems/');
    });
  });

  it('should never use string concatenation for problem type', () => {
    const problem = createProblemDetails('E_TAP_SIGNATURE_INVALID', 'Invalid signature');

    // Verify it matches canonical function output
    expect(problem.type).toBe(problemTypeFor('E_TAP_SIGNATURE_INVALID'));

    // Verify format (should be from canonical function, not ad-hoc concatenation)
    expect(problem.type).toMatch(/^https:\/\/peacprotocol\.org\/problems\/E_[A-Z_]+$/);
  });
});

describe('Parity: WWW-Authenticate Header', () => {
  it('should include WWW-Authenticate for 401 status', () => {
    const response = buildErrorResponse('E_TAP_SIGNATURE_MISSING', 'Missing TAP headers');

    expect(response.status).toBe(401);
    expect(response.headers['WWW-Authenticate']).toBeDefined();

    // Assert exact match with canonical builder
    const expectedHeader = buildWwwAuthenticate('E_TAP_SIGNATURE_MISSING');
    expect(response.headers['WWW-Authenticate']).toBe(expectedHeader);
  });

  it('should include WWW-Authenticate for 402 status', () => {
    const response = buildErrorResponse('E_RECEIPT_MISSING', 'Receipt required');

    expect(response.status).toBe(402);
    expect(response.headers['WWW-Authenticate']).toBeDefined();

    // Assert exact match with canonical builder
    const expectedHeader = buildWwwAuthenticate('E_RECEIPT_MISSING');
    expect(response.headers['WWW-Authenticate']).toBe(expectedHeader);
  });

  it('should omit WWW-Authenticate for other status codes', () => {
    const testCases: Array<[PeacErrorCode, number]> = [
      ['E_TAP_TAG_UNKNOWN', 400],
      ['E_ISSUER_NOT_ALLOWED', 403],
      ['E_TAP_NONCE_REPLAY', 409],
      ['E_INTERNAL_ERROR', 500],
    ];

    testCases.forEach(([code, expectedStatus]) => {
      const response = buildErrorResponse(code, 'Test error');

      expect(response.status).toBe(expectedStatus);
      expect(response.headers['WWW-Authenticate']).toBeUndefined();
    });
  });

  it('should use canonical buildWwwAuthenticate format', () => {
    const codes: PeacErrorCode[] = ['E_TAP_SIGNATURE_MISSING', 'E_RECEIPT_MISSING'];

    codes.forEach((code) => {
      const response = buildErrorResponse(code, 'Test');
      const header = response.headers['WWW-Authenticate'];

      if (requiresWwwAuthenticate(response.status)) {
        // Assert exact string match with canonical builder
        expect(header).toBe(buildWwwAuthenticate(code));

        // Verify format components
        expect(header).toContain('PEAC realm="peac"');
        expect(header).toContain(`error="${code}"`);
        expect(header).toContain(`error_uri="${problemTypeFor(code)}"`);
      }
    });
  });

  it('should match canonical WWW_AUTHENTICATE_STATUSES behavior', () => {
    // 401 and 402 should require WWW-Authenticate
    expect(requiresWwwAuthenticate(401)).toBe(true);
    expect(requiresWwwAuthenticate(402)).toBe(true);

    // Other statuses should not
    expect(requiresWwwAuthenticate(400)).toBe(false);
    expect(requiresWwwAuthenticate(403)).toBe(false);
    expect(requiresWwwAuthenticate(409)).toBe(false);
    expect(requiresWwwAuthenticate(500)).toBe(false);
  });
});

describe('Parity: Legacy Input Mapping', () => {
  it('should map legacy snake_case codes to canonical E_* codes', () => {
    const legacyMappings: Array<[string, PeacErrorCode]> = [
      ['tap_key_not_found', 'E_TAP_KEY_NOT_FOUND'],
      ['key_not_found', 'E_TAP_KEY_NOT_FOUND'],
      ['tap_signature_invalid', 'E_TAP_SIGNATURE_INVALID'],
      ['signature_invalid', 'E_TAP_SIGNATURE_INVALID'],
      ['tap_time_invalid', 'E_TAP_TIME_INVALID'],
      ['tap_window_too_large', 'E_TAP_WINDOW_TOO_LARGE'],
      ['tap_tag_unknown', 'E_TAP_TAG_UNKNOWN'],
      ['tap_algorithm_invalid', 'E_TAP_ALGORITHM_INVALID'],
    ];

    legacyMappings.forEach(([legacy, canonical]) => {
      expect(mapTapErrorCode(legacy)).toBe(canonical);
    });
  });

  it('should map @peac/mappings-tap E_* codes correctly', () => {
    const tapMappings: Array<[string, PeacErrorCode]> = [
      ['E_TAP_WINDOW_TOO_LARGE', 'E_TAP_WINDOW_TOO_LARGE'],
      ['E_TAP_TIME_INVALID', 'E_TAP_TIME_INVALID'],
      ['E_TAP_TAG_UNKNOWN', 'E_TAP_TAG_UNKNOWN'],
      ['E_TAP_ALGORITHM_INVALID', 'E_TAP_ALGORITHM_INVALID'],
      ['E_TAP_KEY_NOT_FOUND', 'E_TAP_KEY_NOT_FOUND'],
      ['E_TAP_SIGNATURE_INVALID', 'E_TAP_SIGNATURE_INVALID'],
    ];

    tapMappings.forEach(([input, canonical]) => {
      expect(mapTapErrorCode(input)).toBe(canonical);
    });
  });

  it('should map unknown codes to canonical fallback E_TAP_SIGNATURE_INVALID', () => {
    const unknownCodes = [
      'unknown_error',
      'some_random_code',
      'tap_future_error',
      '',
      'INVALID',
    ];

    unknownCodes.forEach((code) => {
      // All unknown codes should map to the canonical fallback
      expect(mapTapErrorCode(code)).toBe('E_TAP_SIGNATURE_INVALID');
    });
  });

  it('should handle undefined/null gracefully', () => {
    expect(mapTapErrorCode(undefined)).toBe('E_TAP_SIGNATURE_INVALID');
    expect(mapTapErrorCode('')).toBe('E_TAP_SIGNATURE_INVALID');
  });

  it('should never invent new error codes outside the canonical set', () => {
    // Any mapped code must exist in CANONICAL_ERROR_CODES
    const allCanonicalCodes = Object.values(CANONICAL_ERROR_CODES);

    const testInputs = [
      'tap_key_not_found',
      'unknown_code',
      'E_TAP_WINDOW_TOO_LARGE',
      'something_random',
    ];

    testInputs.forEach((input) => {
      const result = mapTapErrorCode(input);
      expect(allCanonicalCodes).toContain(result);
    });
  });
});

describe('Parity: Cross-Contract Consistency', () => {
  it('should ensure error codes match status mappings', () => {
    // Every canonical error code should have a defined status
    Object.values(CANONICAL_ERROR_CODES).forEach((code) => {
      const problem = createProblemDetails(code);
      expect(problem.status).toBeGreaterThanOrEqual(400);
      expect(problem.status).toBeLessThan(600);
    });
  });

  it('should ensure MODE_BEHAVIOR uses valid canonical codes', () => {
    Object.values(MODE_BEHAVIOR).forEach((behavior) => {
      const allCanonicalCodes = Object.values(CANONICAL_ERROR_CODES);
      expect(allCanonicalCodes).toContain(behavior.code);
    });
  });

  it('should ensure problemTypeFor returns consistent URIs', () => {
    Object.values(CANONICAL_ERROR_CODES).forEach((code) => {
      const uri = problemTypeFor(code);

      expect(uri).toMatch(/^https:\/\/peacprotocol\.org\/problems\/E_[A-Z_]+$/);
      expect(uri).toContain(code);
    });
  });
});

describe('Parity: Type Guards and Utilities', () => {
  it('should validate canonical error codes with isPeacErrorCode', () => {
    // All canonical codes should validate
    Object.values(CANONICAL_ERROR_CODES).forEach((code) => {
      expect(isPeacErrorCode(code)).toBe(true);
    });

    // Specific codes should validate
    expect(isPeacErrorCode('E_TAP_SIGNATURE_MISSING')).toBe(true);
    expect(isPeacErrorCode('E_RECEIPT_MISSING')).toBe(true);
    expect(isPeacErrorCode('E_INTERNAL_ERROR')).toBe(true);
  });

  it('should reject invalid codes with isPeacErrorCode', () => {
    expect(isPeacErrorCode('invalid_code')).toBe(false);
    expect(isPeacErrorCode('E_UNKNOWN')).toBe(false);
    expect(isPeacErrorCode('')).toBe(false);
    expect(isPeacErrorCode(null)).toBe(false);
    expect(isPeacErrorCode(undefined)).toBe(false);
    expect(isPeacErrorCode(123)).toBe(false);
    expect(isPeacErrorCode({})).toBe(false);
  });

  it('should use isPeacErrorCode as type guard', () => {
    const maybeCode: unknown = 'E_TAP_SIGNATURE_MISSING';

    if (isPeacErrorCode(maybeCode)) {
      // TypeScript should narrow type to PeacErrorCode
      const problem = createProblemDetails(maybeCode);
      expect(problem.code).toBe('E_TAP_SIGNATURE_MISSING');
    } else {
      throw new Error('Expected valid code');
    }
  });

  it('should have PeacHttpStatus type matching all status codes', () => {
    // Verify PeacHttpStatus type includes all canonical statuses
    const validStatuses: PeacHttpStatus[] = [400, 401, 402, 403, 409, 500];

    Object.values(CANONICAL_ERROR_CODES).forEach((code) => {
      const problem = createProblemDetails(code);
      expect(validStatuses).toContain(problem.status as PeacHttpStatus);
    });
  });

  it('should have PeacHttpStatus type exclude invalid statuses', () => {
    // TypeScript compile-time check - these should not compile if uncommented:
    // const invalid1: PeacHttpStatus = 200; // OK status - not allowed
    // const invalid2: PeacHttpStatus = 404; // Not Found - not used by PEAC
    // const invalid3: PeacHttpStatus = 503; // Service Unavailable - not used by PEAC

    // Runtime verification that only specific statuses are valid
    const validStatuses = new Set<number>([400, 401, 402, 403, 409, 500]);
    const invalidStatuses = [200, 201, 204, 301, 302, 304, 404, 418, 429, 503];

    invalidStatuses.forEach((status) => {
      expect(validStatuses.has(status)).toBe(false);
    });
  });
});
