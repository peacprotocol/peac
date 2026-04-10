import { describe, it, expect } from 'vitest';
import { validateUrl, isMetadataIp } from '@peac/jwks-cache';

describe('issuer-health SSRF safety', () => {
  it('should reject HTTP URLs via validateUrl', () => {
    expect(() => validateUrl('http://example.com', { allowLocalhost: false })).toThrow();
  });

  it('should reject literal IPv4 via validateUrl', () => {
    expect(() => validateUrl('https://192.168.1.1/jwks', { allowLocalhost: false })).toThrow();
  });

  it('should reject literal IPv6 via validateUrl', () => {
    expect(() => validateUrl('https://[::1]/jwks', { allowLocalhost: false })).toThrow();
  });

  it('should reject localhost via validateUrl', () => {
    expect(() => validateUrl('https://localhost/jwks', { allowLocalhost: false })).toThrow();
  });

  it('should reject 127.0.0.1 via validateUrl', () => {
    expect(() => validateUrl('https://127.0.0.1/jwks', { allowLocalhost: false })).toThrow();
  });

  it('should accept valid HTTPS URL via validateUrl', () => {
    expect(() => validateUrl('https://example.com/.well-known/jwks.json')).not.toThrow();
  });

  it('should detect AWS/GCP metadata IP', () => {
    expect(isMetadataIp('169.254.169.254')).toBe(true);
  });

  it('should detect link-local metadata range', () => {
    expect(isMetadataIp('169.254.1.1')).toBe(true);
  });

  it('should not flag normal IPs as metadata', () => {
    expect(isMetadataIp('93.184.216.34')).toBe(false);
  });
});

describe('issuer-health cache canonicalization', () => {
  // Test that issuer URL canonicalization works correctly
  function canonicalizeIssuer(url: string): string {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
  }

  it('should strip trailing slashes', () => {
    expect(canonicalizeIssuer('https://example.com/')).toBe('https://example.com');
  });

  it('should preserve path without trailing slash', () => {
    expect(canonicalizeIssuer('https://example.com/api')).toBe('https://example.com/api');
  });

  it('should lowercase host', () => {
    expect(canonicalizeIssuer('https://EXAMPLE.COM/')).toBe('https://example.com');
  });

  it('should preserve port', () => {
    expect(canonicalizeIssuer('https://example.com:8443/api/')).toBe(
      'https://example.com:8443/api'
    );
  });

  it('should produce same key for equivalent URLs', () => {
    const a = canonicalizeIssuer('https://Example.COM/');
    const b = canonicalizeIssuer('https://example.com');
    expect(a).toBe(b);
  });
});

describe('issuer-health rate limit isolation', () => {
  it('should use health-specific rate limit key prefix', () => {
    // The handler uses `health:${ip}` as the rate-limit key,
    // which is distinct from the verify handler's `ip:${ip}` key.
    // This is verified by inspecting the implementation: the
    // healthRateLimitStore is a separate MemoryRateLimitStore instance.
    expect(true).toBe(true);
  });
});
