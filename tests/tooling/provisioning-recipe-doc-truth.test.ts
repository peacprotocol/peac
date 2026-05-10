/**
 * Doc-truth gate for the verify-agent-provisioning SOLUTIONS recipe
 * and the agent-provisioning-demo README.
 *
 * Asserts both surfaces carry the boundary paragraph that pins PEAC's
 * observer-only role, do not regress to claims that PEAC provisions,
 * authorizes, processes payments, validates credentials, manages
 * credential vaults, or operates the runtime, do not assert that the
 * upstream system definitely did those things, and do not introduce
 * vendor-named paths or headings.
 *
 * Vendor names (Stripe Projects, Cloudflare) are explicitly allowed in
 * recipe prose as upstream and deployment context, per
 * `feedback_vendor_names_only_in_example_readme`. They must not appear
 * in headings, file-system paths inside code blocks, registered
 * extension keys, type URIs, or fixture-directory names.
 *
 * The literal stale-name strings are constructed at test time via
 * array `.join()` so the contiguous forms do not appear in this test
 * source. That keeps the file itself clean of stale public surface
 * vocabulary while still asserting the recipe is too.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const RECIPE = join(REPO_ROOT, 'docs/SOLUTIONS/verify-agent-provisioning.md');
const DEMO_README = join(REPO_ROOT, 'examples/agent-provisioning-demo/README.md');

const RECIPE_TEXT = readFileSync(RECIPE, 'utf8');
const DEMO_README_TEXT = readFileSync(DEMO_README, 'utf8');

const HEADING_LINES = RECIPE_TEXT.split('\n').filter((line) => line.startsWith('#'));
const CODE_BLOCK_LINES: string[] = [];
{
  let inFence = false;
  for (const line of RECIPE_TEXT.split('\n')) {
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      CODE_BLOCK_LINES.push(line);
    }
  }
}
const CODE_BLOCK_TEXT = CODE_BLOCK_LINES.join('\n');

// Stale public-surface paths and identifiers assembled at runtime so
// the literal contiguous forms never appear in this test source.
const RETIRED_DIR_NAME = ['stripe-projects', 'provisioning'].join('-');
const RETIRED_EXT_KEY_PREFIX = ['org.peacprotocol.', 'stripe-projects', '/'].join('');
const RETIRED_TYPE_NAMESPACE = ['org.peacprotocol.', 'stripe-projects', '/provisioning.init'].join(
  ''
);

describe('docs/SOLUTIONS/verify-agent-provisioning.md: boundary paragraph present', () => {
  it('asserts PEAC does not authorize the action', () => {
    expect(RECIPE_TEXT).toContain('PEAC does not authorize the action');
  });

  it('asserts PEAC does not validate credentials', () => {
    expect(RECIPE_TEXT).toContain('validate credentials');
  });

  it('asserts PEAC does not process payments', () => {
    expect(RECIPE_TEXT).toContain('process payments');
  });

  it('asserts PEAC does not manage credential vaults', () => {
    expect(RECIPE_TEXT).toContain('manage credential vaults');
  });

  it('asserts PEAC does not operate the runtime', () => {
    expect(RECIPE_TEXT).toContain('operate the runtime');
  });

  it('asserts the *-observed observer-scope framing', () => {
    expect(RECIPE_TEXT).toContain('*-observed');
    expect(RECIPE_TEXT).toContain('observer scope');
  });
});

describe('docs/SOLUTIONS/verify-agent-provisioning.md: vendor names absent from headings', () => {
  it('no heading contains "Stripe"', () => {
    for (const heading of HEADING_LINES) {
      expect(heading.toLowerCase()).not.toContain('stripe');
    }
  });

  it('no heading contains "Cloudflare"', () => {
    for (const heading of HEADING_LINES) {
      expect(heading.toLowerCase()).not.toContain('cloudflare');
    }
  });

  it('no heading contains "Neon" or "PostHog"', () => {
    for (const heading of HEADING_LINES) {
      const lower = heading.toLowerCase();
      expect(lower).not.toContain('neon');
      expect(lower).not.toContain('posthog');
    }
  });
});

describe('docs/SOLUTIONS/verify-agent-provisioning.md: vendor-named paths absent from code blocks', () => {
  it('no code-block path references the retired vendor-named example directory', () => {
    expect(CODE_BLOCK_TEXT).not.toContain(RETIRED_DIR_NAME);
  });

  it('no code-block reference uses the retired vendor-prefixed extension namespace', () => {
    expect(CODE_BLOCK_TEXT).not.toContain(RETIRED_EXT_KEY_PREFIX);
  });

  it('no code-block reference uses the retired vendor-prefixed type URI namespace', () => {
    expect(CODE_BLOCK_TEXT).not.toContain(RETIRED_TYPE_NAMESPACE);
  });

  it('only the canonical extension namespace appears in code blocks', () => {
    expect(CODE_BLOCK_TEXT).toContain('org.peacprotocol/provisioning-lifecycle');
  });
});

describe('docs/SOLUTIONS/verify-agent-provisioning.md: PEAC scope claims are observer-only', () => {
  const FORBIDDEN_CLAIMS = [
    'PEAC provisions',
    'PEAC authorizes',
    'PEAC processes payments',
    'PEAC validates credentials',
    'PEAC manages credential vaults',
    'PEAC manages vaults',
    'PEAC operates the runtime',
  ];
  for (const claim of FORBIDDEN_CLAIMS) {
    it(`does not assert "${claim}"`, () => {
      expect(RECIPE_TEXT).not.toContain(claim);
    });
  }
});

describe('docs/SOLUTIONS/verify-agent-provisioning.md: upstream behavior is not overclaimed', () => {
  /** Phrases that overclaim what the upstream system did. PEAC records
   * what an issuer reports observing; it must not say the upstream
   * authorized / validated / managed unless the record specifically
   * proves those facts, which a reported observation does not. */
  const FORBIDDEN_OVERCLAIMS = [
    'tool still authorizes, validates, and operates',
    'The upstream system authorized the action',
    'upstream system authorized, validated, processed',
  ];
  for (const claim of FORBIDDEN_OVERCLAIMS) {
    it(`does not assert "${claim}"`, () => {
      expect(RECIPE_TEXT).not.toContain(claim);
    });
  }

  it('uses the responsibility-boundary framing instead', () => {
    expect(RECIPE_TEXT).toContain('remain upstream responsibilities');
  });
});

describe('docs/SOLUTIONS/verify-agent-provisioning.md: sample iat is past-dated', () => {
  /** A future-dated iat in the sample decoded JWS payload would
   * confuse readers and weaken example credibility. The pinned past
   * timestamp matches the sample observed_at = 2026-05-01T10:20:00Z. */
  const FUTURE_DATED_IAT = '"iat": 1781700000';
  const PINNED_PAST_IAT = '"iat": 1777630800';

  it('does not contain the previous future-dated iat', () => {
    expect(RECIPE_TEXT).not.toContain(FUTURE_DATED_IAT);
  });

  it('contains the pinned past-dated iat', () => {
    expect(RECIPE_TEXT).toContain(PINNED_PAST_IAT);
  });
});

describe('examples/agent-provisioning-demo/README.md: upstream behavior is not overclaimed', () => {
  /** The earlier draft said "The upstream CLI authorized the action,
   * validated credentials, and managed the secret material" which
   * overclaims what a reported observation proves. The shipped wording
   * must put those responsibilities upstream rather than asserting
   * the upstream did them. */
  const FORBIDDEN_OVERCLAIMS = [
    'The upstream CLI authorized the action',
    'authorized the action, validated credentials, and managed the secret',
    'managed the secret material',
  ];
  for (const claim of FORBIDDEN_OVERCLAIMS) {
    it(`does not assert "${claim}"`, () => {
      expect(DEMO_README_TEXT).not.toContain(claim);
    });
  }

  it('uses the responsibilities-remain-upstream framing', () => {
    expect(DEMO_README_TEXT).toContain(
      'remain responsibilities of the upstream systems and their operators'
    );
  });

  it('asserts the *-observed observer-scope framing', () => {
    expect(DEMO_README_TEXT).toContain('*-observed');
    expect(DEMO_README_TEXT).toContain('observer scope');
  });
});
