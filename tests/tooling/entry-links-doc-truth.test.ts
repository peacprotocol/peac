/**
 * Entry-document link-truth test.
 *
 * Verifies that the relative Markdown links in the project's primary entry
 * documents resolve to real files in the repository, so the entry document set
 * cannot silently rot when files move or are renamed:
 *
 *   1. Generic: every relative file link in each covered entry document
 *      (README.md, docs/START_HERE.md, examples/README.md) resolves on disk.
 *   2. Targeted: the README "Choose your path" table targets resolve (locked
 *      independently so the highest-traffic table cannot rot even if the
 *      generic scan is later loosened).
 *   3. Reference verifier: the README links to surfaces/reference-verifier/ and
 *      that surface exists.
 *
 * This is a static, filesystem-only check: no spawn, no network, no new
 * dependency (node:fs + node:path only).
 *
 * Scope notes:
 *   - Anchor validation (#fragment targets within a file) is deliberately out
 *     of scope; only file existence is gated.
 *   - The link parser handles reference-style link definitions, repo-root
 *     relative links (/docs/...), and non-file URI schemes (mailto:, did:, and
 *     so on). The synthetic tests below lock that behavior because the current
 *     entry documents do not exercise all of those forms, so the parser stays
 *     correct as those documents evolve.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

// The primary entry documents whose relative links must resolve.
const REQUIRED_DOCS = [
  'README.md',
  'docs/START_HERE.md',
  'examples/README.md',
  'docs/TRY.md',
  'docs/VERIFY.md',
  'docs/guides/integration-patterns.md',
];

// The seven "Choose your path" table targets in the README (one table row
// carries two links). Pinned independently of the generic scan.
const REQUIRED_README_TARGETS = [
  'docs/guides/quickstart-api-provider.md',
  'integrator-kits/mcp/README.md',
  'docs/SOLUTIONS/mcp-gateway-receipts.md',
  'docs/SOLUTIONS/commerce-evidence-bundle.md',
  'docs/SOLUTIONS/verify-agent-provisioning.md',
  'docs/WHERE-IT-FITS.md',
  'docs/guides/quickstart-agent-operator.md',
];

const REFERENCE_VERIFIER_DIR = 'surfaces/reference-verifier';
const REFERENCE_VERIFIER_LINK = 'surfaces/reference-verifier/';

/** Remove fenced code blocks so snippet text is not scanned for links. */
function stripFencedCode(markdown: string): string {
  // Drop ```...``` and ~~~...~~~ fenced blocks (line-anchored fences).
  return markdown.replace(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm, '');
}

/** Collect every link target referenced by a Markdown document. */
function extractLinkTargets(markdown: string): string[] {
  const body = stripFencedCode(markdown);
  const targets: string[] = [];

  // Inline links: ](target) and ](target "title").
  const inline = /\]\(\s*([^)\s]+)(?:\s+[^)]*)?\)/g;
  let m: RegExpExecArray | null;
  while ((m = inline.exec(body)) !== null) {
    targets.push(m[1]);
  }

  // Reference-style definitions: [label]: target (line start).
  const ref = /^[ \t]*\[[^\]]+\]:\s+(\S+)/gm;
  while ((m = ref.exec(body)) !== null) {
    targets.push(m[1]);
  }

  return targets;
}

/** True for a link that points at a repository file (not a scheme/anchor). */
function isFileLink(target: string): boolean {
  if (target.startsWith('#')) return false; // anchor-only
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return false; // any URI scheme
  return true;
}

/**
 * Resolve a relative or repo-root-relative file link to an absolute path.
 * `/docs/...` resolves against the repository root, not the filesystem root.
 */
function resolveTarget(docPath: string, target: string): string {
  const noFragment = target.split('#')[0];
  if (noFragment.startsWith('/')) {
    return join(REPO_ROOT, noFragment.slice(1));
  }
  return resolve(dirname(docPath), noFragment);
}

/** True if an absolute path is the repository root or lives inside it. */
function isInsideRepo(absPath: string): boolean {
  const root = resolve(REPO_ROOT);
  const target = resolve(absPath);
  return target === root || target.startsWith(root + sep);
}

/** Sorted, de-duplicated list of unresolved links for a document. */
function brokenLinks(relDocPath: string): string[] {
  const docPath = join(REPO_ROOT, relDocPath);
  const markdown = readFileSync(docPath, 'utf8');
  const failures = new Set<string>();
  for (const target of extractLinkTargets(markdown)) {
    if (!isFileLink(target)) continue;
    const resolved = resolveTarget(docPath, target);
    // An entry-doc file link must resolve INSIDE the repository, not merely to
    // some path that happens to exist outside it.
    if (!isInsideRepo(resolved)) {
      failures.add(`${relDocPath}: "${target}" escapes repository root -> ${resolved}`);
      continue;
    }
    if (!existsSync(resolved)) {
      failures.add(`${relDocPath}: "${target}" -> ${resolved}`);
    }
  }
  return [...failures].sort();
}

describe('entry-document links resolve (generic)', () => {
  for (const relDocPath of REQUIRED_DOCS) {
    it(`${relDocPath}: every relative link resolves on disk`, () => {
      expect(existsSync(join(REPO_ROOT, relDocPath)), `${relDocPath} must exist`).toBe(true);
      const broken = brokenLinks(relDocPath);
      expect(broken, `unresolved links in ${relDocPath}:\n${broken.join('\n')}`).toEqual([]);
    });
  }
});

describe('README "Choose your path" targets resolve (targeted)', () => {
  for (const target of REQUIRED_README_TARGETS) {
    it(`${target} exists`, () => {
      expect(existsSync(join(REPO_ROOT, target))).toBe(true);
    });
  }

  it('the README references all seven targets', () => {
    const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
    for (const target of REQUIRED_README_TARGETS) {
      expect(readme, `README should link ${target}`).toContain(target);
    }
  });
});

describe('reference verifier surface link resolves', () => {
  it('the README links to the reference verifier surface and it exists', () => {
    const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
    expect(readme).toContain(REFERENCE_VERIFIER_LINK);
    expect(existsSync(join(REPO_ROOT, REFERENCE_VERIFIER_DIR))).toBe(true);
  });
});

// Synthetic tests for the link parser itself. These lock parser behavior that
// the current entry documents do not exercise completely, especially
// reference-style definitions, root-relative links, non-http URI schemes, and
// links inside fenced code blocks.
describe('link parser handles Markdown durability cases', () => {
  it('strips fenced code so links inside code blocks are not scanned', () => {
    const markdown = [
      '[local](docs/START_HERE.md)',
      '```',
      '[ignored](missing-in-fence.md)',
      '```',
      '~~~md',
      '[also-ignored](other-missing.md)',
      '~~~',
    ].join('\n');
    const targets = extractLinkTargets(markdown);
    expect(targets).toContain('docs/START_HERE.md');
    expect(targets).not.toContain('missing-in-fence.md');
    expect(targets).not.toContain('other-missing.md');
  });

  it('extracts inline links and reference-style definitions', () => {
    const markdown = [
      '[inline](docs/inline-target.md)',
      '[ref-link][label]',
      '',
      '[label]: docs/reference-target.md',
    ].join('\n');
    const targets = extractLinkTargets(markdown);
    expect(targets).toContain('docs/inline-target.md');
    expect(targets).toContain('docs/reference-target.md');
  });

  it('treats anchor-only links and URI-scheme links as non-file (skipped)', () => {
    // extractLinkTargets returns raw targets; isFileLink is the filter that
    // excludes anchors and any URI scheme (not just http/https).
    expect(isFileLink('#section')).toBe(false);
    expect(isFileLink('https://example.com')).toBe(false);
    expect(isFileLink('http://example.com')).toBe(false);
    expect(isFileLink('mailto:test@example.com')).toBe(false);
    expect(isFileLink('did:web:example.com')).toBe(false);
    expect(isFileLink('tel:+15551234567')).toBe(false);
    // A repository file link is kept.
    expect(isFileLink('docs/START_HERE.md')).toBe(true);
    expect(isFileLink('../examples/README.md')).toBe(true);
  });

  it('resolves repo-root-relative links against the repository root, not the filesystem root', () => {
    const readmePath = join(REPO_ROOT, 'README.md');
    expect(resolveTarget(readmePath, '/docs/START_HERE.md')).toBe(
      join(REPO_ROOT, 'docs/START_HERE.md')
    );
  });

  it('resolves document-relative links against the document directory and strips fragments', () => {
    const startHerePath = join(REPO_ROOT, 'docs', 'START_HERE.md');
    // ../examples from docs/ resolves to the repo examples dir.
    expect(resolveTarget(startHerePath, '../examples/README.md')).toBe(
      join(REPO_ROOT, 'examples', 'README.md')
    );
    // A #fragment is stripped before resolution.
    expect(resolveTarget(startHerePath, 'HOW-IT-WORKS.md#verify')).toBe(
      join(REPO_ROOT, 'docs', 'HOW-IT-WORKS.md')
    );
  });

  it('rejects file links that escape the repository root', () => {
    const startHerePath = join(REPO_ROOT, 'docs', 'START_HERE.md');
    expect(isInsideRepo(resolveTarget(startHerePath, '../../outside.md'))).toBe(false);
    // A normal in-repo link stays inside.
    expect(isInsideRepo(resolveTarget(startHerePath, '../examples/README.md'))).toBe(true);
  });
});

describe('entry guides reuse the README quickstart snippet', () => {
  // The exact public offline copy-paste the README promises a new developer.
  // Source of truth: tests/tooling/readme-quickstart-doc-truth.test.ts, which
  // locks these strings against the README and the shipped CLI. The entry
  // guides must reuse them verbatim so the guides cannot drift from the README.
  const GENERATE_CMD = 'pnpm dlx @peac/cli samples generate -o ./s';
  const VERIFY_CMD =
    'pnpm dlx @peac/cli verify ./s/valid/basic-record.jws --public-key ./s/bundles/sandbox-jwks.json';
  const SUCCESS_LITERAL = 'Signature valid (offline).';

  it('docs/TRY.md uses the offline one-liner (generate before verify) and the success literal', () => {
    const try_ = readFileSync(join(REPO_ROOT, 'docs/TRY.md'), 'utf8');
    const gen = try_.indexOf(GENERATE_CMD);
    const verify = try_.indexOf(VERIFY_CMD);
    expect(gen, 'docs/TRY.md must contain the generate command').toBeGreaterThan(-1);
    expect(verify, 'docs/TRY.md must contain the verify command').toBeGreaterThan(-1);
    expect(gen, 'generate must appear before verify in docs/TRY.md').toBeLessThan(verify);
    expect(try_, 'docs/TRY.md must state the success literal').toContain(SUCCESS_LITERAL);
  });

  it('docs/VERIFY.md is self-contained: generate before verify, plus the success literal', () => {
    // VERIFY.md must be independently copy-pasteable, so it includes the
    // generate command before the verify command (not only the verify line).
    const verifyDoc = readFileSync(join(REPO_ROOT, 'docs/VERIFY.md'), 'utf8');
    const gen = verifyDoc.indexOf(GENERATE_CMD);
    const verify = verifyDoc.indexOf(VERIFY_CMD);
    expect(gen, 'docs/VERIFY.md must contain the generate command').toBeGreaterThan(-1);
    expect(verify, 'docs/VERIFY.md must contain the verify command').toBeGreaterThan(-1);
    expect(gen, 'generate must appear before verify in docs/VERIFY.md').toBeLessThan(verify);
    expect(verifyDoc, 'docs/VERIFY.md must state the success literal').toContain(SUCCESS_LITERAL);
  });
});
