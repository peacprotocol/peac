import { request } from 'undici';
import * as yaml from 'yaml';
import * as crypto from 'crypto';
import { Policy, PolicyCacheEntry } from './types.js';

export interface FetchPolicyOptions {
  cacheTtlSec?: number;
  timeout?: number;
  userAgent?: string;
}

const DEFAULT_OPTIONS: Required<FetchPolicyOptions> = {
  cacheTtlSec: 300, // 5 minutes
  timeout: 10000, // 10 seconds
  userAgent: 'peac-sdk-node/0.9.11',
};

const policyCache = new Map<string, PolicyCacheEntry>();

export async function fetchPolicy(url: string, options: FetchPolicyOptions = {}): Promise<Policy> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Check cache first
  const cached = policyCache.get(url);
  const now = Date.now();

  if (cached && now < cached.expiresAt) {
    // Validate integrity
    if (cached.integrity && validateIntegrity(cached.policy, cached.integrity)) {
      return cached.policy;
    }
  }

  // Prepare headers
  const headers: Record<string, string> = {
    'user-agent': opts.userAgent,
    accept: 'application/peac+yaml, application/peac+json, text/plain;q=0.8',
    'accept-encoding': 'gzip, br',
  };

  // Add conditional headers if we have cache
  if (cached?.etag) {
    headers['if-none-match'] = cached.etag;
  }
  if (cached?.lastModified) {
    headers['if-modified-since'] = cached.lastModified;
  }

  try {
    const response = await request(url, {
      method: 'GET',
      headers,
      throwOnError: true,
      maxRedirections: 3,
      bodyTimeout: opts.timeout,
      headersTimeout: opts.timeout,
    });

    // Handle 304 Not Modified
    if (response.statusCode === 304 && cached) {
      // Extend cache expiry
      cached.expiresAt = now + opts.cacheTtlSec * 1000;
      return cached.policy;
    }

    if (response.statusCode !== 200) {
      throw new Error(`HTTP ${response.statusCode}`);
    }

    const contentType = (response.headers['content-type'] as string) || '';
    const etag = response.headers['etag'] as string;
    const lastModified = response.headers['last-modified'] as string;

    // Read response body
    const chunks: Buffer[] = [];
    for await (const chunk of response.body) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString('utf8');

    // Parse policy based on content type
    let policy: Policy;
    if (contentType.includes('yaml') || contentType.includes('text/plain')) {
      policy = yaml.parse(body);
    } else if (contentType.includes('json')) {
      policy = JSON.parse(body);
    } else {
      // Try YAML first, fallback to JSON
      try {
        policy = yaml.parse(body);
      } catch {
        policy = JSON.parse(body);
      }
    }

    // Validate policy schema
    validatePolicy(policy);

    // Generate integrity hash
    const integrity = generateIntegrity(policy);

    // Cache the policy
    const cacheEntry: PolicyCacheEntry = {
      policy,
      etag,
      lastModified,
      cachedAt: now,
      expiresAt: now + opts.cacheTtlSec * 1000,
      integrity,
    };

    policyCache.set(url, cacheEntry);

    return policy;
  } catch (error) {
    // If we have cached data and network fails, return cached
    if (cached) {
      return cached.policy;
    }

    if (error instanceof Error) {
      throw new Error(`Failed to fetch policy from ${url}: ${error.message}`);
    }
    throw error;
  }
}

function validatePolicy(policy: any): asserts policy is Policy {
  if (!policy || typeof policy !== 'object') {
    throw new Error('Policy must be an object');
  }

  if (!policy.version || typeof policy.version !== 'string') {
    throw new Error('Policy must have a version string');
  }

  if (!policy.site || typeof policy.site !== 'object') {
    throw new Error('Policy must have a site object');
  }

  if (!policy.site.name || typeof policy.site.name !== 'string') {
    throw new Error('Policy site must have a name');
  }

  if (!policy.site.domain || typeof policy.site.domain !== 'string') {
    throw new Error('Policy site must have a domain');
  }

  // Validate attribution format regex if present
  if (policy.attribution?.format) {
    try {
      new RegExp(policy.attribution.format);
    } catch {
      throw new Error('Invalid attribution format regex');
    }
  }

  // Validate retention_days if present
  if (policy.privacy?.retention_days !== undefined) {
    const days = policy.privacy.retention_days;
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw new Error('retention_days must be between 1 and 365');
    }
  }

  // Validate max_rows if present
  if (policy.exports?.max_rows !== undefined) {
    const rows = policy.exports.max_rows;
    if (!Number.isInteger(rows) || rows < 1 || rows > 1000000) {
      throw new Error('max_rows must be between 1 and 1,000,000');
    }
  }

  // Validate logging sink if present
  if (policy.logging?.sink) {
    const sink = policy.logging.sink;
    if (sink !== 'stdout' && !sink.startsWith('https://')) {
      throw new Error('logging sink must be "stdout" or https URL');
    }
  }
}

function generateIntegrity(policy: Policy): string {
  const canonical = JSON.stringify(policy, Object.keys(policy).sort());
  return crypto.createHmac('sha256', getIntegrityKey()).update(canonical, 'utf8').digest('hex');
}

function validateIntegrity(policy: Policy, expectedIntegrity: string): boolean {
  const actualIntegrity = generateIntegrity(policy);
  return crypto.timingSafeEqual(
    Buffer.from(expectedIntegrity, 'hex'),
    Buffer.from(actualIntegrity, 'hex'),
  );
}

// Ephemeral per-process key for cache integrity
let integrityKey: Buffer | undefined;
function getIntegrityKey(): Buffer {
  if (!integrityKey) {
    integrityKey = crypto.randomBytes(32);
  }
  return integrityKey;
}

export function clearPolicyCache(): void {
  policyCache.clear();
}

export function getPolicyCacheSize(): number {
  return policyCache.size;
}
