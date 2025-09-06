/**
 * @peac/core v0.9.12.1 - Token bucket rate limiting with RFC 9239 headers
 * Memory and Redis backends with graceful degradation
 */

import { RATE_LIMIT_CONFIG, FEATURES, CrawlerType } from './config.js';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset_time: number;
  retry_after?: number;
}

export interface RateLimitHeaders {
  'RateLimit-Limit': string;
  'RateLimit-Remaining': string;
  'RateLimit-Reset': string;
  'Retry-After'?: string;
}

export interface TokenBucket {
  tokens: number;
  capacity: number;
  refill_rate: number; // tokens per second
  last_refill: number;
  window_start: number;
  window_size: number; // seconds
}

export class RateLimiter {
  private store: Map<string, TokenBucket> = new Map();
  private redis: any = null; // In production, inject Redis client

  constructor(private config = RATE_LIMIT_CONFIG) {
    if (FEATURES.REDIS_RATELIMIT && process.env.REDIS_URL) {
      this.initRedis();
    }
  }

  async checkLimit(
    key: string, 
    crawler_type: CrawlerType, 
    trust_score: number = 0.5
  ): Promise<RateLimitResult> {
    const bucket_config = this.getBucketConfig(crawler_type, trust_score);
    const bucket_key = `rate_limit:${key}`;

    if (this.redis && FEATURES.REDIS_RATELIMIT) {
      return await this.checkLimitRedis(bucket_key, bucket_config);
    } else {
      return this.checkLimitMemory(bucket_key, bucket_config);
    }
  }

  async consumeToken(
    key: string, 
    crawler_type: CrawlerType, 
    trust_score: number = 0.5
  ): Promise<RateLimitResult> {
    const result = await this.checkLimit(key, crawler_type, trust_score);
    
    if (result.allowed && result.remaining > 0) {
      // Actually consume a token
      const bucket_config = this.getBucketConfig(crawler_type, trust_score);
      const bucket_key = `rate_limit:${key}`;
      
      if (this.redis && FEATURES.REDIS_RATELIMIT) {
        await this.consumeTokenRedis(bucket_key, bucket_config);
      } else {
        this.consumeTokenMemory(bucket_key, bucket_config);
      }
      
      result.remaining = Math.max(0, result.remaining - 1);
    }

    return result;
  }

  createHeaders(result: RateLimitResult): RateLimitHeaders {
    const headers: RateLimitHeaders = {
      'RateLimit-Limit': result.limit.toString(),
      'RateLimit-Remaining': result.remaining.toString(),
      'RateLimit-Reset': Math.ceil((result.reset_time - Date.now()) / 1000).toString()
    };

    if (!result.allowed && result.retry_after) {
      headers['Retry-After'] = result.retry_after.toString();
    }

    return headers;
  }

  private getBucketConfig(crawler_type: CrawlerType, trust_score: number) {
    let base_config;

    // Determine base rate limits by crawler type
    if (crawler_type === 'agent') {
      base_config = trust_score >= 0.8 
        ? this.config.agent.realtime 
        : this.config.agent.default;
    } else {
      base_config = trust_score >= 0.8 
        ? this.config.bot.paid 
        : this.config.bot.default;
    }

    // Apply trust score multiplier
    const trust_multiplier = Math.max(0.1, trust_score);
    
    return {
      capacity: base_config.burst,
      refill_rate: base_config.rps * trust_multiplier,
      window_size: this.parseWindowSize(base_config.window)
    };
  }

  private checkLimitMemory(key: string, config: any): RateLimitResult {
    const now = Date.now();
    let bucket = this.store.get(key);

    if (!bucket) {
      bucket = {
        tokens: config.capacity,
        capacity: config.capacity,
        refill_rate: config.refill_rate,
        last_refill: now,
        window_start: now,
        window_size: config.window_size * 1000 // Convert to ms
      };
      this.store.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = (now - bucket.last_refill) / 1000; // Convert to seconds
    const tokens_to_add = Math.floor(elapsed * bucket.refill_rate);
    
    if (tokens_to_add > 0) {
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokens_to_add);
      bucket.last_refill = now;
    }

    // Check if window should reset
    if (now - bucket.window_start >= bucket.window_size) {
      bucket.window_start = now;
      bucket.tokens = bucket.capacity; // Reset to full capacity
    }

    const allowed = bucket.tokens > 0;
    const reset_time = bucket.window_start + bucket.window_size;
    const retry_after = allowed ? undefined : Math.ceil((reset_time - now) / 1000);

    return {
      allowed,
      limit: bucket.capacity,
      remaining: bucket.tokens,
      reset_time,
      retry_after
    };
  }

  private consumeTokenMemory(key: string, config: any): void {
    const bucket = this.store.get(key);
    if (bucket && bucket.tokens > 0) {
      bucket.tokens--;
    }
  }

  private async checkLimitRedis(key: string, config: any): Promise<RateLimitResult> {
    if (!this.redis) {
      // Fallback to memory if Redis unavailable
      console.warn('Redis unavailable, falling back to memory rate limiting');
      return this.checkLimitMemory(key, config);
    }

    try {
      // Use Redis Lua script for atomic token bucket operations
      const lua_script = `
        local key = KEYS[1]
        local capacity = tonumber(ARGV[1])
        local refill_rate = tonumber(ARGV[2])
        local window_size = tonumber(ARGV[3])
        local now = tonumber(ARGV[4])
        
        local bucket = redis.call('HMGET', key, 'tokens', 'last_refill', 'window_start')
        local tokens = tonumber(bucket[1]) or capacity
        local last_refill = tonumber(bucket[2]) or now
        local window_start = tonumber(bucket[3]) or now
        
        -- Refill tokens
        local elapsed = (now - last_refill) / 1000
        local tokens_to_add = math.floor(elapsed * refill_rate)
        if tokens_to_add > 0 then
          tokens = math.min(capacity, tokens + tokens_to_add)
          last_refill = now
        end
        
        -- Check window reset
        if (now - window_start) >= (window_size * 1000) then
          window_start = now
          tokens = capacity
        end
        
        local allowed = tokens > 0
        local reset_time = window_start + (window_size * 1000)
        
        -- Update bucket state
        redis.call('HMSET', key, 
          'tokens', tokens,
          'last_refill', last_refill,
          'window_start', window_start
        )
        redis.call('EXPIRE', key, window_size * 2) -- TTL cleanup
        
        return {allowed and 1 or 0, capacity, tokens, reset_time}
      `;

      const result = await this.redis.eval(
        lua_script,
        1,
        key,
        config.capacity,
        config.refill_rate,
        config.window_size,
        Date.now()
      );

      const [allowed, limit, remaining, reset_time] = result;
      const retry_after = allowed ? undefined : Math.ceil((reset_time - Date.now()) / 1000);

      return {
        allowed: allowed === 1,
        limit,
        remaining,
        reset_time,
        retry_after
      };

    } catch (error) {
      console.error('Redis rate limiting error, falling back to memory:', error);
      return this.checkLimitMemory(key, config);
    }
  }

  private async consumeTokenRedis(key: string, config: any): Promise<void> {
    if (!this.redis) return;

    try {
      const lua_script = `
        local key = KEYS[1]
        local current_tokens = redis.call('HGET', key, 'tokens')
        if current_tokens and tonumber(current_tokens) > 0 then
          redis.call('HINCRBY', key, 'tokens', -1)
          return 1
        end
        return 0
      `;

      await this.redis.eval(lua_script, 1, key);
    } catch (error) {
      console.error('Redis token consumption error:', error);
      // Fallback to memory consumption
      this.consumeTokenMemory(key, config);
    }
  }

  private parseWindowSize(window: string): number {
    const match = window.match(/^(\d+)([smh])$/);
    if (!match) return 60; // Default 60 seconds

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      default: return 60;
    }
  }

  private initRedis(): void {
    try {
      // In production, properly initialize Redis client
      // For now, just log that Redis would be initialized
      console.log('Redis rate limiting would be initialized with URL:', process.env.REDIS_URL);
      
      // Example Redis initialization (commented out for now):
      // const Redis = require('ioredis');
      // this.redis = new Redis(process.env.REDIS_URL);
      // this.redis.on('error', (error) => {
      //   console.error('Redis error:', error);
      //   this.redis = null; // Fall back to memory
      // });
    } catch (error) {
      console.error('Failed to initialize Redis:', error);
      this.redis = null;
    }
  }

  // Cleanup method for memory store
  cleanup(): void {
    const now = Date.now();
    const cutoff = now - (24 * 60 * 60 * 1000); // 24 hours

    for (const [key, bucket] of this.store.entries()) {
      if (bucket.last_refill < cutoff) {
        this.store.delete(key);
      }
    }
  }
}

export const rateLimiter = new RateLimiter();

// Schedule periodic cleanup for memory store
if (typeof setInterval !== 'undefined') {
  setInterval(() => rateLimiter.cleanup(), 60 * 60 * 1000); // Every hour
}