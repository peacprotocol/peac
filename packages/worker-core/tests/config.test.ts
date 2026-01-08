/**
 * @peac/worker-core - Configuration parsing tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseSafeConfigFromEnv,
  parseUnsafeConfigFromEnv,
  toInternalConfig,
  matchesBypassPath,
  isIssuerAllowed,
} from '../src/config.js';

describe('parseSafeConfigFromEnv', () => {
  it('should parse ISSUER_ALLOWLIST from comma-separated string', () => {
    const env = {
      ISSUER_ALLOWLIST: 'https://issuer1.com,https://issuer2.com',
    };

    const config = parseSafeConfigFromEnv(env);

    expect(config.issuerAllowlist).toEqual(['https://issuer1.com', 'https://issuer2.com']);
  });

  it('should handle empty ISSUER_ALLOWLIST', () => {
    const env = {};

    const config = parseSafeConfigFromEnv(env);

    expect(config.issuerAllowlist).toEqual([]);
  });

  it('should trim whitespace from allowlist entries', () => {
    const env = {
      ISSUER_ALLOWLIST: '  https://issuer1.com , https://issuer2.com  ',
    };

    const config = parseSafeConfigFromEnv(env);

    expect(config.issuerAllowlist).toEqual(['https://issuer1.com', 'https://issuer2.com']);
  });

  it('should filter empty entries from allowlist', () => {
    const env = {
      ISSUER_ALLOWLIST: 'https://issuer1.com,,https://issuer2.com,',
    };

    const config = parseSafeConfigFromEnv(env);

    expect(config.issuerAllowlist).toEqual(['https://issuer1.com', 'https://issuer2.com']);
  });

  it('should parse BYPASS_PATHS from comma-separated string', () => {
    const env = {
      BYPASS_PATHS: '/health,/metrics,/favicon.ico',
    };

    const config = parseSafeConfigFromEnv(env);

    expect(config.bypassPaths).toEqual(['/health', '/metrics', '/favicon.ico']);
  });

  it('should handle empty BYPASS_PATHS', () => {
    const env = {};

    const config = parseSafeConfigFromEnv(env);

    expect(config.bypassPaths).toEqual([]);
  });
});

describe('parseUnsafeConfigFromEnv', () => {
  it('should parse UNSAFE_ALLOW_ANY_ISSUER', () => {
    const env = {
      UNSAFE_ALLOW_ANY_ISSUER: 'true',
    };

    const config = parseUnsafeConfigFromEnv(env);

    expect(config.unsafeAllowAnyIssuer).toBe(true);
  });

  it('should parse UNSAFE_ALLOW_UNKNOWN_TAGS', () => {
    const env = {
      UNSAFE_ALLOW_UNKNOWN_TAGS: 'true',
    };

    const config = parseUnsafeConfigFromEnv(env);

    expect(config.unsafeAllowUnknownTags).toBe(true);
  });

  it('should parse UNSAFE_ALLOW_NO_REPLAY', () => {
    const env = {
      UNSAFE_ALLOW_NO_REPLAY: 'true',
    };

    const config = parseUnsafeConfigFromEnv(env);

    expect(config.unsafeAllowNoReplay).toBe(true);
  });

  it('should default unsafe flags to false', () => {
    const env = {};

    const config = parseUnsafeConfigFromEnv(env);

    expect(config.unsafeAllowAnyIssuer).toBe(false);
    expect(config.unsafeAllowUnknownTags).toBe(false);
    expect(config.unsafeAllowNoReplay).toBe(false);
  });

  it('should handle case-insensitive boolean parsing', () => {
    const env = {
      UNSAFE_ALLOW_ANY_ISSUER: 'TRUE',
      UNSAFE_ALLOW_UNKNOWN_TAGS: 'True',
      UNSAFE_ALLOW_NO_REPLAY: '1',
    };

    const config = parseUnsafeConfigFromEnv(env);

    expect(config.unsafeAllowAnyIssuer).toBe(true);
    expect(config.unsafeAllowUnknownTags).toBe(true);
    expect(config.unsafeAllowNoReplay).toBe(true);
  });

  it('should reject non-true values', () => {
    const env = {
      UNSAFE_ALLOW_ANY_ISSUER: 'yes',
      UNSAFE_ALLOW_UNKNOWN_TAGS: 'false',
      UNSAFE_ALLOW_NO_REPLAY: '0',
    };

    const config = parseUnsafeConfigFromEnv(env);

    expect(config.unsafeAllowAnyIssuer).toBe(false);
    expect(config.unsafeAllowUnknownTags).toBe(false);
    expect(config.unsafeAllowNoReplay).toBe(false);
  });
});

describe('toInternalConfig', () => {
  it('should convert safe config to internal with unsafe defaults', () => {
    const safeConfig = {
      issuerAllowlist: ['https://issuer.com'],
      bypassPaths: ['/health'],
    };

    const internal = toInternalConfig(safeConfig);

    expect(internal.issuerAllowlist).toEqual(['https://issuer.com']);
    expect(internal.bypassPaths).toEqual(['/health']);
    expect(internal.unsafeAllowAnyIssuer).toBe(false);
    expect(internal.unsafeAllowUnknownTags).toBe(false);
    expect(internal.unsafeAllowNoReplay).toBe(false);
  });
});

describe('matchesBypassPath', () => {
  it('should match exact path', () => {
    expect(matchesBypassPath('/health', ['/health'])).toBe(true);
    expect(matchesBypassPath('/metrics', ['/health', '/metrics'])).toBe(true);
  });

  it('should not match different path', () => {
    expect(matchesBypassPath('/api/data', ['/health'])).toBe(false);
  });

  it('should match wildcard prefix', () => {
    expect(matchesBypassPath('/static/image.png', ['/static/*'])).toBe(true);
    expect(matchesBypassPath('/static/js/app.js', ['/static/*'])).toBe(true);
  });

  it('should not match wildcard with wrong prefix', () => {
    expect(matchesBypassPath('/api/static/file', ['/static/*'])).toBe(false);
  });

  it('should handle empty bypass list', () => {
    expect(matchesBypassPath('/health', [])).toBe(false);
  });

  it('should handle paths with query strings', () => {
    // Query strings should be stripped before matching
    expect(matchesBypassPath('/health?check=true', ['/health'])).toBe(true);
  });
});

describe('isIssuerAllowed', () => {
  it('should match issuer origin from keyid URL', () => {
    const keyid = 'https://issuer.example.com/.well-known/jwks.json#key-1';
    const allowlist = ['https://issuer.example.com'];

    expect(isIssuerAllowed(keyid, allowlist)).toBe(true);
  });

  it('should not match different issuer', () => {
    const keyid = 'https://other.example.com/.well-known/jwks.json#key-1';
    const allowlist = ['https://issuer.example.com'];

    expect(isIssuerAllowed(keyid, allowlist)).toBe(false);
  });

  it('should match any issuer in allowlist', () => {
    const keyid = 'https://issuer2.example.com/.well-known/jwks.json#key-1';
    const allowlist = [
      'https://issuer1.example.com',
      'https://issuer2.example.com',
      'https://issuer3.example.com',
    ];

    expect(isIssuerAllowed(keyid, allowlist)).toBe(true);
  });

  it('should handle empty allowlist', () => {
    const keyid = 'https://issuer.example.com/.well-known/jwks.json#key-1';

    expect(isIssuerAllowed(keyid, [])).toBe(false);
  });

  it('should handle non-URL keyid', () => {
    const keyid = 'key-identifier-123';
    const allowlist = ['key-identifier-123'];

    expect(isIssuerAllowed(keyid, allowlist)).toBe(true);
  });
});
