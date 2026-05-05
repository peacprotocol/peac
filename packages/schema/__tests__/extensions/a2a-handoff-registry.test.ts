/**
 * v0.14.1 — Registry-completeness regression test for A2A handoff.
 *
 * Asserts that the kernel's `TYPE_TO_EXTENSION_MAP` registers every one of
 * the 10 A2A handoff type URIs with `org.peacprotocol/a2a-handoff` as the
 * extension group, and that `REGISTERED_EXTENSION_GROUP_KEYS` includes the
 * new namespace.
 *
 * This locks the registry shape so a future refactor of `specs/kernel/registries.json`
 * cannot silently drop a mapping.
 */
import { describe, it, expect } from 'vitest';

import { TYPE_TO_EXTENSION_MAP } from '@peac/kernel';

import {
  A2A_AGENT_CARD_OBSERVATION_TYPE,
  A2A_HANDOFF_EXTENSION_KEY,
  A2A_HANDOFF_TYPE_URIS,
  A2A_TASK_TYPE_URIS,
} from '../../src/extensions/a2a-handoff';
import { REGISTERED_EXTENSION_GROUP_KEYS } from '../../src/wire-02-registries';

describe('TYPE_TO_EXTENSION_MAP: a2a-handoff completeness', () => {
  it('includes the Agent Card observation type URI', () => {
    expect(TYPE_TO_EXTENSION_MAP.get(A2A_AGENT_CARD_OBSERVATION_TYPE)).toBe(
      A2A_HANDOFF_EXTENSION_KEY
    );
  });

  it.each(Object.entries(A2A_TASK_TYPE_URIS))(
    'maps %s -> %s -> org.peacprotocol/a2a-handoff',
    (_event, typeUri) => {
      expect(TYPE_TO_EXTENSION_MAP.get(typeUri)).toBe(A2A_HANDOFF_EXTENSION_KEY);
    }
  );

  it('all 10 handoff type URIs map to org.peacprotocol/a2a-handoff', () => {
    expect(A2A_HANDOFF_TYPE_URIS.length).toBe(10);
    for (const typeUri of A2A_HANDOFF_TYPE_URIS) {
      expect(TYPE_TO_EXTENSION_MAP.get(typeUri)).toBe(A2A_HANDOFF_EXTENSION_KEY);
    }
  });
});

describe('REGISTERED_EXTENSION_GROUP_KEYS: a2a-handoff registration', () => {
  it('includes org.peacprotocol/a2a-handoff', () => {
    expect(REGISTERED_EXTENSION_GROUP_KEYS.has(A2A_HANDOFF_EXTENSION_KEY)).toBe(true);
  });

  it('size is 13 (12 pillars/cross-cutting + a2a-handoff)', () => {
    expect(REGISTERED_EXTENSION_GROUP_KEYS.size).toBe(13);
  });
});
