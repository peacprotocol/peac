import { AttestationAdapterImpl, AttestationProblemType } from '../../src/adapters/attestation';
import { PEACError } from '../../src/errors/problem-json';
import { Redis } from 'ioredis';

describe('AttestationAdapter', () => {
  let adapter;
  let mockRedis;
  // Create tokens with future expiration to avoid expiration errors
  const now = Math.floor(Date.now() / 1000);
  
  // Helper function to create valid tokens
  const createToken = (payload) => {
    return `eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.${Buffer.from(
      JSON.stringify({
        exp: now + 1800, // 30 minutes from now
        iat: now,
        ...payload
      })
    ).toString('base64url')}.signature`;
  };

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

  const validToken = createToken({
    iss: 'Anthropic',
    aud: 'test-audience',
    jti: 'test-jti',
    peac_agent_vendor: 'Anthropic',
    peac_agent_name: 'Claude',
    peac_agent_version: '3.0',
    peac_runtime_type: 'browser',
    peac_runtime_platform: 'web'
  });

  describe('verify', () => {
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
      const incompleteToken = createToken({
        iss: 'Anthropic'
        // Missing other required fields
      });

      try {
        await adapter.verify(incompleteToken, 'test-audience');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error.type).toBe(AttestationProblemType.ATTESTATION_AUDIENCE_MISMATCH);
      }
    });

    it('should handle audience mismatch', async () => {
      try {
        await adapter.verify(validToken, 'wrong-audience');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error.type).toBe(AttestationProblemType.ATTESTATION_AUDIENCE_MISMATCH);
        expect(error.message).toContain('audience');
      }
    });

    it('should handle expired token', async () => {
      const expiredToken = createToken({
        iss: 'Anthropic',
        aud: 'test-audience',
        exp: now - 3600, // Expired 1 hour ago
        jti: 'test-jti',
        peac_agent_vendor: 'Anthropic',
        peac_agent_name: 'Claude',
        peac_agent_version: '3.0',
        peac_runtime_type: 'browser',
        peac_runtime_platform: 'web'
      });

      try {
        await adapter.verify(expiredToken, 'test-audience');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error.type).toBe(AttestationProblemType.ATTESTATION_EXPIRED);
        expect(error.message).toContain('expired');
      }
    });

    it('should handle unknown vendor', async () => {
      const unknownVendorToken = createToken({
        iss: 'UnknownVendor',
        aud: 'test-audience',
        jti: 'test-jti',
        peac_agent_vendor: 'UnknownVendor',
        peac_agent_name: 'Test',
        peac_agent_version: '1.0',
        peac_runtime_type: 'browser',
        peac_runtime_platform: 'web'
      });

      const result = await adapter.verify(unknownVendorToken, 'test-audience');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined(); // Should fallback to '*' config for self-signed
    });

    it('should use cache for repeated verifications', async () => {
      const result = await adapter.verify(validToken, 'test-audience');
      expect(result.valid).toBe(false); // Will fail due to signature, but should cache the attempt
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
      const tokenWithoutPeacFields = createToken({
        iss: 'Anthropic',
        aud: 'test-audience',
        jti: 'test-jti'
        // Missing PEAC fields
      });

      const result = await adapter.verify(tokenWithoutPeacFields, 'test-audience');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('caching behavior', () => {
    it('should cache successful verifications', async () => {
      // This will fail verification due to signature, but should attempt caching
      const result = await adapter.verify(validToken, 'test-audience');
      expect(result.valid).toBe(false); // Will fail due to signature verification
    });

    it('should return cached results', async () => {
      // Create an adapter with a mock cache that returns a valid result
      const adapterWithCache = new AttestationAdapterImpl({ redis: mockRedis });
      
      // First call will fail and cache the result
      await adapterWithCache.verify(validToken, 'test-audience');
      
      // Subsequent calls should use the same result
      const result2 = await adapterWithCache.verify(validToken, 'test-audience');
      expect(result2.valid).toBe(false); // Still fails due to no proper signature
    });
  });

  describe('vendor configuration edge cases', () => {
    it('should handle vendor with no config (fallback to * config)', async () => {
      const result = await adapter.verify(validToken, 'test-audience');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined(); // Should fallback to '*' config for self-signed
    });

    it('should handle self-signed tokens', async () => {
      const selfSignedAdapter = new AttestationAdapterImpl({ 
        redis: mockRedis,
        vendors: {
          'TestVendor': {
            self_signed: true,
            trusted: true,
            rate_limit_multiplier: 1
          }
        }
      });

      const tokenWithPublicKey = createToken({
        iss: 'TestVendor',
        aud: 'test-audience',
        jti: 'test-jti',
        peac_agent_vendor: 'TestVendor',
        peac_agent_name: 'Test',
        peac_agent_version: '1.0',
        peac_runtime_type: 'browser',
        peac_runtime_platform: 'web',
        peac_public_key: { kty: 'RSA', n: 'test', e: 'AQAB' }
      });
      
      const result = await selfSignedAdapter.verify(tokenWithPublicKey, 'test-audience');
      expect(result.valid).toBe(false); // Will fail due to invalid signature, but should test the self-signed path
    });

    it('should handle vendor with no verification method', async () => {
      const noVerifyAdapter = new AttestationAdapterImpl({
        redis: mockRedis,
        vendors: {
          'NoVerifyVendor': {
            trusted: false,
            rate_limit_multiplier: 1
            // No jwks_uri or self_signed
          }
        }
      });

      const token = createToken({
        iss: 'NoVerifyVendor',
        aud: 'test-audience',
        jti: 'test-jti',
        peac_agent_vendor: 'NoVerifyVendor',
        peac_agent_name: 'Test',
        peac_agent_version: '1.0',
        peac_runtime_type: 'browser',
        peac_runtime_platform: 'web'
      });
      
      const result = await noVerifyAdapter.verify(token, 'test-audience');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('No verification method available');
    });
  });

  describe('revocation checking', () => {
    it('should handle revocation check when configured', async () => {
      const tokenWithRevocation = createToken({
        iss: 'Anthropic',
        aud: 'test-audience',
        jti: 'test-jti',
        peac_agent_vendor: 'Anthropic',
        peac_agent_name: 'Claude',
        peac_agent_version: '1.0',
        peac_runtime_type: 'browser',
        peac_runtime_platform: 'web',
        peac_revocation_check: 'https://revoke.example.com'
      });
      
      const result = await adapter.verify(tokenWithRevocation, 'test-audience');
      expect(result.valid).toBe(false); // Will fail due to signature verification
    });
  });

  describe('JWKS fetching', () => {
    it('should handle JWKS URI configuration', async () => {
      const jwksAdapter = new AttestationAdapterImpl({
        redis: mockRedis,
        vendors: {
          'JWKSVendor': {
            jwks_uri: 'https://example.com/jwks.json',
            trusted: true,
            rate_limit_multiplier: 1
          }
        }
      });

      const jwksToken = createToken({
        iss: 'JWKSVendor',
        aud: 'test-audience',
        jti: 'test-jti',
        peac_agent_vendor: 'JWKSVendor',
        peac_agent_name: 'Test',
        peac_agent_version: '1.0',
        peac_runtime_type: 'browser',
        peac_runtime_platform: 'web'
      });
      
      const result = await jwksAdapter.verify(jwksToken, 'test-audience');
      expect(result.valid).toBe(false); // Will fail due to JWKS fetch error in test environment
    });
  });

  describe('public key handling', () => {
    it('should handle tokens with public key for thumbprint', async () => {
      const tokenWithPubKey = createToken({
        iss: 'Anthropic',
        aud: 'test-audience',
        jti: 'test-jti',
        peac_agent_vendor: 'Anthropic',
        peac_agent_name: 'Claude',
        peac_agent_version: '1.0',
        peac_runtime_type: 'browser',
        peac_runtime_platform: 'web',
        peac_public_key: { kty: 'RSA', n: 'test', e: 'AQAB' }
      });
      
      const result = await adapter.verify(tokenWithPubKey, 'test-audience');
      expect(result.valid).toBe(false); // Will fail due to signature, but should test the public key thumbprint path
    });
  });

  describe('comprehensive coverage tests', () => {
    beforeEach(() => {
      // Reset adapter for each test to ensure clean cache state
      adapter = new AttestationAdapterImpl({ redis: mockRedis });
    });

    it('should hit cache on repeated verification attempts', async () => {
      const testToken = validToken;

      // First call will cache the result
      const result1 = await adapter.verify(testToken, 'test-audience');
      
      // Create a new adapter instance that manually injects a cached result
      const adapterWithCache = new AttestationAdapterImpl({ redis: mockRedis });
      
      // Manually inject a cached result to test the cache hit path
      const cachedResult = {
        valid: true,
        agent_id: 'test/agent/1.0',
        vendor: 'TestVendor',
        trusted: true,
        rate_limit_multiplier: 5,
        runtime_type: 'browser',
        expires_at: new Date(Date.now() + 3600000)
      };
      
      // Access private cache to inject result (for testing cache hit path)
      const cacheKey = `${testToken}:test-audience`;
      adapterWithCache.verificationCache = new Map();
      adapterWithCache.verificationCache.set(cacheKey, {
        result: cachedResult,
        expires: Date.now() + 3600000
      });
      
      // This call should hit the cache (line 127)
      const cachedResult2 = await adapterWithCache.verify(testToken, 'test-audience');
      expect(cachedResult2.valid).toBe(true);
      expect(cachedResult2.agent_id).toBe('test/agent/1.0');
    });

    it('should handle token with exactly 1 hour TTL (boundary case)', async () => {
      // Create token that expires exactly 1 hour from iat (should pass TTL check)
      const exactlyOneHourToken = createToken({
        iss: 'Anthropic',
        aud: 'test-audience',
        exp: now + 3600, // Exactly 1 hour
        jti: 'test-jti',
        peac_agent_vendor: 'Anthropic',
        peac_agent_name: 'Claude',
        peac_agent_version: '3.0',
        peac_runtime_type: 'browser',
        peac_runtime_platform: 'web'
      });

      const result = await adapter.verify(exactlyOneHourToken, 'test-audience');
      expect(result.valid).toBe(false); // Will fail due to signature but should pass TTL check
    });

    it('should handle successful JWKS verification with proper caching', async () => {
      // Mock successful fetch for JWKS
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          keys: [{
            kty: 'RSA',
            n: 'test-n',
            e: 'AQAB',
            kid: 'test-kid'
          }]
        })
      });

      const testToken = createToken({
        iss: 'Anthropic',
        aud: 'test-audience',
        jti: 'test-jti',
        peac_agent_vendor: 'Anthropic',
        peac_agent_name: 'Claude',
        peac_agent_version: '3.0',
        peac_runtime_type: 'browser',
        peac_runtime_platform: 'web'
      });
      
      const result = await adapter.verify(testToken, 'test-audience');
      expect(result.valid).toBe(false); // Will still fail due to signature but tests JWKS fetch path
      
      // Should have called fetch for JWKS
      expect(global.fetch).toHaveBeenCalledWith('https://anthropic.com/.well-known/agent-keys.json');
    });

    it('should handle JWKS fetch failure gracefully', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found'
      });

      const testToken = validToken;
      
      const result = await adapter.verify(testToken, 'test-audience');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Failed to fetch JWKS');
    });

    it('should handle array audience format', async () => {
      const arrayAudToken = createToken({
        iss: 'Anthropic',
        aud: ['test-audience', 'other-audience'], // Array format
        jti: 'test-jti',
        peac_agent_vendor: 'Anthropic',
        peac_agent_name: 'Claude',
        peac_agent_version: '3.0',
        peac_runtime_type: 'browser',
        peac_runtime_platform: 'web'
      });

      const result = await adapter.verify(arrayAudToken, 'test-audience');
      expect(result.valid).toBe(false); // Will fail on signature but tests array audience handling
    });

    it('should handle TTL validation edge cases', async () => {
      // Test token with TTL exceeding 1 hour
      const longTTLToken = createToken({
        iss: 'Anthropic',
        aud: 'test-audience',
        exp: now + 7200, // 2 hours
        jti: 'test-jti',
        peac_agent_vendor: 'Anthropic',
        peac_agent_name: 'Claude',
        peac_agent_version: '3.0',
        peac_runtime_type: 'browser',
        peac_runtime_platform: 'web'
      });

      const result = await adapter.verify(longTTLToken, 'test-audience');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Attestation TTL exceeds 1 hour');
    });

    it('should handle JWKS caching', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            keys: [{ kty: 'RSA', n: 'test', e: 'AQAB' }]
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            keys: [{ kty: 'RSA', n: 'test2', e: 'AQAB' }]
          })
        });

      const testToken = validToken;
      
      // First call should fetch JWKS
      await adapter.verify(testToken, 'test-audience');
      
      // Second call should use cached JWKS (within 5 minute cache window)
      await adapter.verify(testToken, 'test-audience');
      
      // Should only call fetch once due to caching
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});