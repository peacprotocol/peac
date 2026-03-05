/**
 * @peac/adapter-eat
 *
 * EAT (Entity Attestation Token, RFC 9711) passport decoder and
 * PEAC Wire 0.2 claim mapper.
 *
 * Decodes COSE_Sign1 structures (RFC 9052) with Ed25519 signatures,
 * extracts EAT claims, and maps them to Wire 0.2 receipt claims
 * with privacy-first defaults (SHA-256 hashing of claim values).
 *
 * @packageDocumentation
 */

// Types
export type {
  CoseSign1,
  CoseProtectedHeaders,
  EatClaims,
  EatPassportResult,
  ClaimMapperOptions,
  MappedEatClaims,
} from './types.js';

// Constants
export { COSE_ALG, EAT_CLAIM_KEY, EAT_SIZE_LIMIT } from './types.js';

// Passport decoder
export { decodeEatPassport, EatAdapterError } from './passport.js';

// Claim mapper
export { mapEatClaims } from './claim-mapper.js';
