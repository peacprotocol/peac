import { ssrfGuard } from '../utils/ssrf';
import { JWK, compactVerify, decodeProtectedHeader, importJWK, JWSHeaderParameters } from 'jose';
import { canonicalize } from '../crypto/jcs';
import type { PropertyClaims } from '../property/rights';
import { getRedis } from '../utils/redis-pool';

export type AgentDescriptor = {
  id?: string;
  name?: string;
  purposes?: string[];
  jwk?: JWK;
  jwks_uri?: string;
  /**
   * Optional property rights (Preview). Included in JCS if present.
   */
  property?: PropertyClaims;
  signature: string;
};

export type VerifiedAgent = {
  jwk: JWK;
  descriptor: Omit<AgentDescriptor, 'signature'>;
};

type AllowedAlg = 'RS256' | 'ES256';
const ALLOWED_ALGS = new Set<AllowedAlg>(['RS256', 'ES256']);

function shallowStripSignature(desc: AgentDescriptor): Omit<AgentDescriptor, 'signature'> {
  // Do not deep-clone to preserve canonical ordering expectations before JCS.
  const { signature: _ignored, ...rest } = desc;
  return rest;
}

function isJwksJson(value: unknown): value is { keys: JWK[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { keys?: unknown }).keys)
  );
}

async function fetchJwks(jwksUri: string): Promise<{ keys: JWK[] }> {
  const redis = getRedis();
  const cacheKey = `jwks:${jwksUri}`;
  
  // Try cache first (1 hour TTL)
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      const json = JSON.parse(cached);
      if (isJwksJson(json)) return json;
    } catch {
      // Cache corrupted, continue to fetch
    }
  }
  
  // Fetch from URI
  const resp = await ssrfGuard.safeFetch(jwksUri, { method: 'GET' });
  if (!resp.ok) throw new Error('agent_invalid');
  const text = await resp.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('agent_invalid');
  }
  if (!isJwksJson(json)) throw new Error('agent_invalid');
  
  // Cache for 1 hour
  await redis.setex(cacheKey, 3600, text);
  
  return json;
}

function isString(x: unknown): x is string {
  return typeof x === 'string';
}

function isAllowedAlg(alg: unknown): alg is AllowedAlg {
  return isString(alg) && ALLOWED_ALGS.has(alg as AllowedAlg);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyAgentDescriptor(descriptor: AgentDescriptor): Promise<VerifiedAgent> {
  // Basic shape
  if (!descriptor || typeof descriptor !== 'object') throw new Error('agent_invalid');
  if (!isString(descriptor.signature) || descriptor.signature.split('.').length !== 3) {
    throw new Error('agent_invalid');
  }

  // Check agent revocation list
  if (descriptor.id) {
    const redis = getRedis();
    const isRevoked = await redis.sismember('revoked_agents', descriptor.id);
    if (isRevoked) {
      throw new Error('agent_revoked');
    }
  }

  // Header checks
  const header: JWSHeaderParameters = decodeProtectedHeader(descriptor.signature);
  const { alg, kid } = header;
  if (!isAllowedAlg(alg)) throw new Error('agent_invalid');

  // Canonicalize payload (descriptor without signature)
  const stripped = shallowStripSignature(descriptor);
  const jcs = canonicalize(stripped);
  const expectedBytes = new TextEncoder().encode(jcs);

  // Resolve JWK (inline or JWKS)
  let jwk: JWK | undefined = descriptor.jwk;
  if (!jwk && descriptor.jwks_uri) {
    if (!isString(kid)) throw new Error('agent_invalid');
    const { keys } = await fetchJwks(descriptor.jwks_uri);
    jwk = keys.find((k) => (k as { kid?: string }).kid === kid);
  }
  if (!jwk) throw new Error('agent_invalid');

  // Verify compact JWS
  const key = await importJWK(jwk, alg);
  const result = await compactVerify(descriptor.signature, key);

  // Compare payload (JCS) in constant time
  if (!constantTimeEqual(result.payload, expectedBytes)) throw new Error('agent_invalid');

  return { jwk, descriptor: stripped };
}

export function checkPurposeAllowed(descriptor: AgentDescriptor, expectedPurpose: string): boolean {
  if (!expectedPurpose || typeof expectedPurpose !== 'string') return false;
  const list = Array.isArray(descriptor.purposes) ? descriptor.purposes : [];
  return list.includes(expectedPurpose);
}

export async function revokeAgent(agentId: string): Promise<void> {
  const redis = getRedis();
  await redis.sadd('revoked_agents', agentId);
}

export async function unrevokeAgent(agentId: string): Promise<void> {
  const redis = getRedis();
  await redis.srem('revoked_agents', agentId);
}
