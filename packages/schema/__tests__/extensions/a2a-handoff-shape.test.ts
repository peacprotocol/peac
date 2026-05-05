/**
 * v0.14.1: Artifact-shape snapshot test for the a2a-handoff schema.
 *
 * For each of the 10 type URIs (Agent Card observation + 9 task-lifecycle
 * events), validates a happy-path payload and asserts the emitted shape
 * contains only spec-allowed top-level keys (and never any decision /
 * verdict / score / result vocabulary). This is the artifact-shape gate
 * that replaces the brittle source-grep test for decision words.
 */
import { describe, it, expect } from 'vitest';

import {
  A2A_AGENT_CARD_OBSERVATION_TYPE,
  A2A_HANDOFF_ERROR_CODES,
  A2A_HANDOFF_TYPE_URIS,
  A2A_TASK_TYPE_URIS,
  A2AHandoffSchema,
  validateA2AHandoff,
  type A2ATaskEvent,
} from '../../src/extensions/a2a-handoff';

const FROM_REF = 'sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

const FORBIDDEN_TOP_LEVEL_KEYS = [
  'decision',
  'verdict',
  'score',
  'result',
  'passed',
  'failed',
  'policy_result',
  'approval_result',
  'outcome',
  'judgment',
  'rating',
  'grade',
  'pass',
  'fail',
  'allow',
  'deny',
  'authorized',
  'denied',
  'granted',
  'rejected_reason',
] as const;

const ALLOWED_AGENT_CARD_KEYS = new Set([
  'type',
  'card_ref',
  'selected_interface_url',
  'signature_observation',
  'discovered_at',
  'discovery_path',
]);

const ALLOWED_TASK_KEYS = new Set([
  'type',
  'event',
  'task_id',
  'parent_task_id',
  'from_agent',
  'to_agent',
  'state',
  'reason',
  'observed_at',
  'upstream_event_ref',
  'upstream_event_digest',
]);

describe('A2AHandoffSchema: 10 type URIs', () => {
  it('exports exactly 10 type URIs', () => {
    expect(A2A_HANDOFF_TYPE_URIS.length).toBe(10);
  });
});

describe('Agent Card observation: shape snapshot', () => {
  const payload = {
    type: A2A_AGENT_CARD_OBSERVATION_TYPE,
    card_ref: FROM_REF,
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

  it('validates and uses only allowed top-level keys', () => {
    const result = validateA2AHandoff(payload);
    expect(result.ok).toBe(true);
    for (const k of Object.keys(payload)) {
      expect(ALLOWED_AGENT_CARD_KEYS.has(k)).toBe(true);
    }
    for (const forbidden of FORBIDDEN_TOP_LEVEL_KEYS) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });

  it('rejects legacy signature.verified shape', () => {
    const legacy = {
      type: A2A_AGENT_CARD_OBSERVATION_TYPE,
      card_ref: FROM_REF,
      signature: { present: true, verified: true, method: 'jws', kid: 'k1' },
      discovered_at: '2026-05-05T12:00:00Z',
      discovery_path: '/.well-known/agent-card.json',
    };
    expect(A2AHandoffSchema.safeParse(legacy).success).toBe(false);
  });
});

describe('Task / human events: shape snapshot', () => {
  const events = Object.keys(A2A_TASK_TYPE_URIS) as A2ATaskEvent[];
  it.each(events)('event %s validates and uses only allowed top-level keys', (event) => {
    const payload = {
      type: A2A_TASK_TYPE_URIS[event],
      event,
      task_id: 'urn:a2a:task:42',
      from_agent: {
        card_ref: FROM_REF,
        selected_interface_url: 'https://gateway.example.com/a2a/v1',
      },
      observed_at: '2026-05-05T12:00:00Z',
    };
    const result = validateA2AHandoff(payload);
    expect(result.ok).toBe(true);
    for (const k of Object.keys(payload)) {
      expect(ALLOWED_TASK_KEYS.has(k)).toBe(true);
    }
    for (const forbidden of FORBIDDEN_TOP_LEVEL_KEYS) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });

  it('rejects task observation with top-level decision key', () => {
    const malicious = {
      type: A2A_TASK_TYPE_URIS['task.completed'],
      event: 'task.completed',
      task_id: 'urn:a2a:task:42',
      from_agent: { card_ref: FROM_REF },
      observed_at: '2026-05-05T12:00:00Z',
      decision: 'allow',
    };
    expect(A2AHandoffSchema.safeParse(malicious).success).toBe(false);
  });

  it('rejects task observation with top-level score key', () => {
    const malicious = {
      type: A2A_TASK_TYPE_URIS['task.completed'],
      event: 'task.completed',
      task_id: 'urn:a2a:task:42',
      from_agent: { card_ref: FROM_REF },
      observed_at: '2026-05-05T12:00:00Z',
      score: 0.92,
    };
    expect(A2AHandoffSchema.safeParse(malicious).success).toBe(false);
  });
});

describe('Sha256DigestSchema enforcement on card_ref (Blocker 6)', () => {
  function agentCardWith(card_ref: string) {
    return {
      type: A2A_AGENT_CARD_OBSERVATION_TYPE,
      card_ref,
      signature_observation: {
        present: true,
        caller_reported_verification: 'not_checked' as const,
      },
      discovered_at: '2026-05-05T12:00:00Z',
      discovery_path: '/.well-known/agent-card.json' as const,
    };
  }

  it('rejects bare org.peacprotocol card_ref (digest grammar)', () => {
    expect(A2AHandoffSchema.safeParse(agentCardWith('org.peacprotocol')).success).toBe(false);
  });

  it('rejects urn: card_ref (must be sha256: digest)', () => {
    expect(A2AHandoffSchema.safeParse(agentCardWith('urn:peac:card:1')).success).toBe(false);
  });

  it('rejects sha256:abc (length too short)', () => {
    expect(A2AHandoffSchema.safeParse(agentCardWith('sha256:abc')).success).toBe(false);
  });

  it('accepts sha256:<64 lowercase hex>', () => {
    expect(
      A2AHandoffSchema.safeParse(
        agentCardWith('sha256:0000000000000000000000000000000000000000000000000000000000000001')
      ).success
    ).toBe(true);
  });
});

describe('event/type pair matching (Blocker 5)', () => {
  it('rejects type=task-completed with event=task.failed', () => {
    const malformed = {
      type: A2A_TASK_TYPE_URIS['task.completed'],
      event: 'task.failed',
      task_id: 'urn:a2a:task:42',
      from_agent: {
        card_ref: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
      },
      observed_at: '2026-05-05T12:00:00Z',
    };
    expect(A2AHandoffSchema.safeParse(malformed).success).toBe(false);
  });

  it('rejects type=human-approved with event=human.rejected', () => {
    const malformed = {
      type: A2A_TASK_TYPE_URIS['human.approved'],
      event: 'human.rejected',
      task_id: 'urn:a2a:task:42',
      from_agent: {
        card_ref: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
      },
      observed_at: '2026-05-05T12:00:00Z',
    };
    expect(A2AHandoffSchema.safeParse(malformed).success).toBe(false);
  });
});

describe('validateA2AHandoff structured errors (Improvement 8)', () => {
  it('returns structured errors with stable codes on legacy signature shape', () => {
    const payload = {
      type: A2A_AGENT_CARD_OBSERVATION_TYPE,
      card_ref: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
      signature: { present: true, verified: true, method: 'jws', kid: 'k1' },
      discovered_at: '2026-05-05T12:00:00Z',
      discovery_path: '/.well-known/agent-card.json',
    };
    const result = validateA2AHandoff(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain('a2a.legacy_signature_shape_blocked');
    }
  });

  it('returns structured error code a2a.observation_decision_blocked on top-level decision', () => {
    const payload = {
      type: A2A_TASK_TYPE_URIS['task.completed'],
      event: 'task.completed',
      task_id: 'urn:a2a:task:42',
      from_agent: {
        card_ref: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
      },
      observed_at: '2026-05-05T12:00:00Z',
      decision: 'allow',
    };
    const result = validateA2AHandoff(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain('a2a.observation_decision_blocked');
    }
  });

  it('returns structured error code a2a.type_event_mismatch on cross-pair', () => {
    const payload = {
      type: A2A_TASK_TYPE_URIS['task.completed'],
      event: 'task.failed',
      task_id: 'urn:a2a:task:42',
      from_agent: {
        card_ref: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
      },
      observed_at: '2026-05-05T12:00:00Z',
    };
    const result = validateA2AHandoff(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain('a2a.type_event_mismatch');
    }
  });

  it('returns structured error code a2a.card_ref_digest_invalid on bad card_ref', () => {
    const payload = {
      type: A2A_AGENT_CARD_OBSERVATION_TYPE,
      card_ref: 'urn:peac:card:1',
      signature_observation: {
        present: true,
        caller_reported_verification: 'not_checked' as const,
      },
      discovered_at: '2026-05-05T12:00:00Z',
      discovery_path: '/.well-known/agent-card.json' as const,
    };
    const result = validateA2AHandoff(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain('a2a.card_ref_digest_invalid');
    }
  });

  it('returns structured error code a2a.opaque_ref_grammar_violation on bad task_id', () => {
    const payload = {
      type: A2A_TASK_TYPE_URIS['task.submitted'],
      event: 'task.submitted',
      task_id: 'org.peacprotocol',
      from_agent: {
        card_ref: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
      },
      observed_at: '2026-05-05T12:00:00Z',
    };
    const result = validateA2AHandoff(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain('a2a.opaque_ref_grammar_violation');
    }
  });

  it('happy path returns ok:true with parsed value', () => {
    const payload = {
      type: A2A_AGENT_CARD_OBSERVATION_TYPE,
      card_ref: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
      signature_observation: {
        present: true,
        caller_reported_verification: 'verified' as const,
      },
      discovered_at: '2026-05-05T12:00:00Z',
      discovery_path: '/.well-known/agent-card.json' as const,
    };
    const result = validateA2AHandoff(payload);
    expect(result.ok).toBe(true);
  });
});
