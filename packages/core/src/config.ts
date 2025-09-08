/**
 * @peac/core v0.9.12.1 - Configuration and feature flags
 * Wire-versioned compatibility with circuit breakers and graceful degradation
 */

export const FEATURES = {
  RDNS_VERIFICATION: process.env.ENABLE_RDNS === 'true',
  TRUST_SCORING: process.env.ENABLE_TRUST === 'true',
  CLOUDFLARE: process.env.ENABLE_CF === 'true',
  REDIS_RATELIMIT: process.env.ENABLE_REDIS_RL === 'true',
  CBOR_WIRE: process.env.ENABLE_CBOR === 'true',
  REPLAY_PROTECTION: process.env.ENABLE_REPLAY_PROTECTION !== 'false',
  AUTO_KEY_ROTATION: process.env.ENABLE_KEY_ROTATION === 'true',
  SECURITY_AUDIT: process.env.ENABLE_SECURITY_AUDIT !== 'false',
};

export const VERSION_CONFIG = {
  CURRENT_PROTOCOL: '0.9.12.1',
  SUPPORTED_PROTOCOLS: new Set(['0.9.12.1']),
  ACCEPT_COMPAT: process.env.PEAC_ACCEPT_COMPAT === '1',
  COMPAT_PROTOCOLS: new Set<string>([]), // Fill when needed
  REQUIRED_WIRE_RECEIPT: '1.1',
  REQUIRED_WIRE_PURGE: '1.0',
  REQUIRED_WIRE_DISCOVERY: '1.1',
};

export const TRUST_CONFIG = {
  weights: {
    rdns_match: 0.4,
    ip_in_range: 0.3,
    user_agent_valid: 0.2,
    rate_compliance: 0.1,
  },
  thresholds: {
    trusted: 0.8,
    suspicious: 0.5,
    untrusted: 0.0,
  },
};

export const SECURITY_CONFIG = {
  nonce_ttl_seconds: 86400, // 24 hours
  iat_max_skew_seconds: 30,
  iat_max_age_seconds: 86400,
  request_context_retention_days: 30,
  replay_protection: {
    check_nonce: true,
    check_timestamp: true,
    max_age_seconds: 3600, // 1 hour for receipts
    jti_required: false, // Optional for now
  },
  key_rotation: {
    rotation_interval_days: 30,
    overlap_period_days: 7,
    max_active_keys: 3,
    auto_rotate: false, // Explicit opt-in
  },
  rate_limiting: {
    verification_attempts: 10,
    time_window_seconds: 60,
    block_duration_seconds: 300,
  },
};

export const RATE_LIMIT_CONFIG = {
  storage: process.env.REDIS_URL ? 'redis' : 'memory',
  clock_skew_allowance_ms: 3000,
  bot: {
    default: { rps: 10, burst: 100, window: '60s' },
    paid: { rps: 100, burst: 1000, window: '60s' },
    blocked: { rps: 0, burst: 0 },
  },
  agent: {
    realtime: { rps: 1000, burst: 5000, window: '10s' },
    default: { rps: 100, burst: 500, window: '60s' },
  },
  enforcement: 'token_bucket' as const,
};

export const CLOUDFLARE_CONFIG = {
  enabled: FEATURES.CLOUDFLARE,
  fallback_mode: (process.env.CF_FALLBACK_MODE as 'allow' | 'block' | 'local_only') || 'local_only',
  cache_ttl: parseInt(process.env.CF_CACHE_TTL || '300'),
  timeout_ms: parseInt(process.env.CF_TIMEOUT_MS || '2500'),
  circuit: {
    threshold: parseInt(process.env.CF_CIRCUIT_THRESHOLD || '5'),
    cooldown_ms: parseInt(process.env.CF_CIRCUIT_COOLDOWN_MS || '30000'),
  },
  auth: {
    api_token: process.env.CF_API_TOKEN || '',
    zone_id: process.env.CF_ZONE_ID || '',
  },
};

export const CRAWLER_TYPES = [
  'bot',
  'agent',
  'hybrid',
  'browser',
  'migrating',
  'test',
  'unknown',
] as const;

export type CrawlerType = (typeof CRAWLER_TYPES)[number];

export function isValidCrawlerType(ct: unknown): ct is CrawlerType {
  return typeof ct === 'string' && CRAWLER_TYPES.includes(ct as CrawlerType);
}

export function isCompatibleProtocol(pv: string): boolean {
  if (VERSION_CONFIG.SUPPORTED_PROTOCOLS.has(pv)) return true;
  if (!VERSION_CONFIG.ACCEPT_COMPAT) return false;
  return VERSION_CONFIG.COMPAT_PROTOCOLS.has(pv);
}

// Performance SLOs (non-negotiable)
export const SLO_TARGETS = {
  sign_p95_ms: 3,
  verify_p95_ms: 1,
  bulk_verify_10k_ms: 50,
  memory_per_receipt_kb: 1,
};
