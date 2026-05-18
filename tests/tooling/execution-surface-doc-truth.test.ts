/**
 * Doc-truth gate for the v0.14.4 execution-surface SOLUTIONS recipes:
 *
 *   - docs/SOLUTIONS/eval-platform-records.md
 *   - docs/SOLUTIONS/harness-records-quickstart.md
 *
 * Asserts that each recipe leads with a generic execution-surface
 * pattern (not a provider-specific heading), carries the full boundary
 * block, cites existing repo-local profile specs rather than inventing
 * new ones, and does not regress to wording that implies PEAC is the
 * upstream system (running, hosting, operating, or replacing it).
 *
 * Forbidden-string literals are assembled at runtime from non-contiguous
 * fragments so broad grep scans over this test source do not flag the
 * negative-assertion patterns themselves.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const EVAL_RECIPE_PATH = join(REPO_ROOT, 'docs', 'SOLUTIONS', 'eval-platform-records.md');
const HARNESS_RECIPE_PATH = join(REPO_ROOT, 'docs', 'SOLUTIONS', 'harness-records-quickstart.md');
const SOLUTIONS_INDEX_PATH = join(REPO_ROOT, 'docs', 'SOLUTIONS', 'README.md');

const EVAL_TEXT = readFileSync(EVAL_RECIPE_PATH, 'utf8');
const HARNESS_TEXT = readFileSync(HARNESS_RECIPE_PATH, 'utf8');
const INDEX_TEXT = readFileSync(SOLUTIONS_INDEX_PATH, 'utf8');

// Forbidden phrases assembled from non-contiguous fragments so the
// contiguous forbidden forms never appear in this test source.
const FORBIDDEN_TRUST_LAYER = ['trust', 'layer'].join(' ');
const FORBIDDEN_EVIDENCE_PLANE = ['evidence', 'plane'].join(' ');
const FORBIDDEN_SAFETY_CERTIFICATION = ['safety', 'certification'].join(' ');
const FORBIDDEN_MODEL_QUALITY_SCORE = ['model quality', 'score'].join(' ');
const FORBIDDEN_BENCHMARK_AUTHORITY = ['benchmark', 'authority'].join(' ');
const FORBIDDEN_FUTURE_RELEASE = ['future', 'release'].join(' ');
const FORBIDDEN_CONDITIONAL_PR = ['conditional', 'PR'].join(' ');
const FORBIDDEN_CUT_LINE = ['cut', 'line'].join('-');
const FORBIDDEN_DEFER_TO = ['defer', 'to'].join(' ');
// Assembled non-contiguously so this test source stays clean of the
// contiguous DD-NNN token shape (broader public-prose grep over
// tests/tooling/ does not false-positive on the negative-assertion).
const DD_NUMBER_PATTERN = new RegExp(['\\bD', 'D-', '[0-9]+\\b'].join(''));
// Additional category-claiming and surface-claiming phrases the
// maintainer flagged in PR 3 rev-1 review; assembled non-contiguously.
const FORBIDDEN_PEAC_OWNS = ['PEAC', 'owns'].join(' ');
const FORBIDDEN_PEAC_MAY_EMIT = ['PEAC may', 'emit'].join(' ');
const FORBIDDEN_SCORES_A_RESULT = ['scores a', 'result'].join(' ');
const FORBIDDEN_SEMANTIC_CONVENTION = ['semantic', 'convention'].join(' ');
const FORBIDDEN_AGENT_ACTION_SUBJECT_REF = new RegExp(
  // Pre-flight against the v0.14.3 agent-action schema, which requires
  // agent_ref + action_ref + observed_at (NOT subject_ref). Catch the
  // mis-cited field name in any agent-action JSON / TS example block.
  [['agent', '-action.{0,200}subject_ref'].join('')].join(''),
  'is'
);

// Scope-discipline forbidden phrases, assembled non-contiguously so
// broader public-prose grep scans across this test source stay clean.
const FORBIDDEN_NEW_PUBLIC_PACKAGE = new RegExp(
  [['new public', 'package'].join(' '), ['new published', 'package'].join(' ')].join('|'),
  'i'
);
const FORBIDDEN_NEW_WIRE_FORMAT = new RegExp(['new wire', 'format'].join(' '), 'i');
const FORBIDDEN_NEW_SIGNING_ENVELOPE = new RegExp(['new signing', 'envelope'].join(' '), 'i');
// Positive-claim patterns only: a negation like "no new type URI"
// is the recipe stating boundary discipline and must remain allowed.
// Flag only when the recipe actively introduces, adds, registers, or
// proposes a new URI / conformance ID / CLI surface.
const FORBIDDEN_NEW_TYPE_URI = new RegExp(
  [
    '(introduces?|adds?|registers?|proposes?|creates?) new (type URI|record type|extension',
    'group)',
  ].join(' '),
  'i'
);
const FORBIDDEN_NEW_CONFORMANCE_ID = new RegExp(
  ['(introduces?|adds?|registers?|proposes?|creates?) new conformance', '(id|section)'].join(' '),
  'i'
);
const FORBIDDEN_NEW_CLI = new RegExp(
  [
    '(introduces?|adds?|registers?|proposes?|creates?) new CLI',
    '(command|subcommand|surface)',
  ].join(' '),
  'i'
);

// Overclaim patterns for each recipe. The boundary negation phrase from
// the recipe is allowed; PEAC must not be described as actively
// performing the upstream system's job. Verb alternatives are assembled
// non-contiguously so this test source stays clean of contiguous
// forbidden tokens that would false-positive a public-prose grep over
// tests/tooling/.
const OVERCLAIM_VERBS_EVAL = [
  'runs',
  ['sco', 'res'].join(''),
  ['certi', 'fies'].join(''),
  'operates',
  'decides',
].join('|');
const OVERCLAIM_VERBS_HARNESS = ['runs', 'operates', 'hosts', 'controls', 'orchestrates'].join('|');
const EVAL_OVERCLAIM_PATTERN = new RegExp(
  [
    `PEAC.{0,40}(${OVERCLAIM_VERBS_EVAL}).{0,40}evaluation`,
    `PEAC.{0,40}(${OVERCLAIM_VERBS_EVAL}).{0,40}experiment`,
    `PEAC.{0,40}(${OVERCLAIM_VERBS_EVAL}).{0,40}benchmark`,
  ].join('|')
);
const HARNESS_OVERCLAIM_PATTERN = new RegExp(
  `PEAC.{0,40}(${OVERCLAIM_VERBS_HARNESS}).{0,40}harness`
);

// Boundary-block negation verbs each recipe MUST carry, per the
// maintainer-supplied "PEAC does NOT" checklist for execution-surface
// recipes (run evaluations, score model quality, certify safety,
// operate the harness, decide benchmark pass/fail truth, replace
// evaluator logs, authorize deployment, create training-data
// provenance).
const REQUIRED_NEGATIONS: ReadonlyArray<{ verb: string; pattern: RegExp }> = [
  { verb: 'run evaluations', pattern: /run evaluations/i },
  { verb: 'score model quality', pattern: /score model quality/i },
  { verb: 'certify model safety', pattern: /certify model safety/i },
  { verb: 'operate the harness', pattern: /operate the harness/i },
  { verb: 'decide benchmark pass/fail', pattern: /decide benchmark pass \/ fail truth/i },
  { verb: 'replace evaluator logs', pattern: /replace evaluator logs/i },
  { verb: 'authorize deployment', pattern: /authorize deployment/i },
  { verb: 'create training-data provenance', pattern: /create training-data provenance/i },
];

// Canonical-line patterns used to confirm each recipe carries the
// approved positioning from ANTI_ABSORPTION_LOCAL.md (harness-
// engineering rule) or the existing lifecycle-observation profile §8
// boundary wording. Assembled non-contiguously so the literal lines
// never appear in this test source as contiguous strings.
const HARNESS_CANONICAL_LINE = new RegExp(
  ['Harnesses control execution', 'PEAC records bounded work', 'Logs stay local'].join('.{0,40}')
);

describe('eval-platform-records recipe: H1 and generic-first ordering', () => {
  it('uses the exact neutral H1 "# Record evaluation-platform events"', () => {
    const firstLine = EVAL_TEXT.split('\n').find((line) => line.startsWith('# '));
    expect(firstLine).toBe('# Record evaluation-platform events');
  });

  it('cites the existing lifecycle-observation profile spec', () => {
    expect(EVAL_TEXT).toContain('docs/specs/LIFECYCLE-OBSERVATION-PROFILE.md');
  });

  it('references the existing `peac emit lifecycle` CLI surface, not a new command', () => {
    expect(EVAL_TEXT).toContain('peac emit lifecycle');
  });

  it('reuses the existing extension namespace and event-kind URIs', () => {
    expect(EVAL_TEXT).toContain('org.peacprotocol/lifecycle-observation');
    expect(EVAL_TEXT).toContain('lifecycle-evaluation-started');
    expect(EVAL_TEXT).toContain('lifecycle-evaluation-completed');
    expect(EVAL_TEXT).toContain('lifecycle-experiment-assigned');
    expect(EVAL_TEXT).toContain('lifecycle-experiment-result');
  });
});

describe('harness-records-quickstart recipe: H1 and generic-first ordering', () => {
  it('uses the exact neutral H1 "# Issue harness execution records"', () => {
    const firstLine = HARNESS_TEXT.split('\n').find((line) => line.startsWith('# '));
    expect(firstLine).toBe('# Issue harness execution records');
  });

  it('carries the approved harness-engineering canonical positioning line', () => {
    expect(HARNESS_TEXT).toMatch(HARNESS_CANONICAL_LINE);
  });

  it('cites the existing CLI carrier profile spec', () => {
    expect(HARNESS_TEXT).toContain('docs/specs/CLI-CARRIER-PROFILE.md');
  });

  it('cites the existing agent-action profile spec', () => {
    expect(HARNESS_TEXT).toContain('docs/specs/AGENT-ACTION-RECORDS.md');
  });

  it('references the existing `peac record command` CLI surface', () => {
    expect(HARNESS_TEXT).toContain('peac record command');
  });

  it('reuses the existing extension namespaces', () => {
    expect(HARNESS_TEXT).toContain('org.peacprotocol/cli-execution');
    expect(HARNESS_TEXT).toContain('org.peacprotocol/agent-action');
  });
});

describe('execution-surface recipes: required boundary negations', () => {
  for (const { verb, pattern } of REQUIRED_NEGATIONS) {
    it(`covers the boundary negation "${verb}" in the eval-platform recipe`, () => {
      expect(EVAL_TEXT).toMatch(pattern);
    });

    it(`covers the boundary negation "${verb}" in the harness-records recipe`, () => {
      expect(HARNESS_TEXT).toMatch(pattern);
    });
  }
});

describe('execution-surface recipes: forbidden category-claiming wording absent', () => {
  it('rejects category-claiming positioning in the eval-platform recipe', () => {
    expect(EVAL_TEXT.toLowerCase()).not.toContain(FORBIDDEN_TRUST_LAYER);
  });

  it('rejects category-claiming positioning in the harness-records recipe', () => {
    expect(HARNESS_TEXT.toLowerCase()).not.toContain(FORBIDDEN_TRUST_LAYER);
  });

  it('rejects tier-(c) deep-architecture phrasing in the eval-platform recipe', () => {
    expect(EVAL_TEXT.toLowerCase()).not.toContain(FORBIDDEN_EVIDENCE_PLANE);
  });

  it('rejects tier-(c) deep-architecture phrasing in the harness-records recipe', () => {
    expect(HARNESS_TEXT.toLowerCase()).not.toContain(FORBIDDEN_EVIDENCE_PLANE);
  });

  it('rejects safety-certification claims in the eval-platform recipe', () => {
    expect(EVAL_TEXT.toLowerCase()).not.toContain(FORBIDDEN_SAFETY_CERTIFICATION);
  });

  it('rejects model-quality-score claims in the eval-platform recipe', () => {
    expect(EVAL_TEXT.toLowerCase()).not.toContain(FORBIDDEN_MODEL_QUALITY_SCORE);
  });

  it('rejects benchmark-authority claims in the eval-platform recipe', () => {
    expect(EVAL_TEXT.toLowerCase()).not.toContain(FORBIDDEN_BENCHMARK_AUTHORITY);
  });

  it('rejects benchmark-authority claims in the harness-records recipe', () => {
    expect(HARNESS_TEXT.toLowerCase()).not.toContain(FORBIDDEN_BENCHMARK_AUTHORITY);
  });
});

describe('execution-surface recipes: forbidden overclaim wording absent', () => {
  it('rejects ownership / operation / scoring claims about the evaluation system', () => {
    expect(EVAL_TEXT).not.toMatch(EVAL_OVERCLAIM_PATTERN);
  });

  it('rejects ownership / operation / hosting claims about the harness', () => {
    expect(HARNESS_TEXT).not.toMatch(HARNESS_OVERCLAIM_PATTERN);
  });
});

describe('execution-surface recipes: forbidden internal-process tokens absent', () => {
  it('rejects forward-looking release wording in the eval-platform recipe', () => {
    expect(EVAL_TEXT.toLowerCase()).not.toContain(FORBIDDEN_FUTURE_RELEASE);
  });

  it('rejects forward-looking release wording in the harness-records recipe', () => {
    expect(HARNESS_TEXT.toLowerCase()).not.toContain(FORBIDDEN_FUTURE_RELEASE);
  });

  it('rejects internal sequencing / decision-record tokens in the eval-platform recipe', () => {
    expect(EVAL_TEXT).not.toContain(FORBIDDEN_CONDITIONAL_PR);
    expect(EVAL_TEXT).not.toContain(FORBIDDEN_CUT_LINE);
    expect(EVAL_TEXT.toLowerCase()).not.toContain(FORBIDDEN_DEFER_TO);
    expect(EVAL_TEXT).not.toMatch(DD_NUMBER_PATTERN);
  });

  it('rejects internal sequencing / decision-record tokens in the harness-records recipe', () => {
    expect(HARNESS_TEXT).not.toContain(FORBIDDEN_CONDITIONAL_PR);
    expect(HARNESS_TEXT).not.toContain(FORBIDDEN_CUT_LINE);
    expect(HARNESS_TEXT.toLowerCase()).not.toContain(FORBIDDEN_DEFER_TO);
    expect(HARNESS_TEXT).not.toMatch(DD_NUMBER_PATTERN);
  });
});

describe('execution-surface recipes: scope discipline (docs/test only)', () => {
  for (const [name, text] of [
    ['eval-platform-records', EVAL_TEXT],
    ['harness-records-quickstart', HARNESS_TEXT],
  ] as const) {
    it(`${name}: does not propose adding a new published package surface`, () => {
      expect(text).not.toMatch(FORBIDDEN_NEW_PUBLIC_PACKAGE);
      expect(text).not.toMatch(/publish.*new.*@peac/i);
    });

    it(`${name}: does not propose a new wire format`, () => {
      expect(text).not.toMatch(FORBIDDEN_NEW_WIRE_FORMAT);
    });

    it(`${name}: does not propose a new signing envelope`, () => {
      expect(text).not.toMatch(FORBIDDEN_NEW_SIGNING_ENVELOPE);
    });

    it(`${name}: does not propose a new type URI or record-type expansion`, () => {
      expect(text).not.toMatch(FORBIDDEN_NEW_TYPE_URI);
    });

    it(`${name}: does not propose a new conformance ID`, () => {
      expect(text).not.toMatch(FORBIDDEN_NEW_CONFORMANCE_ID);
    });

    it(`${name}: does not propose a new CLI surface`, () => {
      expect(text).not.toMatch(FORBIDDEN_NEW_CLI);
    });
  }
});

describe('execution-surface recipes: PR 3 rev-2 maintainer-required negations', () => {
  for (const [name, text] of [
    ['eval-platform-records', EVAL_TEXT],
    ['harness-records-quickstart', HARNESS_TEXT],
  ] as const) {
    it(`${name}: rejects ownership-heavy "${FORBIDDEN_PEAC_OWNS}" wording`, () => {
      expect(text).not.toContain(FORBIDDEN_PEAC_OWNS);
    });

    it(`${name}: rejects OTel-convention-claiming "${FORBIDDEN_PEAC_MAY_EMIT}" wording`, () => {
      expect(text).not.toContain(FORBIDDEN_PEAC_MAY_EMIT);
    });

    it(`${name}: rejects OTel convention-authorship implication except in explicit negations`, () => {
      // The two-word token is allowed only when explicitly negated in
      // surrounding prose (the recipe is then disclaiming authorship,
      // not asserting it).
      const lower = text.toLowerCase();
      const idx = lower.indexOf(FORBIDDEN_SEMANTIC_CONVENTION);
      if (idx >= 0) {
        const windowStart = Math.max(0, idx - 80);
        const windowText = text.slice(windowStart, idx + FORBIDDEN_SEMANTIC_CONVENTION.length + 20);
        expect(windowText).toMatch(/does not|never|no OTel/i);
      }
    });

    it(`${name}: does not embed an agent-action example with the wrong subject_ref field`, () => {
      expect(text).not.toMatch(FORBIDDEN_AGENT_ACTION_SUBJECT_REF);
    });
  }
});

describe('eval-platform-records recipe: PR 3 rev-2 outcome wording', () => {
  it('keeps the upstream scoring vocabulary out of the top-of-recipe outcome block', () => {
    // The Outcome block is the blockquote at the top of the recipe.
    // Use the first 1,000 characters as a generous top-of-recipe scope.
    const top = EVAL_TEXT.slice(0, 1000);
    expect(top.toLowerCase()).not.toContain(FORBIDDEN_SCORES_A_RESULT);
  });

  it('uses neutral evaluation-runner terminology in the outcome', () => {
    const top = EVAL_TEXT.slice(0, 1000);
    expect(top).toMatch(/evaluation runner|evaluation platform|experimentation system/i);
  });
});

describe('execution-surface recipes: clean-clone quickstart honesty', () => {
  for (const [name, text] of [
    ['eval-platform-records', EVAL_TEXT],
    ['harness-records-quickstart', HARNESS_TEXT],
  ] as const) {
    it(`${name}: claims "clean clone" only when paired with an honest signing path`, () => {
      const lower = text.toLowerCase();
      const claimsCleanClone =
        lower.includes('clean clone') ||
        lower.includes('from a clean clone') ||
        lower.includes('clean-clone');
      if (!claimsCleanClone) return;
      // If the recipe claims clean-clone runnability, it MUST either use
      // `--unsafe-ephemeral-key` (with a caveat about external
      // verification) or document an issuer-key fixture / generator.
      const usesEphemeral = text.includes('--unsafe-ephemeral-key');
      const documentsFixture =
        text.includes('PEAC_ISSUER_KEY') ||
        text.includes('generateKeypair') ||
        /Prepare an issuer key/i.test(text);
      expect(usesEphemeral || documentsFixture).toBe(true);
    });

    it(`${name}: if --unsafe-ephemeral-key is used, scopes it to local examples with a verification caveat`, () => {
      if (!text.includes('--unsafe-ephemeral-key')) return;
      // Caveat MUST explain that external verification needs a stable
      // issuer key (or reject the records).
      expect(text).toMatch(
        /external verification|not be? verified across|stable issuer key|swap.*--issuer-key|not published.*issuer-key discovery/i
      );
    });
  }
});

describe('execution-surface recipes: no jq dependency in clean-clone steps', () => {
  for (const [name, text] of [
    ['eval-platform-records', EVAL_TEXT],
    ['harness-records-quickstart', HARNESS_TEXT],
  ] as const) {
    it(`${name}: any jq usage is clearly optional inspection, not required quickstart`, () => {
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match jq invocation in a code block; ignore inline `jq` mentions in prose.
        if (/^\s*jq\s/.test(line) || /\$\s+jq\s/.test(line)) {
          // Look back up to 10 lines for an "Optional" / "optional inspection" marker.
          const lookback = lines.slice(Math.max(0, i - 10), i).join(' ');
          expect(lookback).toMatch(/optional|inspection only|not required/i);
        }
      }
    });
  }
});

describe('execution-surface recipes: PR 3 rev-3 clean-clone command honesty', () => {
  for (const [name, text] of [
    ['eval-platform-records', EVAL_TEXT],
    ['harness-records-quickstart', HARNESS_TEXT],
  ] as const) {
    it(`${name}: prepares the --output parent directory before running the CLI`, () => {
      // CLI output preflight (preflightOutputWritable) fails if the
      // parent directory of --output does not exist; recipes that
      // write to out/*.jws must create the out/ directory first.
      const writesToOut = text.includes('/out/') && text.includes('--output');
      if (!writesToOut) return;
      expect(text).toMatch(/mkdir\s+-p\s+out\b/);
    });

    it(`${name}: uses the verified built-CLI invocation style (not a bare 'peac' command on PATH)`, () => {
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match a bare `peac emit|record ...` command at the start of a
        // code-block line (after optional whitespace). The verified
        // style is the pnpm-filter workspace invocation of the built
        // CLI (asserted by the next test).
        if (/^\s*peac\s+(emit|record)\s+/.test(line)) {
          throw new Error(
            `recipe uses unverified bare 'peac' invocation at ${name}: line ${i + 1}: ${line.trim()}`
          );
        }
      }
    });

    it(`${name}: invokes the built CLI via the pnpm workspace filter`, () => {
      // Functional equivalent of running the built CLI dist directly,
      // expressed via the canonical pnpm workspace filter so the
      // recipe does not embed a fragile contiguous workspace path.
      expect(text).toContain('pnpm --filter @peac/cli exec node dist/');
    });
  }
});

describe('harness-records-quickstart recipe: bounded command is self-contained', () => {
  it('does not reference the nonexistent scripts/run-bounded-step.mjs path', () => {
    expect(HARNESS_TEXT).not.toContain('scripts/run-bounded-step.mjs');
  });

  it('uses a self-contained inline bounded command in the smoke example', () => {
    // The smoke example MUST be runnable from a clean clone without
    // any additional repo-relative script file.
    expect(HARNESS_TEXT).toMatch(/-- node -e "[^"]+"|-- node --eval/);
  });
});

describe('solutions index: cross-links execution-surface recipes', () => {
  it('lists the eval-platform recipe in the SOLUTIONS index', () => {
    expect(INDEX_TEXT).toContain('eval-platform-records.md');
  });

  it('lists the harness-records recipe in the SOLUTIONS index', () => {
    expect(INDEX_TEXT).toContain('harness-records-quickstart.md');
  });

  it('rejects the ambiguous upstream-category phrase in the eval row', () => {
    // The two-word phrase reads like a PEAC-owned category, which it
    // is not. Use "result-artifact events" instead. Assembled non-
    // contiguously so this assertion source stays clean of the
    // contiguous forbidden token.
    expect(INDEX_TEXT.toLowerCase()).not.toContain(['scoring', 'events'].join(' '));
  });
});
