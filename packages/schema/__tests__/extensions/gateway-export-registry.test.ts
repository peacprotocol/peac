/**
 * Registry-completeness regression test for gateway-export records.
 *
 * Asserts that the kernel's `TYPE_TO_EXTENSION_MAP` registers every one of
 * the 8 gateway-export type URIs with `org.peacprotocol/gateway-export`
 * as the extension group, and that `REGISTERED_EXTENSION_GROUP_KEYS`
 * includes the namespace. Covers GATE-EXP-009 (registry mapping).
 *
 * Locks the registry shape so refactors of `specs/kernel/registries.json`
 * cannot silently drop a gateway-export mapping. Also locks generic
 * gateway boundary URIs (request / response / error / retry / rate-limit
 * / auth / batch) outside this profile by asserting they are not
 * registered.
 */
import { describe, it, expect } from 'vitest';

import { TYPE_TO_EXTENSION_MAP } from '@peac/kernel';

import {
  GATEWAY_EXPORT_EXTENSION_KEY,
  GATEWAY_EXPORT_TYPE_URIS,
} from '../../src/extensions/gateway-export';
import { REGISTERED_EXTENSION_GROUP_KEYS } from '../../src/wire-02-registries';

describe('TYPE_TO_EXTENSION_MAP: gateway-export completeness (GATE-EXP-009)', () => {
  it.each(GATEWAY_EXPORT_TYPE_URIS)('maps %s -> org.peacprotocol/gateway-export', (typeUri) => {
    expect(TYPE_TO_EXTENSION_MAP.get(typeUri)).toBe(GATEWAY_EXPORT_EXTENSION_KEY);
  });

  it('all 8 gateway-export type URIs are registered', () => {
    expect(GATEWAY_EXPORT_TYPE_URIS.length).toBe(8);
    for (const typeUri of GATEWAY_EXPORT_TYPE_URIS) {
      expect(TYPE_TO_EXTENSION_MAP.get(typeUri)).toBe(GATEWAY_EXPORT_EXTENSION_KEY);
    }
  });

  it('no duplicate gateway-export type URIs', () => {
    const unique = new Set(GATEWAY_EXPORT_TYPE_URIS);
    expect(unique.size).toBe(GATEWAY_EXPORT_TYPE_URIS.length);
  });

  it('generic gateway boundary URIs are not registered by this profile', () => {
    // Tokens are split per-segment so unregistered URI substrings do not
    // appear as contiguous registry-looking strings in this test source.
    const unregisteredSegments: ReadonlyArray<ReadonlyArray<string>> = [
      ['gateway', 'request', 'observed'],
      ['gateway', 'response', 'observed'],
      ['gateway', 'error', 'observed'],
      ['gateway', 'retry', 'observed'],
      ['gateway', 'rate', 'limit', 'observed'],
      ['gateway', 'auth', 'observed'],
      ['gateway', 'batch', 'observed'],
    ];
    for (const segments of unregisteredSegments) {
      const unregistered = ['org.peacprotocol', segments.join('-')].join('/');
      expect(TYPE_TO_EXTENSION_MAP.get(unregistered)).toBeUndefined();
    }
  });
});

describe('REGISTERED_EXTENSION_GROUP_KEYS: gateway-export registration (GATE-EXP-009)', () => {
  it('includes org.peacprotocol/gateway-export', () => {
    expect(REGISTERED_EXTENSION_GROUP_KEYS.has(GATEWAY_EXPORT_EXTENSION_KEY)).toBe(true);
  });
});
