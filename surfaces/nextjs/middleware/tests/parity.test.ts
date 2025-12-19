/**
 * Surface Parity Test - Next.js Middleware
 *
 * Verifies this surface implementation matches the canonical contract.
 * All surface implementations MUST pass these tests.
 */

import { describe, it, expect } from 'vitest';
import { ErrorCodes, createProblemDetails } from '../src/errors.js';
import {
  CANONICAL_ERROR_CODES,
  CANONICAL_STATUS_MAPPINGS,
  CANONICAL_TITLES,
  PROBLEM_TYPE_BASE,
  MODE_BEHAVIOR,
} from '../../../_shared/contracts/index.js';

describe('Surface Parity - Error Codes', () => {
  it('should export all canonical error codes', () => {
    const canonicalKeys = Object.keys(CANONICAL_ERROR_CODES);
    const implementationKeys = Object.keys(ErrorCodes);

    expect(implementationKeys).toEqual(canonicalKeys);
  });

  it('should match canonical error code values', () => {
    for (const [key, value] of Object.entries(CANONICAL_ERROR_CODES)) {
      expect(ErrorCodes[key as keyof typeof ErrorCodes]).toBe(value);
    }
  });
});

describe('Surface Parity - HTTP Status Mappings', () => {
  it('should map all error codes to correct HTTP status', () => {
    for (const [code, expectedStatus] of Object.entries(CANONICAL_STATUS_MAPPINGS)) {
      const problem = createProblemDetails(code as keyof typeof ErrorCodes);
      expect(problem.status).toBe(expectedStatus);
    }
  });

  it('should use canonical status for RECEIPT_MISSING (402)', () => {
    const problem = createProblemDetails(ErrorCodes.RECEIPT_MISSING);
    expect(problem.status).toBe(402);
  });

  it('should use canonical status for TAP_SIGNATURE_INVALID (401)', () => {
    const problem = createProblemDetails(ErrorCodes.TAP_SIGNATURE_INVALID);
    expect(problem.status).toBe(401);
  });

  it('should use canonical status for TAP_NONCE_REPLAY (409)', () => {
    const problem = createProblemDetails(ErrorCodes.TAP_NONCE_REPLAY);
    expect(problem.status).toBe(409);
  });

  it('should use canonical status for CONFIG_ISSUER_ALLOWLIST_REQUIRED (500)', () => {
    const problem = createProblemDetails(ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED);
    expect(problem.status).toBe(500);
  });
});

describe('Surface Parity - Error Titles', () => {
  it('should match canonical error titles', () => {
    for (const [code, expectedTitle] of Object.entries(CANONICAL_TITLES)) {
      const problem = createProblemDetails(code as keyof typeof ErrorCodes);
      expect(problem.title).toBe(expectedTitle);
    }
  });
});

describe('Surface Parity - Problem Type URIs', () => {
  it('should use canonical problem type base', () => {
    const problem = createProblemDetails(ErrorCodes.RECEIPT_MISSING);
    expect(problem.type).toContain(PROBLEM_TYPE_BASE);
  });

  it('should derive type URI from error code', () => {
    const problem = createProblemDetails(ErrorCodes.TAP_SIGNATURE_INVALID);
    expect(problem.type).toBe(`${PROBLEM_TYPE_BASE}/tap_signature_invalid`);
  });
});

describe('Surface Parity - Mode Behavior', () => {
  it('receipt_or_tap mode returns 402 for missing TAP headers', () => {
    // This is verified in handler tests, but we document the contract here
    expect(MODE_BEHAVIOR.receipt_or_tap.noTapHeadersStatus).toBe(402);
    expect(MODE_BEHAVIOR.receipt_or_tap.noTapHeadersCode).toBe(
      CANONICAL_ERROR_CODES.RECEIPT_MISSING
    );
  });

  it('tap_only mode returns 401 for missing TAP headers', () => {
    expect(MODE_BEHAVIOR.tap_only.noTapHeadersStatus).toBe(401);
    expect(MODE_BEHAVIOR.tap_only.noTapHeadersCode).toBe(
      CANONICAL_ERROR_CODES.TAP_SIGNATURE_MISSING
    );
  });
});
