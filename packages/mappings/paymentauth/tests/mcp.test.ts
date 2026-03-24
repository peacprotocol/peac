/**
 * Tests for paymentauth MCP-specific helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  extractCredentialFromMcpMeta,
  extractReceiptFromMcpMeta,
  extractPaymentauthCapability,
  MCP_META_CREDENTIAL,
  MCP_META_RECEIPT,
} from '../src/index.js';

describe('extractCredentialFromMcpMeta', () => {
  it('should extract credential from _meta', () => {
    const meta = { [MCP_META_CREDENTIAL]: 'cred_value_123' };
    expect(extractCredentialFromMcpMeta(meta)).toBe('cred_value_123');
  });

  it('should return null when key absent', () => {
    expect(extractCredentialFromMcpMeta({})).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(extractCredentialFromMcpMeta({ [MCP_META_CREDENTIAL]: '' })).toBeNull();
  });

  it('should return null for non-string value', () => {
    expect(extractCredentialFromMcpMeta({ [MCP_META_CREDENTIAL]: 42 })).toBeNull();
  });

  it('should coexist with PEAC _meta keys', () => {
    const meta = {
      [MCP_META_CREDENTIAL]: 'paymentauth_cred',
      'org.peacprotocol/receipt_ref': 'sha256:abc',
      'org.peacprotocol/receipt_jws': 'eyJ...',
    };
    expect(extractCredentialFromMcpMeta(meta)).toBe('paymentauth_cred');
  });
});

describe('extractReceiptFromMcpMeta', () => {
  it('should extract receipt from _meta', () => {
    const meta = { [MCP_META_RECEIPT]: 'receipt_value_456' };
    expect(extractReceiptFromMcpMeta(meta)).toBe('receipt_value_456');
  });

  it('should return null when key absent', () => {
    expect(extractReceiptFromMcpMeta({})).toBeNull();
  });
});

describe('extractPaymentauthCapability', () => {
  it('should extract payment capability', () => {
    const capabilities = {
      experimental: {
        payment: {
          supported: true,
          methods: ['stripe', 'lightning'],
          intents: ['charge', 'session'],
        },
      },
    };

    const result = extractPaymentauthCapability(capabilities);

    expect(result).not.toBeNull();
    expect(result!.supported).toBe(true);
    expect(result!.methods).toEqual(['stripe', 'lightning']);
    expect(result!.intents).toEqual(['charge', 'session']);
  });

  it('should return null when experimental absent', () => {
    expect(extractPaymentauthCapability({})).toBeNull();
  });

  it('should return null when payment absent', () => {
    expect(extractPaymentauthCapability({ experimental: {} })).toBeNull();
  });

  it('should handle missing optional arrays', () => {
    const capabilities = {
      experimental: { payment: { supported: true } },
    };

    const result = extractPaymentauthCapability(capabilities);
    expect(result!.supported).toBe(true);
    expect(result!.methods).toBeUndefined();
    expect(result!.intents).toBeUndefined();
  });

  it('should filter non-string method entries', () => {
    const capabilities = {
      experimental: {
        payment: { supported: true, methods: ['valid', 42, null, 'also-valid'] },
      },
    };

    const result = extractPaymentauthCapability(capabilities);
    expect(result!.methods).toEqual(['valid', 'also-valid']);
  });
});
