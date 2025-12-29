/**
 * @peac/worker-akamai - Config tests
 */

import { describe, it, expect } from 'vitest';
import { parseConfigFromRecord, matchesBypassPath, isIssuerAllowed } from '../src/config.js';

describe('parseConfigFromRecord', () => {
  it('returns empty config when no environment is set', () => {
    const config = parseConfigFromRecord({});

    expect(config.issuerAllowlist).toEqual([]);
    expect(config.bypassPaths).toEqual([]);
    expect(config.unsafeAllowAnyIssuer).toBe(false);
    expect(config.unsafeAllowUnknownTags).toBe(false);
    expect(config.unsafeAllowNoReplay).toBe(false);
  });

  it('parses config from environment record', () => {
    const env = {
      ISSUER_ALLOWLIST: 'https://issuer1.example.com,https://issuer2.example.com',
      BYPASS_PATHS: '/health,/ready',
      UNSAFE_ALLOW_ANY_ISSUER: 'true',
      UNSAFE_ALLOW_UNKNOWN_TAGS: 'false',
      UNSAFE_ALLOW_NO_REPLAY: 'yes',
    };

    const config = parseConfigFromRecord(env);

    expect(config.issuerAllowlist).toEqual([
      'https://issuer1.example.com',
      'https://issuer2.example.com',
    ]);
    expect(config.bypassPaths).toEqual(['/health', '/ready']);
    expect(config.unsafeAllowAnyIssuer).toBe(true);
    expect(config.unsafeAllowUnknownTags).toBe(false);
    expect(config.unsafeAllowNoReplay).toBe(true);
  });

  it('handles whitespace in comma-separated values', () => {
    const env = {
      ISSUER_ALLOWLIST: 'https://a.com , https://b.com , https://c.com',
    };

    const config = parseConfigFromRecord(env);

    expect(config.issuerAllowlist).toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
  });
});

describe('matchesBypassPath', () => {
  it('matches exact paths', () => {
    expect(matchesBypassPath('/health', ['/health'])).toBe(true);
    expect(matchesBypassPath('/ready', ['/health'])).toBe(false);
  });

  it('matches wildcard patterns', () => {
    expect(matchesBypassPath('/api/health', ['/api/*'])).toBe(true);
    expect(matchesBypassPath('/api/v1/health', ['/api/*'])).toBe(false); // * matches one segment
  });

  it('matches question mark patterns', () => {
    expect(matchesBypassPath('/v1', ['/v?'])).toBe(true);
    expect(matchesBypassPath('/v10', ['/v?'])).toBe(false);
  });

  it('matches multiple patterns', () => {
    const patterns = ['/health', '/ready', '/metrics'];
    expect(matchesBypassPath('/health', patterns)).toBe(true);
    expect(matchesBypassPath('/ready', patterns)).toBe(true);
    expect(matchesBypassPath('/metrics', patterns)).toBe(true);
    expect(matchesBypassPath('/api', patterns)).toBe(false);
  });

  it('returns false for empty patterns', () => {
    expect(matchesBypassPath('/health', [])).toBe(false);
  });
});

describe('isIssuerAllowed', () => {
  it('allows issuer in allowlist', () => {
    const allowlist = ['https://issuer.example.com'];
    expect(isIssuerAllowed('https://issuer.example.com/.well-known/jwks.json', allowlist)).toBe(
      true
    );
  });

  it('rejects issuer not in allowlist', () => {
    const allowlist = ['https://issuer.example.com'];
    expect(isIssuerAllowed('https://other.example.com/.well-known/jwks.json', allowlist)).toBe(
      false
    );
  });

  it('returns false for empty allowlist', () => {
    expect(isIssuerAllowed('https://issuer.example.com', [])).toBe(false);
  });

  it('handles invalid URLs gracefully', () => {
    const allowlist = ['https://issuer.example.com'];
    expect(isIssuerAllowed('not-a-url', allowlist)).toBe(false);
  });

  it('compares origins (ignores path)', () => {
    const allowlist = ['https://issuer.example.com/different/path'];
    expect(isIssuerAllowed('https://issuer.example.com/.well-known/jwks.json', allowlist)).toBe(
      true
    );
  });

  it('handles multiple issuers in allowlist', () => {
    const allowlist = [
      'https://issuer1.example.com',
      'https://issuer2.example.com',
      'https://issuer3.example.com',
    ];
    expect(isIssuerAllowed('https://issuer2.example.com/.well-known/jwks.json', allowlist)).toBe(
      true
    );
    expect(isIssuerAllowed('https://issuer4.example.com/.well-known/jwks.json', allowlist)).toBe(
      false
    );
  });
});
