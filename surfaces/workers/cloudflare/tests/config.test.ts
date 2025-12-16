/**
 * Tests for configuration utilities.
 */

import { describe, it, expect } from 'vitest';
import { parseConfig, matchesBypassPath, isIssuerAllowed } from '../src/config.js';
import type { Env } from '../src/types.js';

describe('parseConfig', () => {
  it('should parse empty environment with fail-closed defaults', () => {
    const env: Env = {};
    const config = parseConfig(env);

    expect(config.issuerAllowlist).toEqual([]);
    expect(config.bypassPaths).toEqual([]);
    // All UNSAFE_* flags default to false (fail-closed)
    expect(config.unsafeAllowAnyIssuer).toBe(false);
    expect(config.unsafeAllowUnknownTags).toBe(false);
    expect(config.unsafeAllowNoReplay).toBe(false);
  });

  it('should parse issuer allowlist', () => {
    const env: Env = {
      ISSUER_ALLOWLIST: 'https://issuer1.example.com, https://issuer2.example.com',
    };
    const config = parseConfig(env);

    expect(config.issuerAllowlist).toEqual([
      'https://issuer1.example.com',
      'https://issuer2.example.com',
    ]);
  });

  it('should parse bypass paths', () => {
    const env: Env = {
      BYPASS_PATHS: '/.well-known/*,/health,/api/public/*',
    };
    const config = parseConfig(env);

    expect(config.bypassPaths).toEqual(['/.well-known/*', '/health', '/api/public/*']);
  });

  it('should parse UNSAFE_ALLOW_ANY_ISSUER', () => {
    expect(parseConfig({ UNSAFE_ALLOW_ANY_ISSUER: 'true' }).unsafeAllowAnyIssuer).toBe(true);
    expect(parseConfig({ UNSAFE_ALLOW_ANY_ISSUER: '1' }).unsafeAllowAnyIssuer).toBe(true);
    expect(parseConfig({ UNSAFE_ALLOW_ANY_ISSUER: 'false' }).unsafeAllowAnyIssuer).toBe(false);
    expect(parseConfig({}).unsafeAllowAnyIssuer).toBe(false);
  });

  it('should parse UNSAFE_ALLOW_UNKNOWN_TAGS', () => {
    expect(parseConfig({ UNSAFE_ALLOW_UNKNOWN_TAGS: 'true' }).unsafeAllowUnknownTags).toBe(true);
    expect(parseConfig({ UNSAFE_ALLOW_UNKNOWN_TAGS: '1' }).unsafeAllowUnknownTags).toBe(true);
    expect(parseConfig({ UNSAFE_ALLOW_UNKNOWN_TAGS: 'yes' }).unsafeAllowUnknownTags).toBe(true);
    expect(parseConfig({ UNSAFE_ALLOW_UNKNOWN_TAGS: 'false' }).unsafeAllowUnknownTags).toBe(false);
    expect(parseConfig({}).unsafeAllowUnknownTags).toBe(false);
  });

  it('should parse UNSAFE_ALLOW_NO_REPLAY', () => {
    expect(parseConfig({ UNSAFE_ALLOW_NO_REPLAY: 'true' }).unsafeAllowNoReplay).toBe(true);
    expect(parseConfig({ UNSAFE_ALLOW_NO_REPLAY: '1' }).unsafeAllowNoReplay).toBe(true);
    expect(parseConfig({ UNSAFE_ALLOW_NO_REPLAY: 'false' }).unsafeAllowNoReplay).toBe(false);
    expect(parseConfig({}).unsafeAllowNoReplay).toBe(false);
  });
});

describe('matchesBypassPath', () => {
  it('should match exact paths', () => {
    expect(matchesBypassPath('/health', ['/health'])).toBe(true);
    expect(matchesBypassPath('/api/health', ['/health'])).toBe(false);
  });

  it('should match glob patterns with *', () => {
    expect(matchesBypassPath('/.well-known/jwks', ['/.well-known/*'])).toBe(true);
    expect(matchesBypassPath('/.well-known/peac.txt', ['/.well-known/*'])).toBe(true);
    expect(matchesBypassPath('/.well-known/nested/path', ['/.well-known/*'])).toBe(false);
  });

  it('should match multiple patterns', () => {
    const patterns = ['/health', '/ready', '/.well-known/*'];
    expect(matchesBypassPath('/health', patterns)).toBe(true);
    expect(matchesBypassPath('/ready', patterns)).toBe(true);
    expect(matchesBypassPath('/.well-known/jwks', patterns)).toBe(true);
    expect(matchesBypassPath('/api/v1', patterns)).toBe(false);
  });

  it('should return false for empty patterns', () => {
    expect(matchesBypassPath('/anything', [])).toBe(false);
  });
});

describe('isIssuerAllowed', () => {
  it('should return false when allowlist is empty (fail-closed)', () => {
    // Empty allowlist = fail-closed (handler should check UNSAFE_ALLOW_ANY_ISSUER separately)
    expect(isIssuerAllowed('https://any.example.com', [])).toBe(false);
  });

  it('should check issuer against allowlist', () => {
    const allowlist = ['https://trusted.example.com', 'https://another.example.com'];

    expect(isIssuerAllowed('https://trusted.example.com', allowlist)).toBe(true);
    expect(isIssuerAllowed('https://another.example.com', allowlist)).toBe(true);
    expect(isIssuerAllowed('https://untrusted.example.com', allowlist)).toBe(false);
  });

  it('should normalize to origin', () => {
    const allowlist = ['https://trusted.example.com'];

    expect(isIssuerAllowed('https://trusted.example.com/path/to/key', allowlist)).toBe(true);
    expect(isIssuerAllowed('https://trusted.example.com:443', allowlist)).toBe(true);
    expect(isIssuerAllowed('https://trusted.example.com:8443', allowlist)).toBe(false);
  });

  it('should handle invalid URLs', () => {
    expect(isIssuerAllowed('not-a-url', ['https://example.com'])).toBe(false);
  });
});
