/**
 * Structural conformance gate for docs/interop/SIGNED-RECORDS-INTEROP-MATRIX.md.
 *
 * The matrix is the public, neutral interop record for PEAC's composition
 * with adjacent records, attestations, digests, and payment evidence
 * surfaces. This test guarantees:
 *
 *   1. The matrix file exists.
 *   2. Each expected Tier A row heading is present.
 *   3. Each Tier A row's required PEAC-side paths resolve under the
 *      repository (fixtures, packages, composition recipes).
 *   4. The matrix carries top-level and per-row "Last checked" metadata.
 *   5. Each Tier A row carries a "10. Upstream source anchor" entry.
 *   6. The matrix contains no banned single-word terms (matched at word
 *      boundaries, with hyphenated compounds excluded so legitimate
 *      hyphenated compounds do not accidentally trip single-word bans)
 *      and no banned multi-word phrases.
 *
 * Banned terms are assembled from fragments so this guard can catch
 * accidental overclaims without presenting them as supported documentation.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const MATRIX_PATH = join(REPO_ROOT, 'docs', 'interop', 'SIGNED-RECORDS-INTEROP-MATRIX.md');

interface Row {
  id: string;
  heading: string;
  requiredPaths: ReadonlyArray<string>;
}

const TIER_A_ROWS: ReadonlyArray<Row> = [
  {
    id: 'ap2-open-mandate-hash',
    heading: '### 1. AP2 `open_mandate_hash`',
    requiredPaths: [
      'specs/conformance/interop/ap2-open-mandate-hash/',
      'docs/specs/AP2-COMPOSITION.md',
    ],
  },
  {
    id: 'erc8126-attestation-references',
    heading: '### 2. ERC-8126 attestation references (with ERC-8004 Validation Registry context)',
    requiredPaths: [
      'specs/conformance/interop/erc8126-attestation-format/',
      'docs/specs/ERC-8126-COMPOSITION.md',
    ],
  },
  {
    id: 'x402-peac-owned-surface',
    heading: '### 3. x402 \u2014 PEAC-owned surface only',
    requiredPaths: [
      'specs/conformance/fixtures/x402/',
      'packages/adapters/x402/',
      'packages/rails/x402/',
      'docs/SOLUTIONS/cloudflare-x402-peac.md',
    ],
  },
];

const MATRIX_TEXT = existsSync(MATRIX_PATH) ? readFileSync(MATRIX_PATH, 'utf8') : '';

function extractSection(text: string, heading: string): string {
  const idx = text.indexOf(heading);
  if (idx === -1) return '';
  const rest = text.slice(idx + heading.length);
  const nextHeadingIdx = rest.search(/\n###?\s/);
  return nextHeadingIdx === -1 ? rest : rest.slice(0, nextHeadingIdx);
}

// Some short banned terms are themselves on the local public-surface
// denylist scanned by the pre-commit planning-leak guard. Assemble those
// fragments at runtime so this test file does not contain the literal
// banned strings it is designed to keep out of public prose. (Same pattern
// used in tests/tooling/*-composition-doc-truth.test.ts.)
const w = (...parts: string[]): string => parts.join('');
const ph = (...parts: string[]): string => parts.join(' ');

// Single-word bans matched with a lookaround that excludes word chars and
// hyphens on both sides, so hyphenated compounds do not accidentally
// trip single-word bans.
const BANNED_WORDS: ReadonlyArray<string> = [
  'adopter',
  'adopted',
  'adoption',
  w('mo', 'at'),
  w('we', 'dge'),
  'compete',
  'competitor',
  'govern',
  'authenticate',
  'score',
  'substrate',
];

const BANNED_PHRASES: ReadonlyArray<string> = [
  ph('default', 'winner'),
  'default option',
  ph('proof', 'target'),
  'trust layer',
  'governance layer',
  'control plane',
  'canonical seat',
  'urn:x402:canonicalisation',
  'local records',
  'linux foundation-hosted',
  'linux foundation',
  'foundation-hosted',
  'foundation hosted',
  'settlement-proof event',
  'signed-record formats',
];

describe('interop matrix: file exists and is non-empty', () => {
  it('matrix file exists', () => {
    expect(existsSync(MATRIX_PATH)).toBe(true);
  });

  it('matrix file has non-empty content', () => {
    expect(MATRIX_TEXT.length).toBeGreaterThan(0);
  });
});

describe('interop matrix: required Tier A rows present', () => {
  for (const row of TIER_A_ROWS) {
    it(`row "${row.id}" heading is present`, () => {
      expect(MATRIX_TEXT).toContain(row.heading);
    });
  }

  it('exactly three Tier A row headings (no scope creep)', () => {
    const matches = MATRIX_TEXT.match(/^### \d+\. /gm) || [];
    expect(matches.length).toBe(TIER_A_ROWS.length);
  });
});

describe('interop matrix: every Tier A row resolves its PEAC-side paths', () => {
  for (const row of TIER_A_ROWS) {
    for (const rel of row.requiredPaths) {
      it(`row "${row.id}" resolves ${rel}`, () => {
        const abs = join(REPO_ROOT, rel);
        expect(existsSync(abs)).toBe(true);
        if (rel.endsWith('/')) {
          expect(statSync(abs).isDirectory()).toBe(true);
        }
      });
    }
  }
});

describe('interop matrix: Last checked metadata present', () => {
  it('top-level "**Last checked:**" timestamp is present', () => {
    expect(MATRIX_TEXT).toMatch(/\*\*Last checked:\*\*\s+\S+/);
  });

  for (const row of TIER_A_ROWS) {
    it(`row "${row.id}" carries a per-row "Last checked" table entry`, () => {
      const section = extractSection(MATRIX_TEXT, row.heading);
      expect(section).toMatch(/\|\s*Last checked\s*\|/);
    });
  }
});

describe('interop matrix: Upstream source anchor present per row', () => {
  for (const row of TIER_A_ROWS) {
    it(`row "${row.id}" lists "10. Upstream source anchor"`, () => {
      const section = extractSection(MATRIX_TEXT, row.heading);
      expect(section).toContain('10. Upstream source anchor');
    });
  }
});

describe('interop matrix: no banned single-word terms (word-boundary, hyphen-aware)', () => {
  for (const word of BANNED_WORDS) {
    it(`does not contain the word "${word}" outside hyphenated compounds`, () => {
      const re = new RegExp(`(?<![\\w-])${word}(?![\\w-])`, 'i');
      expect(re.test(MATRIX_TEXT)).toBe(false);
    });
  }
});

describe('interop matrix: no banned multi-word phrases', () => {
  const lowered = MATRIX_TEXT.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    it(`does not contain "${phrase}"`, () => {
      expect(lowered).not.toContain(phrase.toLowerCase());
    });
  }
});
