/**
 * @peac/adapter-runtime-governance record issuance
 *
 * Generic issuance function that dispatches to per-family extension
 * builders. Source-specific mappers (e.g., mapAgtEvent) produce the
 * RuntimeGovernanceEvent input; this function handles signing.
 *
 * PEAC validates the structure and signature of the PEAC record,
 * not the truth of the upstream governance decision or the operating
 * effectiveness of the upstream control plane.
 */

import { issue } from '@peac/protocol';
import { EXTENSION_NAMESPACE } from './constants.js';
import { FAMILY_REGISTRY } from './families.js';
import { FAMILY_BUILDERS } from './builders.js';
import type { RuntimeGovernanceEvent, IssueOptions, IssueResult } from './types.js';

/**
 * Issue a signed Interaction Record for a normalized runtime governance event.
 *
 * Use source-specific mappers (e.g., mapAgtEvent) to produce the event input.
 * The provider field is always caller-supplied and never hardcoded.
 */
function validateIssueOptions(options: IssueOptions): void {
  if (!(options.privateKey instanceof Uint8Array) || options.privateKey.length !== 32) {
    throw new Error('privateKey must be a 32-byte Uint8Array');
  }
  if (typeof options.kid !== 'string' || options.kid.length === 0 || options.kid.length > 256) {
    throw new Error('kid must be a non-empty string (max 256 chars)');
  }
  if (typeof options.issuer !== 'string' || options.issuer.length === 0) {
    throw new Error('issuer must be a non-empty string');
  }
  if (
    typeof options.sessionId !== 'string' ||
    options.sessionId.length === 0 ||
    options.sessionId.length > 256
  ) {
    throw new Error('sessionId must be a non-empty string (max 256 chars)');
  }
  if (
    typeof options.agentId !== 'string' ||
    options.agentId.length === 0 ||
    options.agentId.length > 256
  ) {
    throw new Error('agentId must be a non-empty string (max 256 chars)');
  }
  if (
    typeof options.provider !== 'string' ||
    options.provider.length === 0 ||
    options.provider.length > 256
  ) {
    throw new Error('provider must be a non-empty string (max 256 chars)');
  }
}

export async function issueRuntimeGovernanceRecord(
  event: RuntimeGovernanceEvent,
  options: IssueOptions
): Promise<IssueResult> {
  validateIssueOptions(options);
  const entry = FAMILY_REGISTRY[event.payload.family];
  const { privateKey, kid, issuer, sessionId, agentId, provider } = options;

  const common = {
    session_id: sessionId,
    event: event.event_name,
    agent_id: agentId,
    provider,
  };

  const extensionData = FAMILY_BUILDERS[event.payload.family](
    event.payload,
    common,
    event.upstream
  );

  const { jws } = await issue({
    iss: issuer,
    kind: entry.kind,
    type: entry.type,
    privateKey,
    kid,
    extensions: { [EXTENSION_NAMESPACE]: extensionData },
  });

  return { jws, type: entry.type, family: event.payload.family };
}
