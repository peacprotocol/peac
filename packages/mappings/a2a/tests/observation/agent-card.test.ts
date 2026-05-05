import { describe, it, expect } from 'vitest';

import {
  fromA2AAgentCardObservation,
  type AgentCardObservationInput,
  type DiscoveryPath,
} from '../../src/observation/agent-card';
import type { A2AAgentCard } from '../../src/types';
import {
  A2A_AGENT_CARD_OBSERVATION_TYPE,
  A2A_HANDOFF_EXTENSION_KEY,
  A2AHandoffSchema,
} from '@peac/schema';

const VALID_CARD: A2AAgentCard = {
  name: 'Test Agent',
  supportedInterfaces: [
    {
      url: 'https://agent.example.com/a2a/v1',
      protocolBinding: 'http+json',
      protocolVersion: '1.0',
    },
  ],
};

const FIXED_CARD_REF = 'sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

const baseInput: AgentCardObservationInput = {
  card: VALID_CARD,
  card_ref: FIXED_CARD_REF,
  selected_interface_url: 'https://agent.example.com/a2a/v1',
  signature_observation: {
    present: true,
    caller_reported_verification: 'verified',
    method_ref: 'ref:detached-jws',
    kid: 'k-2026-001',
    observed_by_ref: 'urn:peac:verifier:internal',
  },
  discovered_at: '2026-05-05T12:00:00Z',
  discovery_path: '/.well-known/agent-card.json',
};

describe('fromA2AAgentCardObservation', () => {
  it('happy path: produces valid extension block under org.peacprotocol/a2a-handoff', () => {
    const ext = fromA2AAgentCardObservation(baseInput);
    expect(Object.keys(ext)).toEqual([A2A_HANDOFF_EXTENSION_KEY]);
    const obs = ext[A2A_HANDOFF_EXTENSION_KEY];
    expect(obs.type).toBe(A2A_AGENT_CARD_OBSERVATION_TYPE);

    const parsed = A2AHandoffSchema.safeParse(obs);
    expect(parsed.success).toBe(true);
  });

  it('records caller_reported_verification: unverified without rejection', () => {
    const ext = fromA2AAgentCardObservation({
      ...baseInput,
      signature_observation: {
        ...baseInput.signature_observation,
        caller_reported_verification: 'unverified',
      },
    });
    const obs = ext[A2A_HANDOFF_EXTENSION_KEY] as {
      signature_observation: { caller_reported_verification: string };
    };
    expect(obs.signature_observation.caller_reported_verification).toBe('unverified');
    expect(A2AHandoffSchema.safeParse(obs).success).toBe(true);
  });

  it('records caller_reported_verification: not_checked without rejection', () => {
    const ext = fromA2AAgentCardObservation({
      ...baseInput,
      signature_observation: {
        present: false,
        caller_reported_verification: 'not_checked',
      },
    });
    const obs = ext[A2A_HANDOFF_EXTENSION_KEY] as {
      signature_observation: { caller_reported_verification: string };
    };
    expect(obs.signature_observation.caller_reported_verification).toBe('not_checked');
    expect(A2AHandoffSchema.safeParse(obs).success).toBe(true);
  });

  it('throws when card is not a v1.0 Agent Card (no supportedInterfaces[])', () => {
    const cardV03 = {
      name: 'Legacy Agent',
      url: 'https://agent.example.com',
    } as unknown as A2AAgentCard;
    expect(() => fromA2AAgentCardObservation({ ...baseInput, card: cardV03 })).toThrowError(
      /a2a\.agent_card_normalization_failed/
    );
  });

  it('throws when supportedInterfaces[] is empty', () => {
    const card = { name: 'Empty', supportedInterfaces: [] } as unknown as A2AAgentCard;
    expect(() => fromA2AAgentCardObservation({ ...baseInput, card })).toThrowError(
      /a2a\.agent_card_normalization_failed/
    );
  });

  it.each<DiscoveryPath>([
    '/.well-known/agent-card.json',
    '/.well-known/peac.json',
    'header-probe',
  ])('accepts discovery_path = %s', (discovery_path) => {
    const ext = fromA2AAgentCardObservation({ ...baseInput, discovery_path });
    expect(A2AHandoffSchema.safeParse(ext[A2A_HANDOFF_EXTENSION_KEY]).success).toBe(true);
  });

  it('omits optional signature_observation fields when not provided', () => {
    const ext = fromA2AAgentCardObservation({
      ...baseInput,
      signature_observation: {
        present: true,
        caller_reported_verification: 'verified',
      },
    });
    const obs = ext[A2A_HANDOFF_EXTENSION_KEY] as {
      signature_observation: Record<string, unknown>;
    };
    expect(obs.signature_observation.method_ref).toBeUndefined();
    expect(obs.signature_observation.kid).toBeUndefined();
    expect(obs.signature_observation.observed_by_ref).toBeUndefined();
  });

  it('rejects card_ref violating opaque-ref grammar (bare org.peacprotocol)', () => {
    const ext = fromA2AAgentCardObservation({ ...baseInput, card_ref: 'org.peacprotocol' });
    const parsed = A2AHandoffSchema.safeParse(ext[A2A_HANDOFF_EXTENSION_KEY]);
    expect(parsed.success).toBe(false);
  });

  it('rejects malformed discovered_at', () => {
    const ext = fromA2AAgentCardObservation({ ...baseInput, discovered_at: 'not-a-date' });
    const parsed = A2AHandoffSchema.safeParse(ext[A2A_HANDOFF_EXTENSION_KEY]);
    expect(parsed.success).toBe(false);
  });

  it('emitted-extension-shape snapshot: only spec-allowed keys, no decision/verdict/score/result', () => {
    const ext = fromA2AAgentCardObservation(baseInput);
    const obs = ext[A2A_HANDOFF_EXTENSION_KEY] as Record<string, unknown>;
    const allowed = new Set([
      'type',
      'card_ref',
      'selected_interface_url',
      'signature_observation',
      'discovered_at',
      'discovery_path',
    ]);
    const forbidden = [
      'decision',
      'verdict',
      'score',
      'result',
      'passed',
      'failed',
      'allowed',
      'denied',
      'authorized',
    ];
    for (const k of Object.keys(obs)) expect(allowed.has(k)).toBe(true);
    for (const k of forbidden) expect(obs).not.toHaveProperty(k);
  });

  it('helper does not import signature-verification APIs (boundary preserved)', async () => {
    // Smoke check at runtime: importing the helper module must not bring in
    // any object that resembles a JWS verifier. The strict enforcement is the
    // import-graph test at `tests/tooling/no-signature-verification-in-a2a-observation.test.ts`.
    const mod = await import('../../src/observation/agent-card');
    const exported = Object.keys(mod);
    expect(exported).toContain('fromA2AAgentCardObservation');
    for (const name of exported) {
      expect(name.toLowerCase()).not.toMatch(/verify|sign|jws/);
    }
  });
});
