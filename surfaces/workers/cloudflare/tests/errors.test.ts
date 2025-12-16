/**
 * Tests for RFC 9457 error responses.
 */

import { describe, it, expect } from 'vitest';
import {
  createProblemDetails,
  createErrorResponse,
  createChallengeResponse,
  ErrorCodes,
} from '../src/errors.js';
import type { ProblemDetails } from '../src/types.js';

describe('createProblemDetails', () => {
  it('should create problem details for receipt_missing', () => {
    const problem = createProblemDetails(ErrorCodes.RECEIPT_MISSING);

    expect(problem.type).toBe('https://peacprotocol.org/problems/receipt_missing');
    expect(problem.title).toBe('Payment Required');
    expect(problem.status).toBe(402);
    expect(problem.detail).toBeUndefined();
    expect(problem.instance).toBeUndefined();
  });

  it('should create problem details with detail and instance', () => {
    const problem = createProblemDetails(
      ErrorCodes.TAP_SIGNATURE_INVALID,
      'Signature verification failed',
      'https://api.example.com/resource'
    );

    expect(problem.type).toBe('https://peacprotocol.org/problems/tap_signature_invalid');
    expect(problem.title).toBe('Invalid Signature');
    expect(problem.status).toBe(401);
    expect(problem.detail).toBe('Signature verification failed');
    expect(problem.instance).toBe('https://api.example.com/resource');
  });

  it('should map error codes to correct HTTP status', () => {
    expect(createProblemDetails(ErrorCodes.RECEIPT_MISSING).status).toBe(402);
    expect(createProblemDetails(ErrorCodes.TAP_SIGNATURE_INVALID).status).toBe(401);
    expect(createProblemDetails(ErrorCodes.TAP_WINDOW_TOO_LARGE).status).toBe(400);
    expect(createProblemDetails(ErrorCodes.ISSUER_NOT_ALLOWED).status).toBe(403);
    expect(createProblemDetails(ErrorCodes.INTERNAL_ERROR).status).toBe(500);
  });
});

describe('createErrorResponse', () => {
  it('should create Response with application/problem+json', async () => {
    const response = createErrorResponse(ErrorCodes.TAP_SIGNATURE_INVALID, 'Invalid signature');

    expect(response.status).toBe(401);
    expect(response.headers.get('Content-Type')).toBe('application/problem+json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = (await response.json()) as ProblemDetails;
    expect(body.type).toBe('https://peacprotocol.org/problems/tap_signature_invalid');
    expect(body.detail).toBe('Invalid signature');
  });
});

describe('createChallengeResponse', () => {
  it('should create 402 response with WWW-Authenticate header', async () => {
    const response = createChallengeResponse('https://api.example.com/resource');

    expect(response.status).toBe(402);
    expect(response.headers.get('Content-Type')).toBe('application/problem+json');
    expect(response.headers.get('WWW-Authenticate')).toBe('PEAC realm="peac-verifier"');

    const body = (await response.json()) as ProblemDetails;
    expect(body.type).toBe('https://peacprotocol.org/problems/receipt_missing');
    expect(body.title).toBe('Payment Required');
    expect(body.instance).toBe('https://api.example.com/resource');
  });
});
