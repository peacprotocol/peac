/**
 * Conformance fixture tests for Content-Usage parser.
 *
 * Validates the parser against deterministic golden fixtures
 * in specs/conformance/fixtures/content-usage/.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseContentUsage } from '../src/content-usage.js';

const FIXTURES_DIR = join(__dirname, '../../../../specs/conformance/fixtures/content-usage');

interface FixtureEntry {
  purpose: string;
  decision: string;
}

interface Fixture {
  name: string;
  description: string;
  input?: string;
  input_note?: string;
  expected_entries: FixtureEntry[];
  expected_extension_count: number;
  expected_extension_keys?: string[];
}

interface FixtureFile {
  description: string;
  version: string;
  fixture_count: number;
  fixtures: Fixture[];
}

function loadFixtures(filename: string): FixtureFile {
  const raw = readFileSync(join(FIXTURES_DIR, filename), 'utf-8');
  return JSON.parse(raw) as FixtureFile;
}

describe('Content-Usage conformance: valid fixtures', () => {
  const file = loadFixtures('valid.json');

  for (const fixture of file.fixtures) {
    it(`${fixture.name}: ${fixture.description}`, () => {
      const result = parseContentUsage(fixture.input!);

      // Verify expected entries exist with correct decisions
      for (const expected of fixture.expected_entries) {
        const match = result.entries.find((e) => e.purpose === expected.purpose);
        expect(match, `expected entry for purpose "${expected.purpose}"`).toBeDefined();
        expect(match!.decision).toBe(expected.decision);
      }

      // Verify extension count
      expect(result.extensions.length).toBe(fixture.expected_extension_count);
    });
  }
});

describe('Content-Usage conformance: edge-case fixtures', () => {
  const file = loadFixtures('edge-cases.json');

  for (const fixture of file.fixtures) {
    // Skip the oversized fixture (needs dynamic generation)
    if (fixture.input_note) {
      it(`${fixture.name}: ${fixture.description}`, () => {
        // Generate oversized input dynamically
        const oversized = 'train-ai=n,' + 'x'.repeat(10000);
        const result = parseContentUsage(oversized);
        expect(result.entries.length).toBe(fixture.expected_entries.length);
        expect(result.extensions.length).toBe(fixture.expected_extension_count);
      });
      continue;
    }

    it(`${fixture.name}: ${fixture.description}`, () => {
      const result = parseContentUsage(fixture.input!);

      // Verify expected entries
      for (const expected of fixture.expected_entries) {
        const match = result.entries.find((e) => e.purpose === expected.purpose);
        expect(match, `expected entry for purpose "${expected.purpose}"`).toBeDefined();
        expect(match!.decision).toBe(expected.decision);
      }

      // Verify extension count
      expect(result.extensions.length).toBe(fixture.expected_extension_count);

      // Verify extension keys if specified
      if (fixture.expected_extension_keys) {
        const actualKeys = result.extensions.map((e) => e.key);
        expect(actualKeys).toEqual(fixture.expected_extension_keys);
      }
    });
  }
});
