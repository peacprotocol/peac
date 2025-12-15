import { describe, it, expect } from 'vitest';
import { isExpired, isCreatedInFuture, verifySignature } from '../src/verify.js';
import { ErrorCodes } from '../src/errors.js';
import type { SignatureRequest, KeyResolver } from '../src/types.js';

describe('isExpired', () => {
  it('returns false when no expires', () => {
    expect(
      isExpired({ keyid: '', alg: '', created: 100, coveredComponents: [] }, 200)
    ).toBe(false);
  });

  it('returns false when not expired', () => {
    expect(
      isExpired(
        { keyid: '', alg: '', created: 100, expires: 300, coveredComponents: [] },
        200
      )
    ).toBe(false);
  });

  it('returns true when expired', () => {
    expect(
      isExpired(
        { keyid: '', alg: '', created: 100, expires: 150, coveredComponents: [] },
        200
      )
    ).toBe(true);
  });
});

describe('isCreatedInFuture', () => {
  it('returns false when created is in past', () => {
    expect(
      isCreatedInFuture(
        { keyid: '', alg: '', created: 100, coveredComponents: [] },
        200,
        60
      )
    ).toBe(false);
  });

  it('returns false when within skew tolerance', () => {
    expect(
      isCreatedInFuture(
        { keyid: '', alg: '', created: 250, coveredComponents: [] },
        200,
        60
      )
    ).toBe(false);
  });

  it('returns true when beyond skew tolerance', () => {
    expect(
      isCreatedInFuture(
        { keyid: '', alg: '', created: 300, coveredComponents: [] },
        200,
        60
      )
    ).toBe(true);
  });
});

describe('verifySignature', () => {
  const mockRequest: SignatureRequest = {
    method: 'GET',
    url: 'https://example.com/api/resource',
    headers: {
      'signature-input': 'sig1=("@method");created=1618884473;keyid="test-key";alg="ed25519"',
      'signature': 'sig1=:dGVzdA==:',
    },
  };

  it('rejects unsupported algorithm', async () => {
    const request: SignatureRequest = {
      ...mockRequest,
      headers: {
        'signature-input': 'sig1=("@method");created=1618884473;keyid="test-key";alg="rsa-sha256"',
        'signature': 'sig1=:dGVzdA==:',
      },
    };

    const keyResolver: KeyResolver = async () => async () => true;
    const result = await verifySignature(request, { keyResolver });

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(ErrorCodes.SIGNATURE_ALGORITHM_UNSUPPORTED);
  });

  it('rejects expired signature', async () => {
    const request: SignatureRequest = {
      ...mockRequest,
      headers: {
        'signature-input': 'sig1=("@method");created=100;expires=150;keyid="test-key";alg="ed25519"',
        'signature': 'sig1=:dGVzdA==:',
      },
    };

    const keyResolver: KeyResolver = async () => async () => true;
    const result = await verifySignature(request, { keyResolver, now: 200 });

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(ErrorCodes.SIGNATURE_EXPIRED);
  });

  it('rejects future signature', async () => {
    const request: SignatureRequest = {
      ...mockRequest,
      headers: {
        'signature-input': 'sig1=("@method");created=500;keyid="test-key";alg="ed25519"',
        'signature': 'sig1=:dGVzdA==:',
      },
    };

    const keyResolver: KeyResolver = async () => async () => true;
    const result = await verifySignature(request, { keyResolver, now: 200, clockSkewSeconds: 60 });

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(ErrorCodes.SIGNATURE_FUTURE);
  });

  it('rejects when key not found', async () => {
    const keyResolver: KeyResolver = async () => null;
    const result = await verifySignature(mockRequest, { keyResolver, now: 1618884473 });

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(ErrorCodes.KEY_NOT_FOUND);
  });

  it('verifies with mock verifier', async () => {
    const keyResolver: KeyResolver = async () => async () => true;
    const result = await verifySignature(mockRequest, { keyResolver, now: 1618884473 });

    expect(result.valid).toBe(true);
    expect(result.signature).toBeDefined();
    expect(result.signature?.params.keyid).toBe('test-key');
  });

  it('rejects invalid signature', async () => {
    const keyResolver: KeyResolver = async () => async () => false;
    const result = await verifySignature(mockRequest, { keyResolver, now: 1618884473 });

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe(ErrorCodes.SIGNATURE_INVALID);
  });
});
