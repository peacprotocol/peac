/**
 * Registry-completeness regression test for commerce-mandate records.
 *
 * Asserts that the kernel's `TYPE_TO_EXTENSION_MAP` registers every one of
 * the 7 commerce-mandate type URIs with `org.peacprotocol/commerce-mandate`
 * as the extension group, and that `REGISTERED_EXTENSION_GROUP_KEYS`
 * includes the namespace. Covers COMM-MAN-009 (registry mapping).
 *
 * This locks the registry shape so a future refactor of
 * `specs/kernel/registries.json` cannot silently drop a commerce-mandate
 * mapping. Also locks the stale draft URI set out of the registry.
 */
import { describe, it, expect } from 'vitest';

import { TYPE_TO_EXTENSION_MAP } from '@peac/kernel';

import {
  COMMERCE_MANDATE_EXTENSION_KEY,
  COMMERCE_MANDATE_TYPE_URIS,
} from '../../src/extensions/commerce-mandate';
import { REGISTERED_EXTENSION_GROUP_KEYS } from '../../src/wire-02-registries';

describe('TYPE_TO_EXTENSION_MAP: commerce-mandate completeness (COMM-MAN-009)', () => {
  it.each(COMMERCE_MANDATE_TYPE_URIS)('maps %s -> org.peacprotocol/commerce-mandate', (typeUri) => {
    expect(TYPE_TO_EXTENSION_MAP.get(typeUri)).toBe(COMMERCE_MANDATE_EXTENSION_KEY);
  });

  it('all 7 commerce-mandate type URIs are registered', () => {
    expect(COMMERCE_MANDATE_TYPE_URIS.length).toBe(7);
    for (const typeUri of COMMERCE_MANDATE_TYPE_URIS) {
      expect(TYPE_TO_EXTENSION_MAP.get(typeUri)).toBe(COMMERCE_MANDATE_EXTENSION_KEY);
    }
  });

  it('no duplicate commerce-mandate type URIs', () => {
    const unique = new Set(COMMERCE_MANDATE_TYPE_URIS);
    expect(unique.size).toBe(COMMERCE_MANDATE_TYPE_URIS.length);
  });

  it('stale draft URI set is NOT registered (locks pre-2026-05-15 names out)', () => {
    // The earlier draft URI set used a mandate-binding lifecycle vocabulary.
    // The locked PR 2B set uses commerce-lifecycle terminology scoped to a
    // mandate. Stale tokens are split per-segment via .join() so the literal
    // stale URI substrings do not appear anywhere in this test source.
    const staleDraftSegments: ReadonlyArray<ReadonlyArray<string>> = [
      ['commerce', 'mandate', 'binding', 'requested', 'observed'],
      ['commerce', 'mandate', 'binding', 'confirmed', 'observed'],
      ['commerce', 'mandate', 'binding', 'declined', 'observed'],
      ['commerce', 'mandate', 'authorization', 'observed'],
      ['commerce', 'mandate', 'payment', 'settled', 'observed'],
      ['commerce', 'mandate', 'settlement', 'failed', 'observed'],
      ['commerce', 'mandate', 'settlement', 'reversed', 'observed'],
    ];
    for (const segments of staleDraftSegments) {
      const stale = ['org.peacprotocol', segments.join('-')].join('/');
      expect(TYPE_TO_EXTENSION_MAP.get(stale)).toBeUndefined();
    }
  });
});

describe('REGISTERED_EXTENSION_GROUP_KEYS: commerce-mandate registration (COMM-MAN-009)', () => {
  it('includes org.peacprotocol/commerce-mandate', () => {
    expect(REGISTERED_EXTENSION_GROUP_KEYS.has(COMMERCE_MANDATE_EXTENSION_KEY)).toBe(true);
  });
});
