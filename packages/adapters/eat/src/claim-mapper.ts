/**
 * EAT Claim Mapper: maps EAT claims to Wire 0.2 receipt claims
 *
 * Privacy-first: all claim values are SHA-256 hashed by default.
 * Callers opt in to raw value inclusion via `includeRawClaims` option.
 * This prevents accidental PII leakage from EAT attestations into PEAC receipts.
 *
 * References:
 *   - RFC 9711 (Entity Attestation Token)
 *   - Wire 0.2 spec: kind, type, pillars, extensions
 */

import { sha256Hex } from '@peac/crypto';
import { EAT_CLAIM_KEY } from './types.js';
import type { EatClaims, ClaimMapperOptions, MappedEatClaims } from './types.js';

const DEFAULT_TYPE = 'org.peacprotocol/attestation';
const DEFAULT_PILLARS = ['identity'];

/** Well-known EAT claim labels (integer to string name) */
const CLAIM_LABEL_NAMES: Record<number, string> = {
  [EAT_CLAIM_KEY.iss]: 'iss',
  [EAT_CLAIM_KEY.sub]: 'sub',
  [EAT_CLAIM_KEY.aud]: 'aud',
  [EAT_CLAIM_KEY.exp]: 'exp',
  [EAT_CLAIM_KEY.nbf]: 'nbf',
  [EAT_CLAIM_KEY.iat]: 'iat',
  [EAT_CLAIM_KEY.cti]: 'cti',
  [EAT_CLAIM_KEY.nonce]: 'nonce',
  [EAT_CLAIM_KEY.ueid]: 'ueid',
  [EAT_CLAIM_KEY.sueids]: 'sueids',
  [EAT_CLAIM_KEY.oemid]: 'oemid',
  [EAT_CLAIM_KEY.hwmodel]: 'hwmodel',
  [EAT_CLAIM_KEY.hwversion]: 'hwversion',
  [EAT_CLAIM_KEY.swname]: 'swname',
  [EAT_CLAIM_KEY.swversion]: 'swversion',
  [EAT_CLAIM_KEY.secboot]: 'secboot',
  [EAT_CLAIM_KEY.dbgstat]: 'dbgstat',
};

/**
 * Serialize a claim value to a deterministic string for hashing.
 * Handles Uint8Array (hex), numbers, strings, and falls back to JSON.
 */
function serializeClaimValue(value: unknown): string {
  if (value instanceof Uint8Array) {
    return Array.from(value)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * Map EAT claims to Wire 0.2 receipt claims.
 *
 * Privacy-first: claim values are SHA-256 hashed unless their integer key
 * appears in `options.includeRawClaims`. This prevents accidental PII leakage.
 *
 * @param claims - Decoded EAT claims map
 * @param options - Mapper configuration
 * @returns Mapped claims suitable for Wire 0.2 receipt issuance
 */
export async function mapEatClaims(
  claims: EatClaims,
  options: ClaimMapperOptions = {}
): Promise<MappedEatClaims> {
  const { includeRawClaims = [], type = DEFAULT_TYPE, pillars = DEFAULT_PILLARS } = options;

  const rawSet = new Set(includeRawClaims);
  const attestationClaims: Record<string, string> = {};

  for (const [key, value] of claims) {
    if (typeof key !== 'number') continue;

    const labelName = CLAIM_LABEL_NAMES[key] ?? `claim_${key}`;
    const serialized = serializeClaimValue(value);

    if (rawSet.has(key)) {
      attestationClaims[labelName] = serialized;
    } else {
      attestationClaims[labelName] = `sha256:${await sha256Hex(serialized)}`;
    }
  }

  // Extract standard identifiers (if present and opted-in to raw)
  const issValue = claims.get(EAT_CLAIM_KEY.iss);
  const subValue = claims.get(EAT_CLAIM_KEY.sub);

  return {
    kind: 'evidence',
    type,
    pillars,
    attestation_claims: attestationClaims,
    eat_iss: typeof issValue === 'string' ? issValue : undefined,
    eat_sub: typeof subValue === 'string' ? subValue : undefined,
  };
}
