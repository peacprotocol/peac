/**
 * @peac/adapter-runtime-governance session summary builder
 *
 * Aggregates decoded receipts into a session summary.
 * Decode-only (does NOT verify signatures; caller should verify first).
 * Returns deterministic family order (sorted alphabetically).
 * Counts unknown/unsupported type URIs separately.
 * Never implies verification or finality.
 */

import { decode } from '@peac/crypto';
import { EXTENSION_NAMESPACE, TYPE_PREFIX } from './constants.js';
import {
  RUNTIME_GOVERNANCE_FAMILIES,
  type RuntimeGovernanceFamily,
  type SessionSummary,
} from './types.js';

/** Reverse lookup set for known family suffixes. */
const KNOWN_SUFFIXES = new Set(RUNTIME_GOVERNANCE_FAMILIES.map((f) => f.replace(/_/g, '-')));

/**
 * Build a session summary from an array of signed JWS receipts.
 *
 * Decodes each JWS (does NOT verify signatures; caller should verify first).
 * Extracts session ID, families, and issuer from claims and extensions.
 * Unknown type URIs are counted but not included in the families list.
 *
 * @param receipts - Array of compact JWS strings (must be valid JWS format)
 * @returns Session summary with deterministic family ordering
 */
export function buildSessionSummary(receipts: string[]): SessionSummary {
  if (receipts.length === 0) {
    return { sessionId: '', receipts: 0, families: [], unknownTypeCount: 0, issuer: '' };
  }

  let sessionId = '';
  let issuer = '';
  let unknownTypeCount = 0;
  const familySet = new Set<RuntimeGovernanceFamily>();

  for (const jws of receipts) {
    const decoded = decode(jws);
    const claims = decoded.payload as Record<string, unknown>;

    if (!issuer && typeof claims.iss === 'string') {
      issuer = claims.iss;
    }

    const extensions = claims.extensions as Record<string, unknown> | undefined;
    const govExt = extensions?.[EXTENSION_NAMESPACE] as Record<string, unknown> | undefined;

    if (govExt) {
      if (!sessionId && typeof govExt.session_id === 'string') {
        sessionId = govExt.session_id;
      }
    }

    const type = claims.type as string | undefined;
    if (type?.startsWith(TYPE_PREFIX)) {
      const suffix = type.slice(TYPE_PREFIX.length);
      if (KNOWN_SUFFIXES.has(suffix)) {
        familySet.add(suffix.replace(/-/g, '_') as RuntimeGovernanceFamily);
      } else {
        unknownTypeCount++;
      }
    } else if (type) {
      unknownTypeCount++;
    }
  }

  return {
    sessionId,
    receipts: receipts.length,
    families: [...familySet].sort(),
    unknownTypeCount,
    issuer,
  };
}
