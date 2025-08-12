import { getRedis } from '../utils/redis-pool';

// Lua token bucket: KEYS[1]=key ARGV[1]=capacity ARGV[2]=refillPerSec ARGV[3]=ttlSec ARGV[4]=nowSec
const SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'last')
local tokens = tonumber(data[1])
local last = tonumber(data[2])

if tokens == nil then
  tokens = capacity
  last = now
else
  local delta = math.max(0, now - last)
  tokens = math.min(capacity, tokens + delta * refill)
  last = now
end

if tokens < 1 then
  redis.call('HMSET', key, 'tokens', tokens, 'last', last)
  redis.call('EXPIRE', key, ttl)
  return 0
else
  tokens = tokens - 1
  redis.call('HMSET', key, 'tokens', tokens, 'last', last)
  redis.call('EXPIRE', key, ttl)
  return 1
end
`;

export async function checkRateLimit(resource: string, id: string, capacity = 50, refillPerSec = 5): Promise<boolean> {
  const redis = getRedis();
  const key = `rate:${resource}:${id}`;
  const now = Math.floor(Date.now() / 1000);
  const ttl = 60;
  const res = await redis.eval(SCRIPT, 1, key, capacity, refillPerSec, ttl, now);
  return res === 1 || res === '1';
}
