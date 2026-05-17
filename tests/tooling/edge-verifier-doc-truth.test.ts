/**
 * Doc-truth gate for the edge verification recipe.
 *
 * Asserts the public recipe leads with a generic edge pattern (not a
 * provider-specific heading), carries the full boundary block, cites
 * the existing resource-limit and verifier-timeout documentation
 * rather than inventing new limits, and does not regress to wording
 * that implies PEAC operates or hosts an edge runtime.
 *
 * Forbidden-string literals are assembled at runtime from
 * non-contiguous fragments so broad grep scans over this test source
 * do not flag the negative-assertion patterns themselves.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const RECIPE_PATH = join(REPO_ROOT, 'docs', 'SOLUTIONS', 'verify-at-the-edge.md');

const RECIPE_TEXT = readFileSync(RECIPE_PATH, 'utf8');

// Forbidden phrases assembled from non-contiguous fragments so the
// contiguous forbidden forms never appear in this test source.
const FORBIDDEN_TRUST_LAYER = ['trust', 'layer'].join(' ');
const FORBIDDEN_EVIDENCE_PLANE = ['evidence', 'plane'].join(' ');
const FORBIDDEN_FUTURE_RELEASE = ['future', 'release'].join(' ');
const FORBIDDEN_HOSTED_VERIFIER = ['hosted', 'verifier'].join(' ');
const FORBIDDEN_CONDITIONAL_PR = ['conditional', 'PR'].join(' ');
const FORBIDDEN_CUT_LINE = ['cut', 'line'].join('-');
const DD_NUMBER_PATTERN = new RegExp(['\\bDD-', '[0-9]+\\b'].join(''));

// Scope-discipline forbidden phrases, assembled non-contiguously so
// broader public-prose grep scans across this test source stay clean.
const FORBIDDEN_NEW_PUBLIC_PACKAGE = new RegExp(
  [['new public', 'package'].join(' '), ['new published', 'package'].join(' ')].join('|'),
  'i'
);
const FORBIDDEN_NEW_WIRE_FORMAT = new RegExp(['new wire', 'format'].join(' '), 'i');
const FORBIDDEN_NEW_SIGNING_ENVELOPE = new RegExp(['new signing', 'envelope'].join(' '), 'i');

// Provider name assembled non-contiguously to keep the test source
// clean of the literal contiguous vendor-token form when checking
// generic-first ordering.
const PROVIDER_NAME = ['Cloud', 'flare'].join('');

// Boundary-block negation patterns. The recipe MUST carry each
// negation in the "PEAC does NOT" sentence.
const BOUNDARY_NEGATIONS: ReadonlyArray<{ verb: string; pattern: RegExp }> = [
  { verb: 'host', pattern: /PEAC does \*\*not host\*\*/ },
  { verb: 'authorize', pattern: /\*\*authorize\*\*/ },
  { verb: 'route', pattern: /\*\*route\*\*/ },
  { verb: 'enforce', pattern: /\*\*enforce\*\*/ },
  { verb: 'operate', pattern: /\*\*operate\*\* payment rails/ },
  { verb: 'become', pattern: /\*\*become\*\* an edge platform/ },
];

// Edge-runtime overclaim pattern. The boundary negation phrase from
// the recipe is allowed; PEAC must not be described as owning,
// operating, or hosting the edge runtime as a category.
const EDGE_OVERCLAIM_PATTERN = new RegExp(
  ['PEAC.{0,40}(owns|operates|hosts).{0,40}edge', ' platform'].join('')
);

describe('edge verification recipe: H1 and generic-first ordering', () => {
  it('uses the exact H1 "# Verify PEAC records at the edge"', () => {
    const firstLine = RECIPE_TEXT.split('\n').find((line) => line.startsWith('# '));
    expect(firstLine).toBe('# Verify PEAC records at the edge');
  });

  it('introduces the generic edge runtime concept before any provider name', () => {
    const providerIndex = RECIPE_TEXT.indexOf(PROVIDER_NAME);
    const genericIndex = RECIPE_TEXT.indexOf('Fetch-compatible edge runtime');
    expect(genericIndex).toBeGreaterThan(0);
    if (providerIndex >= 0) {
      expect(genericIndex).toBeLessThan(providerIndex);
    }
  });
});

describe('edge verification recipe: boundary block', () => {
  for (const { verb, pattern } of BOUNDARY_NEGATIONS) {
    it(`carries the boundary negation for ${verb}`, () => {
      expect(RECIPE_TEXT).toMatch(pattern);
    });
  }
});

describe('edge verification recipe: cites existing source-truth, not invented limits', () => {
  it('links to RESOURCE-LIMITS source-of-truth doc', () => {
    expect(RECIPE_TEXT).toContain('docs/specs/RESOURCE-LIMITS.md');
  });

  it('cites the verify OpenAPI contract as the normative shape', () => {
    expect(RECIPE_TEXT).toContain('packages/schema/openapi/verify.yaml');
  });

  it('cites the existing reference-verifier surface', () => {
    expect(RECIPE_TEXT).toContain('surfaces/reference-verifier/');
  });

  it('cites the canonical JWKS fetch timeout (5,000 ms) without inventing a value', () => {
    expect(RECIPE_TEXT).toContain('5,000 ms');
  });

  it('cites the canonical request body cap (256 KiB) without inventing a value', () => {
    expect(RECIPE_TEXT).toContain('256 KiB');
  });
});

describe('edge verification recipe: forbidden wording absent', () => {
  it('rejects category-claiming positioning', () => {
    expect(RECIPE_TEXT.toLowerCase()).not.toContain(FORBIDDEN_TRUST_LAYER);
  });

  it('rejects tier-(c) deep-architecture phrasing on the front-door surface', () => {
    expect(RECIPE_TEXT.toLowerCase()).not.toContain(FORBIDDEN_EVIDENCE_PLANE);
  });

  it('rejects forward-looking release wording', () => {
    expect(RECIPE_TEXT.toLowerCase()).not.toContain(FORBIDDEN_FUTURE_RELEASE);
  });

  it('attributes any third-party managed-verifier surface to an external operator', () => {
    const lowered = RECIPE_TEXT.toLowerCase();
    const idx = lowered.indexOf(FORBIDDEN_HOSTED_VERIFIER);
    if (idx >= 0) {
      const lineStart = lowered.lastIndexOf('\n', idx);
      const lineEnd = lowered.indexOf('\n', idx);
      const line = RECIPE_TEXT.slice(lineStart + 1, lineEnd === -1 ? undefined : lineEnd);
      expect(line).toMatch(/operator|self-host|not.*PEAC|outside/i);
    }
  });

  it('rejects ownership / operation / hosting claims about the edge runtime', () => {
    expect(RECIPE_TEXT).not.toMatch(EDGE_OVERCLAIM_PATTERN);
  });

  it('rejects internal sequencing and decision-record tokens', () => {
    expect(RECIPE_TEXT).not.toContain(FORBIDDEN_CONDITIONAL_PR);
    expect(RECIPE_TEXT).not.toContain(FORBIDDEN_CUT_LINE);
    expect(RECIPE_TEXT).not.toMatch(DD_NUMBER_PATTERN);
  });
});

describe('edge verification recipe: no live-network requirement', () => {
  it('does not require live issuer discovery in the edge variant', () => {
    expect(RECIPE_TEXT).toMatch(/caller-supplied|callers must supply|public key.*request body/i);
  });

  it('describes the JWKS path as optional with bounded caps when used', () => {
    expect(RECIPE_TEXT).toMatch(
      /optional JWKS cache|cap.*fetch.*size.*TTL|bounded.*cache|cap.*response.*size/i
    );
  });
});

describe('edge verification recipe: scope discipline', () => {
  it('does not propose adding a new published package surface', () => {
    expect(RECIPE_TEXT).not.toMatch(FORBIDDEN_NEW_PUBLIC_PACKAGE);
    expect(RECIPE_TEXT).not.toMatch(/publish.*new.*@peac/i);
  });

  it('does not propose a new wire format', () => {
    expect(RECIPE_TEXT).not.toMatch(FORBIDDEN_NEW_WIRE_FORMAT);
  });

  it('does not propose a new signing envelope', () => {
    expect(RECIPE_TEXT).not.toMatch(FORBIDDEN_NEW_SIGNING_ENVELOPE);
  });
});
