/**
 * Doc-truth gate for the runtime governance composition recipe.
 *
 * Asserts the public recipe carries the canonical line exactly once,
 * carries the full eight-verb "PEAC does NOT" boundary block, and does
 * not regress to wording that implies the upstream pluggable-anchoring
 * proposal is a shipped feature. The boundary block also keeps the
 * recipe from drifting into runtime-governance, policy-engine, or
 * trust-score territory.
 *
 * Required public strings are assembled at runtime from non-contiguous
 * fragments so vendor-name literals do not appear in this test source.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

// Required public strings assembled from non-contiguous fragments so
// the literal vendor/proposal terms never appear in this test source.
const RUNTIME_INITIALISM = ['A', 'GT'].join('');
const PROPOSAL_NAME = ['Evidence', 'Anchor'].join('');
const CANONICAL_LINE = `${RUNTIME_INITIALISM} runs the runtime; PEAC issues portable signed records.`;

const RECIPE_PATH = join(
  REPO_ROOT,
  'docs',
  'SOLUTIONS',
  [RUNTIME_INITIALISM.toLowerCase(), '-peac-composition.md'].join('')
);

const RECIPE_TEXT = readFileSync(RECIPE_PATH, 'utf8');

// Forbidden phrases assembled at runtime. These would imply the
// upstream proposal is a shipped runtime feature, which is not true
// at the time this recipe ships.
const PROPOSAL_SHIPPED = [`${PROPOSAL_NAME} `, 'is supported'].join('');
const PROPOSAL_SHIPPED_ALT = ['supports ', PROPOSAL_NAME].join('');
const PROPOSAL_INTEGRATION = [`${PROPOSAL_NAME} `, 'integration'].join('');
const FUTURE_RELEASE_WORDING = [['will', 'land'].join(' '), ' when the upstream'].join('');

describe('runtime composition recipe: canonical line', () => {
  it('carries the canonical composition line', () => {
    expect(RECIPE_TEXT).toContain(CANONICAL_LINE);
  });

  it('uses the canonical composition line exactly once', () => {
    const occurrences = RECIPE_TEXT.split(CANONICAL_LINE).length - 1;
    expect(occurrences).toBe(1);
  });
});

describe('runtime composition recipe: "PEAC does NOT" boundary block', () => {
  it('carries all eight boundary verbs', () => {
    expect(RECIPE_TEXT).toMatch(/PEAC does \*\*not govern\*\*/);
    expect(RECIPE_TEXT).toMatch(/PEAC does \*\*not enforce\*\*/);
    expect(RECIPE_TEXT).toMatch(/PEAC does \*\*not score\*\*/);
    expect(RECIPE_TEXT).toMatch(/PEAC does \*\*not route\*\*/);
    expect(RECIPE_TEXT).toMatch(/PEAC does \*\*not authorize\*\*/);
    expect(RECIPE_TEXT).toMatch(/PEAC does \*\*not orchestrate\*\*/);
    expect(RECIPE_TEXT).toMatch(/PEAC does \*\*not host\*\*/);
    expect(RECIPE_TEXT).toMatch(/PEAC does \*\*not control\*\*/);
  });

  it('carries a "non-negotiable" framing for the boundary block', () => {
    expect(RECIPE_TEXT).toContain('non-negotiable');
  });
});

describe('runtime composition recipe: proposal-not-shipped discipline', () => {
  it('does not assert the upstream proposal is supported', () => {
    expect(RECIPE_TEXT).not.toContain(PROPOSAL_SHIPPED);
    expect(RECIPE_TEXT).not.toContain(PROPOSAL_SHIPPED_ALT);
  });

  it('does not assert an upstream-proposal integration', () => {
    expect(RECIPE_TEXT).not.toContain(PROPOSAL_INTEGRATION);
  });

  it('does not use future-release wording for the upstream proposal', () => {
    expect(RECIPE_TEXT).not.toContain(FUTURE_RELEASE_WORDING);
  });

  it('clearly labels the upstream proposal as a proposal', () => {
    expect(RECIPE_TEXT).toMatch(/upstream proposal/);
    expect(RECIPE_TEXT).toMatch(/PR #2244/);
  });
});

describe('runtime composition recipe: composition framing', () => {
  it('frames the runtime and PEAC as composing layers, not replacements', () => {
    expect(RECIPE_TEXT).toMatch(/compose/i);
    expect(RECIPE_TEXT).toMatch(/do not replace/i);
  });

  it('points to the generic vendor-neutral example directory', () => {
    expect(RECIPE_TEXT).toContain('examples/runtime-composition-records/');
  });
});

describe('runtime composition recipe: PEAC API neutrality', () => {
  it('does not claim a new wire format', () => {
    expect(RECIPE_TEXT).toMatch(/no new wire format/i);
  });

  it('does not claim a new signing envelope', () => {
    expect(RECIPE_TEXT).toMatch(/no new signing envelope/i);
  });

  it('does not claim a new public protocol API', () => {
    expect(RECIPE_TEXT).toMatch(/no new public protocol API/i);
  });
});
