import { describe, it, expect } from 'vitest';
import { verifyTapProof } from '../src/mapper.js';
import { headersToRecord } from '../src/helpers.js';
import type { TapRequest, TapKeyResolver } from '../src/types.js';

describe('verifyTapProof', () => {
  const now = 1618884473;

  // Mock request with valid TAP headers
  const createMockRequest = (overrides: Partial<Record<string, string>> = {}): TapRequest => {
    const headers: Record<string, string> = {
      'signature-input': `sig1=("@method" "@path");created=${now - 60};expires=${now + 360};keyid="https://issuer.example.com/.well-known/jwks.json#test-key";alg="ed25519";tag="agent-browser-auth"`,
      signature: 'sig1=:dGVzdA==:',
      ...overrides,
    };
    return {
      method: 'GET',
      url: 'https://example.com/api/resource',
      headers,
    };
  };

  // Mock key resolver that always returns a verifier
  const mockKeyResolver: TapKeyResolver = async () => async () => true;

  // Mock key resolver that always returns null
  const nullKeyResolver: TapKeyResolver = async () => null;

  it('returns error for missing headers', async () => {
    const request: TapRequest = {
      method: 'GET',
      url: 'https://example.com/api',
      headers: {},
    };

    const result = await verifyTapProof(request, { keyResolver: mockKeyResolver });

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('E_SIGNATURE_MISSING');
  });

  it('rejects invalid algorithm', async () => {
    const request = createMockRequest({
      'signature-input': `sig1=("@method");created=${now - 60};expires=${now + 360};keyid="https://issuer.example.com/.well-known/jwks.json#test-key";alg="rsa-sha256";tag="agent-browser-auth"`,
    });

    const result = await verifyTapProof(request, { keyResolver: mockKeyResolver, now });

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('E_TAP_ALGORITHM_INVALID');
  });

  it('rejects window > 8 minutes', async () => {
    const request = createMockRequest({
      'signature-input': `sig1=("@method");created=${now - 60};expires=${now + 600};keyid="https://issuer.example.com/.well-known/jwks.json#test-key";alg="ed25519";tag="agent-browser-auth"`,
    });

    const result = await verifyTapProof(request, { keyResolver: mockKeyResolver, now });

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('E_TAP_WINDOW_TOO_LARGE');
  });

  it('rejects expired signature', async () => {
    // Use a window of 400 seconds (under 480 limit) but already expired
    const request = createMockRequest({
      'signature-input': `sig1=("@method");created=${now - 500};expires=${now - 100};keyid="https://issuer.example.com/.well-known/jwks.json#test-key";alg="ed25519";tag="agent-browser-auth"`,
    });

    const result = await verifyTapProof(request, { keyResolver: mockKeyResolver, now });

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('E_TAP_TIME_INVALID');
  });

  it('rejects unknown tags by default', async () => {
    const request = createMockRequest({
      'signature-input': `sig1=("@method");created=${now - 60};expires=${now + 360};keyid="https://issuer.example.com/.well-known/jwks.json#test-key";alg="ed25519";tag="unknown-tag"`,
    });

    const result = await verifyTapProof(request, { keyResolver: mockKeyResolver, now });

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('E_TAP_TAG_UNKNOWN');
  });

  it('allows unknown tags when enabled', async () => {
    const request = createMockRequest({
      'signature-input': `sig1=("@method");created=${now - 60};expires=${now + 360};keyid="https://issuer.example.com/.well-known/jwks.json#test-key";alg="ed25519";tag="custom-tag"`,
    });

    const result = await verifyTapProof(request, {
      keyResolver: mockKeyResolver,
      now,
      allowUnknownTags: true,
    });

    expect(result.valid).toBe(true);
    expect(result.controlEntry?.evidence.tag).toBe('custom-tag');
  });

  it('returns error when key not found', async () => {
    const request = createMockRequest();
    const result = await verifyTapProof(request, { keyResolver: nullKeyResolver, now });

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('E_KEY_NOT_FOUND');
  });

  describe('keyid trust boundary (security)', () => {
    // A keyid that is not an absolute https URL must fail closed BEFORE key
    // resolution. Otherwise a plain keyid would fall back to deriving the
    // issuer from the request URL / Host header and steer key resolution to an
    // attacker-controlled origin.
    it.each([
      ['plain opaque keyid', 'agent-key-1'],
      ['http downgrade', 'http://issuer.example.com/jwks#k1'],
      ['bare host', 'issuer.example.com'],
    ])('rejects %s with E_TAP_KEYID_INVALID and never resolves a key', async (_label, keyid) => {
      let resolverCalled = false;
      const spyResolver: TapKeyResolver = async () => {
        resolverCalled = true;
        return async () => true;
      };

      const request = createMockRequest({
        'signature-input': `sig1=("@method" "@path");created=${now - 60};expires=${now + 360};keyid="${keyid}";alg="ed25519";tag="agent-browser-auth"`,
      });
      const result = await verifyTapProof(request, { keyResolver: spyResolver, now });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('E_TAP_KEYID_INVALID');
      // The spoof is blocked before the key resolver runs.
      expect(resolverCalled).toBe(false);
    });

    it('does not derive the issuer from a spoofed Host header', async () => {
      // Even with an attacker-controlled Host and request URL, a plain keyid
      // fails closed rather than resolving keys from the request origin.
      let resolvedIssuer: string | undefined;
      const captureResolver: TapKeyResolver = async (issuer) => {
        resolvedIssuer = issuer;
        return async () => true;
      };

      const request: TapRequest = {
        method: 'GET',
        url: 'https://attacker.example/api',
        headers: {
          host: 'attacker.example',
          'signature-input': `sig1=("@method" "@path");created=${now - 60};expires=${now + 360};keyid="agent-key-1";alg="ed25519";tag="agent-browser-auth"`,
          signature: 'sig1=:dGVzdA==:',
        },
      };
      const result = await verifyTapProof(request, { keyResolver: captureResolver, now });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('E_TAP_KEYID_INVALID');
      expect(resolvedIssuer).toBeUndefined();
    });
  });

  it('verifies valid TAP proof', async () => {
    const request = createMockRequest();
    const result = await verifyTapProof(request, { keyResolver: mockKeyResolver, now });

    expect(result.valid).toBe(true);
    expect(result.controlEntry).toBeDefined();
    expect(result.controlEntry?.engine).toBe('tap');
    expect(result.controlEntry?.result).toBe('allow');
    expect(result.controlEntry?.evidence.protocol).toBe('visa-tap');
    expect(result.controlEntry?.evidence.tag).toBe('agent-browser-auth');
    expect(result.controlEntry?.evidence.verified).toBe(true);
  });

  it('works with headersToRecord from Map', async () => {
    const headersMap = new Map([
      [
        'signature-input',
        `sig1=("@method");created=${now - 60};expires=${now + 360};keyid="https://issuer.example.com/.well-known/jwks.json#test-key";alg="ed25519";tag="agent-browser-auth"`,
      ],
      ['signature', 'sig1=:dGVzdA==:'],
    ]);

    const request: TapRequest = {
      method: 'GET',
      url: 'https://example.com/api/resource',
      headers: headersToRecord(headersMap),
    };

    const result = await verifyTapProof(request, { keyResolver: mockKeyResolver, now });

    expect(result.valid).toBe(true);
  });
});
