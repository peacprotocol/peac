import { describe, it, expect } from 'vitest';
import {
  aggregateRequestsByBot,
  aggregateRevenueByRail,
  generateMetrics,
  type ReceiptEvent,
} from '../src/index.js';

describe('metrics-api', () => {
  // Helper to create test events
  function createEvents(
    botCounts: Record<string, number>,
    options: { withPayment?: boolean; railId?: string } = {}
  ): ReceiptEvent[] {
    const events: ReceiptEvent[] = [];
    let id = 0;

    for (const [botId, count] of Object.entries(botCounts)) {
      for (let i = 0; i < count; i++) {
        events.push({
          receiptId: `receipt-${id++}`,
          timestamp: '2025-01-01T00:00:00Z',
          botId,
          railId: options.railId ?? 'stripe',
          amountMinorUnits: options.withPayment ? 100n : undefined,
          currency: 'USD',
          bytesTransferred: 1000,
          wasChallenge: false,
          paymentSuccessful: options.withPayment ?? false,
        });
      }
    }

    return events;
  }

  describe('aggregateRequestsByBot', () => {
    it('should aggregate requests by bot with k-anonymity', () => {
      const events = createEvents({
        googlebot: 50,
        bingbot: 30,
        smallbot: 5,
      });

      const { metrics, suppressed } = aggregateRequestsByBot(events);

      // googlebot and bingbot should be present (>= 20)
      // smallbot should be suppressed (< 20, and alone can't form __other__)
      expect(metrics.some((m) => m.botId === 'googlebot')).toBe(true);
      expect(metrics.some((m) => m.botId === 'bingbot')).toBe(true);
      expect(metrics.some((m) => m.botId === 'smallbot')).toBe(false);
      expect(suppressed).toBe(true);
    });

    it('should aggregate small bots into __other__ when combined >= k', () => {
      const events = createEvents({
        googlebot: 50,
        smallbot1: 10,
        smallbot2: 15,
      });

      const { metrics, suppressed } = aggregateRequestsByBot(events);

      expect(metrics.some((m) => m.botId === 'googlebot')).toBe(true);
      expect(metrics.some((m) => m.botId === '__other__')).toBe(true);

      const other = metrics.find((m) => m.botId === '__other__');
      expect(other?.requestCount).toBe(25);
      expect(suppressed).toBe(false);
    });

    it('should sum bytes and counts correctly', () => {
      const events = createEvents({ googlebot: 25 });

      const { metrics } = aggregateRequestsByBot(events);
      const google = metrics.find((m) => m.botId === 'googlebot');

      expect(google?.requestCount).toBe(25);
      expect(google?.bytesTransferred).toBe(25000);
    });

    it('should handle empty events', () => {
      const { metrics, suppressed } = aggregateRequestsByBot([]);
      expect(metrics).toHaveLength(0);
      expect(suppressed).toBe(false);
    });
  });

  describe('aggregateRevenueByRail', () => {
    it('should aggregate revenue by rail with k-anonymity', () => {
      const events = createEvents(
        {
          bot1: 25,
          bot2: 25,
        },
        { withPayment: true, railId: 'stripe' }
      );

      const { metrics } = aggregateRevenueByRail(events);

      expect(metrics).toHaveLength(1);
      expect(metrics[0].railId).toBe('stripe');
      expect(metrics[0].totalMinorUnits).toBe(5000n);
      expect(metrics[0].transactionCount).toBe(50);
    });

    it('should suppress small rails', () => {
      const stripeEvents = createEvents({ bot1: 25 }, { withPayment: true, railId: 'stripe' });
      const x402Events = createEvents({ bot2: 5 }, { withPayment: true, railId: 'x402' });

      const { metrics, suppressed } = aggregateRevenueByRail([...stripeEvents, ...x402Events]);

      expect(metrics.some((m) => m.railId === 'stripe')).toBe(true);
      expect(metrics.some((m) => m.railId === 'x402')).toBe(false);
      expect(suppressed).toBe(true);
    });

    it('should ignore non-payment events', () => {
      const events = createEvents({ bot1: 25 }, { withPayment: false });
      const { metrics } = aggregateRevenueByRail(events);
      expect(metrics).toHaveLength(0);
    });
  });

  describe('generateMetrics', () => {
    it('should generate complete metrics response', () => {
      const events = createEvents({ googlebot: 30, bingbot: 25 }, { withPayment: true });

      const response = generateMetrics(events, {
        timeRange: {
          start: '2024-12-01T00:00:00Z',
          end: '2025-02-01T00:00:00Z',
        },
      });

      expect(response.timeRange.start).toBe('2024-12-01T00:00:00Z');
      expect(response.requestsByBot.length).toBeGreaterThan(0);
      expect(response.revenueByRail.length).toBeGreaterThan(0);
      expect(response.kThreshold).toBe(20);
    });

    it('should filter events by time range', () => {
      const events: ReceiptEvent[] = [
        {
          receiptId: 'r1',
          timestamp: '2025-01-15T00:00:00Z',
          botId: 'bot1',
          wasChallenge: false,
          paymentSuccessful: false,
        },
        {
          receiptId: 'r2',
          timestamp: '2025-02-15T00:00:00Z',
          botId: 'bot1',
          wasChallenge: false,
          paymentSuccessful: false,
        },
      ];

      // Add more events to meet k-anonymity
      for (let i = 0; i < 25; i++) {
        events.push({
          receiptId: `r${i + 3}`,
          timestamp: '2025-01-15T00:00:00Z',
          botId: 'bot1',
          wasChallenge: false,
          paymentSuccessful: false,
        });
      }

      const response = generateMetrics(events, {
        timeRange: {
          start: '2025-01-01T00:00:00Z',
          end: '2025-01-31T00:00:00Z',
        },
      });

      // Only events in January should be counted
      const bot1 = response.requestsByBot.find((m) => m.botId === 'bot1');
      expect(bot1?.requestCount).toBe(26);
    });

    it('should use custom k-threshold (minimum 20)', () => {
      const events = createEvents({ bot1: 30 });

      const response = generateMetrics(events, {
        timeRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2026-01-01T00:00:00Z',
        },
        kThreshold: 50,
      });

      expect(response.kThreshold).toBe(50);
    });

    it('should enforce minimum k of 20', () => {
      const events = createEvents({ bot1: 15 });

      const response = generateMetrics(events, {
        timeRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2026-01-01T00:00:00Z',
        },
        kThreshold: 5, // Should be ignored, minimum is 20
      });

      expect(response.kThreshold).toBe(20);
      expect(response.requestsByBot).toHaveLength(0); // 15 < 20
    });
  });
});
