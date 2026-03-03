/**
 * Wire 0.2 registry parity tests (v0.12.0-preview.1)
 *
 * Asserts that the code-side constants (REGISTERED_RECEIPT_TYPES,
 * REGISTERED_EXTENSION_GROUP_KEYS) match the canonical source of truth
 * in specs/kernel/registries.json. Prevents silent drift between the
 * JSON registry and the runtime constants used for warning emission.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REGISTERED_RECEIPT_TYPES, REGISTERED_EXTENSION_GROUP_KEYS } from '../src/index';

const REGISTRIES_PATH = resolve(__dirname, '../../../specs/kernel/registries.json');
const registries = JSON.parse(readFileSync(REGISTRIES_PATH, 'utf-8'));

describe('Wire 0.2 registry parity: REGISTERED_RECEIPT_TYPES', () => {
  const jsonTypes: string[] = registries.receipt_types.values.map((e: { id: string }) => e.id);

  it('code-side set matches registries.json receipt_types exactly', () => {
    const codeTypes = Array.from(REGISTERED_RECEIPT_TYPES).sort();
    const sortedJsonTypes = [...jsonTypes].sort();
    expect(codeTypes).toEqual(sortedJsonTypes);
  });

  it('no duplicate IDs in registries.json receipt_types', () => {
    expect(new Set(jsonTypes).size).toBe(jsonTypes.length);
  });
});

describe('Wire 0.2 registry parity: REGISTERED_EXTENSION_GROUP_KEYS', () => {
  const jsonGroups: string[] = registries.extension_groups.values.map((e: { id: string }) => e.id);

  it('code-side set matches registries.json extension_groups exactly', () => {
    const codeGroups = Array.from(REGISTERED_EXTENSION_GROUP_KEYS).sort();
    const sortedJsonGroups = [...jsonGroups].sort();
    expect(codeGroups).toEqual(sortedJsonGroups);
  });

  it('no duplicate IDs in registries.json extension_groups', () => {
    expect(new Set(jsonGroups).size).toBe(jsonGroups.length);
  });
});
