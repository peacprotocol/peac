/**
 * @peac/worker-akamai - Error tests
 */

import { describe, it, expect } from 'vitest';
import {
  createErrorResponse,
  createChallengeResponse,
  createProblemDetails,
  ErrorCodes,
} from '../src/errors.js';

describe('createProblemDetails', () => {
  it('creates problem details with correct structure', () => {
    const problem = createProblemDetails(
      ErrorCodes.RECEIPT_MISSING,
      'Payment required',
      'https://example.com/resource'
    );

    expect(problem.type).toBe('https://peacprotocol.org/problems/receipt_missing');
    expect(problem.title).toBe('Payment Required');
    expect(problem.status).toBe(402);
    expect(problem.detail).toBe('Payment required');
    expect(problem.instance).toBe('https://example.com/resource');
    expect(problem.code).toBe('E_RECEIPT_MISSING');
  });

  it('sanitizes sensitive information in details', () => {
    const problem = createProblemDetails(
      ErrorCodes.TAP_SIGNATURE_INVALID,
      'Signature invalid: sig1=:dGVzdA==:'
    );

    expect(problem.detail).not.toContain('dGVzdA');
    expect(problem.detail).toContain('[REDACTED]');
  });

  it('handles missing detail and instance', () => {
    const problem = createProblemDetails(ErrorCodes.INTERNAL_ERROR);

    expect(problem.detail).toBeUndefined();
    expect(problem.instance).toBeUndefined();
  });
});

describe('createErrorResponse', () => {
  it('creates response with correct status and headers', () => {
    const response = createErrorResponse(ErrorCodes.TAP_SIGNATURE_INVALID, 'Invalid signature');

    expect(response.status).toBe(401);
    expect(response.headers.get('Content-Type')).toBe('application/problem+json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('creates 400 response for malformed errors', () => {
    const response = createErrorResponse(ErrorCodes.TAP_TAG_UNKNOWN);
    expect(response.status).toBe(400);
  });

  it('creates 403 response for forbidden errors', () => {
    const response = createErrorResponse(ErrorCodes.ISSUER_NOT_ALLOWED);
    expect(response.status).toBe(403);
  });

  it('creates 409 response for replay errors', () => {
    const response = createErrorResponse(ErrorCodes.TAP_NONCE_REPLAY);
    expect(response.status).toBe(409);
  });

  it('creates 500 response for config errors', () => {
    const response = createErrorResponse(ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED);
    expect(response.status).toBe(500);
  });
});

describe('createChallengeResponse', () => {
  it('creates 402 response with WWW-Authenticate header', () => {
    const response = createChallengeResponse('https://example.com/resource');

    expect(response.status).toBe(402);
    expect(response.headers.get('Content-Type')).toBe('application/problem+json');
    expect(response.headers.get('WWW-Authenticate')).toBe('PEAC realm="peac-verifier"');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('includes request URL as instance', async () => {
    const response = createChallengeResponse('https://example.com/resource');
    const body = await response.json() as { instance: string; code: string };

    expect(body.instance).toBe('https://example.com/resource');
    expect(body.code).toBe('E_RECEIPT_MISSING');
  });
});
