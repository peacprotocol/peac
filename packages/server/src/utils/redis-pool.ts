// packages/server/src/utils/redis-pool.ts
import IORedis, { Redis as RedisClient } from "ioredis";

const USE_MOCK =
  process.env.CI === "true" ||
  process.env.NODE_ENV === "test" ||
  !process.env.REDIS_URL;

let RedisCtor: any = IORedis;
if (USE_MOCK) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("ioredis-mock");
  RedisCtor = mod.default || mod;
}

let _client: RedisClient | null = null;

export function getRedis(): RedisClient {
  if (_client) return _client;

  if (USE_MOCK) {
    _client = new RedisCtor() as unknown as RedisClient; // in-memory mock
  } else {
    _client = new RedisCtor(process.env.REDIS_URL as string, {
      maxRetriesPerRequest: 1,
      lazyConnect: false,
      enableReadyCheck: true,
    }) as unknown as RedisClient;
  }
  return _client;
}

export async function disconnectRedis(): Promise<void> {
  if (_client) {
    try {
      await (_client as any).quit?.();
    } catch {
      /* noop */
    }
    _client = null;
  }
}
