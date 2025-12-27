import { describe, it, expect } from 'vitest';
import {
  DEFAULT_K_THRESHOLD,
  checkKAnonymity,
  meetsKAnonymity,
  filterByKAnonymity,
  aggregateSmallBuckets,
  type MetricBucket,
} from '../src/k-anonymity.js';

describe('k-anonymity primitives', () => {
  describe('DEFAULT_K_THRESHOLD', () => {
    it('should be 20', () => {
      expect(DEFAULT_K_THRESHOLD).toBe(20);
    });
  });

  describe('checkKAnonymity', () => {
    it('should return meetsThreshold=true when groupSize >= 20', () => {
      const result = checkKAnonymity(20);
      expect(result.meetsThreshold).toBe(true);
      expect(result.groupSize).toBe(20);
      expect(result.kThreshold).toBe(20);
    });

    it('should return meetsThreshold=false when groupSize < 20', () => {
      const result = checkKAnonymity(19);
      expect(result.meetsThreshold).toBe(false);
      expect(result.groupSize).toBe(19);
      expect(result.kThreshold).toBe(20);
    });

    it('should use custom threshold when provided', () => {
      const result = checkKAnonymity(25, { kThreshold: 30 });
      expect(result.meetsThreshold).toBe(false);
      expect(result.kThreshold).toBe(30);
    });

    it('should enforce minimum threshold of 20', () => {
      // Even if user asks for k=5, we enforce k=20 minimum
      const result = checkKAnonymity(15, { kThreshold: 5 });
      expect(result.meetsThreshold).toBe(false);
      expect(result.kThreshold).toBe(20);
    });

    it('should handle large group sizes', () => {
      const result = checkKAnonymity(1000000);
      expect(result.meetsThreshold).toBe(true);
      expect(result.groupSize).toBe(1000000);
    });

    it('should handle zero group size', () => {
      const result = checkKAnonymity(0);
      expect(result.meetsThreshold).toBe(false);
      expect(result.groupSize).toBe(0);
    });
  });

  describe('meetsKAnonymity', () => {
    it('should return true when count >= threshold', () => {
      expect(meetsKAnonymity(20)).toBe(true);
      expect(meetsKAnonymity(100)).toBe(true);
      expect(meetsKAnonymity(25, 25)).toBe(true);
    });

    it('should return false when count < threshold', () => {
      expect(meetsKAnonymity(19)).toBe(false);
      expect(meetsKAnonymity(0)).toBe(false);
      expect(meetsKAnonymity(24, 25)).toBe(false);
    });

    it('should enforce minimum threshold of 20', () => {
      // Even with k=5, should require at least 20
      expect(meetsKAnonymity(15, 5)).toBe(false);
      expect(meetsKAnonymity(20, 5)).toBe(true);
    });
  });

  describe('filterByKAnonymity', () => {
    const buckets: MetricBucket<number>[] = [
      { key: 'bot:googlebot', count: 100, value: 1000 },
      { key: 'bot:bingbot', count: 50, value: 500 },
      { key: 'bot:twitterbot', count: 15, value: 150 },
      { key: 'bot:facebookbot', count: 5, value: 50 },
    ];

    it('should filter out buckets below threshold', () => {
      const filtered = filterByKAnonymity(buckets);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((b) => b.key)).toEqual(['bot:googlebot', 'bot:bingbot']);
    });

    it('should keep all buckets meeting threshold', () => {
      const largeBuckets: MetricBucket<number>[] = [
        { key: 'a', count: 100, value: 1 },
        { key: 'b', count: 50, value: 2 },
        { key: 'c', count: 20, value: 3 },
      ];
      const filtered = filterByKAnonymity(largeBuckets);
      expect(filtered).toHaveLength(3);
    });

    it('should use custom threshold', () => {
      const filtered = filterByKAnonymity(buckets, { kThreshold: 60 });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].key).toBe('bot:googlebot');
    });

    it('should return empty array when no buckets meet threshold', () => {
      const smallBuckets: MetricBucket<number>[] = [
        { key: 'a', count: 5, value: 1 },
        { key: 'b', count: 10, value: 2 },
      ];
      const filtered = filterByKAnonymity(smallBuckets);
      expect(filtered).toHaveLength(0);
    });
  });

  describe('aggregateSmallBuckets', () => {
    const sumFn = (values: number[]) => values.reduce((a, b) => a + b, 0);

    it('should aggregate small buckets into __other__', () => {
      const buckets: MetricBucket<number>[] = [
        { key: 'large', count: 100, value: 1000 },
        { key: 'small1', count: 10, value: 100 },
        { key: 'small2', count: 15, value: 150 },
      ];

      const result = aggregateSmallBuckets(buckets, sumFn);
      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('large');

      const other = result.find((b) => b.key === '__other__');
      expect(other).toBeDefined();
      expect(other!.count).toBe(25);
      expect(other!.value).toBe(250);
    });

    it('should suppress small buckets if combined count < threshold', () => {
      const buckets: MetricBucket<number>[] = [
        { key: 'large', count: 100, value: 1000 },
        { key: 'small1', count: 5, value: 50 },
        { key: 'small2', count: 5, value: 50 },
      ];

      const result = aggregateSmallBuckets(buckets, sumFn);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('large');
    });

    it('should keep all buckets when all meet threshold', () => {
      const buckets: MetricBucket<number>[] = [
        { key: 'a', count: 50, value: 500 },
        { key: 'b', count: 30, value: 300 },
        { key: 'c', count: 20, value: 200 },
      ];

      const result = aggregateSmallBuckets(buckets, sumFn);
      expect(result).toHaveLength(3);
      expect(result.find((b) => b.key === '__other__')).toBeUndefined();
    });

    it('should handle empty input', () => {
      const result = aggregateSmallBuckets([], sumFn);
      expect(result).toHaveLength(0);
    });

    it('should handle all small buckets with sufficient combined count', () => {
      const buckets: MetricBucket<number>[] = [
        { key: 'a', count: 7, value: 70 },
        { key: 'b', count: 7, value: 70 },
        { key: 'c', count: 7, value: 70 },
      ];

      const result = aggregateSmallBuckets(buckets, sumFn);
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('__other__');
      expect(result[0].count).toBe(21);
      expect(result[0].value).toBe(210);
    });
  });
});
