/**
 * Error Factory Tests
 */
import { describe, it, expect } from 'vitest';
import {
  createAttributionError,
  createMissingSourcesError,
  createInvalidFormatError,
  createInvalidRefError,
  createHashInvalidError,
  createUnknownUsageError,
  createInvalidWeightError,
  createCircularChainError,
  createChainTooDeepError,
  createTooManySourcesError,
  createSizeExceededError,
  createResolutionFailedError,
  createResolutionTimeoutError,
  createNotYetValidError,
  createExpiredError,
} from '../errors.js';

describe('createAttributionError', () => {
  it('should create a structured error', () => {
    const error = createAttributionError('E_ATTRIBUTION_INVALID_FORMAT', 'Test error message', {
      field: 'test',
    });

    expect(error.code).toBe('E_ATTRIBUTION_INVALID_FORMAT');
    expect(error.remediation).toBe('Test error message');
    expect(error.details).toEqual({ field: 'test' });
    expect(error.http_status).toBe(400);
    expect(error.category).toBe('attribution');
    expect(error.severity).toBe('error');
  });

  it('should fallback for unknown error codes at runtime', () => {
    // Use type assertion to test runtime fallback behavior
    // This tests graceful handling of edge cases that bypass type checking
    const error = createAttributionError(
      'UNKNOWN_CODE' as unknown as Parameters<typeof createAttributionError>[0],
      'Unknown error'
    );

    expect(error.code).toBe('UNKNOWN_CODE');
    expect(error.category).toBe('validation');
    expect(error.http_status).toBe(400);
  });
});

describe('createMissingSourcesError', () => {
  it('should create error with correct code', () => {
    const error = createMissingSourcesError();
    expect(error.code).toBe('E_ATTRIBUTION_MISSING_SOURCES');
    expect(error.remediation).toContain('at least one source');
  });
});

describe('createInvalidFormatError', () => {
  it('should include reason in remediation', () => {
    const error = createInvalidFormatError('Missing required field');
    expect(error.code).toBe('E_ATTRIBUTION_INVALID_FORMAT');
    expect(error.remediation).toContain('Missing required field');
    expect(error.details).toEqual({ reason: 'Missing required field' });
  });
});

describe('createInvalidRefError', () => {
  it('should include receipt_ref in details', () => {
    const error = createInvalidRefError('invalid-ref');
    expect(error.code).toBe('E_ATTRIBUTION_INVALID_REF');
    expect(error.details).toEqual({ receiptRef: 'invalid-ref' });
  });
});

describe('createHashInvalidError', () => {
  it('should include reason', () => {
    const error = createHashInvalidError('Wrong length');
    expect(error.code).toBe('E_ATTRIBUTION_HASH_INVALID');
    expect(error.remediation).toContain('Wrong length');
  });
});

describe('createUnknownUsageError', () => {
  it('should include usage in details', () => {
    const error = createUnknownUsageError('invalid_usage');
    expect(error.code).toBe('E_ATTRIBUTION_UNKNOWN_USAGE');
    expect(error.details).toEqual({ usage: 'invalid_usage' });
    expect(error.remediation).toContain('training_input');
  });
});

describe('createInvalidWeightError', () => {
  it('should include weight in details', () => {
    const error = createInvalidWeightError(1.5);
    expect(error.code).toBe('E_ATTRIBUTION_INVALID_WEIGHT');
    expect(error.details).toEqual({ weight: 1.5 });
  });
});

describe('createCircularChainError', () => {
  it('should include receipt_ref in details', () => {
    const error = createCircularChainError('jti:cyclic');
    expect(error.code).toBe('E_ATTRIBUTION_CIRCULAR_CHAIN');
    expect(error.details).toEqual({ receiptRef: 'jti:cyclic' });
  });
});

describe('createChainTooDeepError', () => {
  it('should include depth and maxDepth', () => {
    const error = createChainTooDeepError(10, 8);
    expect(error.code).toBe('E_ATTRIBUTION_CHAIN_TOO_DEEP');
    expect(error.details).toEqual({ depth: 10, maxDepth: 8 });
    expect(error.remediation).toContain('10');
    expect(error.remediation).toContain('8');
  });
});

describe('createTooManySourcesError', () => {
  it('should include count and maxSources', () => {
    const error = createTooManySourcesError(150, 100);
    expect(error.code).toBe('E_ATTRIBUTION_TOO_MANY_SOURCES');
    expect(error.details).toEqual({ count: 150, maxSources: 100 });
  });
});

describe('createSizeExceededError', () => {
  it('should include size and maxSize', () => {
    const error = createSizeExceededError(70000, 65536);
    expect(error.code).toBe('E_ATTRIBUTION_SIZE_EXCEEDED');
    expect(error.details).toEqual({ size: 70000, maxSize: 65536 });
  });
});

describe('createResolutionFailedError', () => {
  it('should include receipt_ref and reason', () => {
    const error = createResolutionFailedError('jti:missing', 'Not found');
    expect(error.code).toBe('E_ATTRIBUTION_RESOLUTION_FAILED');
    expect(error.details).toEqual({ receiptRef: 'jti:missing', reason: 'Not found' });
    expect(error.retryable).toBe(true);
  });
});

describe('createResolutionTimeoutError', () => {
  it('should include receipt_ref and timeout', () => {
    const error = createResolutionTimeoutError('jti:slow', 5000);
    expect(error.code).toBe('E_ATTRIBUTION_RESOLUTION_TIMEOUT');
    expect(error.details).toEqual({ receiptRef: 'jti:slow', timeout: 5000 });
    expect(error.retryable).toBe(true);
  });
});

describe('createNotYetValidError', () => {
  it('should include issued_at', () => {
    const issuedAt = '2030-01-01T00:00:00Z';
    const error = createNotYetValidError(issuedAt);
    expect(error.code).toBe('E_ATTRIBUTION_NOT_YET_VALID');
    expect(error.details).toEqual({ issuedAt });
    expect(error.retryable).toBe(true);
  });
});

describe('createExpiredError', () => {
  it('should include expires_at', () => {
    const expiresAt = '2020-01-01T00:00:00Z';
    const error = createExpiredError(expiresAt);
    expect(error.code).toBe('E_ATTRIBUTION_EXPIRED');
    expect(error.details).toEqual({ expiresAt });
    expect(error.retryable).toBe(false);
  });
});
