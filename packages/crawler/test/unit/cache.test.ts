/**
 * @peac/crawler v0.9.12.1 - Cache unit tests
 * Tests for verification cache with TTL and in-flight deduplication
 */

import { VerificationCache } from '../../src/cache.js';
import { VerifyRequest, VerificationResult } from '../../src/types.js';

describe('VerificationCache', () => {
  let cache: VerificationCache;
  
  beforeEach(() => {
    cache = new VerificationCache('test');
  });
  
  afterEach(() => {
    cache.clear();
  });
  
  describe('key generation', () => {
    it('should generate consistent keys for same request', () => {
      const req: VerifyRequest = {
        requestId: 'test-123',
        ip: '1.2.3.4',
        userAgent: 'TestBot/1.0'
      };
      
      const key1 = cache.key(req);
      const key2 = cache.key(req);
      
      expect(key1).toBe(key2);
      expect(key1).toBe('test:1.2.3.4:TestBot/1.0');
    });
    
    it('should generate different keys for different requests', () => {
      const req1: VerifyRequest = {
        requestId: 'test-123',
        ip: '1.2.3.4',
        userAgent: 'TestBot/1.0'
      };
      
      const req2: VerifyRequest = {
        requestId: 'test-456',
        ip: '1.2.3.5',
        userAgent: 'TestBot/1.0'
      };
      
      const key1 = cache.key(req1);
      const key2 = cache.key(req2);
      
      expect(key1).not.toBe(key2);
    });
  });
  
  describe('cache operations', () => {
    const mockRequest: VerifyRequest = {
      requestId: 'test-123',
      ip: '1.2.3.4',
      userAgent: 'TestBot/1.0'
    };
    
    const mockResult: VerificationResult = {
      provider: 'test',
      result: 'trusted',
      confidence: 0.8
    };
    
    it('should cache and retrieve results', async () => {
      const computeFn = jest.fn().mockResolvedValue(mockResult);
      
      // First call should invoke compute function
      const result1 = await cache.getOrCompute(mockRequest, computeFn);
      expect(computeFn).toHaveBeenCalledTimes(1);
      expect(result1).toEqual(mockResult);
      expect(result1.fromCache).toBeUndefined();
      
      // Second call should use cache
      const result2 = await cache.getOrCompute(mockRequest, computeFn);
      expect(computeFn).toHaveBeenCalledTimes(1); // Not called again
      expect(result2).toEqual({ ...mockResult, fromCache: true });
    });
    
    it('should deduplicate in-flight requests', async () => {
      const computeFn = jest.fn().mockImplementation(async () => {
        // Simulate async work
        await new Promise(resolve => setTimeout(resolve, 10));
        return mockResult;
      });
      
      // Start multiple concurrent requests
      const promises = [
        cache.getOrCompute(mockRequest, computeFn),
        cache.getOrCompute(mockRequest, computeFn),
        cache.getOrCompute(mockRequest, computeFn)
      ];
      
      const results = await Promise.all(promises);
      
      // Should only call compute function once
      expect(computeFn).toHaveBeenCalledTimes(1);
      
      // All results should be identical
      results.forEach(result => {
        expect(result).toEqual(mockResult);
      });
    });
    
    it('should handle errors in compute function', async () => {
      const error = new Error('Compute failed');
      const computeFn = jest.fn().mockRejectedValue(error);
      
      await expect(cache.getOrCompute(mockRequest, computeFn)).rejects.toThrow('Compute failed');
      expect(computeFn).toHaveBeenCalledTimes(1);
      
      // Should not cache errors
      expect(cache.has(mockRequest)).toBe(false);
    });
    
    it('should clean up in-flight requests after completion', async () => {
      const computeFn = jest.fn().mockResolvedValue(mockResult);
      
      // Start request
      const promise = cache.getOrCompute(mockRequest, computeFn);
      
      // Should be in-flight
      expect(cache.getInFlightKeys()).toContain(cache.key(mockRequest));
      
      // Wait for completion
      await promise;
      
      // Should no longer be in-flight
      expect(cache.getInFlightKeys()).not.toContain(cache.key(mockRequest));
    });
    
    it('should clean up in-flight requests after error', async () => {
      const error = new Error('Compute failed');
      const computeFn = jest.fn().mockRejectedValue(error);
      
      // Start request
      const promise = cache.getOrCompute(mockRequest, computeFn);
      
      // Should be in-flight
      expect(cache.getInFlightKeys()).toContain(cache.key(mockRequest));
      
      // Wait for error
      await expect(promise).rejects.toThrow();
      
      // Should no longer be in-flight
      expect(cache.getInFlightKeys()).not.toContain(cache.key(mockRequest));
    });
  });
  
  describe('cache management', () => {
    const mockRequest: VerifyRequest = {
      requestId: 'test-123',
      ip: '1.2.3.4',
      userAgent: 'TestBot/1.0'
    };
    
    const mockResult: VerificationResult = {
      provider: 'test',
      result: 'trusted',
      confidence: 0.8
    };
    
    it('should support manual deletion', async () => {
      const computeFn = jest.fn().mockResolvedValue(mockResult);
      
      // Add to cache
      await cache.getOrCompute(mockRequest, computeFn);
      expect(cache.has(mockRequest)).toBe(true);
      
      // Delete
      const deleted = cache.delete(mockRequest);
      expect(deleted).toBe(true);
      expect(cache.has(mockRequest)).toBe(false);
      
      // Next call should invoke compute again
      await cache.getOrCompute(mockRequest, computeFn);
      expect(computeFn).toHaveBeenCalledTimes(2);
    });
    
    it('should support cache clearing', async () => {
      const computeFn = jest.fn().mockResolvedValue(mockResult);
      
      // Add multiple entries
      const requests = [
        { ...mockRequest, ip: '1.1.1.1' },
        { ...mockRequest, ip: '2.2.2.2' },
        { ...mockRequest, ip: '3.3.3.3' }
      ];
      
      for (const req of requests) {
        await cache.getOrCompute(req, computeFn);
      }
      
      expect(cache.getStats().size).toBe(3);
      
      // Clear cache
      cache.clear();
      
      expect(cache.getStats().size).toBe(0);
      expect(cache.getStats().hits).toBe(0);
      expect(cache.getStats().misses).toBe(0);
    });
  });
  
  describe('statistics', () => {
    const mockRequest: VerifyRequest = {
      requestId: 'test-123',
      ip: '1.2.3.4',
      userAgent: 'TestBot/1.0'
    };
    
    const mockResult: VerificationResult = {
      provider: 'test',
      result: 'trusted',
      confidence: 0.8
    };
    
    it('should track hit/miss statistics', async () => {
      const computeFn = jest.fn().mockResolvedValue(mockResult);
      
      // First call = miss
      await cache.getOrCompute(mockRequest, computeFn);
      let stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(1);
      expect(stats.hit_rate).toBe(0);
      
      // Second call = hit
      await cache.getOrCompute(mockRequest, computeFn);
      stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hit_rate).toBe(0.5);
      
      // Third call = hit
      await cache.getOrCompute(mockRequest, computeFn);
      stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hit_rate).toBeCloseTo(0.667, 3);
    });
    
    it('should count deduplication as hits', async () => {
      const computeFn = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return mockResult;
      });
      
      // Concurrent requests should count as hits
      await Promise.all([
        cache.getOrCompute(mockRequest, computeFn),
        cache.getOrCompute(mockRequest, computeFn)
      ]);
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(1); // Second request was deduplicated
      expect(stats.misses).toBe(1); // First request was a miss
      expect(stats.hit_rate).toBe(0.5);
    });
  });
});