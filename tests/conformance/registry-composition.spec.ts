/**
 * Registry composition parity test.
 *
 * Verifies that the non-WIRE02 extension registry is correctly composed into
 * the final requirement-ids.json by build-registry.mjs. This test is the
 * canonical check that the two-source registry model (WIRE02 builder +
 * extension builder) stays aligned.
 *
 * If this test fails, run:
 *   node scripts/conformance/build-extension-registry.mjs
 *   node scripts/conformance/build-registry.mjs
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = join(__dirname, '..', '..');

const registry = JSON.parse(
  readFileSync(join(ROOT, 'specs/conformance/requirement-ids.json'), 'utf-8')
);
const extensionRegistry = JSON.parse(
  readFileSync(join(ROOT, 'specs/conformance/extension-requirement-ids.json'), 'utf-8')
);

const NON_WIRE02_NAMESPACES = ['DID-RES', 'GRPC-META', 'PKCE', 'RURL', 'SC', 'X402V2'];

function hashFragment(fragment: string): string {
  return 'sha256:' + createHash('sha256').update(fragment, 'utf-8').digest('hex');
}

describe('registry composition parity', () => {
  it('extension registry has 32 requirements across 7 sections', () => {
    expect(extensionRegistry.total_requirements).toBe(32);
    expect(extensionRegistry.sections).toHaveLength(7);
  });

  it('main registry has 240 total requirements across 27 sections (Section 28 A2A Handoff Records + Section 29 CLI Execution Records)', () => {
    let total = 0;
    for (const section of registry.sections) {
      total += section.requirements.length;
    }
    expect(total).toBe(240);
    expect(registry.sections).toHaveLength(27);
  });

  it('every extension section appears in main registry', () => {
    const mainSectionNumbers = new Set(
      registry.sections.map((s: { section_number: number }) => s.section_number)
    );
    for (const extSection of extensionRegistry.sections) {
      expect(mainSectionNumbers.has(extSection.section_number)).toBe(true);
    }
  });

  it('every extension requirement ID appears in main registry with identical hash', () => {
    const mainIdMap = new Map<string, { hash: string; fragment: string }>();
    for (const section of registry.sections) {
      for (const req of section.requirements) {
        mainIdMap.set(req.id, {
          hash: req.source_fragment_hash,
          fragment: req.source_fragment,
        });
      }
    }

    for (const extSection of extensionRegistry.sections) {
      for (const extReq of extSection.requirements) {
        const mainEntry = mainIdMap.get(extReq.id);
        expect(mainEntry).toBeDefined();
        expect(mainEntry!.hash).toBe(extReq.source_fragment_hash);
        expect(mainEntry!.fragment).toBe(extReq.source_fragment);
      }
    }
  });

  it('every non-WIRE02 namespace ID is sourced from extension registry', () => {
    const extensionIds = new Set<string>();
    for (const section of extensionRegistry.sections) {
      for (const req of section.requirements) {
        extensionIds.add(req.id);
      }
    }

    for (const section of registry.sections) {
      for (const req of section.requirements) {
        const isNonWire02 = NON_WIRE02_NAMESPACES.some((ns) => req.id.startsWith(ns));
        if (isNonWire02) {
          expect(extensionIds.has(req.id)).toBe(true);
        }
      }
    }
  });

  it('all hashes are freshly computable from source fragments (no tampering)', () => {
    for (const section of registry.sections) {
      for (const req of section.requirements) {
        const computed = hashFragment(req.source_fragment);
        expect(computed).toBe(req.source_fragment_hash);
      }
    }
  });

  it('extension sections carry governing_spec field', () => {
    for (const section of extensionRegistry.sections) {
      expect(section.governing_spec).toBeDefined();
      expect(typeof section.governing_spec).toBe('string');
      expect(section.governing_spec).toMatch(/^docs\/specs\//);
    }
  });

  it('all 25 non-WIRE02 IDs are blocking (hard_fail or advisory), not warning_only', () => {
    const allowedClasses = new Set(['hard_fail', 'advisory', 'issuance']);
    for (const section of extensionRegistry.sections) {
      for (const req of section.requirements) {
        expect(allowedClasses.has(req.enforcement_class)).toBe(true);
      }
    }
  });
});
