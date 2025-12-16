/**
 * Tests for configuration utilities.
 */

import { describe, it, expect } from 'vitest';
import { parseConfig, matchesBypassPath, isIssuerAllowed } from '../src/config.js';
import type { Env } from '../src/types.js';

describe('parseConfig', () => {
  it('should parse empty environment', () => {
    const env: Env = {};
    const config = parseConfig(env);

    expect(config.issuerAllowlist).toEqual([]);
    expect(config.bypassPaths).toEqual([]);
    expect(config.allowUnknownTags).toBe(false);
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

  it('should parse allowUnknownTags as true', () => {
    const env: Env = {
      ALLOW_UNKNOWN_TAGS: 'true',
    };
    const config = parseConfig(env);

    expect(config.allowUnknownTags).toBe(true);
  });

  it('should parse allowUnknownTags variations', () => {
    expect(parseConfig({ ALLOW_UNKNOWN_TAGS: '1' }).allowUnknownTags).toBe(true);
    expect(parseConfig({ ALLOW_UNKNOWN_TAGS: 'yes' }).allowUnknownTags).toBe(true);
    expect(parseConfig({ ALLOW_UNKNOWN_TAGS: 'TRUE' }).allowUnknownTags).toBe(true);
    expect(parseConfig({ ALLOW_UNKNOWN_TAGS: 'false' }).allowUnknownTags).toBe(false);
    expect(parseConfig({ ALLOW_UNKNOWN_TAGS: 'no' }).allowUnknownTags).toBe(false);
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
  it('should allow any issuer when allowlist is empty', () => {
    expect(isIssuerAllowed('https://any.example.com', [])).toBe(true);
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
