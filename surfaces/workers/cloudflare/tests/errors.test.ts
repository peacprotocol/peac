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

    expect(problem.type).toBe('https://www.peacprotocol.org/problems/receipt_missing');
    expect(problem.title).toBe('Payment Required');
    expect(problem.status).toBe(402);
    expect(problem.code).toBe('E_RECEIPT_MISSING');
    expect(problem.detail).toBeUndefined();
    expect(problem.instance).toBeUndefined();
  });

  it('should create problem details with detail and instance', () => {
    const problem = createProblemDetails(
      ErrorCodes.TAP_SIGNATURE_INVALID,
      'Signature verification failed',
      'https://api.example.com/resource'
    );

    expect(problem.type).toBe('https://www.peacprotocol.org/problems/tap_signature_invalid');
    expect(problem.title).toBe('Invalid Signature');
    expect(problem.status).toBe(401);
    expect(problem.code).toBe('E_TAP_SIGNATURE_INVALID');
    expect(problem.detail).toBe('Signature verification failed');
    expect(problem.instance).toBe('https://api.example.com/resource');
  });

  it('should map error codes to correct HTTP status', () => {
    // 402 - Payment Required (reserved for payment flows)
    expect(createProblemDetails(ErrorCodes.RECEIPT_MISSING).status).toBe(402);
    expect(createProblemDetails(ErrorCodes.RECEIPT_INVALID).status).toBe(402);
    expect(createProblemDetails(ErrorCodes.RECEIPT_EXPIRED).status).toBe(402);

    // 401 - Authentication errors
    expect(createProblemDetails(ErrorCodes.TAP_SIGNATURE_INVALID).status).toBe(401);
    expect(createProblemDetails(ErrorCodes.TAP_SIGNATURE_MISSING).status).toBe(401);
    expect(createProblemDetails(ErrorCodes.TAP_TIME_INVALID).status).toBe(401);
    expect(createProblemDetails(ErrorCodes.TAP_KEY_NOT_FOUND).status).toBe(401);
    expect(createProblemDetails(ErrorCodes.TAP_REPLAY_PROTECTION_REQUIRED).status).toBe(401);

    // 400 - Client errors
    expect(createProblemDetails(ErrorCodes.TAP_WINDOW_TOO_LARGE).status).toBe(400);
    expect(createProblemDetails(ErrorCodes.TAP_TAG_UNKNOWN).status).toBe(400);
    expect(createProblemDetails(ErrorCodes.TAP_ALGORITHM_INVALID).status).toBe(400);

    // 403 - Forbidden
    expect(createProblemDetails(ErrorCodes.ISSUER_NOT_ALLOWED).status).toBe(403);

    // 409 - Conflict (replay detected)
    expect(createProblemDetails(ErrorCodes.TAP_NONCE_REPLAY).status).toBe(409);

    // 500 - Server errors
    expect(createProblemDetails(ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED).status).toBe(500);
    expect(createProblemDetails(ErrorCodes.INTERNAL_ERROR).status).toBe(500);
  });

  it('should create config error for missing issuer allowlist', () => {
    const problem = createProblemDetails(ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED);

    expect(problem.type).toBe(
      'https://www.peacprotocol.org/problems/config_issuer_allowlist_required'
    );
    expect(problem.title).toBe('Configuration Error');
    expect(problem.status).toBe(500);
    expect(problem.code).toBe('E_CONFIG_ISSUER_ALLOWLIST_REQUIRED');
  });

  it('should create replay protection required error', () => {
    const problem = createProblemDetails(ErrorCodes.TAP_REPLAY_PROTECTION_REQUIRED);

    expect(problem.type).toBe(
      'https://www.peacprotocol.org/problems/tap_replay_protection_required'
    );
    expect(problem.title).toBe('Replay Protection Required');
    expect(problem.status).toBe(401);
    expect(problem.code).toBe('E_TAP_REPLAY_PROTECTION_REQUIRED');
  });

  it('should sanitize sensitive data in detail', () => {
    const problem = createProblemDetails(
      ErrorCodes.TAP_SIGNATURE_INVALID,
      'Failed to verify sig1=:dGVzdHNpZ25hdHVyZQ==:'
    );

    expect(problem.detail).toBe('Failed to verify sig1:[REDACTED]:');
    expect(problem.detail).not.toContain('dGVzdHNpZ25hdHVyZQ==');
  });

  it('should sanitize PEM keys in detail', () => {
    const problem = createProblemDetails(
      ErrorCodes.INTERNAL_ERROR,
      'Key error: -----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBg...\n-----END PRIVATE KEY-----'
    );

    expect(problem.detail).toBe('Key error: [REDACTED KEY]');
    expect(problem.detail).not.toContain('MIIEvgIBADANBg');
  });
});

describe('createErrorResponse', () => {
  it('should create Response with application/problem+json', async () => {
    const response = createErrorResponse(ErrorCodes.TAP_SIGNATURE_INVALID, 'Invalid signature');

    expect(response.status).toBe(401);
    expect(response.headers.get('Content-Type')).toBe('application/problem+json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const body = (await response.json()) as ProblemDetails;
    expect(body.type).toBe('https://www.peacprotocol.org/problems/tap_signature_invalid');
    expect(body.code).toBe('E_TAP_SIGNATURE_INVALID');
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
    expect(body.type).toBe('https://www.peacprotocol.org/problems/receipt_missing');
    expect(body.title).toBe('Payment Required');
    expect(body.code).toBe('E_RECEIPT_MISSING');
    expect(body.instance).toBe('https://api.example.com/resource');
  });
});
