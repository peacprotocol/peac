/**
 * @peac/worker-core - Response building tests
 */

import { describe, it, expect } from 'vitest';
import { buildErrorResponse, buildChallengeResponse } from '../src/response.js';
import { ErrorCodes } from '../src/errors.js';

describe('buildErrorResponse', () => {
  it('should build 401 response with WWW-Authenticate header', () => {
    const response = buildErrorResponse(
      ErrorCodes.TAP_SIGNATURE_MISSING,
      'TAP signature headers are required.'
    );

    expect(response.status).toBe(401);
    expect(response.headers['Content-Type']).toBe('application/problem+json');
    expect(response.headers['WWW-Authenticate']).toBe(
      'PEAC realm="peac", error="E_TAP_SIGNATURE_MISSING", error_uri="https://peacprotocol.org/problems/E_TAP_SIGNATURE_MISSING"'
    );
    expect(response.body.type).toBe('https://peacprotocol.org/problems/E_TAP_SIGNATURE_MISSING');
    expect(response.body.status).toBe(401);
  });

  it('should build 402 response with WWW-Authenticate header', () => {
    const response = buildErrorResponse(
      ErrorCodes.RECEIPT_MISSING,
      'A valid PEAC receipt is required.'
    );

    expect(response.status).toBe(402);
    expect(response.headers['WWW-Authenticate']).toBe(
      'PEAC realm="peac", error="E_RECEIPT_MISSING", error_uri="https://peacprotocol.org/problems/E_RECEIPT_MISSING"'
    );
  });

  it('should build 403 response without WWW-Authenticate header', () => {
    const response = buildErrorResponse(ErrorCodes.ISSUER_NOT_ALLOWED, 'Issuer not in allowlist');

    expect(response.status).toBe(403);
    expect(response.headers['WWW-Authenticate']).toBeUndefined();
    expect(response.headers['Content-Type']).toBe('application/problem+json');
  });

  it('should build 400 response without WWW-Authenticate header', () => {
    const response = buildErrorResponse(ErrorCodes.TAP_TAG_UNKNOWN, 'Unknown TAP tag');

    expect(response.status).toBe(400);
    expect(response.headers['WWW-Authenticate']).toBeUndefined();
  });

  it('should build 409 response without WWW-Authenticate header', () => {
    const response = buildErrorResponse(ErrorCodes.TAP_NONCE_REPLAY, 'Nonce replay detected');

    expect(response.status).toBe(409);
    expect(response.headers['WWW-Authenticate']).toBeUndefined();
  });

  it('should build 500 response without WWW-Authenticate header', () => {
    const response = buildErrorResponse(
      ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED,
      'ISSUER_ALLOWLIST is required'
    );

    expect(response.status).toBe(500);
    expect(response.headers['WWW-Authenticate']).toBeUndefined();
  });

  it('should include instance when request URL provided', () => {
    const response = buildErrorResponse(
      ErrorCodes.TAP_SIGNATURE_MISSING,
      'TAP signature headers are required.',
      'https://example.com/api/resource'
    );

    expect(response.body.instance).toBe('https://example.com/api/resource');
  });
});

describe('buildChallengeResponse', () => {
  it('should build 402 challenge response', () => {
    const response = buildChallengeResponse('A valid PEAC receipt is required.');

    expect(response.status).toBe(402);
    expect(response.headers['Content-Type']).toBe('application/problem+json');
    expect(response.headers['WWW-Authenticate']).toBe(
      'PEAC realm="peac", error="E_RECEIPT_MISSING", error_uri="https://peacprotocol.org/problems/E_RECEIPT_MISSING"'
    );
    expect(response.body.type).toBe('https://peacprotocol.org/problems/E_RECEIPT_MISSING');
    expect(response.body.status).toBe(402);
  });

  it('should include instance in challenge response', () => {
    const response = buildChallengeResponse(
      'A valid PEAC receipt is required.',
      'https://example.com/api/resource'
    );

    expect(response.body.instance).toBe('https://example.com/api/resource');
  });
});
