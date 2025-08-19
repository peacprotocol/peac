import { randomUUID } from 'crypto';
import { getRedis } from '../utils/redis-pool';
import { logger } from '../logging';

export interface NegotiationRecord {
  id: string;
  state: 'proposed' | 'accepted' | 'rejected';
  terms?: Record<string, unknown>;
  context?: Record<string, unknown>;
  reason?: string; // rejection reason
  created_at: string;
  updated_at: string;
  proposed_by?: string;
  decided_by?: string;
}

export interface NegotiationListOptions {
  cursor?: string;
  limit?: number;
  state?: NegotiationRecord['state'];
}

export interface NegotiationListResult {
  items: NegotiationRecord[];
  next_cursor?: string;
}

export interface NegotiationStore {
  create(
    negotiation: Omit<NegotiationRecord, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<NegotiationRecord>;
  get(id: string): Promise<NegotiationRecord | null>;
  update(id: string, updates: Partial<NegotiationRecord>): Promise<NegotiationRecord | null>;
  list(options?: NegotiationListOptions): Promise<NegotiationListResult>;
}

export class InMemoryNegotiationStore implements NegotiationStore {
  private negotiations: Map<string, NegotiationRecord> = new Map();

  async create(
    negotiation: Omit<NegotiationRecord, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<NegotiationRecord> {
    const now = new Date().toISOString();
    const record: NegotiationRecord = {
      ...negotiation,
      id: randomUUID(),
      created_at: now,
      updated_at: now,
      state: 'proposed',
    };

    this.negotiations.set(record.id, record);
    logger.debug({ negotiationId: record.id }, 'Negotiation created in memory store');
    return record;
  }

  async get(id: string): Promise<NegotiationRecord | null> {
    return this.negotiations.get(id) || null;
  }

  async update(id: string, updates: Partial<NegotiationRecord>): Promise<NegotiationRecord | null> {
    const existing = this.negotiations.get(id);
    if (!existing) return null;

    const updated: NegotiationRecord = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    this.negotiations.set(id, updated);
    logger.debug({ negotiationId: id }, 'Negotiation updated in memory store');
    return updated;
  }

  async list(options: NegotiationListOptions = {}): Promise<NegotiationListResult> {
    const limit = Math.min(options.limit || 50, 100);
    const cursor = options.cursor;
    const stateFilter = options.state;

    // Get all negotiations sorted by created_at desc (stable sort)
    let allNegotiations = Array.from(this.negotiations.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    // Apply state filter
    if (stateFilter) {
      allNegotiations = allNegotiations.filter((n) => n.state === stateFilter);
    }

    let startIndex = 0;
    if (cursor) {
      try {
        const decodedCursor = JSON.parse(Buffer.from(cursor, 'base64').toString());
        const cursorTime = new Date(decodedCursor.created_at).getTime();
        startIndex = allNegotiations.findIndex(
          (n) => new Date(n.created_at).getTime() <= cursorTime,
        );
        if (startIndex === -1) startIndex = allNegotiations.length;
      } catch (error) {
        logger.warn({ cursor }, 'Invalid cursor format');
        startIndex = 0;
      }
    }

    const items = allNegotiations.slice(startIndex, startIndex + limit);
    let next_cursor: string | undefined;

    if (startIndex + limit < allNegotiations.length) {
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

export class RedisNegotiationStore implements NegotiationStore {
  private readonly keyPrefix = 'peac:negotiations:';
  private readonly sortedSetKey = 'peac:negotiations:by_time';
  private readonly stateSetKey = 'peac:negotiations:by_state:';

  async create(
    negotiation: Omit<NegotiationRecord, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<NegotiationRecord> {
    const redis = getRedis();
    const now = new Date().toISOString();
    const record: NegotiationRecord = {
      ...negotiation,
      id: randomUUID(),
      created_at: now,
      updated_at: now,
      state: 'proposed',
    };

    const key = this.keyPrefix + record.id;
    const timestamp = new Date(record.created_at).getTime();

    await Promise.all([
      redis.hset(key, this.serializeNegotiation(record)),
      redis.zadd(this.sortedSetKey, timestamp, record.id),
      redis.sadd(this.stateSetKey + record.state, record.id),
      redis.expire(key, 86400 * 30), // 30 days TTL
    ]);

    logger.debug({ negotiationId: record.id }, 'Negotiation created in Redis store');
    return record;
  }

  async get(id: string): Promise<NegotiationRecord | null> {
    const redis = getRedis();
    const key = this.keyPrefix + id;
    const data = await redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return this.deserializeNegotiation(data);
  }

  async update(id: string, updates: Partial<NegotiationRecord>): Promise<NegotiationRecord | null> {
    const redis = getRedis();
    const key = this.keyPrefix + id;

    const existing = await this.get(id);
    if (!existing) return null;

    const updated: NegotiationRecord = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    // If state changed, update state sets
    if (updates.state && updates.state !== existing.state) {
      await Promise.all([
        redis.srem(this.stateSetKey + existing.state, id),
        redis.sadd(this.stateSetKey + updated.state, id),
      ]);
    }

    await redis.hset(key, this.serializeNegotiation(updated));
    logger.debug({ negotiationId: id }, 'Negotiation updated in Redis store');
    return updated;
  }

  async list(options: NegotiationListOptions = {}): Promise<NegotiationListResult> {
    const redis = getRedis();
    const limit = Math.min(options.limit || 50, 100);
    const cursor = options.cursor;
    const stateFilter = options.state;

    let negotiationIds: string[];
    let excludeId: string | undefined;

    if (stateFilter) {
      // Get negotiations by state from set
      negotiationIds = await redis.smembers(this.stateSetKey + stateFilter);

      // Sort by timestamp (we need to get timestamps from sorted set)
      const pipeline = redis.pipeline();
      negotiationIds.forEach((id) => pipeline.zscore(this.sortedSetKey, id));
      const scores = await pipeline.exec();

      if (scores) {
        const idsWithScores = negotiationIds
          .map((id, index) => ({
            id,
            score: (scores[index]?.[1] as number) || 0,
          }))
          .sort((a, b) => b.score - a.score); // desc order

        negotiationIds = idsWithScores.map((item) => item.id);
      }
    } else {
      let maxScore = '+inf';
      if (cursor) {
        try {
          const decodedCursor = JSON.parse(Buffer.from(cursor, 'base64').toString());
          maxScore = String(new Date(decodedCursor.created_at).getTime());
          excludeId = decodedCursor.id;
        } catch (error) {
          logger.warn({ cursor }, 'Invalid cursor format');
        }
      }

      // Get negotiation IDs from sorted set (reverse chronological order)
      negotiationIds = await redis.zrevrangebyscore(
        this.sortedSetKey,
        maxScore,
        '-inf',
        'LIMIT',
        0,
        limit + 1,
      );
    }

    const hasMore = negotiationIds.length > limit;
    const idsToFetch = hasMore ? negotiationIds.slice(0, limit) : negotiationIds;

    // Fetch negotiation data in parallel
    const items: NegotiationRecord[] = [];
    if (idsToFetch.length > 0) {
      const pipeline = redis.pipeline();
      idsToFetch.forEach((id) => pipeline.hgetall(this.keyPrefix + id));
      const results = await pipeline.exec();

      if (results) {
        for (const [error, data] of results) {
          if (!error && data && Object.keys(data as Record<string, unknown>).length > 0) {
            const negotiation = this.deserializeNegotiation(data as Record<string, string>);
            // Skip the excluded boundary item (only for non-filtered queries)
            if (!options.state && excludeId && negotiation.id === excludeId) {
              continue;
            }
            items.push(negotiation);
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

  private serializeNegotiation(record: NegotiationRecord): Record<string, string> {
    return {
      id: record.id,
      state: record.state,
      terms: record.terms ? JSON.stringify(record.terms) : '',
      context: record.context ? JSON.stringify(record.context) : '',
      reason: record.reason || '',
      created_at: record.created_at,
      updated_at: record.updated_at,
      proposed_by: record.proposed_by || '',
      decided_by: record.decided_by || '',
    };
  }

  private deserializeNegotiation(data: Record<string, string>): NegotiationRecord {
    return {
      id: data.id,
      state: data.state as NegotiationRecord['state'],
      terms: data.terms ? JSON.parse(data.terms) : undefined,
      context: data.context ? JSON.parse(data.context) : undefined,
      reason: data.reason || undefined,
      created_at: data.created_at,
      updated_at: data.updated_at,
      proposed_by: data.proposed_by || undefined,
      decided_by: data.decided_by || undefined,
    };
  }
}
