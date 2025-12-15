import { describe, it, expect } from 'vitest';
import { verifyTapProof } from '../src/mapper.js';
import { headersToRecord } from '../src/helpers.js';
import type { TapRequest, TapKeyResolver } from '../src/types.js';

describe('verifyTapProof', () => {
  const now = 1618884473;

  // Mock request with valid TAP headers
  const createMockRequest = (
    overrides: Partial<Record<string, string>> = {}
  ): TapRequest => {
    const headers: Record<string, string> = {
      'signature-input': `sig1=("@method" "@path");created=${now - 60};expires=${now + 360};keyid="test-key";alg="ed25519";tag="agent-browser-auth"`,
      'signature': 'sig1=:dGVzdA==:',
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
      'signature-input': `sig1=("@method");created=${now - 60};expires=${now + 360};keyid="test-key";alg="rsa-sha256";tag="agent-browser-auth"`,
    });

    const result = await verifyTapProof(request, { keyResolver: mockKeyResolver, now });

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('E_TAP_ALGORITHM_INVALID');
  });

  it('rejects window > 8 minutes', async () => {
    const request = createMockRequest({
      'signature-input': `sig1=("@method");created=${now - 60};expires=${now + 600};keyid="test-key";alg="ed25519";tag="agent-browser-auth"`,
    });

    const result = await verifyTapProof(request, { keyResolver: mockKeyResolver, now });

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('E_TAP_WINDOW_TOO_LARGE');
  });

  it('rejects expired signature', async () => {
    // Use a window of 400 seconds (under 480 limit) but already expired
    const request = createMockRequest({
      'signature-input': `sig1=("@method");created=${now - 500};expires=${now - 100};keyid="test-key";alg="ed25519";tag="agent-browser-auth"`,
    });

    const result = await verifyTapProof(request, { keyResolver: mockKeyResolver, now });

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('E_TAP_TIME_INVALID');
  });

  it('rejects unknown tags by default', async () => {
    const request = createMockRequest({
      'signature-input': `sig1=("@method");created=${now - 60};expires=${now + 360};keyid="test-key";alg="ed25519";tag="unknown-tag"`,
    });

    const result = await verifyTapProof(request, { keyResolver: mockKeyResolver, now });

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('E_TAP_TAG_UNKNOWN');
  });

  it('allows unknown tags when enabled', async () => {
    const request = createMockRequest({
      'signature-input': `sig1=("@method");created=${now - 60};expires=${now + 360};keyid="test-key";alg="ed25519";tag="custom-tag"`,
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
      ['signature-input', `sig1=("@method");created=${now - 60};expires=${now + 360};keyid="test-key";alg="ed25519";tag="agent-browser-auth"`],
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
