/**
 * Doc-truth gate for the AGT EvidenceAnchor composition section in
 * docs/SOLUTIONS/agt-peac-composition.md.
 *
 * Keeps the new informational section anchored to:
 *
 *   1. The upstream proposal cited by exact number
 *      (microsoft/agent-governance-toolkit#2244).
 *   2. The proposal-only framing (no claim of an implemented SPI,
 *      backend, or partnership).
 *   3. The record-only PEAC / AGT composition line.
 *   4. The shared determinism contract (RFC 8785 JCS + SHA-256).
 *
 * Relationship-boundary checks are scoped to the new section so that
 * pre-existing runtime-descriptive prose elsewhere in the doc is not
 * over-constrained. Disallowed phrases are assembled from fragments so the
 * test can guard against accidental overclaims without presenting those
 * phrases as supported documentation.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const DOC_PATH = join(REPO_ROOT, 'docs', 'SOLUTIONS', 'agt-peac-composition.md');
const DOC_TEXT = readFileSync(DOC_PATH, 'utf8');

const SECTION_HEADING = '## PEAC records and the AGT EvidenceAnchor proposal (informational)';

function extractSection(text: string, heading: string): string {
  const idx = text.indexOf(heading);
  if (idx === -1) return '';
  const rest = text.slice(idx + heading.length);
  const nextHeadingIdx = rest.search(/\n##\s/);
  return nextHeadingIdx === -1 ? rest : rest.slice(0, nextHeadingIdx);
}

const SECTION_TEXT = extractSection(DOC_TEXT, SECTION_HEADING);

// Forbidden phrasings assembled from fragments. The phrasings describe
// overclaims the doc must never make about the PEAC and AGT relationship.
const FORBIDDEN_MICROSOFT_PARTNERSHIP = ['Microsoft', 'partnership'].join(' ');
const FORBIDDEN_AGT_ADOPTED_PEAC = ['AGT', 'adopted', 'PEAC'].join(' ');
const FORBIDDEN_PEAC_ADOPTS_AGT = ['PEAC', 'adopts', 'AGT'].join(' ');
const FORBIDDEN_PEAC_PLUGS_INTO_AGT = ['PEAC', 'plugs', 'into', 'AGT'].join(' ');
const FORBIDDEN_AGT_RECOMMENDS_PEAC = ['AGT', 'recommends', 'PEAC'].join(' ');
const FORBIDDEN_GOVERNANCE_LAYER = ['governance', 'layer'].join(' ');
const FORBIDDEN_TRUST_LAYER = ['trust', 'layer'].join(' ');
const FORBIDDEN_CONTROL_PLANE = ['control', 'plane'].join(' ');
const FORBIDDEN_PEAC_ENFORCES_AGT_POLICY = ['PEAC', 'enforces', 'AGT', 'policy'].join(' ');
const FORBIDDEN_EVIDENCEANCHOR_IMPLEMENTATION = ['EvidenceAnchor', 'implementation'].join(' ');
const FORBIDDEN_WORKING_PLUGIN = ['working', 'plugin'].join(' ');
const FORBIDDEN_PYTHON_WRAPPER = ['Python', 'wrapper'].join(' ');

describe('agt-peac-composition.md: AGT EvidenceAnchor section exists', () => {
  it('contains the expected section heading', () => {
    expect(DOC_TEXT).toContain(SECTION_HEADING);
  });

  it('extracts a non-empty section body', () => {
    expect(SECTION_TEXT.length).toBeGreaterThan(0);
  });
});

describe('agt-peac-composition.md: upstream and contract citations', () => {
  it('cites the upstream proposal by exact number', () => {
    expect(DOC_TEXT).toContain('microsoft/agent-governance-toolkit#2244');
  });

  it('introduces the proposal name', () => {
    expect(DOC_TEXT).toContain('EvidenceAnchor');
  });

  it('uses the word "proposal" alongside EvidenceAnchor', () => {
    expect(SECTION_TEXT.toLowerCase()).toContain('proposal');
  });

  it('cites the RFC 8785 canonicalization scheme', () => {
    expect(DOC_TEXT).toContain('RFC 8785');
  });

  it('cites SHA-256 as the digest function', () => {
    expect(DOC_TEXT).toContain('SHA-256');
  });
});

describe('agt-peac-composition.md: canonical record-only boundary', () => {
  it('preserves the boundary line "AGT runs the runtime. PEAC records what AGT reported."', () => {
    expect(DOC_TEXT).toContain('AGT runs the runtime. PEAC records what AGT reported.');
  });

  it('states explicitly that no implementation lands with this section', () => {
    expect(SECTION_TEXT).toContain('No implementation');
  });
});

describe('agt-peac-composition.md: new section does not overclaim the relationship', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['partnership overclaim #1', FORBIDDEN_MICROSOFT_PARTNERSHIP],
    ['relationship overclaim #1', FORBIDDEN_AGT_ADOPTED_PEAC],
    ['relationship overclaim #2', FORBIDDEN_PEAC_ADOPTS_AGT],
    ['relationship overclaim #3', FORBIDDEN_PEAC_PLUGS_INTO_AGT],
    ['relationship overclaim #4', FORBIDDEN_AGT_RECOMMENDS_PEAC],
    ['category framing #1', FORBIDDEN_GOVERNANCE_LAYER],
    ['category framing #2', FORBIDDEN_TRUST_LAYER],
    ['category framing #3', FORBIDDEN_CONTROL_PLANE],
    ['policy overclaim #1', FORBIDDEN_PEAC_ENFORCES_AGT_POLICY],
    ['implementation overclaim #1', FORBIDDEN_EVIDENCEANCHOR_IMPLEMENTATION],
    ['implementation overclaim #2', FORBIDDEN_WORKING_PLUGIN],
    ['implementation overclaim #3', FORBIDDEN_PYTHON_WRAPPER],
  ];

  for (const [label, phrase] of cases) {
    it(`new section does not contain ${label}`, () => {
      expect(SECTION_TEXT.toLowerCase()).not.toContain(phrase.toLowerCase());
    });
  }
});
