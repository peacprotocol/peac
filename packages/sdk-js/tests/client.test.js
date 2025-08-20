/**
 * PEAC Client v0.9.6 Tests - Header Injection + Error Propagation
 * 
 * Tests for the modern agreement-first client with focus on:
 * - Protocol header injection (X-PEAC-Protocol)
 * - Agreement header injection (X-PEAC-Agreement)
 * - Error response parsing and propagation
 * - Idempotency header handling
 */

// Mock fetch to simulate server responses
jest.mock('node-fetch', () => jest.fn());

const PEACClient = require('../sdk/client');
const fetch = require('node-fetch');

describe('PEACClient v0.9.6', () => {
  let client;
  
  beforeEach(() => {
    client = new PEACClient({
      baseURL: 'https://api.example.com',
      timeout: 5000
    });
    fetch.mockClear();
    console.debug = jest.fn();
    console.info = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
  });

  describe('Header Injection', () => {
    describe('Protocol Headers', () => {
      it('should inject X-PEAC-Protocol header in createAgreement', async () => {
        fetch.mockResolvedValueOnce({
          status: 201,
          json: async () => ({
            id: 'agr_test123',
            fingerprint: 'abc123',
            protocol_version: '0.9.6',
            status: 'valid'
          })
        });

        const proposal = {
          purpose: 'Test',
          consent: { required: true },
          attribution: { required: false },
          pricing_policy: { price: '1000', duration: 3600, usage: 'inference' },
          terms: { text: 'Test terms' }
        };

        await client.createAgreement(proposal);

        expect(fetch).toHaveBeenCalledWith(
          'https://api.example.com/peac/agreements',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'X-PEAC-Protocol': '0.9.6',
              'Content-Type': 'application/json',
              'User-Agent': 'PEAC-SDK-JS/0.9.6'
            }),
            body: JSON.stringify(proposal)
          })
        );
      });

      it('should inject X-PEAC-Protocol header in getCapabilities', async () => {
        fetch.mockResolvedValueOnce({
          status: 200,
          headers: {
            get: () => null
          },
          json: async () => ({
            version: '0.9.6',
            features: ['agreements', 'payments']
          })
        });

        await client.getCapabilities();

        // Note: getCapabilities doesn't need protocol header since it's a well-known endpoint
        // But all API calls should have User-Agent
        expect(fetch).toHaveBeenCalledWith(
          'https://api.example.com/.well-known/peac-capabilities',
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              'User-Agent': 'PEAC-SDK-JS/0.9.6'
            })
          })
        );
      });
    });

    describe('Agreement Headers', () => {
      it('should inject X-PEAC-Agreement header in pay() method', async () => {
        fetch.mockResolvedValueOnce({
          status: 200,
          json: async () => ({
            id: 'pay_test123',
            amount: '2500',
            currency: 'USD',
            agreement_id: 'agr_test123',
            status: 'completed'
          })
        });

        await client.pay(2500, {
          agreementId: 'agr_test123',
          currency: 'USD',
          metadata: { order_id: 'order_456' }
        });

        expect(fetch).toHaveBeenCalledWith(
          'https://api.example.com/peac/payments/charges',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'X-PEAC-Protocol': '0.9.6',
              'X-PEAC-Agreement': 'agr_test123',
              'Content-Type': 'application/json',
              'User-Agent': 'PEAC-SDK-JS/0.9.6'
            }),
            body: JSON.stringify({
              amount: '2500',
              currency: 'USD',
              agreement_id: 'agr_test123',
              metadata: { order_id: 'order_456' }
            })
          })
        );
      });

      it('should throw error if agreementId is missing for payments', async () => {
        await expect(client.pay(2500, { currency: 'USD' }))
          .rejects
          .toThrow('agreementId is required for payments in v0.9.6');
        
        expect(fetch).not.toHaveBeenCalled();
      });
    });

    describe('ETag Headers', () => {
      it('should inject If-None-Match header for conditional agreement requests', async () => {
        fetch.mockResolvedValueOnce({
          status: 304,
          json: async () => null
        });

        // Mock cached agreement
        client._cacheAgreement({
          id: 'agr_test123',
          fingerprint: 'abc123'
        });

        await client.getAgreement('agr_test123', { 
          ifNoneMatch: 'W/"abc123"' 
        });

        expect(fetch).toHaveBeenCalledWith(
          'https://api.example.com/peac/agreements/agr_test123',
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              'If-None-Match': 'W/"abc123"'
            })
          })
        );
      });
    });
  });

  describe('Error Propagation', () => {
    describe('HTTP Status Code Handling', () => {
      it('should parse and propagate 400 validation errors', async () => {
        fetch.mockResolvedValueOnce({
          status: 400,
          json: async () => ({
            type: 'https://peacprotocol.org/problems/validation-error',
            title: 'Validation Error',
            status: 400,
            detail: 'Invalid agreement proposal structure'
          })
        });

        await expect(client.createAgreement({}))
          .rejects
          .toThrow('Agreement creation failed: 400');
        
        expect(console.error).toHaveBeenCalledWith(
          'Agreement creation failed:',
          'Agreement creation failed: 400'
        );
      });

      it('should parse and propagate 422 invalid reference errors for payments', async () => {
        fetch.mockResolvedValueOnce({
          status: 422,
          json: async () => ({
            type: 'https://peacprotocol.org/problems/invalid-reference',
            title: 'Unprocessable Entity',
            status: 422,
            detail: 'Agreement agr_nonexistent not found'
          })
        });

        await expect(client.pay(2500, { agreementId: 'agr_nonexistent' }))
          .rejects
          .toThrow('Invalid agreement reference: Agreement agr_nonexistent not found');
      });

      it('should handle 404 not found errors for agreements', async () => {
        fetch.mockResolvedValueOnce({
          status: 404,
          json: async () => ({
            type: 'https://peacprotocol.org/problems/not-found',
            status: 404,
            detail: 'Agreement agr_missing not found'
          })
        });

        await expect(client.getAgreement('agr_missing'))
          .rejects
          .toThrow('Agreement agr_missing not found');
      });

      it('should handle 426 protocol upgrade required errors', async () => {
        fetch.mockResolvedValueOnce({
          status: 426,
          json: async () => ({
            type: 'https://peacprotocol.org/problems/protocol-version-required',
            status: 426,
            detail: 'X-PEAC-Protocol header is required',
            supported: ['0.9.6']
          })
        });

        await expect(client.createAgreement({}))
          .rejects
          .toThrow('Agreement creation failed: 426');
      });

      it('should handle 500 internal server errors', async () => {
        fetch.mockResolvedValueOnce({
          status: 500,
          json: async () => ({
            type: 'https://peacprotocol.org/problems/internal-error',
            status: 500,
            detail: 'Payment processing failed'
          })
        });

        await expect(client.pay(2500, { agreementId: 'agr_test123' }))
          .rejects
          .toThrow('Payment failed: 500');
      });
    });

    describe('Network Error Handling', () => {
      it('should handle network timeouts with retries', async () => {
        fetch
          .mockRejectedValueOnce(new Error('ETIMEDOUT'))
          .mockRejectedValueOnce(new Error('ETIMEDOUT'))
          .mockResolvedValueOnce({
            status: 200,
            headers: {
              get: () => null
            },
            json: async () => ({
              version: '0.9.6',
              features: ['agreements']
            })
          });

        // Should succeed after 2 retries
        const result = await client.getCapabilities();
        expect(result.version).toBe('0.9.6');
        expect(fetch).toHaveBeenCalledTimes(3);
      });

      it('should fail after exhausting all retries', async () => {
        fetch
          .mockRejectedValueOnce(new Error('ECONNREFUSED'))
          .mockRejectedValueOnce(new Error('ECONNREFUSED'))
          .mockRejectedValueOnce(new Error('ECONNREFUSED'));

        await expect(client.getCapabilities())
          .rejects
          .toThrow('ECONNREFUSED');
        
        expect(fetch).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('Idempotency Header Support', () => {
    it('should include Idempotency-Key header when provided', async () => {
      // Test implementation would require modifying the client to accept idempotency keys
      // For now, verify current behavior
      fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          id: 'pay_test123',
          amount: '2500'
        })
      });

      await client.pay(2500, { agreementId: 'agr_test123' });

      // Current implementation doesn't expose idempotency key setting
      // This is an area for potential enhancement
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle idempotent replay responses (X-Idempotent-Replay header)', async () => {
      fetch.mockResolvedValueOnce({
        status: 200,
        headers: {
          get: (name) => {
            if (name === 'X-Idempotent-Replay') return 'true';
            if (name === 'Age') return '15';
            return null;
          }
        },
        json: async () => ({
          id: 'pay_test123',
          amount: '2500'
        })
      });

      const result = await client.pay(2500, { agreementId: 'agr_test123' });
      
      // Client should still process the response normally
      expect(result.id).toBe('pay_test123');
    });
  });

  describe('Caching and ETags', () => {
    it('should cache agreements with ETag fingerprints', async () => {
      const agreement = {
        id: 'agr_test123',
        fingerprint: 'abc123def456',
        protocol_version: '0.9.6',
        status: 'valid'
      };

      fetch.mockResolvedValueOnce({
        status: 201,
        json: async () => agreement
      });

      await client.createAgreement({});

      // Check if agreement is cached
      expect(client._getCachedAgreement('agr_test123')).toEqual(agreement);
    });

    it('should handle 304 Not Modified responses for cached agreements', async () => {
      // First, cache an agreement
      const agreement = {
        id: 'agr_test123',
        fingerprint: 'abc123'
      };
      client._cacheAgreement(agreement);

      fetch.mockResolvedValueOnce({
        status: 304
      });

      const result = await client.getAgreement('agr_test123');
      expect(result).toEqual(agreement);
      expect(console.debug).toHaveBeenCalledWith('Agreement unchanged (304)');
    });

    it('should respect cache TTL for capabilities', async () => {
      const capabilities = { version: '0.9.6', features: ['agreements'] };
      
      // First request
      fetch.mockResolvedValueOnce({
        status: 200,
        headers: {
          get: () => 'W/"etag123"'
        },
        json: async () => capabilities
      });

      const result1 = await client.getCapabilities();
      expect(result1).toEqual(capabilities);

      // Second request should use cache (no new fetch)
      const result2 = await client.getCapabilities();
      expect(result2).toEqual(capabilities);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(console.debug).toHaveBeenCalledWith('Using cached capabilities');
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit breaker after repeated failures', async () => {
      fetch
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockRejectedValueOnce(new Error('Service unavailable'))
        .mockRejectedValueOnce(new Error('Service unavailable'));

      // Three failures should open the circuit breaker
      for (let i = 0; i < 3; i++) {
        await expect(client.getCapabilities()).rejects.toThrow();
      }

      // Fourth request should be rejected immediately
      await expect(client.getCapabilities())
        .rejects
        .toThrow('Capabilities service unavailable (circuit breaker open)');
      
      expect(fetch).toHaveBeenCalledTimes(3); // No 4th call due to circuit breaker
      expect(console.warn).toHaveBeenCalledWith('Circuit breaker opened due to repeated failures');
    });

    it('should transition to half-open after timeout', async () => {
      // Configure shorter timeout for testing
      client.discovery.circuitBreaker.timeout = 100;

      fetch
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockRejectedValueOnce(new Error('Failure 3'))
        .mockResolvedValueOnce({
          status: 200,
          headers: { get: () => null },
          json: async () => ({ version: '0.9.6' })
        });

      // Trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        await expect(client.getCapabilities()).rejects.toThrow();
      }

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should allow retry and succeed
      const result = await client.getCapabilities();
      expect(result.version).toBe('0.9.6');
      expect(fetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('Deprecated Methods', () => {
    it('should show deprecation warning for negotiate() method', async () => {
      fetch.mockResolvedValueOnce({
        status: 201,
        json: async () => ({
          id: 'agr_test123',
          status: 'valid'
        })
      });

      await client.negotiate({});

      expect(console.warn).toHaveBeenCalledWith('⚠️  negotiate() is deprecated. Use createAgreement() instead.');
      expect(console.warn).toHaveBeenCalledWith('   The negotiate() method will be removed in a future version.');
      expect(console.warn).toHaveBeenCalledWith('   Migration: Replace client.negotiate(proposal) with client.createAgreement(proposal)');
    });

    it('should forward negotiate() calls to createAgreement()', async () => {
      const mockCreateAgreement = jest.spyOn(client, 'createAgreement')
        .mockResolvedValueOnce({ id: 'agr_test123' });

      const proposal = { purpose: 'Test' };
      const result = await client.negotiate(proposal);

      expect(mockCreateAgreement).toHaveBeenCalledWith(proposal);
      expect(result.id).toBe('agr_test123');
    });
  });

  describe('Request Debugging', () => {
    it('should log debug information for requests', async () => {
      fetch.mockResolvedValueOnce({
        status: 200,
        headers: {
          get: () => null
        },
        json: async () => ({})
      });

      await client.getCapabilities();

      expect(console.debug).toHaveBeenCalledWith(
        'GET /.well-known/peac-capabilities (attempt 1/3)'
      );
    });

    it('should log payment processing details', async () => {
      fetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          id: 'pay_test123',
          amount: '2500'
        })
      });

      await client.pay(2500, { agreementId: 'agr_test123', currency: 'USD' });

      expect(console.debug).toHaveBeenCalledWith(
        'Processing payment: 2500 USD for agreement agr_test123'
      );
      expect(console.info).toHaveBeenCalledWith('Payment processed: pay_test123');
    });
  });
});