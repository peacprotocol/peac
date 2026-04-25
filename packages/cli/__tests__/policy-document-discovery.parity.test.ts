/**
 * Parity test (Step 3 - post-archive): frozen-snapshot comparison.
 *
 * The retired @peac/disc package was archived in PR A. The pre-archive
 * snapshot capture (packages/cli/__tests__/policy-document-discovery
 * .snapshot-capture.mjs) recorded the v0.13.0 @peac/disc.parse output for
 * each fixture into ./fixtures/policy-document-discovery/snapshots/.
 *
 * This test replays each snapshot, runs the new CLI-internal
 * parsePolicyDocumentCompat helper on the same fixture text, and asserts
 * behavior equivalence on the surface the CLI consumers actually depend on:
 *   - valid flag matches the snapshot
 *   - data structural equality where valid
 *   - error arity matches (we do NOT pin error wording)
 *   - legacy-line warning count matches
 *
 * Snapshots are normative. Updating a snapshot requires a separate explicit
 * commit + reviewer approval; do not regenerate them from the new helper.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parsePolicyDocumentCompat,
  __resetLegacyWarningForTests,
} from '../src/lib/policy-document-discovery.js';
import { PARITY_FIXTURES } from './fixtures/policy-document-discovery/fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = join(__dirname, 'fixtures', 'policy-document-discovery', 'snapshots');

interface FrozenSnapshot {
  fixture: string;
  description: string;
  capturedFrom: string;
  valid: boolean;
  data?: unknown;
  errorsCount: number;
  legacyWarningCount: number;
}

function loadSnapshot(name: string): FrozenSnapshot {
  const path = join(SNAPSHOTS_DIR, `${name}.snapshot.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as FrozenSnapshot;
}

function legacyWarningCount(warnings: readonly string[] | undefined): number {
  return (warnings ?? []).filter((w) => /legacy key-discovery field/.test(w)).length;
}

describe('policy-document-discovery: parity vs frozen v0.13.0 @peac/disc snapshots', () => {
  beforeEach(() => {
    vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
    __resetLegacyWarningForTests();
  });

  it.each(PARITY_FIXTURES.map((f) => [f.name, f.description, f.text] as const))(
    '%s (%s): matches frozen snapshot',
    (name, _desc, text) => {
      const snapshot = loadSnapshot(name);
      const result = parsePolicyDocumentCompat(text);

      expect(result.valid).toBe(snapshot.valid);

      if (snapshot.valid) {
        expect(result.data).toEqual(snapshot.data);
      } else {
        expect(result.errors?.length ?? 0).toBeGreaterThan(0);
        expect(snapshot.errorsCount).toBeGreaterThan(0);
      }

      expect(legacyWarningCount(result.warnings)).toBe(snapshot.legacyWarningCount);
    }
  );

  it('snapshot count matches fixture count (no orphaned snapshots, no missing snapshots)', () => {
    const fixtureNames = new Set(PARITY_FIXTURES.map((f) => f.name));
    for (const fixture of PARITY_FIXTURES) {
      const snapshot = loadSnapshot(fixture.name);
      expect(snapshot.fixture).toBe(fixture.name);
      expect(snapshot.capturedFrom).toMatch(/@peac\/disc\.parse/);
    }
    expect(fixtureNames.size).toBe(PARITY_FIXTURES.length);
  });
});
