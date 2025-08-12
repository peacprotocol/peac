import Redis from 'ioredis';
import { config } from '../config';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;
  
  _redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  // Handle connection events (only if not mocked)
  if (typeof _redis.on === 'function') {
    _redis.on('error', () => {
      // Redis connection errors are handled by ioredis internally
    });

    _redis.on('connect', () => {
      // Redis connected successfully
    });
  }

  return _redis;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}