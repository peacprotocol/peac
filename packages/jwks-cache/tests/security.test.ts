import { describe, it, expect } from 'vitest';
import { validateUrl, isMetadataIp } from '../src/security.js';
import { JwksError, ErrorCodes } from '../src/errors.js';

describe('validateUrl', () => {
  it('accepts valid HTTPS URLs', () => {
    expect(() => validateUrl('https://example.com/.well-known/jwks')).not.toThrow();
    expect(() => validateUrl('https://auth.example.com/keys')).not.toThrow();
  });

  it('rejects HTTP URLs', () => {
    expect(() => validateUrl('http://example.com/.well-known/jwks')).toThrow(JwksError);
  });

  it('allows HTTP localhost when enabled', () => {
    expect(() => validateUrl('http://localhost:3000/jwks', { allowLocalhost: true })).not.toThrow();
  });

  it('rejects localhost by default', () => {
    expect(() => validateUrl('https://localhost/.well-known/jwks')).toThrow(JwksError);
    expect(() => validateUrl('https://127.0.0.1/.well-known/jwks')).toThrow(JwksError);
  });

  it('allows localhost when enabled', () => {
    expect(() =>
      validateUrl('https://localhost/.well-known/jwks', { allowLocalhost: true })
    ).not.toThrow();
  });

  it('rejects literal IP addresses', () => {
    expect(() => validateUrl('https://192.168.1.1/.well-known/jwks')).toThrow(JwksError);
    expect(() => validateUrl('https://10.0.0.1/.well-known/jwks')).toThrow(JwksError);
    expect(() => validateUrl('https://[::1]/.well-known/jwks')).toThrow(JwksError);
  });

  it('respects allowlist callback', () => {
    const isAllowed = (host: string) => host === 'allowed.example.com';

    expect(() =>
      validateUrl('https://allowed.example.com/jwks', { isAllowedHost: isAllowed })
    ).not.toThrow();

    expect(() =>
      validateUrl('https://blocked.example.com/jwks', { isAllowedHost: isAllowed })
    ).toThrow(JwksError);
  });

  it('rejects invalid URLs', () => {
    expect(() => validateUrl('not-a-url')).toThrow(JwksError);
    expect(() => validateUrl('')).toThrow(JwksError);
  });
});

describe('isMetadataIp', () => {
  it('detects AWS metadata IP', () => {
    expect(isMetadataIp('169.254.169.254')).toBe(true);
  });

  it('detects link-local range', () => {
    expect(isMetadataIp('169.254.1.1')).toBe(true);
  });

  it('does not match regular IPs', () => {
    expect(isMetadataIp('192.168.1.1')).toBe(false);
    expect(isMetadataIp('10.0.0.1')).toBe(false);
  });
});
