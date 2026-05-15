/**
 * v0.14.2: Registry-completeness regression test for provisioning-lifecycle.
 *
 * Asserts that the kernel's `TYPE_TO_EXTENSION_MAP` registers every one of
 * the 10 provisioning-lifecycle type URIs with `org.peacprotocol/provisioning-lifecycle`
 * as the extension group, and that `REGISTERED_EXTENSION_GROUP_KEYS`
 * includes the new namespace.
 *
 * This locks the registry shape so a future refactor of `specs/kernel/registries.json`
 * cannot silently drop a mapping.
 */
import { describe, it, expect } from 'vitest';

import { TYPE_TO_EXTENSION_MAP } from '@peac/kernel';

import {
  PROVISIONING_LIFECYCLE_EXTENSION_KEY,
  PROVISIONING_LIFECYCLE_TYPE_URIS,
} from '../../src/extensions/provisioning-lifecycle';
import { REGISTERED_EXTENSION_GROUP_KEYS } from '../../src/wire-02-registries';

describe('TYPE_TO_EXTENSION_MAP: provisioning-lifecycle completeness', () => {
  it.each(PROVISIONING_LIFECYCLE_TYPE_URIS)(
    'maps %s -> org.peacprotocol/provisioning-lifecycle',
    (typeUri) => {
      expect(TYPE_TO_EXTENSION_MAP.get(typeUri)).toBe(PROVISIONING_LIFECYCLE_EXTENSION_KEY);
    }
  );

  it('all 10 provisioning-lifecycle type URIs are registered', () => {
    expect(PROVISIONING_LIFECYCLE_TYPE_URIS.length).toBe(10);
    for (const typeUri of PROVISIONING_LIFECYCLE_TYPE_URIS) {
      expect(TYPE_TO_EXTENSION_MAP.get(typeUri)).toBe(PROVISIONING_LIFECYCLE_EXTENSION_KEY);
    }
  });
});

describe('REGISTERED_EXTENSION_GROUP_KEYS: provisioning-lifecycle registration', () => {
  it('includes org.peacprotocol/provisioning-lifecycle', () => {
    expect(REGISTERED_EXTENSION_GROUP_KEYS.has(PROVISIONING_LIFECYCLE_EXTENSION_KEY)).toBe(true);
  });

  it('size is 17 (12 pillars/cross-cutting + a2a-handoff + cli-execution + lifecycle-observation added in v0.14.1 + provisioning-lifecycle added in v0.14.2 + agent-action added in v0.14.3)', () => {
    expect(REGISTERED_EXTENSION_GROUP_KEYS.size).toBe(17);
  });
});
