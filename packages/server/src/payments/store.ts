import { randomUUID } from 'crypto';
import { getRedis } from '../utils/redis-pool';
import { logger } from '../logging';

export interface PaymentRecord {
  id: string;
  rail: 'credits' | 'x402';
  amount: number;
  currency: string;
  status: 'pending' | 'requires_action' | 'succeeded' | 'failed';
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  external_id?: string;
  failure_reason?: string;
}

export interface PaymentListOptions {
  cursor?: string;
  limit?: number;
}

export interface PaymentListResult {
  items: PaymentRecord[];
  next_cursor?: string;
}

export interface PaymentStore {
  create(payment: Omit<PaymentRecord, 'id' | 'created_at' | 'updated_at'>): Promise<PaymentRecord>;
  get(id: string): Promise<PaymentRecord | null>;
  update(id: string, updates: Partial<PaymentRecord>): Promise<PaymentRecord | null>;
  list(options?: PaymentListOptions): Promise<PaymentListResult>;
}

export class InMemoryPaymentStore implements PaymentStore {
  private payments: Map<string, PaymentRecord> = new Map();

  async create(
    payment: Omit<PaymentRecord, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<PaymentRecord> {
    const now = new Date().toISOString();
    const record: PaymentRecord = {
      ...payment,
      id: randomUUID(),
      created_at: now,
      updated_at: now,
    };

    this.payments.set(record.id, record);
    logger.debug({ paymentId: record.id }, 'Payment created in memory store');
    return record;
  }

  async get(id: string): Promise<PaymentRecord | null> {
    return this.payments.get(id) || null;
  }

  async update(id: string, updates: Partial<PaymentRecord>): Promise<PaymentRecord | null> {
    const existing = this.payments.get(id);
    if (!existing) return null;

    const updated: PaymentRecord = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    this.payments.set(id, updated);
    logger.debug({ paymentId: id }, 'Payment updated in memory store');
    return updated;
  }

  async list(options: PaymentListOptions = {}): Promise<PaymentListResult> {
    const limit = Math.min(options.limit || 50, 100);
    const cursor = options.cursor;

    // Get all payments sorted by created_at desc (stable sort)
    const allPayments = Array.from(this.payments.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    let startIndex = 0;
    if (cursor) {
      try {
        const decodedCursor = JSON.parse(Buffer.from(cursor, 'base64').toString());
        const cursorTime = new Date(decodedCursor.created_at).getTime();
        startIndex = allPayments.findIndex((p) => new Date(p.created_at).getTime() <= cursorTime);
        if (startIndex === -1) startIndex = allPayments.length;
      } catch (error) {
        logger.warn({ cursor }, 'Invalid cursor format');
        startIndex = 0;
      }
    }

    const items = allPayments.slice(startIndex, startIndex + limit);
    let next_cursor: string | undefined;

    if (startIndex + limit < allPayments.length) {
      const lastItem = items[items.length - 1];
      if (lastItem) {
        next_cursor = Buffer.from(JSON.stringify({ created_at: lastItem.created_at })).toString(
          'base64',
        );
      }
    }

    return { items, next_cursor };
  }
}

export class RedisPaymentStore implements PaymentStore {
  private readonly keyPrefix = 'peac:payments:';
  private readonly sortedSetKey = 'peac:payments:by_time';

  async create(
    payment: Omit<PaymentRecord, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<PaymentRecord> {
    const redis = getRedis();
    const now = new Date().toISOString();
    const record: PaymentRecord = {
      ...payment,
      id: randomUUID(),
      created_at: now,
      updated_at: now,
    };

    const key = this.keyPrefix + record.id;
    const timestamp = new Date(record.created_at).getTime();

    await Promise.all([
      redis.hset(key, record as unknown as Record<string, string | number>),
      redis.zadd(this.sortedSetKey, timestamp, record.id),
      redis.expire(key, 86400 * 30), // 30 days TTL
    ]);

    logger.debug({ paymentId: record.id }, 'Payment created in Redis store');
    return record;
  }

  async get(id: string): Promise<PaymentRecord | null> {
    const redis = getRedis();
    const key = this.keyPrefix + id;
    const data = await redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return this.deserializePayment(data);
  }

  async update(id: string, updates: Partial<PaymentRecord>): Promise<PaymentRecord | null> {
    const redis = getRedis();
    const key = this.keyPrefix + id;

    const existing = await this.get(id);
    if (!existing) return null;

    const updated: PaymentRecord = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    await redis.hset(key, updated as unknown as Record<string, string | number>);
    logger.debug({ paymentId: id }, 'Payment updated in Redis store');
    return updated;
  }

  async list(options: PaymentListOptions = {}): Promise<PaymentListResult> {
    const redis = getRedis();
    const limit = Math.min(options.limit || 50, 100);
    const cursor = options.cursor;

    let maxScore = '+inf';
    let excludeId: string | undefined;
    if (cursor) {
      try {
        const decodedCursor = JSON.parse(Buffer.from(cursor, 'base64').toString());
        maxScore = String(new Date(decodedCursor.created_at).getTime());
        excludeId = decodedCursor.id;
      } catch (error) {
        logger.warn({ cursor }, 'Invalid cursor format');
      }
    }

    // Get payment IDs from sorted set (reverse chronological order)
    const paymentIds = await redis.zrevrangebyscore(
      this.sortedSetKey,
      maxScore,
      '-inf',
      'LIMIT',
      0,
      limit + 1,
    );

    const hasMore = paymentIds.length > limit;
    const idsToFetch = hasMore ? paymentIds.slice(0, limit) : paymentIds;

    // Fetch payment data in parallel
    const items: PaymentRecord[] = [];
    if (idsToFetch.length > 0) {
      const pipeline = redis.pipeline();
      idsToFetch.forEach((id) => pipeline.hgetall(this.keyPrefix + id));
      const results = await pipeline.exec();

      if (results) {
        for (const [error, data] of results) {
          if (!error && data && Object.keys(data as Record<string, unknown>).length > 0) {
            const payment = this.deserializePayment(data as Record<string, string>);
            // Skip the excluded boundary item
            if (excludeId && payment.id === excludeId) {
              continue;
            }
            items.push(payment);
          }
        }
      }
    }

    let next_cursor: string | undefined;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      next_cursor = Buffer.from(
        JSON.stringify({
          created_at: lastItem.created_at,
          id: lastItem.id,
        }),
      ).toString('base64');
    }

    return { items, next_cursor };
  }

  private deserializePayment(data: Record<string, string>): PaymentRecord {
    return {
      id: data.id,
      rail: data.rail as 'credits' | 'x402',
      amount: Number(data.amount),
      currency: data.currency,
      status: data.status as PaymentRecord['status'],
      metadata: data.metadata ? JSON.parse(data.metadata) : undefined,
      created_at: data.created_at,
      updated_at: data.updated_at,
      external_id: data.external_id,
      failure_reason: data.failure_reason,
    };
  }
}
