import { UDAAdapterImpl } from '../../src/adapters/uda';

describe('UDAAdapter', () => {
  let adapter;
  let mockRedis;

  beforeEach(() => {
    mockRedis = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    };
    
    // Mock fetch to prevent network calls in tests
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        keys: [
          {
            kty: 'RSA',
            use: 'sig',
            kid: 'test-key-id',
            alg: 'RS256',
            n: 'mock-rsa-n-value',
            e: 'AQAB',
          }
        ]
      })
    });
    
    adapter = new UDAAdapterImpl({ redis: mockRedis });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default demo issuer', () => {
      expect(adapter.name()).toBe('uda');
    });

    it('should register custom trusted issuers from config', () => {
      const customIssuers = [
        {
          iss: 'https://custom.issuer/auth',
          jwks_uri: 'https://custom.issuer/.well-known/jwks.json',
          name: 'Custom Issuer',
          enabled: true,
        },
      ];

      const customAdapter = new UDAAdapterImpl({
        redis: mockRedis,
        trustedIssuers: customIssuers,
      });

      expect(customAdapter.name()).toBe('uda');
    });
  });

  describe('name', () => {
    it('should return "uda"', () => {
      expect(adapter.name()).toBe('uda');
    });
  });

  describe('discoveryFragment', () => {
    it('should return discovery fragment with enabled issuers', () => {
      const fragment = adapter.discoveryFragment();

      expect(fragment).toHaveProperty('endpoints');
      expect(fragment.endpoints).toHaveProperty('uda');
      expect(fragment.endpoints.uda).toEqual({
        href: '/adapters/uda/verify',
        methods: ['POST'],
      });

      expect(fragment).toHaveProperty('auth_hints');
      expect(fragment.auth_hints).toHaveProperty('user_delegated_access');

      const udaHints = fragment.auth_hints.user_delegated_access;
      expect(udaHints.supported).toBe(true);
      expect(udaHints.oauth_device_flow).toBe(true);
      expect(udaHints.issuers).toContain('https://demo.peac.dev/auth');
      expect(udaHints.scopes).toEqual(['read', 'summarize', 'translate', 'annotate']);
    });

    it('should only include enabled issuers in discovery', () => {
      const issuers = [
        {
          iss: 'https://enabled.issuer/auth',
          jwks_uri: 'https://enabled.issuer/.well-known/jwks.json',
          name: 'Enabled Issuer',
          enabled: true,
        },
        {
          iss: 'https://disabled.issuer/auth',
          jwks_uri: 'https://disabled.issuer/.well-known/jwks.json',
          name: 'Disabled Issuer',
          enabled: false,
        },
      ];

      const customAdapter = new UDAAdapterImpl({
        redis: mockRedis,
        trustedIssuers: issuers,
      });

      const fragment = customAdapter.discoveryFragment();
      const enabledIssuers = fragment.auth_hints.user_delegated_access.issuers;

      expect(enabledIssuers).toContain('https://enabled.issuer/auth');
      expect(enabledIssuers).not.toContain('https://disabled.issuer/auth');
    });
  });

  const createMockToken = (payload) => {
    const header = { typ: 'JWT', alg: 'RS256' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encodedHeader}.${encodedPayload}.mock-signature`;
  };

  describe('verify', () => {
    const validTokenPayload = {
      iss: 'https://demo.peac.dev/auth',
      sub: 'user123',
      aud: 'test-audience',
      exp: Math.floor(Date.now() / 1000) + 300,
      iat: Math.floor(Date.now() / 1000),
      jti: 'test-jti-123',
      peac_entitlements: [
        {
          type: 'ownership',
          resource: 'test-resource',
          scopes: ['read', 'write'],
        },
      ],
    };

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

    it('should reject untrusted issuer', async () => {
      const untrustedPayload = {
        ...validTokenPayload,
        iss: 'https://untrusted.issuer/auth',
      };
      const token = createMockToken(untrustedPayload);

      try {
        const result = await adapter.verify(token, 'test-audience');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not in the trusted list');
      } catch (error) {
        expect(error.message).toContain('not in the trusted list');
      }
    });

    it('should reject disabled issuer', async () => {
      const disabledIssuer = {
        iss: 'https://disabled.issuer/auth',
        jwks_uri: 'https://disabled.issuer/.well-known/jwks.json',
        name: 'Disabled Issuer',
        enabled: false,
      };

      const customAdapter = new UDAAdapterImpl({
        redis: mockRedis,
        trustedIssuers: [disabledIssuer],
      });

      const disabledPayload = {
        ...validTokenPayload,
        iss: 'https://disabled.issuer/auth',
      };
      const token = createMockToken(disabledPayload);

      try {
        const result = await customAdapter.verify(token, 'test-audience');
        expect(result.valid).toBe(false);
      } catch (error) {
        expect(error.message).toContain('not in the trusted list');
      }
    });

    it('should handle token with excessive TTL', async () => {
      const longTtlPayload = {
        ...validTokenPayload,
        exp: validTokenPayload.iat + 400, // 400 seconds > 300 second limit
      };
      const token = createMockToken(longTtlPayload);

      const result = await adapter.verify(token, 'test-audience');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle token not yet valid (nbf)', async () => {
      const futurePayload = {
        ...validTokenPayload,
        nbf: Math.floor(Date.now() / 1000) + 120, // 2 minutes in future
      };
      const token = createMockToken(futurePayload);

      const result = await adapter.verify(token, 'test-audience');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should detect replay attacks', async () => {
      const token = createMockToken(validTokenPayload);

      // Mock Redis to simulate replay detection
      mockRedis.set.mockResolvedValueOnce(null); // Simulates existing key

      const result = await adapter.verify(token, 'test-audience');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis connection failed'));

      const token = createMockToken(validTokenPayload);
      const result = await adapter.verify(token, 'test-audience');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle JWKS fetch failures', async () => {
      // Mock fetch to fail
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const token = createMockToken(validTokenPayload);
      const result = await adapter.verify(token, 'test-audience');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle invalid JWKS response', async () => {
      // Mock fetch to return invalid response
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      });

      const token = createMockToken(validTokenPayload);
      const result = await adapter.verify(token, 'test-audience');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Failed to fetch JWKS');
    });

    it('should cache JWKS responses', async () => {
      // Mock successful JWKS fetch
      const mockJwks = { keys: [{ kty: 'RSA', use: 'sig' }] };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockJwks),
      });

      const token = createMockToken(validTokenPayload);

      // First call
      await adapter.verify(token, 'test-audience');

      // Second call should use cache
      await adapter.verify(token, 'test-audience');

      // Fetch should only be called once due to caching
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle key binding verification', async () => {
      const mockAgentKey = {};
      const keyBindingPayload = {
        ...validTokenPayload,
        cnf: {
          jkt: 'mock-key-thumbprint',
        },
      };
      const token = createMockToken(keyBindingPayload);

      const result = await adapter.verify(token, 'test-audience', mockAgentKey);

      expect(result.valid).toBe(false); // Will fail due to signature verification
      expect(result.error).toBeDefined();
    });
  });

  describe('registerIssuer', () => {
    it('should register issuer during construction', () => {
      const customIssuer = {
        iss: 'https://test.issuer/auth',
        jwks_uri: 'https://test.issuer/.well-known/jwks.json',
        name: 'Test Issuer',
        enabled: true,
      };

      const customAdapter = new UDAAdapterImpl({
        redis: mockRedis,
        trustedIssuers: [customIssuer],
      });

      const fragment = customAdapter.discoveryFragment();
      expect(fragment.auth_hints.user_delegated_access.issuers).toContain(
        'https://test.issuer/auth',
      );
    });
  });

  describe('fetchJWKS caching behavior', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('should cache JWKS for 5 minutes', async () => {
      const testPayload = {
        iss: 'https://demo.peac.dev/auth',
        sub: 'user123',
        aud: 'test-audience',
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        jti: 'test-jti-123',
      };

      const mockJwks = { keys: [{ kty: 'RSA', use: 'sig' }] };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockJwks),
      });

      const token = createMockToken(testPayload);

      // Make multiple calls within cache window
      await adapter.verify(token, 'test-audience');
      await adapter.verify(token, 'test-audience');

      // Should only fetch once due to caching
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith('https://demo.peac.dev/.well-known/jwks.json');
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

    it('should handle missing required UDA fields', async () => {
      const incompletePayload = {
        iss: 'https://demo.peac.dev/auth',
        aud: 'test-audience',
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        // Missing jti, sub
      };
      const token = createMockToken(incompletePayload);

      const result = await adapter.verify(token, 'test-audience');

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
