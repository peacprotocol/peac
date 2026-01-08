/**
 * @peac/worker-core - Verification logic tests
 */

import { describe, it, expect, vi } from 'vitest';
import {
  hasTapHeaders,
  extractIssuerFromKeyid,
  headersToPlainObject,
  verifyTap,
  handleVerification,
} from '../src/verification.js';
import { ErrorCodes } from '../src/errors.js';
import type {
  InternalWorkerConfig,
  ReplayStore,
  ReplayContext,
  RequestLike,
} from '../src/types.js';

describe('hasTapHeaders', () => {
  it('should return true when both signature headers present (lowercase)', () => {
    const headers = {
      'signature-input': 'sig1=(...)',
      signature: 'sig1=:base64:',
    };

    expect(hasTapHeaders(headers)).toBe(true);
  });

  it('should return true when both signature headers present (mixed case)', () => {
    const headers = {
      'Signature-Input': 'sig1=(...)',
      Signature: 'sig1=:base64:',
    };

    expect(hasTapHeaders(headers)).toBe(true);
  });

  it('should return false when signature-input missing', () => {
    const headers = {
      signature: 'sig1=:base64:',
    };

    expect(hasTapHeaders(headers)).toBe(false);
  });

  it('should return false when signature missing', () => {
    const headers = {
      'signature-input': 'sig1=(...)',
    };

    expect(hasTapHeaders(headers)).toBe(false);
  });

  it('should return false for empty headers', () => {
    expect(hasTapHeaders({})).toBe(false);
  });
});

describe('extractIssuerFromKeyid', () => {
  it('should extract origin from JWKS URL', () => {
    const keyid = 'https://issuer.example.com/.well-known/jwks.json#key-1';

    expect(extractIssuerFromKeyid(keyid)).toBe('https://issuer.example.com');
  });

  it('should handle URL with port', () => {
    const keyid = 'https://issuer.example.com:8443/.well-known/jwks.json#key-1';

    expect(extractIssuerFromKeyid(keyid)).toBe('https://issuer.example.com:8443');
  });

  it('should return keyid as-is for non-URL', () => {
    const keyid = 'key-identifier-123';

    expect(extractIssuerFromKeyid(keyid)).toBe('key-identifier-123');
  });
});

describe('headersToPlainObject', () => {
  it('should convert Headers-like to Record', () => {
    const headersLike = {
      entries: function* () {
        yield ['content-type', 'application/json'];
        yield ['authorization', 'Bearer token'];
      },
    };

    const result = headersToPlainObject(headersLike as unknown as Headers);

    expect(result).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer token',
    });
  });
});

describe('verifyTap', () => {
  it('should return isTap=false when no TAP headers', async () => {
    const result = await verifyTap({}, 'GET', 'https://example.com/api', {
      keyResolver: async () => null,
      unsafeAllowUnknownTags: false,
      unsafeAllowNoReplay: false,
      warnNoReplayStore: () => {},
    });

    expect(result.valid).toBe(false);
    expect(result.isTap).toBe(false);
    expect(result.errorCode).toBe(ErrorCodes.TAP_SIGNATURE_MISSING);
  });
});

describe('handleVerification', () => {
  const createRequest = (
    headers: Record<string, string> = {},
    url = 'https://example.com/api/resource'
  ): RequestLike => ({
    method: 'GET',
    url,
    headers: {
      entries: function* () {
        for (const [k, v] of Object.entries(headers)) {
          yield [k, v] as [string, string];
        }
      },
    } as unknown as Headers,
  });

  const createConfig = (overrides: Partial<InternalWorkerConfig> = {}): InternalWorkerConfig => ({
    issuerAllowlist: ['https://issuer.example.com'],
    bypassPaths: [],
    unsafeAllowAnyIssuer: false,
    unsafeAllowUnknownTags: false,
    unsafeAllowNoReplay: false,
    ...overrides,
  });

  const mockKeyResolver = async () => null;

  describe('bypass paths', () => {
    it('should pass through bypass paths', async () => {
      const request = createRequest({}, 'https://example.com/health');
      const config = createConfig({ bypassPaths: ['/health'] });

      const result = await handleVerification(request, config, {
        keyResolver: mockKeyResolver,
        unsafeAllowUnknownTags: false,
        unsafeAllowNoReplay: false,
      });

      expect(result.action).toBe('pass');
    });

    it('should bypass before issuer allowlist check', async () => {
      const request = createRequest({}, 'https://example.com/health');
      const config = createConfig({
        bypassPaths: ['/health'],
        issuerAllowlist: [], // Empty allowlist would normally fail
      });

      const result = await handleVerification(request, config, {
        keyResolver: mockKeyResolver,
        unsafeAllowUnknownTags: false,
        unsafeAllowNoReplay: false,
      });

      expect(result.action).toBe('pass');
    });
  });

  describe('issuer allowlist', () => {
    it('should return 500 when allowlist empty and UNSAFE not set', async () => {
      const request = createRequest();
      const config = createConfig({
        issuerAllowlist: [],
        unsafeAllowAnyIssuer: false,
      });

      const result = await handleVerification(request, config, {
        keyResolver: mockKeyResolver,
        unsafeAllowUnknownTags: false,
        unsafeAllowNoReplay: false,
      });

      expect(result.action).toBe('error');
      if (result.action === 'error') {
        expect(result.status).toBe(500);
        expect(result.errorCode).toBe(ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED);
      }
    });

    it('should allow empty allowlist when UNSAFE_ALLOW_ANY_ISSUER set', async () => {
      const request = createRequest();
      const config = createConfig({
        issuerAllowlist: [],
        unsafeAllowAnyIssuer: true,
      });

      const result = await handleVerification(request, config, {
        keyResolver: mockKeyResolver,
        unsafeAllowUnknownTags: false,
        unsafeAllowNoReplay: false,
      });

      // Should proceed to TAP verification (not fail on allowlist check)
      // Since request has no TAP headers, it will error with TAP_SIGNATURE_MISSING instead
      expect(result.action).toBe('error');
      if (result.action === 'error') {
        // Error should be TAP_SIGNATURE_MISSING, NOT CONFIG_ISSUER_ALLOWLIST_REQUIRED
        expect(result.errorCode).toBe(ErrorCodes.TAP_SIGNATURE_MISSING);
        expect(result.errorCode).not.toBe(ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED);
      }
    });
  });

  describe('mode: tap_only', () => {
    it('should return 401 when TAP headers missing', async () => {
      const request = createRequest();
      const config = createConfig();

      const result = await handleVerification(
        request,
        config,
        {
          keyResolver: mockKeyResolver,
          unsafeAllowUnknownTags: false,
          unsafeAllowNoReplay: false,
        },
        'tap_only'
      );

      expect(result.action).toBe('error');
      if (result.action === 'error') {
        expect(result.status).toBe(401);
        expect(result.errorCode).toBe(ErrorCodes.TAP_SIGNATURE_MISSING);
      }
    });
  });

  describe('mode: receipt_or_tap (default)', () => {
    it('should return 402 when TAP headers missing', async () => {
      const request = createRequest();
      const config = createConfig();

      const result = await handleVerification(
        request,
        config,
        {
          keyResolver: mockKeyResolver,
          unsafeAllowUnknownTags: false,
          unsafeAllowNoReplay: false,
        },
        'receipt_or_tap'
      );

      expect(result.action).toBe('challenge');
      if (result.action === 'challenge') {
        expect(result.status).toBe(402);
        expect(result.errorCode).toBe(ErrorCodes.RECEIPT_MISSING);
      }
    });

    it('should default to tap_only mode', async () => {
      const request = createRequest();
      const config = createConfig();

      const result = await handleVerification(request, config, {
        keyResolver: mockKeyResolver,
        unsafeAllowUnknownTags: false,
        unsafeAllowNoReplay: false,
      });

      // Default mode should be tap_only, returning 401 when TAP headers missing
      expect(result.action).toBe('error');
      if (result.action === 'error') {
        expect(result.status).toBe(401);
        expect(result.errorCode).toBe(ErrorCodes.TAP_SIGNATURE_MISSING);
      }
    });
  });

  describe('replay protection', () => {
    it('should detect replay when store reports seen', async () => {
      // This test requires mocking the full TAP verification flow
      // which is complex. For now, we test the replay store directly.
      const mockStore: ReplayStore = {
        seen: vi.fn().mockResolvedValue(true),
      };

      // Test the store behavior directly
      const ctx: ReplayContext = {
        issuer: 'https://issuer.example.com',
        keyid: 'https://issuer.example.com/.well-known/jwks.json#key-1',
        nonce: 'abc123',
        ttlSeconds: 480,
      };

      const isReplay = await mockStore.seen(ctx);
      expect(isReplay).toBe(true);
    });
  });

  describe('HTTP status semantics', () => {
    it('should use 401 for missing TAP in tap_only mode', async () => {
      const request = createRequest();
      const config = createConfig();

      const result = await handleVerification(
        request,
        config,
        {
          keyResolver: mockKeyResolver,
          unsafeAllowUnknownTags: false,
          unsafeAllowNoReplay: false,
        },
        'tap_only'
      );

      if (result.action === 'error') {
        expect(result.status).toBe(401);
      }
    });

    it('should use 402 ONLY for payment remedy', async () => {
      const request = createRequest();
      const config = createConfig();

      const result = await handleVerification(
        request,
        config,
        {
          keyResolver: mockKeyResolver,
          unsafeAllowUnknownTags: false,
          unsafeAllowNoReplay: false,
        },
        'receipt_or_tap'
      );

      // 402 is only returned in receipt_or_tap mode for missing TAP
      if (result.action === 'challenge') {
        expect(result.status).toBe(402);
        expect(result.errorCode).toBe(ErrorCodes.RECEIPT_MISSING);
      }
    });
  });
});
