import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeypair, verifyLocal } from '@peac/protocol';
import { decode } from '@peac/crypto';
import {
  issueRuntimeGovernanceRecord,
  RUNTIME_GOVERNANCE_FAMILIES,
  EXTENSION_NAMESPACE,
  FAMILY_REGISTRY,
  type RuntimeGovernanceEvent,
  type IssueOptions,
} from '../src/index.js';

/** Minimal valid events for each family. */
const FAMILY_EVENTS: Record<string, RuntimeGovernanceEvent> = {
  policy_decision: {
    event_name: 'policy.evaluated',
    payload: { family: 'policy_decision', action: 'allow', evaluation_ms: 2.3 },
    upstream: { source_system: 'test-system', source_event_type: 'ai.test.policy' },
  },
  audit_entry: {
    event_name: 'audit.created',
    payload: { family: 'audit_entry', entry_id: 'ae-001', outcome: 'success' },
  },
  authority_scope: {
    event_name: 'authority.narrowed',
    payload: {
      family: 'authority_scope',
      decision: 'allow_narrowed',
      effective_scope: ['read:files'],
    },
  },
  lifecycle_event: {
    event_name: 'lifecycle.transitioned',
    payload: {
      family: 'lifecycle_event',
      lifecycle_event_type: 'provisioned',
      new_state: 'active',
    },
  },
  trust_observation: {
    event_name: 'trust.observed',
    payload: { family: 'trust_observation', trust_score: 750, trust_delta: 5 },
  },
  compliance_observation: {
    event_name: 'compliance.assessed',
    payload: { family: 'compliance_observation', framework: 'EU_AI_ACT', compliance_score: 92 },
  },
};

describe('issue', () => {
  let privateKey: Uint8Array;
  let publicKey: Uint8Array;
  const issueOpts: Omit<IssueOptions, 'privateKey'> = {
    kid: 'test-key-1',
    issuer: 'https://test.example.com',
    sessionId: 'sess-001',
    agentId: 'agent-001',
    provider: 'test-provider',
  };

  beforeAll(async () => {
    const kp = await generateKeypair();
    privateKey = kp.privateKey;
    publicKey = kp.publicKey;
  });

  it('issues and verifies a record for each family', async () => {
    for (const family of RUNTIME_GOVERNANCE_FAMILIES) {
      const event = FAMILY_EVENTS[family];
      const result = await issueRuntimeGovernanceRecord(event, { ...issueOpts, privateKey });
      expect(result.jws).toBeTruthy();
      expect(result.family).toBe(family);
      expect(result.type).toBe(FAMILY_REGISTRY[family].type);

      const verification = await verifyLocal(result.jws, publicKey);
      expect(verification.valid).toBe(true);
    }
  });

  it('includes extension namespace with correct fields', async () => {
    const result = await issueRuntimeGovernanceRecord(FAMILY_EVENTS.policy_decision, {
      ...issueOpts,
      privateKey,
    });
    const decoded = decode(result.jws);
    const claims = decoded.payload as Record<string, unknown>;
    const ext = (claims.extensions as Record<string, unknown>)?.[EXTENSION_NAMESPACE] as Record<
      string,
      unknown
    >;

    expect(ext).toBeDefined();
    expect(ext.session_id).toBe('sess-001');
    expect(ext.agent_id).toBe('agent-001');
    expect(ext.provider).toBe('test-provider');
    expect(ext.event).toBe('policy.evaluated');
    expect(ext.action).toBe('allow');
    expect(ext.evaluation_ms).toBe(2.3);
  });

  it('preserves upstream artifact when present', async () => {
    const result = await issueRuntimeGovernanceRecord(FAMILY_EVENTS.policy_decision, {
      ...issueOpts,
      privateKey,
    });
    const decoded = decode(result.jws);
    const claims = decoded.payload as Record<string, unknown>;
    const ext = (claims.extensions as Record<string, unknown>)?.[EXTENSION_NAMESPACE] as Record<
      string,
      unknown
    >;
    const upstream = ext.upstream as Record<string, unknown>;

    expect(upstream.source_system).toBe('test-system');
    expect(upstream.source_event_type).toBe('ai.test.policy');
  });

  it('omits upstream block when not provided', async () => {
    const result = await issueRuntimeGovernanceRecord(FAMILY_EVENTS.audit_entry, {
      ...issueOpts,
      privateKey,
    });
    const decoded = decode(result.jws);
    const claims = decoded.payload as Record<string, unknown>;
    const ext = (claims.extensions as Record<string, unknown>)?.[EXTENSION_NAMESPACE] as Record<
      string,
      unknown
    >;

    expect(ext.upstream).toBeUndefined();
  });

  it('does not leak unknown fields into extension', async () => {
    const event: RuntimeGovernanceEvent = {
      event_name: 'policy.evaluated',
      payload: { family: 'policy_decision', action: 'allow' },
    };

    const result = await issueRuntimeGovernanceRecord(event, { ...issueOpts, privateKey });
    const decoded = decode(result.jws);
    const claims = decoded.payload as Record<string, unknown>;
    const ext = (claims.extensions as Record<string, unknown>)?.[EXTENSION_NAMESPACE] as Record<
      string,
      unknown
    >;

    const allowedKeys = new Set(['session_id', 'event', 'agent_id', 'provider', 'action']);
    for (const key of Object.keys(ext)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
  });

  it('produces deterministic extension field content across calls', async () => {
    const event = FAMILY_EVENTS.trust_observation;
    const r1 = await issueRuntimeGovernanceRecord(event, { ...issueOpts, privateKey });
    const r2 = await issueRuntimeGovernanceRecord(event, { ...issueOpts, privateKey });

    const d1 = decode(r1.jws).payload as Record<string, unknown>;
    const d2 = decode(r2.jws).payload as Record<string, unknown>;

    const ext1 = (d1.extensions as Record<string, unknown>)?.[EXTENSION_NAMESPACE];
    const ext2 = (d2.extensions as Record<string, unknown>)?.[EXTENSION_NAMESPACE];

    expect(JSON.stringify(ext1)).toBe(JSON.stringify(ext2));
  });

  it('nested upstream undefined fields are stripped (no E_EXTENSION_NON_JSON_VALUE)', async () => {
    const event: RuntimeGovernanceEvent = {
      event_name: 'policy.evaluated',
      payload: { family: 'policy_decision', action: 'allow' },
      upstream: {
        source_system: 'test-system',
        // all other upstream fields are undefined
      },
    };
    const result = await issueRuntimeGovernanceRecord(event, { ...issueOpts, privateKey });
    expect(result.jws).toBeTruthy();

    const decoded = decode(result.jws);
    const claims = decoded.payload as Record<string, unknown>;
    const ext = (claims.extensions as Record<string, unknown>)?.[EXTENSION_NAMESPACE] as Record<
      string,
      unknown
    >;
    const upstream = ext.upstream as Record<string, unknown>;

    expect(upstream.source_system).toBe('test-system');
    // undefined fields must not appear as keys
    expect(Object.keys(upstream)).toEqual(['source_system']);

    // must verify without error
    const v = await verifyLocal(result.jws, publicKey);
    expect(v.valid).toBe(true);
  });
});
