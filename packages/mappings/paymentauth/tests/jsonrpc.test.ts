/**
 * Tests for paymentauth JSON-RPC transport helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  isPaymentRequiredError,
  isVerificationFailedError,
  parsePaymentauthFromJsonRpcError,
  parsePaymentauthFromJsonRpcResult,
  JSONRPC_PAYMENT_REQUIRED,
  JSONRPC_VERIFICATION_FAILED,
} from '../src/index.js';

describe('isPaymentRequiredError', () => {
  it('should detect -32042', () => {
    expect(isPaymentRequiredError({ code: JSONRPC_PAYMENT_REQUIRED })).toBe(true);
  });

  it('should reject other codes', () => {
    expect(isPaymentRequiredError({ code: -32600 })).toBe(false);
    expect(isPaymentRequiredError({ code: JSONRPC_VERIFICATION_FAILED })).toBe(false);
  });
});

describe('isVerificationFailedError', () => {
  it('should detect -32043', () => {
    expect(isVerificationFailedError({ code: JSONRPC_VERIFICATION_FAILED })).toBe(true);
  });

  it('should reject other codes', () => {
    expect(isVerificationFailedError({ code: JSONRPC_PAYMENT_REQUIRED })).toBe(false);
  });
});

describe('parsePaymentauthFromJsonRpcError', () => {
  it('should extract challenge from string data', () => {
    const error = {
      code: JSONRPC_PAYMENT_REQUIRED,
      data: 'Payment id="abc", realm="api.com", method="m", intent="charge", request="ewo"',
    };

    const result = parsePaymentauthFromJsonRpcError(error);
    expect(result).not.toBeNull();
    expect(result!.params.id).toBe('abc');
  });

  it('should extract challenge from structured data', () => {
    const error = {
      code: JSONRPC_PAYMENT_REQUIRED,
      data: { id: 'abc', realm: 'api.com', method: 'm', intent: 'charge', request: 'ewo' },
    };

    const result = parsePaymentauthFromJsonRpcError(error);
    expect(result).not.toBeNull();
    expect(result!.params.id).toBe('abc');
  });

  it('should return null for non-payment-required errors', () => {
    expect(parsePaymentauthFromJsonRpcError({ code: -32600 })).toBeNull();
  });

  it('should return null when data is absent', () => {
    expect(parsePaymentauthFromJsonRpcError({ code: JSONRPC_PAYMENT_REQUIRED })).toBeNull();
  });
});

describe('parsePaymentauthFromJsonRpcResult', () => {
  it('should return null for non-object result', () => {
    expect(parsePaymentauthFromJsonRpcResult(null)).toBeNull();
    expect(parsePaymentauthFromJsonRpcResult('string')).toBeNull();
  });

  it('should return null when receipt field is absent', () => {
    expect(parsePaymentauthFromJsonRpcResult({ data: 'test' })).toBeNull();
  });

  it('should return null when receipt is not a string', () => {
    expect(parsePaymentauthFromJsonRpcResult({ receipt: 42 })).toBeNull();
  });
});
