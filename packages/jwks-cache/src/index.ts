/**
 * @peac/jwks-cache
 *
 * Edge-safe JWKS fetch and cache with SSRF protection.
 */

// Types
export type {
  JWK,
  JWKS,
  CacheBackend,
  CacheEntry,
  ResolverOptions,
  ResolvedKey,
  JwksKeyResolver,
} from './types.js';

// Cache
export {
  InMemoryCache,
  buildCacheKey,
  buildJwksCacheKey,
  parseCacheControlMaxAge,
} from './cache.js';

// Security
export { validateUrl, isMetadataIp } from './security.js';

// Resolver
export { createResolver, resolveKey, importJwkAsEd25519, createJwkVerifier } from './resolver.js';

// Errors
export { ErrorCodes, ErrorHttpStatus, JwksError } from './errors.js';
export type { ErrorCode } from './errors.js';
