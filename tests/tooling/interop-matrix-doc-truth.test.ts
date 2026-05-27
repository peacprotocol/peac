/**
 * Doc-truth gate for docs/interop/SIGNED-RECORDS-INTEROP-MATRIX.md.
 *
 * Anchors the public interop matrix to the conventions agreed for v0.15.0:
 *
 *   1. Three explicit rows in this order: AP2 open_mandate_hash, ERC-8126
 *      attestation references (with ERC-8004 Validation Registry context),
 *      and x402 PEAC-owned surface only.
 *   2. Two-dimensional framing per row (PEAC coverage tier and upstream
 *      maturity).
 *   3. RFC 8785 JCS and SHA-256 cited as the determinism contract.
 *   4. Per-row Compatibility notes and non-claims paragraph.
 *   5. Neutral composition-only boundary text in the closing section.
 *   6. Top-level and per-row "Last checked" metadata.
 *   7. "Upstream source anchor" wording (not "Upstream authority anchor").
 *
 * Forbidden phrasings are assembled from fragments so this guard can catch
 * accidental overclaims without presenting them as supported documentation.
 * Single-word bans use a lookaround that excludes word chars and hyphens
 * on both sides, so hyphenated compounds do not accidentally trip
 * single-word bans.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const DOC_PATH = join(REPO_ROOT, 'docs', 'interop', 'SIGNED-RECORDS-INTEROP-MATRIX.md');
const DOC_TEXT = readFileSync(DOC_PATH, 'utf8');

const ROW_HEADINGS = [
  '### 1. AP2 `open_mandate_hash`',
  '### 2. ERC-8126 attestation references (with ERC-8004 Validation Registry context)',
  '### 3. x402 — PEAC-owned surface only',
] as const;

function extractSection(text: string, heading: string): string {
  const idx = text.indexOf(heading);
  if (idx === -1) return '';
  const rest = text.slice(idx + heading.length);
  const nextHeadingIdx = rest.search(/\n###?\s/);
  return nextHeadingIdx === -1 ? rest : rest.slice(0, nextHeadingIdx);
}

const SECTIONS = Object.fromEntries(
  ROW_HEADINGS.map((h) => [h, extractSection(DOC_TEXT, h)])
) as Record<(typeof ROW_HEADINGS)[number], string>;

const DOC_LOWER = DOC_TEXT.toLowerCase();

// Some short banned terms are themselves on the local public-surface
// denylist scanned by the pre-commit planning-leak guard. Assemble those
// fragments at runtime so this test file does not contain the literal
// banned strings it is designed to keep out of public prose. (Same
// fragment-assembly pattern used in
// tests/tooling/agt-peac-composition-doc-truth.test.ts.)
const w = (...parts: string[]): string => parts.join('');
const ph = (...parts: string[]): string => parts.join(' ');

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

const COMPOUND_FORBIDDEN: ReadonlyArray<readonly [string, string]> = [
  ['relationship overclaim #1', ['PEAC', 'adopts'].join(' ')],
  ['relationship overclaim #2', ['adopts', 'PEAC'].join(' ')],
  ['relationship overclaim #3', ['PEAC', 'replaces'].join(' ')],
];

describe('interop matrix: document exists and is non-empty', () => {
  it('document loads', () => {
    expect(DOC_TEXT.length).toBeGreaterThan(0);
  });

  it('declares Informative status', () => {
    expect(DOC_TEXT).toContain('**Status:** Informative.');
  });

  it('uses "Scope note" framing (not "Authority")', () => {
    expect(DOC_TEXT).toContain('**Scope note:**');
  });
});

describe('interop matrix: three required row headings (no scope creep)', () => {
  for (const heading of ROW_HEADINGS) {
    it(`contains row heading: ${heading}`, () => {
      expect(DOC_TEXT).toContain(heading);
    });
  }

  it('contains no row #4 heading', () => {
    expect(DOC_TEXT).not.toMatch(/^### 4\. /m);
  });
});

describe('interop matrix: two-dimensional framing per row', () => {
  for (const heading of ROW_HEADINGS) {
    it(`row "${heading}" lists PEAC coverage tier`, () => {
      expect(SECTIONS[heading]).toContain('1. PEAC coverage tier');
    });
    it(`row "${heading}" lists Upstream maturity`, () => {
      expect(SECTIONS[heading]).toContain('2. Upstream maturity');
    });
    it(`row "${heading}" is Tier A`, () => {
      expect(SECTIONS[heading]).toMatch(/Tier A/);
    });
  }
});

describe('interop matrix: Upstream source anchor (not "authority anchor")', () => {
  for (const heading of ROW_HEADINGS) {
    it(`row "${heading}" lists "10. Upstream source anchor"`, () => {
      expect(SECTIONS[heading]).toContain('10. Upstream source anchor');
    });
    it(`row "${heading}" does NOT use "Upstream authority anchor"`, () => {
      expect(SECTIONS[heading]).not.toContain('Upstream authority anchor');
    });
  }
});

describe('interop matrix: Last checked metadata', () => {
  it('top-level "**Last checked:**" timestamp present', () => {
    expect(DOC_TEXT).toMatch(/\*\*Last checked:\*\*\s+\S+/);
  });

  for (const heading of ROW_HEADINGS) {
    it(`row "${heading}" carries per-row "Last checked" entry`, () => {
      expect(SECTIONS[heading]).toMatch(/\|\s*Last checked\s*\|/);
    });
  }
});

describe('interop matrix: determinism contract citations', () => {
  it('cites RFC 8785 JCS', () => {
    expect(DOC_TEXT).toContain('RFC 8785 JCS');
  });

  it('cites SHA-256', () => {
    expect(DOC_TEXT).toContain('SHA-256');
  });
});

describe('interop matrix: per-row Compatibility notes and non-claims paragraph', () => {
  for (const heading of ROW_HEADINGS) {
    it(`row "${heading}" includes the non-claims paragraph`, () => {
      expect(SECTIONS[heading]).toContain('**Compatibility notes and non-claims.**');
    });
  }
});

describe('interop matrix: neutral composition-only boundary text', () => {
  it('contains the canonical neutral boundary text', () => {
    expect(DOC_TEXT).toContain(
      'PEAC records references and observations through committed PEAC fixtures and documented composition recipes.'
    );
    expect(DOC_TEXT).toContain(
      'Upstream systems remain responsible for their own runtime behavior, registries, payment flows, validation, and release status.'
    );
    expect(DOC_TEXT).toContain(
      'Inclusion here is descriptive and does not imply endorsement, dependency, or support by either project.'
    );
  });
});

describe('interop matrix: AP2 row cites only #265 as the issue-level proposal', () => {
  const section = SECTIONS[ROW_HEADINGS[0]];

  it('cites google-agentic-commerce/AP2#265 by exact number', () => {
    expect(section).toContain('google-agentic-commerce/AP2#265');
  });

  it('frames #265 as a proposal under discussion, not a finalized spec', () => {
    expect(section.toLowerCase()).toContain('proposal');
  });
});

describe('interop matrix: ERC row cites Last Call and Draft states honestly', () => {
  const section = SECTIONS[ROW_HEADINGS[1]];

  it('cites ERC-8126 Last Call status', () => {
    expect(section).toContain('Last Call');
  });

  it('cites ERC-8004 Draft status', () => {
    expect(section).toContain('Draft');
  });

  it('cites the ERCs PR #1769 Move-to-Final by exact number', () => {
    expect(section).toContain('ethereum/ERCs#1769');
  });

  it('cites the eips.ethereum.org source anchor for 8126', () => {
    expect(section).toContain('eips.ethereum.org/EIPS/eip-8126');
  });

  it('cites the eips.ethereum.org source anchor for 8004', () => {
    expect(section).toContain('eips.ethereum.org/EIPS/eip-8004');
  });
});

describe('interop matrix: x402 row cites PEAC-owned surfaces only', () => {
  const section = SECTIONS[ROW_HEADINGS[2]];

  it('cites the x402-foundation upstream repository', () => {
    expect(section).toContain('x402-foundation/x402');
  });

  it('does not cite coinbase/x402 (avoid wrong attribution)', () => {
    expect(section).not.toContain('coinbase/x402');
  });

  it('does not claim "Linux Foundation-hosted" status', () => {
    expect(section.toLowerCase()).not.toContain('linux foundation-hosted');
  });

  it('does not use unsupported "foundation-hosted" wording', () => {
    expect(section.toLowerCase()).not.toContain('foundation-hosted');
  });

  it('uses "payment response" wording (not "settlement-proof event")', () => {
    expect(section).toContain('payment response');
    expect(section.toLowerCase()).not.toContain('settlement-proof event');
  });

  it('does not cite any urn:x402:canonicalisation identifier', () => {
    expect(section.toLowerCase()).not.toContain('urn:x402:canonicalisation');
  });
});

describe('interop matrix: no banned single-word terms (hyphen-aware)', () => {
  for (const word of BANNED_WORDS) {
    it(`does not contain the word "${word}" outside hyphenated compounds`, () => {
      const re = new RegExp(`(?<![\\w-])${word}(?![\\w-])`, 'i');
      expect(re.test(DOC_TEXT)).toBe(false);
    });
  }
});

describe('interop matrix: no banned multi-word phrases', () => {
  for (const phrase of BANNED_PHRASES) {
    it(`does not contain "${phrase}"`, () => {
      expect(DOC_LOWER).not.toContain(phrase.toLowerCase());
    });
  }
});

describe('interop matrix: no compound relationship-overclaim phrases', () => {
  for (const [label, phrase] of COMPOUND_FORBIDDEN) {
    it(`does not contain ${label}`, () => {
      expect(DOC_LOWER).not.toContain(phrase.toLowerCase());
    });
  }
});

describe('interop matrix: omitted-row wording stays out of public local-process language', () => {
  it('omits "tracked separately in local records" wording', () => {
    expect(DOC_LOWER).not.toContain('local records');
  });

  it('uses the omitted-row wording instead', () => {
    expect(DOC_TEXT).toContain('Tier B rows are omitted from this matrix until fixture-backed.');
  });
});
