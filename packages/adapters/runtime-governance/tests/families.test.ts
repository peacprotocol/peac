import { describe, it, expect } from 'vitest';
import {
  EVENT_TYPES,
  TYPE_PREFIX,
  EXTENSION_NAMESPACE,
  RUNTIME_GOVERNANCE_FAMILIES,
  FAMILY_REGISTRY,
} from '../src/index.js';

describe('families', () => {
  it('has 6 distinct families', () => {
    expect(RUNTIME_GOVERNANCE_FAMILIES).toHaveLength(6);
    expect(new Set(RUNTIME_GOVERNANCE_FAMILIES).size).toBe(6);
  });

  it('all type URIs start with the correct prefix', () => {
    for (const entry of Object.values(FAMILY_REGISTRY)) {
      expect(entry.type).toMatch(
        new RegExp(`^${TYPE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      );
    }
  });

  it('all type URIs are distinct', () => {
    const types = Object.values(FAMILY_REGISTRY).map((e) => e.type);
    expect(new Set(types).size).toBe(6);
  });

  it('all families use evidence kind', () => {
    for (const entry of Object.values(FAMILY_REGISTRY)) {
      expect(entry.kind).toBe('evidence');
    }
  });

  it('extension namespace is vendor-neutral', () => {
    expect(EXTENSION_NAMESPACE).toBe('org.peacprotocol/runtime-governance');
    expect(EXTENSION_NAMESPACE).not.toMatch(/microsoft|agt|azure|agentmesh/i);
  });

  it('no vendor strings in type URIs', () => {
    for (const type of Object.values(EVENT_TYPES)) {
      expect(type).not.toMatch(/microsoft|agt|azure|agentmesh/i);
    }
  });

  it('type URIs use observation-specific suffixes', () => {
    expect(EVENT_TYPES.POLICY_DECISION).toContain('policy-decision');
    expect(EVENT_TYPES.AUDIT_ENTRY).toContain('audit-entry');
    expect(EVENT_TYPES.AUTHORITY_SCOPE).toContain('authority-scope');
    expect(EVENT_TYPES.LIFECYCLE_EVENT).toContain('lifecycle-event');
    expect(EVENT_TYPES.TRUST_OBSERVATION).toContain('trust-observation');
    expect(EVENT_TYPES.COMPLIANCE_OBSERVATION).toContain('compliance-observation');
  });

  it('registry covers all families', () => {
    for (const family of RUNTIME_GOVERNANCE_FAMILIES) {
      expect(FAMILY_REGISTRY[family]).toBeDefined();
    }
  });
});
