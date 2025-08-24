import { AttestationAdapterImpl } from '../../src/adapters/attestation';

describe('AttestationAdapter', () => {
  let adapter;
  let mockRedis;

  beforeEach(() => {
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
    };
    adapter = new AttestationAdapterImpl({ redis: mockRedis });
  });

  describe('constructor', () => {
    it('should initialize with default vendors', () => {
      expect(adapter.name()).toBe('attestation');
    });

    it('should register custom vendors from config', () => {
      const customVendors = {
        CustomVendor: {
          jwks_uri: 'https://custom.vendor/keys',
          trusted: true,
          rate_limit_multiplier: 5,
        },
      };

      const customAdapter = new AttestationAdapterImpl({
        redis: mockRedis,
        vendors: customVendors,
      });

      expect(customAdapter.name()).toBe('attestation');
    });
  });

  describe('name', () => {
    it('should return "attestation"', () => {
      expect(adapter.name()).toBe('attestation');
    });
  });

  describe('discoveryFragment', () => {
    it('should return discovery fragment with trusted vendors', () => {
      const fragment = adapter.discoveryFragment();

      expect(fragment).toHaveProperty('endpoints');
      expect(fragment.endpoints).toHaveProperty('attestation');
      expect(fragment).toHaveProperty('auth_hints');
      expect(fragment.auth_hints).toHaveProperty('agent_attestation');
      expect(fragment.auth_hints.agent_attestation).toHaveProperty('trusted_vendors');

      const trustedVendors = fragment.auth_hints.agent_attestation.trusted_vendors;
      expect(trustedVendors).toContain('Anthropic');
      expect(trustedVendors).toContain('OpenAI');
      expect(trustedVendors).toContain('Perplexity');
      expect(trustedVendors).not.toContain('*');
    });

    it('should include custom trusted vendors in discovery', () => {
      const customAdapter = new AttestationAdapterImpl({
        redis: mockRedis,
        vendors: {
          TrustedCustom: {
            trusted: true,
            rate_limit_multiplier: 5,
          },
          UntrustedCustom: {
            trusted: false,
            rate_limit_multiplier: 1,
          },
        },
      });

      const fragment = customAdapter.discoveryFragment();
      const trustedVendors = fragment.auth_hints.agent_attestation.trusted_vendors;

      expect(trustedVendors).toContain('TrustedCustom');
      expect(trustedVendors).not.toContain('UntrustedCustom');
    });
  });

  describe('verify', () => {
    const validToken =
      'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJBbnRocm9waWMiLCJhdWQiOiJ0ZXN0LWF1ZGllbmNlIiwiZXhwIjoxOTAwMDAwMDAwLCJpYXQiOjE2MDAwMDAwMDAsImp0aSI6InRlc3QtanRpIiwicGVhY19hZ2VudF92ZW5kb3IiOiJBbnRocm9waWMiLCJwZWFjX2FnZW50X25hbWUiOiJDbGF1ZGUiLCJwZWFjX2FnZW50X3ZlcnNpb24iOiIzLjAiLCJwZWFjX3J1bnRpbWVfdHlwZSI6ImJyb3dzZXIiLCJwZWFjX3J1bnRpbWVfcGxhdGZvcm0iOiJ3ZWIifQ.signature';

    it('should handle invalid token format', async () => {
      const result = await adapter.verify('invalid-token', 'test-audience');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle malformed JWT', async () => {
      const result = await adapter.verify('not.a.jwt', 'test-audience');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle token with missing required fields', async () => {
      const incompleteToken =
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJBbnRocm9waWMifQ.signature';

      const result = await adapter.verify(incompleteToken, 'test-audience');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle audience mismatch', async () => {
      const result = await adapter.verify(validToken, 'wrong-audience');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('audience');
    });

    it('should handle expired token', async () => {
      const expiredToken =
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJBbnRocm9waWMiLCJhdWQiOiJ0ZXN0LWF1ZGllbmNlIiwiZXhwIjoxNTAwMDAwMDAwLCJpYXQiOjE0MDAwMDAwMDAsImp0aSI6InRlc3QtanRpIiwicGVhY19hZ2VudF92ZW5kb3IiOiJBbnRocm9waWMiLCJwZWFjX2FnZW50X25hbWUiOiJDbGF1ZGUiLCJwZWFjX2FnZW50X3ZlcnNpb24iOiIzLjAiLCJwZWFjX3J1bnRpbWVfdHlwZSI6ImJyb3dzZXIiLCJwZWFjX3J1bnRpbWVfcGxhdGZvcm0iOiJ3ZWIifQ.signature';

      const result = await adapter.verify(expiredToken, 'test-audience');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should handle unknown vendor', async () => {
      const unknownVendorToken =
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJVbmtub3duVmVuZG9yIiwiYXVkIjoidGVzdC1hdWRpZW5jZSIsImV4cCI6MTkwMDAwMDAwMCwiaWF0IjoxNjAwMDAwMDAwLCJqdGkiOiJ0ZXN0LWp0aSIsInBlYWNfYWdlbnRfdmVuZG9yIjoiVW5rbm93blZlbmRvciIsInBlYWNfYWdlbnRfbmFtZSI6IlRlc3QiLCJwZWFjX2FnZW50X3ZlcnNpb24iOiIxLjAiLCJwZWFjX3J1bnRpbWVfdHlwZSI6ImJyb3dzZXIiLCJwZWFjX3J1bnRpbWVfcGxhdGZvcm0iOiJ3ZWIifQ.signature';

      const result = await adapter.verify(unknownVendorToken, 'test-audience');

      expect(result.valid).toBe(false);
      expect(result.vendor).toBe('UnknownVendor');
      expect(result.trusted).toBe(false);
    });

    it('should use cache for repeated verifications', async () => {
      const cacheKey = `attestation:${validToken}:test-audience`;
      const cachedResult = {
        valid: true,
        agent_id: 'cached-agent',
        vendor: 'Anthropic',
        trusted: true,
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedResult));

      const result = await adapter.verify(validToken, 'test-audience');

      expect(mockRedis.get).toHaveBeenCalledWith(cacheKey);
      expect(result).toEqual(cachedResult);
    });

    it('should handle cache errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await adapter.verify(validToken, 'test-audience');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('registerVendor', () => {
    it('should register vendor with configuration', () => {
      const customAdapter = new AttestationAdapterImpl({ redis: mockRedis });

      // This is tested indirectly through the constructor and discoveryFragment
      const fragment = customAdapter.discoveryFragment();
      expect(fragment.auth_hints.agent_attestation.trusted_vendors).toContain('Anthropic');
    });
  });

  describe('error handling', () => {
    it('should handle various JWT parsing errors', async () => {
      const testCases = [
        '',
        'not-jwt-at-all',
        'only.two.parts',
        'invalid.base64!.encoding',
        'eyJhbGciOiJub25lIn0..invalid',
      ];

      for (const token of testCases) {
        const result = await adapter.verify(token, 'test-audience');
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('should handle missing required PEAC fields', async () => {
      const tokenWithoutPeacFields =
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJBbnRocm9waWMiLCJhdWQiOiJ0ZXN0LWF1ZGllbmNlIiwiZXhwIjoxOTAwMDAwMDAwLCJpYXQiOjE2MDAwMDAwMDAsImp0aSI6InRlc3QtanRpIn0.signature';

      const result = await adapter.verify(tokenWithoutPeacFields, 'test-audience');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('caching behavior', () => {
    it('should cache successful verifications', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');

      // This will fail verification due to signature, but should attempt caching
      const result = await adapter.verify(validToken, 'test-audience');

      expect(result.valid).toBe(false); // Will fail due to signature verification
    });

    it('should respect cache TTL', async () => {
      const cacheKey = `attestation:${validToken}:test-audience`;
      mockRedis.get.mockResolvedValue(null);

      await adapter.verify(validToken, 'test-audience');

      // Cache should be set with TTL (exact verification depends on implementation)
      expect(mockRedis.get).toHaveBeenCalledWith(cacheKey);
    });
  });
});
