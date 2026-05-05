/**
 * A2A Agent Card observation helper (v0.14.1).
 *
 * Records an observation of an A2A v1.0 Agent Card discovery event.
 * Strictly observational: this helper does NOT verify Agent Card signatures,
 * does NOT fetch Agent Cards, and does NOT derive auth or trust decisions.
 *
 * The caller supplies a `signature_observation` block containing what an
 * EXTERNAL verifier system reported about the signature. The field name is
 * deliberately `signature_observation.caller_reported_verification` (not the
 * legacy `signature.verified`) to make the semantic explicit at the field
 * level: PEAC observes what was reported, never decides verification.
 *
 * NEVER import signature-verification APIs here. The boundary is enforced by
 * `tests/tooling/no-signature-verification-in-a2a-observation.test.ts` via a
 * TS AST walker over import statements (artifact-shape, not source-grep).
 */

import {
  A2A_AGENT_CARD_OBSERVATION_TYPE,
  A2A_HANDOFF_EXTENSION_KEY,
  type A2AAgentCardObservation,
} from '@peac/schema';

import { normalizeAgentCard } from '../normalizers';
import type { A2AAgentCard } from '../types';

export type DiscoveryPath =
  | '/.well-known/agent-card.json'
  | '/.well-known/peac.json'
  | 'header-probe';

export type CallerReportedVerification = 'verified' | 'unverified' | 'not_checked';

export interface SignatureObservationInput {
  present: boolean;
  caller_reported_verification: CallerReportedVerification;
  /** Opaque pointer to the verification method (NOT an enum). */
  method_ref?: string;
  kid?: string;
  /** Opaque pointer to the verifier system that produced the observation. */
  observed_by_ref?: string;
}

export interface AgentCardObservationInput {
  /**
   * Raw Agent Card JSON. Typed as `unknown` because external integrators
   * pass parsed JSON without prior typing; the helper normalizes via
   * `normalizeAgentCard` and rejects non-v1.0 shapes.
   */
  card: unknown;
  /** Opaque reference to the card; MUST be sha256:<64 lowercase hex>. */
  card_ref: string;
  /** Caller-supplied URL of the chosen entry from supportedInterfaces[]. */
  selected_interface_url?: string;
  /** Caller-supplied verification observation. Helper does not verify. */
  signature_observation: SignatureObservationInput;
  /** RFC 3339 timestamp of when the discovery happened. */
  discovered_at: string;
  /** Which discovery path produced the card. */
  discovery_path: DiscoveryPath;
}

export interface A2AHandoffExtensionBlock {
  [A2A_HANDOFF_EXTENSION_KEY]: A2AAgentCardObservation;
}

/**
 * Build an Agent Card observation extension block. Throws if the card cannot
 * be normalized to A2A v1.0.0 (no `supportedInterfaces[]`); the helper does
 * NOT silently accept v0.3.0 shape.
 *
 * Typical use:
 *
 *   const ext = fromA2AAgentCardObservation({
 *     card: discoveredCard,
 *     card_ref: 'sha256:' + sha256(JSON.stringify(discoveredCard)),
 *     selected_interface_url: 'https://agent.example.com/a2a/v1',
 *     signature_observation: {
 *       present: true,
 *       caller_reported_verification: 'verified',
 *       method_ref: 'ref:detached-jws',
 *       kid: 'k-2026-001',
 *       observed_by_ref: 'urn:peac:verifier:internal',
 *     },
 *     discovered_at: '2026-05-05T12:00:00Z',
 *     discovery_path: '/.well-known/agent-card.json',
 *   });
 *   await issue({ extensions: { ...ext }, ... });
 */
export function fromA2AAgentCardObservation(
  input: AgentCardObservationInput
): A2AHandoffExtensionBlock {
  // Caller passes raw JSON; helper normalizes via the A2A v1.0 normalizer.
  // We cast through `A2AAgentCard` only at the call site; a non-conformant
  // shape returns null from the normalizer and we surface the failure as a
  // structured throw with stable error code.
  const normalized = normalizeAgentCard(input.card as A2AAgentCard);
  if (!normalized) {
    throw new Error(
      'a2a.agent_card_normalization_failed: card does not conform to A2A v1.0.0 (supportedInterfaces[] required)'
    );
  }

  const obs: A2AAgentCardObservation = {
    type: A2A_AGENT_CARD_OBSERVATION_TYPE,
    card_ref: input.card_ref,
    discovered_at: input.discovered_at,
    discovery_path: input.discovery_path,
    signature_observation: {
      present: input.signature_observation.present,
      caller_reported_verification: input.signature_observation.caller_reported_verification,
      ...(input.signature_observation.method_ref !== undefined && {
        method_ref: input.signature_observation.method_ref,
      }),
      ...(input.signature_observation.kid !== undefined && {
        kid: input.signature_observation.kid,
      }),
      ...(input.signature_observation.observed_by_ref !== undefined && {
        observed_by_ref: input.signature_observation.observed_by_ref,
      }),
    },
    ...(input.selected_interface_url !== undefined && {
      selected_interface_url: input.selected_interface_url,
    }),
  };

  return { [A2A_HANDOFF_EXTENSION_KEY]: obs };
}
