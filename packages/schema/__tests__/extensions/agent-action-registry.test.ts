/**
 * Registry-completeness regression test for agent-action records.
 *
 * Asserts that the kernel's `TYPE_TO_EXTENSION_MAP` registers every one of
 * the 6 agent-action type URIs with `org.peacprotocol/agent-action` as the
 * extension group, and that `REGISTERED_EXTENSION_GROUP_KEYS` includes the
 * namespace. Covers AGENT-ACT-009 (registry mapping).
 *
 * This locks the registry shape so a future refactor of `specs/kernel/registries.json`
 * cannot silently drop an agent-action mapping.
 */
import { describe, it, expect } from 'vitest';

import { TYPE_TO_EXTENSION_MAP } from '@peac/kernel';

import {
  AGENT_ACTION_EXTENSION_KEY,
  AGENT_ACTION_TYPE_URIS,
} from '../../src/extensions/agent-action';
import { REGISTERED_EXTENSION_GROUP_KEYS } from '../../src/wire-02-registries';

describe('TYPE_TO_EXTENSION_MAP: agent-action completeness (AGENT-ACT-009)', () => {
  it.each(AGENT_ACTION_TYPE_URIS)('maps %s -> org.peacprotocol/agent-action', (typeUri) => {
    expect(TYPE_TO_EXTENSION_MAP.get(typeUri)).toBe(AGENT_ACTION_EXTENSION_KEY);
  });

  it('all 6 agent-action type URIs are registered', () => {
    expect(AGENT_ACTION_TYPE_URIS.length).toBe(6);
    for (const typeUri of AGENT_ACTION_TYPE_URIS) {
      expect(TYPE_TO_EXTENSION_MAP.get(typeUri)).toBe(AGENT_ACTION_EXTENSION_KEY);
    }
  });

  it('no duplicate agent-action type URIs', () => {
    const unique = new Set(AGENT_ACTION_TYPE_URIS);
    expect(unique.size).toBe(AGENT_ACTION_TYPE_URIS.length);
  });
});

describe('REGISTERED_EXTENSION_GROUP_KEYS: agent-action registration (AGENT-ACT-009)', () => {
  it('includes org.peacprotocol/agent-action', () => {
    expect(REGISTERED_EXTENSION_GROUP_KEYS.has(AGENT_ACTION_EXTENSION_KEY)).toBe(true);
  });
});
