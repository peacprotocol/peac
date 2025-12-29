/**
 * @peac/worker-fastly - Config tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseConfig, matchesBypassPath, isIssuerAllowed } from '../src/config.js';

describe('parseConfig', () => {
  beforeEach(() => {
    // Reset global state
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty config when no environment is set', () => {
    const config = parseConfig();

    expect(config.issuerAllowlist).toEqual([]);
    expect(config.bypassPaths).toEqual([]);
    expect(config.unsafeAllowAnyIssuer).toBe(false);
    expect(config.unsafeAllowUnknownTags).toBe(false);
    expect(config.unsafeAllowNoReplay).toBe(false);
  });

  it('parses config from fastly environment variables', () => {
    // Mock Fastly global
    const mockFastly = {
      getEnv: vi.fn((key: string) => {
        const env: Record<string, string> = {
          ISSUER_ALLOWLIST: 'https://issuer1.example.com,https://issuer2.example.com',
          BYPASS_PATHS: '/health,/ready',
          UNSAFE_ALLOW_ANY_ISSUER: 'true',
        };
        return env[key];
      }),
    };

    (globalThis as unknown as { fastly: typeof mockFastly }).fastly = mockFastly;

    const config = parseConfig();

    expect(config.issuerAllowlist).toEqual([
      'https://issuer1.example.com',
      'https://issuer2.example.com',
    ]);
    expect(config.bypassPaths).toEqual(['/health', '/ready']);
    expect(config.unsafeAllowAnyIssuer).toBe(true);

    // Cleanup
    delete (globalThis as unknown as { fastly?: typeof mockFastly }).fastly;
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

  it('returns false for empty patterns', () => {
    expect(matchesBypassPath('/health', [])).toBe(false);
  });
});

describe('isIssuerAllowed', () => {
  it('allows issuer in allowlist', () => {
    const allowlist = ['https://issuer.example.com'];
    expect(isIssuerAllowed('https://issuer.example.com/.well-known/jwks.json', allowlist)).toBe(true);
  });

  it('rejects issuer not in allowlist', () => {
    const allowlist = ['https://issuer.example.com'];
    expect(isIssuerAllowed('https://other.example.com/.well-known/jwks.json', allowlist)).toBe(false);
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
    expect(isIssuerAllowed('https://issuer.example.com/.well-known/jwks.json', allowlist)).toBe(true);
  });
});
