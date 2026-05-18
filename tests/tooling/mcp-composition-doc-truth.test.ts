/**
 * Doc-truth gate for the v0.14.4 MCP composition guide.
 *
 * Asserts:
 *
 *   - docs/SOLUTIONS/mcp-composition.md exists with the canonical H1.
 *   - The four merged SEPs cited by the guide (2468, 2484, 2577, 2106)
 *     appear by exact number.
 *   - SEP-2202 is not described as merged or accepted (it was closed
 *     without merging).
 *   - The "PEAC does NOT" boundary block carries all eight required
 *     negation lines.
 *   - The guide does not regress to deep-architecture or
 *     control-surface category framings (assembled from non-contiguous
 *     fragments below) and does not imply PEAC orchestrates the
 *     upstream MCP runtime, enforces its auth policy, scores its
 *     servers, or hosts its registry.
 *   - docs/COMPATIBILITY_MATRIX.md references the new composition doc
 *     on the MCP row.
 *   - docs/SOLUTIONS/mcp-tool-call-receipts.md cross-links to the new
 *     composition doc.
 *
 * Forbidden-string literals are assembled at runtime from
 * non-contiguous fragments so broad public-prose grep scans over this
 * test source do not flag the negative-assertion patterns themselves.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const COMPOSITION_PATH = join(REPO_ROOT, 'docs', 'SOLUTIONS', 'mcp-composition.md');
const TOOL_CALL_RECIPE_PATH = join(REPO_ROOT, 'docs', 'SOLUTIONS', 'mcp-tool-call-receipts.md');
const COMPAT_MATRIX_PATH = join(REPO_ROOT, 'docs', 'COMPATIBILITY_MATRIX.md');

const COMPOSITION_TEXT = readFileSync(COMPOSITION_PATH, 'utf8');
const TOOL_CALL_RECIPE_TEXT = readFileSync(TOOL_CALL_RECIPE_PATH, 'utf8');
const COMPAT_MATRIX_TEXT = readFileSync(COMPAT_MATRIX_PATH, 'utf8');

// Forbidden phrases assembled from non-contiguous fragments so the
// contiguous forbidden forms never appear in this test source.
const FORBIDDEN_TRUST_LAYER = ['trust', 'layer'].join(' ');
const FORBIDDEN_GOVERNANCE_LAYER = ['governance', 'layer'].join(' ');
const FORBIDDEN_CONTROL_PLANE = ['control', 'plane'].join(' ');
const FORBIDDEN_ENFORCES_MCP_AUTH = ['enforces MCP', 'auth'].join(' ');
const FORBIDDEN_SCORES_MCP_SERVERS = ['scores MCP', 'servers'].join(' ');
const FORBIDDEN_HOSTS_MCP_REGISTRY = ['hosts an MCP', 'registry'].join(' ');
const FORBIDDEN_ORCHESTRATES = 'orchestrates';
const FORBIDDEN_FUTURE_RELEASE = ['future', 'release'].join(' ');
const FORBIDDEN_CONDITIONAL_PR = ['conditional', 'PR'].join(' ');
const FORBIDDEN_CUT_LINE = ['cut', 'line'].join('-');
// DD-NNN pattern assembled non-contiguously per v0.14.4 PR 3
// carry-forward learning #6.
const DD_NUMBER_PATTERN = new RegExp(['\\bD', 'D-', '[0-9]+\\b'].join(''));

describe('mcp-composition guide: file exists with canonical H1', () => {
  it('exists at docs/SOLUTIONS/mcp-composition.md', () => {
    expect(existsSync(COMPOSITION_PATH)).toBe(true);
  });

  it('uses the canonical H1 "MCP composition with PEAC records"', () => {
    const firstLine = COMPOSITION_TEXT.split('\n').find((line) => line.startsWith('# '));
    expect(firstLine).toBe('# MCP composition with PEAC records');
  });
});

describe('mcp-composition guide: SEP citations by exact number', () => {
  for (const sep of ['2468', '2484', '2577', '2106'] as const) {
    it(`cites merged SEP-${sep} by exact number`, () => {
      expect(COMPOSITION_TEXT).toContain(`SEP-${sep}`);
    });
  }

  it('does not describe SEP-2202 as merged or accepted', () => {
    // SEP-2202 was closed without merging. The guide should NOT cite
    // it as an accepted / merged feature. If it appears at all, it
    // must be in a "closed without merging" context.
    if (COMPOSITION_TEXT.includes('SEP-2202')) {
      const idx = COMPOSITION_TEXT.indexOf('SEP-2202');
      const window = COMPOSITION_TEXT.slice(Math.max(0, idx - 80), idx + 200);
      expect(window).toMatch(/closed without|not merged|not accepted|did not merge/i);
    }
    // Either way, SEP-2202 must not appear in a positive-merge context.
    expect(COMPOSITION_TEXT).not.toMatch(/SEP-2202 (is|was) merged/);
  });
});

describe('mcp-composition guide: boundary block', () => {
  const REQUIRED_BOUNDARIES: ReadonlyArray<string> = [
    'PEAC does not host an MCP registry.',
    'PEAC does not route MCP requests.',
    'PEAC does not implement MCP transport.',
    'PEAC does not evaluate MCP tool safety.',
    'PEAC does not score MCP servers.',
    'PEAC does not validate MCP server identity.',
    'PEAC does not enforce MCP auth policy.',
    'PEAC does not manage MCP server processes.',
  ];

  for (const line of REQUIRED_BOUNDARIES) {
    it(`carries the boundary line "${line}"`, () => {
      expect(COMPOSITION_TEXT).toContain(line);
    });
  }
});

describe('mcp-composition guide: forbidden category-claim wording absent', () => {
  it('rejects deep-architecture category framing #1', () => {
    expect(COMPOSITION_TEXT.toLowerCase()).not.toContain(FORBIDDEN_TRUST_LAYER);
  });

  it('rejects deep-architecture category framing #2', () => {
    expect(COMPOSITION_TEXT.toLowerCase()).not.toContain(FORBIDDEN_GOVERNANCE_LAYER);
  });

  it('rejects deep-architecture category framing #3', () => {
    expect(COMPOSITION_TEXT.toLowerCase()).not.toContain(FORBIDDEN_CONTROL_PLANE);
  });

  it('does not say "PEAC orchestrates"', () => {
    // PEAC is the records layer; the upstream MCP runtime is the
    // orchestrator. Reject any prose claiming PEAC orchestrates.
    expect(COMPOSITION_TEXT.toLowerCase()).not.toMatch(
      new RegExp(`peac ${FORBIDDEN_ORCHESTRATES}`)
    );
  });

  it('does not assert that PEAC enforces MCP auth in a positive claim', () => {
    // The boundary block "PEAC does not enforce MCP auth policy" is
    // allowed and required. No positive "PEAC enforces MCP auth"
    // claim may appear anywhere else.
    expect(COMPOSITION_TEXT).not.toMatch(/PEAC\s+enforces\s+MCP\s+auth/i);
    expect(COMPOSITION_TEXT.toLowerCase()).not.toContain(FORBIDDEN_ENFORCES_MCP_AUTH);
  });

  it('does not assert that PEAC scores MCP servers in a positive claim', () => {
    expect(COMPOSITION_TEXT).not.toMatch(/PEAC\s+scores\s+MCP\s+servers/i);
    expect(COMPOSITION_TEXT.toLowerCase()).not.toContain(FORBIDDEN_SCORES_MCP_SERVERS);
  });

  it('does not assert that PEAC hosts an MCP registry in a positive claim', () => {
    expect(COMPOSITION_TEXT).not.toMatch(/PEAC\s+hosts\s+an\s+MCP\s+registry/i);
    expect(COMPOSITION_TEXT.toLowerCase()).not.toContain(FORBIDDEN_HOSTS_MCP_REGISTRY);
  });
});

describe('mcp-composition guide: forbidden internal-process tokens', () => {
  it('rejects forward-looking release wording', () => {
    expect(COMPOSITION_TEXT.toLowerCase()).not.toContain(FORBIDDEN_FUTURE_RELEASE);
  });

  it('rejects internal sequencing / decision-record tokens', () => {
    expect(COMPOSITION_TEXT).not.toContain(FORBIDDEN_CONDITIONAL_PR);
    expect(COMPOSITION_TEXT).not.toContain(FORBIDDEN_CUT_LINE);
    expect(COMPOSITION_TEXT).not.toMatch(DD_NUMBER_PATTERN);
  });
});

describe('mcp-composition guide: scope discipline', () => {
  it('does not propose a new wire format', () => {
    expect(COMPOSITION_TEXT).not.toMatch(/new wire format/i);
  });

  it('does not propose a new signing envelope', () => {
    expect(COMPOSITION_TEXT).not.toMatch(/new signing envelope/i);
  });

  it('does not propose adding a new public package surface', () => {
    expect(COMPOSITION_TEXT).not.toMatch(/new public package/i);
    expect(COMPOSITION_TEXT).not.toMatch(/new published package/i);
  });

  it('does not propose an MCP SDK dependency upgrade', () => {
    expect(COMPOSITION_TEXT).not.toMatch(/upgrade.*@modelcontextprotocol\/sdk/i);
    expect(COMPOSITION_TEXT).not.toMatch(/MCP SDK upgrade/i);
  });
});

describe('compatibility matrix: cross-links the MCP composition guide', () => {
  it('cites docs/SOLUTIONS/mcp-composition.md from the MCP server row', () => {
    expect(COMPAT_MATRIX_TEXT).toContain('SOLUTIONS/mcp-composition.md');
  });
});

describe('mcp-tool-call recipe: cross-links the MCP composition guide', () => {
  it('cross-links mcp-composition.md from the existing recipe', () => {
    expect(TOOL_CALL_RECIPE_TEXT).toContain('mcp-composition.md');
  });
});
