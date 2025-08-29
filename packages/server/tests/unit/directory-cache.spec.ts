import { directoryCache, hasThumbprintOverlap } from '../../src/adapters/webbot/cache';

describe('Directory Cache', () => {
  beforeEach(() => {
    directoryCache.clear();
  });

  describe('cache operations', () => {
    it('should store and retrieve directory records', () => {
      const record = {
        origin: 'https://example.com',
        verifiedAt: Date.now(),
        expiresAt: Date.now() + 86400000, // 24 hours
        keys: [
          {
            thumbprint: 'thumb123',
            jwk: { kty: 'OKP', crv: 'Ed25519', x: 'test' },
          },
        ],
        pinnedThumbs: new Set(['thumb123']),
      };

      directoryCache.set(record);
      const retrieved = directoryCache.get('https://example.com');

      expect(retrieved).toBeDefined();
      expect(retrieved?.origin).toBe('https://example.com');
      expect(retrieved?.keys).toHaveLength(1);
    });

    it('should return undefined for expired records', () => {
      const record = {
        origin: 'https://example.com',
        verifiedAt: Date.now() - 86400000,
        expiresAt: Date.now() - 1000, // Expired 1 second ago
        keys: [],
        pinnedThumbs: new Set(),
      };

      directoryCache.set(record);
      const retrieved = directoryCache.get('https://example.com');

      expect(retrieved).toBeUndefined();
    });

    it('should handle negative cache', () => {
      const until = Date.now() + 300000; // 5 minutes from now
      
      directoryCache.setNegative('https://failing.com', until);
      const negativeUntil = directoryCache.getNegative('https://failing.com');

      expect(negativeUntil).toBe(until);
    });

    it('should clean up expired negative cache', () => {
      const until = Date.now() - 1000; // 1 second ago
      
      directoryCache.setNegative('https://failing.com', until);
      const negativeUntil = directoryCache.getNegative('https://failing.com');

      expect(negativeUntil).toBeUndefined();
    });
  });

  describe('thumbprint overlap', () => {
    it('should detect overlap between thumbprint sets', () => {
      const oldThumbs = new Set(['thumb1', 'thumb2', 'thumb3']);
      const newThumbs = new Set(['thumb3', 'thumb4', 'thumb5']);

      expect(hasThumbprintOverlap(oldThumbs, newThumbs)).toBe(true);
    });

    it('should detect no overlap between thumbprint sets', () => {
      const oldThumbs = new Set(['thumb1', 'thumb2', 'thumb3']);
      const newThumbs = new Set(['thumb4', 'thumb5', 'thumb6']);

      expect(hasThumbprintOverlap(oldThumbs, newThumbs)).toBe(false);
    });

    it('should handle empty sets', () => {
      const oldThumbs = new Set(['thumb1']);
      const newThumbs = new Set();

      expect(hasThumbprintOverlap(oldThumbs, newThumbs)).toBe(false);
      expect(hasThumbprintOverlap(newThumbs, oldThumbs)).toBe(false);
    });
  });
});