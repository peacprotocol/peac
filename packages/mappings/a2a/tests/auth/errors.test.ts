import { describe, it, expect } from 'vitest';
import { GrpcStatusCode, createA2AAuthStatus } from '../../src/auth/errors';
import type { A2AAuthErrorCode, GrpcStatus } from '../../src/auth/errors';

describe('GrpcStatusCode', () => {
  it('maps UNAUTHENTICATED to 16', () => {
    expect(GrpcStatusCode.UNAUTHENTICATED).toBe(16);
  });

  it('maps PERMISSION_DENIED to 7', () => {
    expect(GrpcStatusCode.PERMISSION_DENIED).toBe(7);
  });

  it('maps INVALID_ARGUMENT to 3', () => {
    expect(GrpcStatusCode.INVALID_ARGUMENT).toBe(3);
  });

  it('maps UNAVAILABLE to 14', () => {
    expect(GrpcStatusCode.UNAVAILABLE).toBe(14);
  });
});

describe('createA2AAuthStatus()', () => {
  it('returns google.rpc.Status shape with code, message, and details', () => {
    const status = createA2AAuthStatus('PKCE_MISMATCH');
    expect(status.code).toBe(GrpcStatusCode.UNAUTHENTICATED);
    expect(status.message).toBe('PKCE code challenge verification failed');
    expect(status.details).toHaveLength(1);
  });

  it('includes google.rpc.ErrorInfo in details with correct @type', () => {
    const status = createA2AAuthStatus('TOKEN_EXCHANGE_FAILED');
    const errorInfo = status.details[0];
    expect(errorInfo['@type']).toBe('type.googleapis.com/google.rpc.ErrorInfo');
    expect(errorInfo.reason).toBe('TOKEN_EXCHANGE_FAILED');
    expect(errorInfo.domain).toBe('a2a-protocol.org');
  });

  it('includes metadata in ErrorInfo when provided', () => {
    const status = createA2AAuthStatus('INVALID_AUTH_CODE', {
      authorization_server: 'https://auth.example.com',
      grant_type: 'authorization_code',
    });
    expect(status.details[0].metadata).toEqual({
      authorization_server: 'https://auth.example.com',
      grant_type: 'authorization_code',
    });
  });

  it('uses empty metadata when none provided', () => {
    const status = createA2AAuthStatus('SCOPE_DENIED');
    expect(status.details[0].metadata).toEqual({});
  });

  it('maps PKCE_INVALID_VERIFIER to INVALID_ARGUMENT', () => {
    const status = createA2AAuthStatus('PKCE_INVALID_VERIFIER');
    expect(status.code).toBe(GrpcStatusCode.INVALID_ARGUMENT);
  });

  it('maps AUTH_SERVER_UNAVAILABLE to UNAVAILABLE', () => {
    const status = createA2AAuthStatus('AUTH_SERVER_UNAVAILABLE');
    expect(status.code).toBe(GrpcStatusCode.UNAVAILABLE);
  });

  it('maps INVALID_CLIENT to PERMISSION_DENIED', () => {
    const status = createA2AAuthStatus('INVALID_CLIENT');
    expect(status.code).toBe(GrpcStatusCode.PERMISSION_DENIED);
  });

  it('maps DEVICE_CODE_EXPIRED to UNAUTHENTICATED', () => {
    const status = createA2AAuthStatus('DEVICE_CODE_EXPIRED');
    expect(status.code).toBe(GrpcStatusCode.UNAUTHENTICATED);
    expect(status.details[0].reason).toBe('DEVICE_CODE_EXPIRED');
  });

  it('produces correct shape for all error codes', () => {
    const codes: A2AAuthErrorCode[] = [
      'PKCE_MISMATCH',
      'PKCE_INVALID_VERIFIER',
      'TOKEN_EXCHANGE_FAILED',
      'AUTH_SERVER_UNAVAILABLE',
      'INVALID_AUTH_CODE',
      'INVALID_CLIENT',
      'SCOPE_DENIED',
      'DEVICE_CODE_EXPIRED',
    ];
    for (const code of codes) {
      const status: GrpcStatus = createA2AAuthStatus(code);
      expect(typeof status.code).toBe('number');
      expect(typeof status.message).toBe('string');
      expect(status.message.length).toBeGreaterThan(0);
      expect(status.details).toHaveLength(1);
      expect(status.details[0]['@type']).toBe('type.googleapis.com/google.rpc.ErrorInfo');
      expect(status.details[0].domain).toBe('a2a-protocol.org');
      expect(typeof status.details[0].reason).toBe('string');
    }
  });
});
