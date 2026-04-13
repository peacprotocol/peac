import { describe, it, expect } from 'vitest';
import { mapAgtEvent, NormalizationError } from '../../src/index.js';

describe('agt-mapper', () => {
  it('maps a policy decision event', () => {
    const event = mapAgtEvent({
      family: 'policy_decision',
      event: 'policy.evaluated',
      data: { action: 'allow', matched_rule: 'default-allow', evaluation_ms: 2.3 },
      source: { system: 'microsoft-agt', event_type: 'ai.agentmesh.policy.evaluation' },
    });
    expect(event.payload.family).toBe('policy_decision');
    expect(event.event_name).toBe('policy.evaluated');
    expect(event.upstream?.source_system).toBe('microsoft-agt');
  });

  it('maps an audit entry event', () => {
    const event = mapAgtEvent({
      family: 'audit_entry',
      event: 'audit.created',
      data: { entry_id: 'ae-001', outcome: 'success', previous_hash: 'sha256:' + 'a'.repeat(64) },
    });
    expect(event.payload.family).toBe('audit_entry');
  });

  it('maps all 6 families', () => {
    const families = [
      { family: 'policy_decision', data: { action: 'deny' } },
      { family: 'audit_entry', data: {} },
      { family: 'authority_scope', data: {} },
      { family: 'lifecycle_event', data: {} },
      { family: 'trust_observation', data: {} },
      { family: 'compliance_observation', data: {} },
    ];
    for (const { family, data } of families) {
      const event = mapAgtEvent({ family, event: 'test', data });
      expect(event.payload.family).toBe(family);
    }
  });

  it('builds PreservedUpstreamArtifact from source context', () => {
    const event = mapAgtEvent({
      family: 'policy_decision',
      event: 'test',
      data: { action: 'allow' },
      source: {
        system: 'microsoft-agt',
        event_type: 'ai.agentmesh.policy.evaluation',
        event_id: 'evt-123',
        timestamp: '2026-04-13T10:00:00Z',
        cloud_event_type: 'ai.agentmesh.policy.evaluation',
      },
    });
    expect(event.upstream?.source_system).toBe('microsoft-agt');
    expect(event.upstream?.source_event_id).toBe('evt-123');
    expect(event.upstream?.source_cloud_event_type).toBe('ai.agentmesh.policy.evaluation');
  });

  it('throws on unrecognized family', () => {
    expect(() => mapAgtEvent({ family: 'unknown_thing', event: 'test', data: {} })).toThrow(
      NormalizationError
    );
  });

  it('throws on malformed data', () => {
    expect(() =>
      mapAgtEvent({
        family: 'trust_observation',
        event: 'test',
        data: { trust_score: 'not-a-number' },
      })
    ).toThrow(NormalizationError);
  });
});
