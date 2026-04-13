import { describe, it, expect } from 'vitest';
import { normalizeRuntimeGovernanceEvent, NormalizationError } from '../src/index.js';

describe('normalize', () => {
  it('normalizes a valid policy decision', () => {
    const result = normalizeRuntimeGovernanceEvent({
      event_name: 'policy.evaluated',
      payload: {
        family: 'policy_decision',
        action: 'allow',
        matched_rule: 'default-allow',
        evaluation_ms: 2.3,
      },
    });
    expect(result.payload.family).toBe('policy_decision');
    if (result.payload.family === 'policy_decision') {
      expect(result.payload.action).toBe('allow');
      expect(result.payload.evaluation_ms).toBe(2.3);
    }
  });

  it('normalizes a valid audit entry', () => {
    const result = normalizeRuntimeGovernanceEvent({
      event_name: 'audit.created',
      payload: {
        family: 'audit_entry',
        entry_id: 'ae-001',
        outcome: 'success',
        previous_hash: 'sha256:' + 'a'.repeat(64),
        entry_hash: 'sha256:' + 'b'.repeat(64),
      },
    });
    expect(result.payload.family).toBe('audit_entry');
  });

  it('normalizes a valid authority scope', () => {
    const result = normalizeRuntimeGovernanceEvent({
      event_name: 'authority.narrowed',
      payload: {
        family: 'authority_scope',
        decision: 'allow_narrowed',
        effective_scope: ['read:files', 'write:sandbox'],
        matched_invariants: ['max-scope-depth'],
      },
    });
    expect(result.payload.family).toBe('authority_scope');
  });

  it('normalizes a valid lifecycle event', () => {
    const result = normalizeRuntimeGovernanceEvent({
      event_name: 'lifecycle.transitioned',
      payload: {
        family: 'lifecycle_event',
        lifecycle_event_type: 'provisioned',
        previous_state: 'pending',
        new_state: 'active',
        actor: 'orchestrator',
      },
    });
    expect(result.payload.family).toBe('lifecycle_event');
  });

  it('normalizes a valid trust observation', () => {
    const result = normalizeRuntimeGovernanceEvent({
      event_name: 'trust.observed',
      payload: {
        family: 'trust_observation',
        peer_id: 'agent-002',
        trust_score: 750,
        trust_delta: 5,
        success: true,
      },
    });
    expect(result.payload.family).toBe('trust_observation');
  });

  it('normalizes a valid compliance observation', () => {
    const result = normalizeRuntimeGovernanceEvent({
      event_name: 'compliance.assessed',
      payload: {
        family: 'compliance_observation',
        framework: 'EU_AI_ACT',
        compliance_score: 92,
        violation_count: 1,
        evidence_item_count: 47,
      },
    });
    expect(result.payload.family).toBe('compliance_observation');
  });

  it('normalizes preserved upstream artifact', () => {
    const result = normalizeRuntimeGovernanceEvent({
      event_name: 'policy.evaluated',
      payload: { family: 'policy_decision', action: 'allow' },
      upstream: {
        source_system: 'microsoft-agt',
        source_event_type: 'ai.agentmesh.policy.evaluation',
        source_timestamp: '2026-04-13T10:00:00Z',
      },
    });
    expect(result.upstream?.source_system).toBe('microsoft-agt');
    expect(result.upstream?.source_event_type).toBe('ai.agentmesh.policy.evaluation');
  });

  // Rejection tests
  it('rejects trust_score outside 0-1000', () => {
    expect(() =>
      normalizeRuntimeGovernanceEvent({
        event_name: 'test',
        payload: { family: 'trust_observation', trust_score: 1500 },
      })
    ).toThrow(NormalizationError);
  });

  it('rejects negative trust_score', () => {
    expect(() =>
      normalizeRuntimeGovernanceEvent({
        event_name: 'test',
        payload: { family: 'trust_observation', trust_score: -1 },
      })
    ).toThrow(NormalizationError);
  });

  it('rejects non-integer trust_score', () => {
    expect(() =>
      normalizeRuntimeGovernanceEvent({
        event_name: 'test',
        payload: { family: 'trust_observation', trust_score: 750.5 },
      })
    ).toThrow(NormalizationError);
  });

  it('rejects trust_delta outside bounds', () => {
    expect(() =>
      normalizeRuntimeGovernanceEvent({
        event_name: 'test',
        payload: { family: 'trust_observation', trust_delta: 2000 },
      })
    ).toThrow(NormalizationError);
  });

  it('rejects negative evaluation_ms', () => {
    expect(() =>
      normalizeRuntimeGovernanceEvent({
        event_name: 'test',
        payload: { family: 'policy_decision', action: 'allow', evaluation_ms: -1 },
      })
    ).toThrow(NormalizationError);
  });

  it('rejects NaN evaluation_ms', () => {
    expect(() =>
      normalizeRuntimeGovernanceEvent({
        event_name: 'test',
        payload: { family: 'policy_decision', action: 'allow', evaluation_ms: NaN },
      })
    ).toThrow(NormalizationError);
  });

  it('rejects Infinity evaluation_ms', () => {
    expect(() =>
      normalizeRuntimeGovernanceEvent({
        event_name: 'test',
        payload: { family: 'policy_decision', action: 'allow', evaluation_ms: Infinity },
      })
    ).toThrow(NormalizationError);
  });

  it('rejects compliance_score outside 0-100', () => {
    expect(() =>
      normalizeRuntimeGovernanceEvent({
        event_name: 'test',
        payload: { family: 'compliance_observation', compliance_score: 150 },
      })
    ).toThrow(NormalizationError);
  });

  it('rejects oversized effective_scope array', () => {
    expect(() =>
      normalizeRuntimeGovernanceEvent({
        event_name: 'test',
        payload: {
          family: 'authority_scope',
          effective_scope: Array.from({ length: 100 }, (_, i) => `scope-${i}`),
        },
      })
    ).toThrow(NormalizationError);
  });

  it('rejects unknown family', () => {
    expect(() =>
      normalizeRuntimeGovernanceEvent({
        event_name: 'test',
        payload: { family: 'unknown_family' },
      })
    ).toThrow(NormalizationError);
  });

  it('rejects missing event_name', () => {
    expect(() =>
      normalizeRuntimeGovernanceEvent({
        payload: { family: 'policy_decision', action: 'allow' },
      })
    ).toThrow(NormalizationError);
  });

  it('rejects non-object input', () => {
    expect(() => normalizeRuntimeGovernanceEvent('string')).toThrow(NormalizationError);
    expect(() => normalizeRuntimeGovernanceEvent(null)).toThrow(NormalizationError);
    expect(() => normalizeRuntimeGovernanceEvent(42)).toThrow(NormalizationError);
  });

  it('rejects upstream array (no recursive blobs)', () => {
    expect(() =>
      normalizeRuntimeGovernanceEvent({
        event_name: 'test',
        payload: { family: 'policy_decision', action: 'allow' },
        upstream: [1, 2, 3],
      })
    ).toThrow(NormalizationError);
  });

  it('rejects oversized digest strings', () => {
    expect(() =>
      normalizeRuntimeGovernanceEvent({
        event_name: 'test',
        payload: {
          family: 'audit_entry',
          previous_hash: 'x'.repeat(600),
        },
      })
    ).toThrow(NormalizationError);
  });

  it('rejects invalid RFC 3339 timestamp', () => {
    expect(() =>
      normalizeRuntimeGovernanceEvent({
        event_name: 'test',
        payload: { family: 'policy_decision', action: 'allow' },
        upstream: { source_timestamp: 'not-a-timestamp' },
      })
    ).toThrow(NormalizationError);
  });

  it('accepts valid RFC 3339 timestamp', () => {
    const result = normalizeRuntimeGovernanceEvent({
      event_name: 'test',
      payload: { family: 'policy_decision', action: 'allow' },
      upstream: { source_timestamp: '2026-04-13T10:00:00Z' },
    });
    expect(result.upstream?.source_timestamp).toBe('2026-04-13T10:00:00Z');
  });

  it('rejects malformed digest pattern', () => {
    expect(() =>
      normalizeRuntimeGovernanceEvent({
        event_name: 'test',
        payload: { family: 'audit_entry', previous_hash: 'not-a-digest' },
      })
    ).toThrow(NormalizationError);
  });

  it('accepts valid digest pattern', () => {
    const result = normalizeRuntimeGovernanceEvent({
      event_name: 'test',
      payload: {
        family: 'audit_entry',
        previous_hash: 'sha256:' + 'a'.repeat(64),
      },
    });
    if (result.payload.family === 'audit_entry') {
      expect(result.payload.previous_hash).toContain('sha256:');
    }
  });

  it('rejects invalid URI for source_artifact_ref', () => {
    expect(() =>
      normalizeRuntimeGovernanceEvent({
        event_name: 'test',
        payload: { family: 'policy_decision', action: 'allow' },
        upstream: { source_artifact_ref: 'no-scheme-here' },
      })
    ).toThrow(NormalizationError);
  });

  it('accepts valid URI for source_artifact_ref', () => {
    const result = normalizeRuntimeGovernanceEvent({
      event_name: 'test',
      payload: { family: 'policy_decision', action: 'allow' },
      upstream: { source_artifact_ref: 'https://example.com/artifact/123' },
    });
    expect(result.upstream?.source_artifact_ref).toBe('https://example.com/artifact/123');
  });

  it('allows optional fields to be absent', () => {
    const result = normalizeRuntimeGovernanceEvent({
      event_name: 'test',
      payload: { family: 'policy_decision', action: 'allow' },
    });
    if (result.payload.family === 'policy_decision') {
      expect(result.payload.matched_rule).toBeUndefined();
      expect(result.payload.evaluation_ms).toBeUndefined();
    }
  });
});
