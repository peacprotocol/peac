/**
 * @peac/adapter-managed-agents session summary builder
 *
 * Aggregates verified receipts into a session evidence summary.
 * Decodes each JWS to extract session ID, event family, and issuer.
 */

import { decode } from '@peac/crypto';
import { EXTENSION_NAMESPACE, TYPE_PREFIX } from './constants.js';
import { EventFamily, type SessionSummary } from './types.js';

/** Reverse lookup: type URI suffix -> EventFamily */
const TYPE_TO_FAMILY: Record<string, EventFamily> = {
  session: EventFamily.Session,
  task: EventFamily.Task,
  'tool-use': EventFamily.ToolUse,
  'mcp-call': EventFamily.McpCall,
  permission: EventFamily.Permission,
  outcome: EventFamily.Outcome,
};

/**
 * Build a session evidence summary from an array of signed JWS receipts.
 *
 * Decodes each JWS (does NOT verify signatures; caller should verify first).
 * Extracts session ID, event families, and issuer from claims and extensions.
 *
 * Accepts previously verified compact JWS receipts.
 * Does NOT perform signature verification; callers should verify first.
 * Throws on malformed compact JWS input (invalid base64url segments).
 *
 * @param receipts - Array of compact JWS strings (must be valid JWS format)
 * @returns Session summary with receipt count, families, and issuer
 */
export function buildSessionSummary(receipts: string[]): SessionSummary {
  if (receipts.length === 0) {
    return { sessionId: '', receipts: 0, families: [], issuer: '' };
  }

  let sessionId = '';
  let issuer = '';
  const familySet = new Set<EventFamily>();

  for (const jws of receipts) {
    const decoded = decode(jws);
    const claims = decoded.payload as Record<string, unknown>;

    if (!issuer && typeof claims.iss === 'string') {
      issuer = claims.iss;
    }

    const extensions = claims.extensions as Record<string, unknown> | undefined;
    const agentExt = extensions?.[EXTENSION_NAMESPACE] as Record<string, unknown> | undefined;

    if (agentExt) {
      if (!sessionId && typeof agentExt.session_id === 'string') {
        sessionId = agentExt.session_id;
      }
    }

    const type = claims.type as string | undefined;
    if (type?.startsWith(TYPE_PREFIX)) {
      const suffix = type.slice(TYPE_PREFIX.length);
      const family = TYPE_TO_FAMILY[suffix];
      if (family !== undefined) {
        familySet.add(family);
      }
    }
  }

  return {
    sessionId,
    receipts: receipts.length,
    families: [...familySet],
    issuer,
  };
}
