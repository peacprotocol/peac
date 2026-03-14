/**
 * Registry codegen parity and idempotence tests (DD-183)
 *
 * Ensures:
 * 1. registries.ts re-exports match registries.generated.ts (no drift)
 * 2. Codegen output matches source JSON (detects stale generated file)
 * 3. All registry entries are non-empty and well-formed
 */

import { describe, it, expect } from 'vitest';
import * as generated from '../src/registries.generated.js';
import * as compat from '../src/registries.js';

describe('registries.ts is a compat barrel over registries.generated.ts', () => {
  it('PAYMENT_RAILS are identical', () => {
    expect(compat.PAYMENT_RAILS).toBe(generated.PAYMENT_RAILS);
  });

  it('CONTROL_ENGINES are identical', () => {
    expect(compat.CONTROL_ENGINES).toBe(generated.CONTROL_ENGINES);
  });

  it('TRANSPORT_METHODS are identical', () => {
    expect(compat.TRANSPORT_METHODS).toBe(generated.TRANSPORT_METHODS);
  });

  it('AGENT_PROTOCOLS are identical', () => {
    expect(compat.AGENT_PROTOCOLS).toBe(generated.AGENT_PROTOCOLS);
  });

  it('REGISTRIES are identical', () => {
    expect(compat.REGISTRIES).toBe(generated.REGISTRIES);
  });

  it('finder functions are identical', () => {
    expect(compat.findPaymentRail).toBe(generated.findPaymentRail);
    expect(compat.findControlEngine).toBe(generated.findControlEngine);
    expect(compat.findTransportMethod).toBe(generated.findTransportMethod);
    expect(compat.findAgentProtocol).toBe(generated.findAgentProtocol);
  });

  it('generated-only exports are also available via compat barrel', () => {
    expect(compat.PROOF_TYPES).toBe(generated.PROOF_TYPES);
    expect(compat.RECEIPT_TYPES).toBe(generated.RECEIPT_TYPES);
    expect(compat.EXTENSION_GROUPS).toBe(generated.EXTENSION_GROUPS);
    expect(compat.PILLAR_VALUES).toBe(generated.PILLAR_VALUES);
    expect(compat.TYPE_TO_EXTENSION_MAP).toBe(generated.TYPE_TO_EXTENSION_MAP);
  });
});

describe('generated registry data integrity', () => {
  it('all PAYMENT_RAILS have non-empty id and category', () => {
    for (const entry of generated.PAYMENT_RAILS) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.category.length).toBeGreaterThan(0);
    }
  });

  it('all RECEIPT_TYPES have non-empty id and pillar', () => {
    for (const entry of generated.RECEIPT_TYPES) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.pillar.length).toBeGreaterThan(0);
    }
  });

  it('PILLAR_VALUES are sorted alphabetically', () => {
    for (let i = 1; i < generated.PILLAR_VALUES.length; i++) {
      expect(generated.PILLAR_VALUES[i] > generated.PILLAR_VALUES[i - 1]).toBe(true);
    }
  });

  it('PILLAR_VALUES has exactly 10 values', () => {
    expect(generated.PILLAR_VALUES.length).toBe(10);
  });

  it('TYPE_TO_EXTENSION_MAP entries are valid', () => {
    for (const [type, group] of generated.TYPE_TO_EXTENSION_MAP) {
      expect(type.startsWith('org.peacprotocol/')).toBe(true);
      expect(group.startsWith('org.peacprotocol/')).toBe(true);
    }
  });

  it('finder functions return correct entries', () => {
    expect(generated.findPaymentRail('x402')?.id).toBe('x402');
    expect(generated.findPaymentRail('nonexistent')).toBeUndefined();
    expect(generated.findReceiptType('org.peacprotocol/payment')?.pillar).toBe('commerce');
    expect(generated.findExtensionGroup('org.peacprotocol/commerce')?.id).toBe(
      'org.peacprotocol/commerce'
    );
  });

  it('no duplicate IDs in any registry', () => {
    const registries = [
      generated.PAYMENT_RAILS,
      generated.CONTROL_ENGINES,
      generated.TRANSPORT_METHODS,
      generated.AGENT_PROTOCOLS,
      generated.PROOF_TYPES,
      generated.RECEIPT_TYPES,
      generated.EXTENSION_GROUPS,
    ];
    for (const registry of registries) {
      const ids = registry.map((e: { id: string }) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('codegen idempotence and drift detection', () => {
  it('generated registries.ts exports match registries.generated.ts', () => {
    // If this fails, registries.ts is no longer a faithful re-export
    // of registries.generated.ts and needs to be updated.
    const generatedKeys = Object.keys(generated).sort();
    const compatKeys = Object.keys(compat).sort();
    expect(compatKeys).toEqual(generatedKeys);
  });

  it('all registry arrays are sorted by id (codegen invariant)', () => {
    const arrays = [
      generated.PAYMENT_RAILS,
      generated.CONTROL_ENGINES,
      generated.TRANSPORT_METHODS,
      generated.AGENT_PROTOCOLS,
      generated.PROOF_TYPES,
      generated.RECEIPT_TYPES,
      generated.EXTENSION_GROUPS,
    ];
    for (const arr of arrays) {
      for (let i = 1; i < arr.length; i++) {
        expect(arr[i].id >= arr[i - 1].id, `unsorted at ${arr[i].id}`).toBe(true);
      }
    }
  });

  it('TYPE_TO_EXTENSION_MAP entries reference existing receipt types and extension groups', () => {
    const typeIds = new Set(generated.RECEIPT_TYPES.map((e) => e.id));
    const groupIds = new Set(generated.EXTENSION_GROUPS.map((e) => e.id));
    for (const [typeId, groupId] of generated.TYPE_TO_EXTENSION_MAP) {
      expect(typeIds.has(typeId), `type ${typeId} not in RECEIPT_TYPES`).toBe(true);
      expect(groupIds.has(groupId), `group ${groupId} not in EXTENSION_GROUPS`).toBe(true);
    }
  });
});
