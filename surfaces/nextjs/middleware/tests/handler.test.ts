/**
 * @peac/middleware-nextjs - Handler tests
 *
 * Tests for the core request handler.
 * Validates parity with Cloudflare Worker behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleRequest } from '../src/handler.js';
import { ErrorCodes } from '../src/errors.js';
import type { MiddlewareConfig, HandlerRequest, ReplayStore } from '../src/types.js';

// Hoist mock functions so they're available at module load time
const { mockVerifyTapProof } = vi.hoisted(() => ({
  mockVerifyTapProof: vi.fn(),
}));

// Mock JWKS resolver to avoid network calls
vi.mock('@peac/jwks-cache', () => ({
  createResolver: () => async () => null, // Key not found by default
}));

// Mock TAP verification
vi.mock('@peac/mappings-tap', () => ({
  verifyTapProof: mockVerifyTapProof,
  TAP_CONSTANTS: { MAX_WINDOW_SECONDS: 480 },
}));

describe('handleRequest', () => {
  const baseConfig: MiddlewareConfig = {
    issuerAllowlist: ['https://issuer.example.com'],
  };

  const baseRequest: HandlerRequest = {
    method: 'GET',
    url: 'https://api.example.com/resource',
    headers: {},
  };

  beforeEach(() => {
    mockVerifyTapProof.mockReset();
  });

  describe('bypass paths', () => {
    it('returns null for bypass paths', async () => {
      const config: MiddlewareConfig = {
        ...baseConfig,
        bypassPaths: ['/health', '/public/**'],
      };

      const result = await handleRequest(
        { ...baseRequest, url: 'https://api.example.com/health' },
        config
      );

      expect(result).toBeNull();
    });

    it('returns null for wildcard bypass paths', async () => {
      const config: MiddlewareConfig = {
        ...baseConfig,
        bypassPaths: ['/public/**'],
      };

      const result = await handleRequest(
        { ...baseRequest, url: 'https://api.example.com/public/file.js' },
        config
      );

      expect(result).toBeNull();
    });
  });

  describe('issuer allowlist', () => {
    it('returns 500 when issuerAllowlist is empty', async () => {
      const config: MiddlewareConfig = {
        issuerAllowlist: [],
      };

      const result = await handleRequest(baseRequest, config);

      expect(result).not.toBeNull();
      expect(result!.status).toBe(500);
      expect(JSON.parse(result!.body!).code).toBe(ErrorCodes.CONFIG_ISSUER_ALLOWLIST_REQUIRED);
    });

    it('allows empty allowlist with unsafeAllowAnyIssuer', async () => {
      const config: MiddlewareConfig = {
        issuerAllowlist: [],
        unsafeAllowAnyIssuer: true,
      };

      // No TAP headers -> 402 in receipt_or_tap mode
      const result = await handleRequest(baseRequest, config);

      expect(result).not.toBeNull();
      expect(result!.status).toBe(402);
    });
  });

  describe('mode: receipt_or_tap (default)', () => {
    it('returns 402 when no TAP headers present', async () => {
      const result = await handleRequest(baseRequest, baseConfig);

      expect(result).not.toBeNull();
      expect(result!.status).toBe(402);
      expect(JSON.parse(result!.body!).code).toBe(ErrorCodes.RECEIPT_MISSING);
      expect(result!.headers['WWW-Authenticate']).toBe('PEAC realm="peac-verifier"');
    });
  });

  describe('mode: tap_only', () => {
    it('returns 401 when no TAP headers present', async () => {
      const config: MiddlewareConfig = {
        ...baseConfig,
        mode: 'tap_only',
      };

      const result = await handleRequest(baseRequest, config);

      expect(result).not.toBeNull();
      expect(result!.status).toBe(401);
      expect(JSON.parse(result!.body!).code).toBe(ErrorCodes.TAP_SIGNATURE_MISSING);
    });
  });

  describe('TAP verification', () => {
    const tapRequest: HandlerRequest = {
      ...baseRequest,
      headers: {
        'signature-input':
          'sig1=("@method" "@target-uri");created=1234567890;expires=1234568370;keyid="https://issuer.example.com/.well-known/jwks#key-1";alg="ed25519"',
        signature: 'sig1=:base64signature:',
      },
    };

    it('returns 401 when signature is invalid', async () => {
      mockVerifyTapProof.mockResolvedValue({
        valid: false,
        errorCode: 'E_SIGNATURE_INVALID',
        errorMessage: 'Signature verification failed',
      });

      const result = await handleRequest(tapRequest, baseConfig);

      expect(result).not.toBeNull();
      expect(result!.status).toBe(401);
      expect(JSON.parse(result!.body!).code).toBe(ErrorCodes.TAP_SIGNATURE_INVALID);
    });

    it('returns 400 when window is too large', async () => {
      mockVerifyTapProof.mockResolvedValue({
        valid: false,
        errorCode: 'E_TAP_WINDOW_TOO_LARGE',
        errorMessage: 'Window too large',
      });

      const result = await handleRequest(tapRequest, baseConfig);

      expect(result).not.toBeNull();
      expect(result!.status).toBe(400);
      expect(JSON.parse(result!.body!).code).toBe(ErrorCodes.TAP_WINDOW_TOO_LARGE);
    });

    it('returns 400 when tag is unknown', async () => {
      mockVerifyTapProof.mockResolvedValue({
        valid: false,
        errorCode: 'E_TAP_TAG_UNKNOWN',
        errorMessage: 'Unknown tag',
      });

      const result = await handleRequest(tapRequest, baseConfig);

      expect(result).not.toBeNull();
      expect(result!.status).toBe(400);
      expect(JSON.parse(result!.body!).code).toBe(ErrorCodes.TAP_TAG_UNKNOWN);
    });

    it('returns 403 when issuer not in allowlist', async () => {
      mockVerifyTapProof.mockResolvedValue({
        valid: true,
        controlEntry: {
          engine: 'tap',
          result: 'allow',
          evidence: {
            protocol: 'visa-tap',
            tag: 'agent-browser-auth',
            keyid: 'https://untrusted.example.com/.well-known/jwks#key-1',
            created: 1234567890,
            expires: 1234568370,
            coveredComponents: ['@method', '@target-uri'],
            signatureBase64: 'base64',
            verified: true,
            jwksSource: '/.well-known/jwks',
          },
        },
      });

      const result = await handleRequest(tapRequest, baseConfig);

      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
      expect(JSON.parse(result!.body!).code).toBe(ErrorCodes.ISSUER_NOT_ALLOWED);
    });

    it('returns null (forward) when TAP is valid and issuer allowed', async () => {
      mockVerifyTapProof.mockResolvedValue({
        valid: true,
        controlEntry: {
          engine: 'tap',
          result: 'allow',
          evidence: {
            protocol: 'visa-tap',
            tag: 'agent-browser-auth',
            keyid: 'https://issuer.example.com/.well-known/jwks#key-1',
            created: 1234567890,
            expires: 1234568370,
            coveredComponents: ['@method', '@target-uri'],
            signatureBase64: 'base64',
            verified: true,
            jwksSource: '/.well-known/jwks',
          },
        },
      });

      const result = await handleRequest(tapRequest, baseConfig);

      expect(result).toBeNull(); // Forward to origin
    });
  });

  describe('replay protection', () => {
    const tapRequestWithNonce: HandlerRequest = {
      ...baseRequest,
      headers: {
        'signature-input':
          'sig1=("@method");created=1234567890;expires=1234568370;keyid="https://issuer.example.com/.well-known/jwks#key-1";nonce="abc123";alg="ed25519"',
        signature: 'sig1=:base64signature:',
      },
    };

    it('returns 401 when nonce present but no replay store', async () => {
      mockVerifyTapProof.mockResolvedValue({
        valid: true,
        controlEntry: {
          engine: 'tap',
          result: 'allow',
          evidence: {
            protocol: 'visa-tap',
            tag: 'agent-browser-auth',
            keyid: 'https://issuer.example.com/.well-known/jwks#key-1',
            created: 1234567890,
            expires: 1234568370,
            nonce: 'abc123',
            coveredComponents: ['@method'],
            signatureBase64: 'base64',
            verified: true,
            jwksSource: '/.well-known/jwks',
          },
        },
      });

      const result = await handleRequest(tapRequestWithNonce, baseConfig);

      expect(result).not.toBeNull();
      expect(result!.status).toBe(401);
      expect(JSON.parse(result!.body!).code).toBe(ErrorCodes.TAP_REPLAY_PROTECTION_REQUIRED);
    });

    it('returns 409 when replay detected', async () => {
      const replayStore: ReplayStore = {
        seen: vi.fn().mockResolvedValue(true), // Replay detected
      };

      mockVerifyTapProof.mockResolvedValue({
        valid: true,
        controlEntry: {
          engine: 'tap',
          result: 'allow',
          evidence: {
            protocol: 'visa-tap',
            tag: 'agent-browser-auth',
            keyid: 'https://issuer.example.com/.well-known/jwks#key-1',
            created: 1234567890,
            expires: 1234568370,
            nonce: 'abc123',
            coveredComponents: ['@method'],
            signatureBase64: 'base64',
            verified: true,
            jwksSource: '/.well-known/jwks',
          },
        },
      });

      const result = await handleRequest(tapRequestWithNonce, {
        ...baseConfig,
        replayStore,
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe(409);
      expect(JSON.parse(result!.body!).code).toBe(ErrorCodes.TAP_NONCE_REPLAY);
    });

    it('allows bypass with unsafeAllowNoReplay', async () => {
      mockVerifyTapProof.mockResolvedValue({
        valid: true,
        controlEntry: {
          engine: 'tap',
          result: 'allow',
          evidence: {
            protocol: 'visa-tap',
            tag: 'agent-browser-auth',
            keyid: 'https://issuer.example.com/.well-known/jwks#key-1',
            created: 1234567890,
            expires: 1234568370,
            nonce: 'abc123',
            coveredComponents: ['@method'],
            signatureBase64: 'base64',
            verified: true,
            jwksSource: '/.well-known/jwks',
          },
        },
      });

      const result = await handleRequest(tapRequestWithNonce, {
        ...baseConfig,
        unsafeAllowNoReplay: true,
      });

      expect(result).toBeNull(); // Forward to origin
    });
  });
});
