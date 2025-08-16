// packages/server/src/utils/redis-pool.ts
<<<<<<< HEAD
import IORedis, { Redis as RedisClient } from "ioredis";

const USE_MOCK =
  process.env.CI === "true" ||
  process.env.NODE_ENV === "test" ||
=======
import IORedis, { Redis as RedisClient } from 'ioredis';

const USE_MOCK =
  process.env.CI === 'true' ||
  process.env.NODE_ENV === 'test' ||
>>>>>>> eac06f2e (test(ci): use in-memory Redis mock in tests; stabilize server unit tests)
  !process.env.REDIS_URL;

let RedisCtor: any = IORedis;
if (USE_MOCK) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
<<<<<<< HEAD
  const mod = require("ioredis-mock");
=======
  const mod = require('ioredis-mock');
>>>>>>> eac06f2e (test(ci): use in-memory Redis mock in tests; stabilize server unit tests)
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