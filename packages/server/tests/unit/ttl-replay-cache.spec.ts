import { TTLReplayCache } from '../../src/utils/ttl-replay-cache';

describe('TTLReplayCache', () => {
  let originalDateNow;
  let mockTime;

  beforeEach(() => {
    originalDateNow = Date.now;
    mockTime = 1000000000;
    Date.now = jest.fn(() => mockTime);
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  describe('constructor', () => {
    it('should create cache with default options', () => {
      const cache = new TTLReplayCache();
      const stats = cache.getStats();

      expect(stats.ttlMs).toBe(10 * 60 * 1000); // 10 minutes
      expect(stats.maxSize).toBe(10_000);
      expect(stats.size).toBe(0);
    });

    it('should create cache with custom options', () => {
      const cache = new TTLReplayCache({ ttlMs: 5000, maxSize: 100 });
      const stats = cache.getStats();

      expect(stats.ttlMs).toBe(5000);
      expect(stats.maxSize).toBe(100);
      expect(stats.size).toBe(0);
    });

    it('should create cache with partial options', () => {
      const cache = new TTLReplayCache({ ttlMs: 3000 });
      const stats = cache.getStats();

      expect(stats.ttlMs).toBe(3000);
      expect(stats.maxSize).toBe(10_000);
    });

    it('should create cache with empty options object', () => {
      const cache = new TTLReplayCache({});
      const stats = cache.getStats();

      expect(stats.ttlMs).toBe(10 * 60 * 1000);
      expect(stats.maxSize).toBe(10_000);
    });
  });

  describe('add', () => {
    it('should add items to cache', () => {
      const cache = new TTLReplayCache();

      cache.add('item1');
      cache.add('item2');

      expect(cache.getStats().size).toBe(2);
      expect(cache.has('item1')).toBe(true);
      expect(cache.has('item2')).toBe(true);
    });

    it('should update timestamp when adding same item again', () => {
      const cache = new TTLReplayCache({ ttlMs: 5000 });

      cache.add('item1');
      mockTime += 2000;
      cache.add('item1');

      expect(cache.getStats().size).toBe(1);
      expect(cache.has('item1')).toBe(true);

      // Should still be valid after original TTL would have expired
      mockTime += 4000; // Total 6000ms, original would expire at 5000ms
      expect(cache.has('item1')).toBe(true);
    });

    it('should remove oldest item when maxSize exceeded', () => {
      const cache = new TTLReplayCache({ maxSize: 2 });

      cache.add('item1');
      cache.add('item2');
      cache.add('item3'); // This should remove item1

      expect(cache.getStats().size).toBe(2);
      expect(cache.has('item1')).toBe(false);
      expect(cache.has('item2')).toBe(true);
      expect(cache.has('item3')).toBe(true);
    });

    it('should handle maxSize of 1', () => {
      const cache = new TTLReplayCache({ maxSize: 1 });

      cache.add('item1');
      expect(cache.has('item1')).toBe(true);

      cache.add('item2');
      expect(cache.has('item1')).toBe(false);
      expect(cache.has('item2')).toBe(true);
      expect(cache.getStats().size).toBe(1);
    });

    it('should clean up expired items during add', () => {
      const cache = new TTLReplayCache({ ttlMs: 5000 });

      cache.add('item1');
      mockTime += 6000; // Expire item1
      cache.add('item2');

      expect(cache.getStats().size).toBe(1);
      expect(cache.has('item1')).toBe(false);
      expect(cache.has('item2')).toBe(true);
    });
  });

  describe('has', () => {
    it('should return false for non-existent items', () => {
      const cache = new TTLReplayCache();

      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should return true for existing items within TTL', () => {
      const cache = new TTLReplayCache({ ttlMs: 5000 });

      cache.add('item1');
      mockTime += 2000;

      expect(cache.has('item1')).toBe(true);
    });

    it('should return false for expired items', () => {
      const cache = new TTLReplayCache({ ttlMs: 5000 });

      cache.add('item1');
      mockTime += 6000; // Exceed TTL

      expect(cache.has('item1')).toBe(false);
    });

    it('should return false for items that expire exactly at TTL', () => {
      const cache = new TTLReplayCache({ ttlMs: 5000 });

      cache.add('item1');
      mockTime += 5000; // Exactly at TTL

      expect(cache.has('item1')).toBe(false);
    });

    it('should clean up expired items during check', () => {
      const cache = new TTLReplayCache({ ttlMs: 5000 });

      cache.add('item1');
      cache.add('item2');
      mockTime += 6000; // Expire both items

      expect(cache.has('item1')).toBe(false);
      expect(cache.getStats().size).toBe(0);
    });

    it('should clean up some expired items while keeping valid ones', () => {
      const cache = new TTLReplayCache({ ttlMs: 5000 });

      cache.add('item1');
      mockTime += 3000;
      cache.add('item2');
      mockTime += 3000; // item1 expired (6000ms total), item2 still valid (3000ms)

      expect(cache.has('item2')).toBe(true);
      expect(cache.has('item1')).toBe(false);
      expect(cache.getStats().size).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return correct stats for empty cache', () => {
      const cache = new TTLReplayCache({ ttlMs: 1000, maxSize: 50 });
      const stats = cache.getStats();

      expect(stats.size).toBe(0);
      expect(stats.maxSize).toBe(50);
      expect(stats.ttlMs).toBe(1000);
    });

    it('should return correct stats with items', () => {
      const cache = new TTLReplayCache({ ttlMs: 1000, maxSize: 50 });

      cache.add('item1');
      cache.add('item2');
      cache.add('item3');

      const stats = cache.getStats();
      expect(stats.size).toBe(3);
      expect(stats.maxSize).toBe(50);
      expect(stats.ttlMs).toBe(1000);
    });

    it('should return updated size after cleanup', () => {
      const cache = new TTLReplayCache({ ttlMs: 5000 });

      cache.add('item1');
      cache.add('item2');
      mockTime += 6000; // Expire items

      // Trigger cleanup by calling has
      cache.has('item1');

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle zero TTL', () => {
      const cache = new TTLReplayCache({ ttlMs: 0 });

      cache.add('item1');
      expect(cache.has('item1')).toBe(false); // Should be expired immediately
    });

    it('should handle very large TTL', () => {
      const cache = new TTLReplayCache({ ttlMs: Number.MAX_SAFE_INTEGER });

      cache.add('item1');
      mockTime += 1000000; // Large time jump
      expect(cache.has('item1')).toBe(true);
    });

    it('should handle maxSize of 0', () => {
      const cache = new TTLReplayCache({ maxSize: 0 });

      cache.add('item1');
      expect(cache.getStats().size).toBe(1); // Item gets added since map is empty
      expect(cache.has('item1')).toBe(true);
      
      cache.add('item2'); // This should remove item1 and add item2
      expect(cache.getStats().size).toBe(1);
      expect(cache.has('item1')).toBe(false);
      expect(cache.has('item2')).toBe(true);
    });

    it('should handle rapid consecutive adds', () => {
      const cache = new TTLReplayCache({ maxSize: 3 });

      for (let i = 0; i < 10; i++) {
        cache.add(`item${i}`);
      }

      expect(cache.getStats().size).toBe(3);
      expect(cache.has('item7')).toBe(true);
      expect(cache.has('item8')).toBe(true);
      expect(cache.has('item9')).toBe(true);
    });

    it('should handle empty string keys', () => {
      const cache = new TTLReplayCache();

      cache.add('');
      expect(cache.has('')).toBe(true);
      expect(cache.getStats().size).toBe(1);
    });

    it('should handle special character keys', () => {
      const cache = new TTLReplayCache();

      cache.add('key with spaces');
      cache.add('key/with/slashes');
      cache.add('key-with-dashes');
      cache.add('key.with.dots');

      expect(cache.has('key with spaces')).toBe(true);
      expect(cache.has('key/with/slashes')).toBe(true);
      expect(cache.has('key-with-dashes')).toBe(true);
      expect(cache.has('key.with.dots')).toBe(true);
      expect(cache.getStats().size).toBe(4);
    });
  });
});