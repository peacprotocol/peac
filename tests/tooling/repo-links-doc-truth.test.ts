/**
 * Repo-wide Markdown link-truth test.
 *
 * Extends the curated entry-document gate (entry-links-doc-truth.test.ts) to
 * every Markdown file under docs/, .github/, surfaces/, and examples/, so a
 * moved or renamed target cannot silently break documentation outside the small
 * entry-doc set. Every relative file link must resolve to a real repository file
 * with EXACT case (development is often case-insensitive; CI is not).
 *
 * Tracked-tree existence: a link must resolve to a git-TRACKED file or directory
 * (validated against the git index), not merely to a path present in the local
 * working directory. Untracked residue (a stale node_modules, an old build
 * output) therefore cannot mask a broken link that a clean checkout would fail.
 * Anchor (#fragment) validation and external URL liveness are out of scope; only
 * in-repo tracked existence is gated.
 *
 * Scope:
 *   - Roots: docs/, .github/, surfaces/, examples/ (recursive).
 *   - Skips generated/vendored dirs (node_modules, dist, .turbo, .wrangler, out,
 *     coverage, .git).
 *   - Excludes CHANGELOG.md (root-level, historical) and the repo-root README,
 *     both already covered by the entry gate.
 *
 * Allowlist: intentionally empty. Fix broken links rather than allowlisting. The
 * mechanism exists only for a generated/historical target that genuinely cannot
 * resolve, and each entry must carry a written reason. A self-cleaning test
 * fails if an allowlisted link starts resolving, so stale allowlist entries
 * cannot linger.
 */

import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  brokenLinksForDoc,
  existsCaseExact,
  existsTrackedCaseExact,
  extractLinkTargets,
  isFileLink,
  walkMarkdownFiles,
} from './lib/markdown-links.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const ROOTS = ['docs', '.github', 'surfaces', 'examples'] as const;
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.turbo',
  '.wrangler',
  'out',
  'coverage',
  '.git',
]);

// Files already gated elsewhere or intentionally out of scope.
const EXCLUDE = new Set<string>(['CHANGELOG.md']);

/**
 * Path prefixes excluded from the living-docs gate. These are the frozen
 * snapshot/fixture subtrees of the evidence pack: their internal
 * cross-references point at sibling files from the original spec tree that were
 * not copied into the partial snapshot, so those links cannot resolve by design.
 * The exclusion is deliberately narrow: it covers ONLY the frozen subtrees, not
 * the active docs/evidence-pack/README.md entry point, which is still gated.
 */
const EXCLUDE_PREFIXES = ['docs/evidence-pack/spec-snapshots/', 'docs/evidence-pack/evidence/'];

/**
 * Allowlist of links that are permitted to not resolve, each with a reason.
 * Keep EMPTY where possible; prefer fixing the link.
 */
const ALLOWLIST: ReadonlyArray<{ file: string; target: string; reason: string }> = [];

const DOCS = walkMarkdownFiles(REPO_ROOT, ROOTS, SKIP_DIRS).filter(
  (f) => !EXCLUDE.has(f) && !EXCLUDE_PREFIXES.some((p) => f.startsWith(p))
);

function allowKey(file: string, brokenEntry: string): boolean {
  return ALLOWLIST.some((a) => a.file === file && brokenEntry.startsWith(`"${a.target}"`));
}

describe('repo-wide Markdown links resolve (case-exact)', () => {
  it('discovers Markdown files to check', () => {
    expect(DOCS.length).toBeGreaterThan(0);
  });

  for (const relDocPath of DOCS) {
    it(`${relDocPath}: every relative link resolves on disk`, () => {
      const broken = brokenLinksForDoc(REPO_ROOT, relDocPath).filter(
        (entry) => !allowKey(relDocPath, entry)
      );
      expect(
        broken,
        `unresolved links in ${relDocPath} (fix the link or add an allowlist entry with a reason):\n  ${broken.join('\n  ')}`
      ).toEqual([]);
    });
  }
});

describe('link allowlist is self-cleaning', () => {
  for (const entry of ALLOWLIST) {
    it(`${entry.file}: allowlisted "${entry.target}" still needs the allowlist`, () => {
      // If an allowlisted link now resolves, remove it from the allowlist.
      const broken = brokenLinksForDoc(REPO_ROOT, entry.file);
      const stillBroken = broken.some((b) => b.startsWith(`"${entry.target}"`));
      expect(
        stillBroken,
        `"${entry.target}" in ${entry.file} now resolves; remove it from ALLOWLIST`
      ).toBe(true);
    });
  }
});

describe('case-exact resolution rejects wrong-case links', () => {
  it('accepts an exact-case path and rejects a wrong-case one', () => {
    // docs/SOLUTIONS exists; docs/solutions does not (case-insensitive FS would
    // wrongly accept the latter). Guard the gate's core invariant.
    expect(existsCaseExact(REPO_ROOT, join(REPO_ROOT, 'docs', 'SOLUTIONS'))).toBe(true);
    expect(existsCaseExact(REPO_ROOT, join(REPO_ROOT, 'docs', 'solutions'))).toBe(false);
  });

  it('resolves an exact-case file and rejects a missing one', () => {
    expect(existsCaseExact(REPO_ROOT, join(REPO_ROOT, 'README.md'))).toBe(true);
    expect(existsCaseExact(REPO_ROOT, join(REPO_ROOT, 'README.MD'))).toBe(false);
    expect(existsCaseExact(REPO_ROOT, join(REPO_ROOT, 'does-not-exist.md'))).toBe(false);
  });
});

// The tracked-tree check must resolve links against the git index, not the
// working directory: an untracked file or directory present on disk (residue
// such as a stale node_modules or an old build output) must NOT satisfy a
// repository-relative link, because a clean checkout would not have it. These
// tests build throwaway git repositories with a known index so the abstraction
// is exercised directly, independent of this checkout's layout.
function gitFixtureRepo(): { root: string; git: (...args: string[]) => void } {
  const root = mkdtempSync(join(tmpdir(), 'peac-link-gate-'));
  const git = (...args: string[]): void => {
    const res = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    if (res.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${res.stderr || res.error?.message || ''}`);
    }
  };
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Link Gate Test');
  git('config', 'commit.gpgsign', 'false');
  return { root, git };
}

describe('tracked-tree existence (git-index fixture)', () => {
  it('accepts tracked files, tracked directories, staged files; rejects untracked residue and wrong case', () => {
    const { root, git } = gitFixtureRepo();
    try {
      mkdirSync(join(root, 'docs'), { recursive: true });
      writeFileSync(join(root, 'docs', 'guide.md'), '# guide\n');
      // A tracked filename containing a space exercises NUL-delimited parsing.
      writeFileSync(join(root, 'docs', 'a file.md'), '# spaced\n');
      git('add', 'docs/guide.md', 'docs/a file.md');
      git('commit', '-qm', 'init');

      // Staged but not committed: present in the index, so it resolves.
      writeFileSync(join(root, 'staged.md'), '# staged\n');
      git('add', 'staged.md');

      // Present on disk but never added: must NOT resolve.
      writeFileSync(join(root, 'untracked.md'), '# untracked\n');
      mkdirSync(join(root, 'residue'), { recursive: true });
      writeFileSync(join(root, 'residue', 'x.md'), '# residue\n');

      expect(existsTrackedCaseExact(root, join(root, 'docs', 'guide.md'))).toBe(true);
      expect(existsTrackedCaseExact(root, join(root, 'docs'))).toBe(true);
      expect(existsTrackedCaseExact(root, join(root, 'docs', 'a file.md'))).toBe(true);
      expect(existsTrackedCaseExact(root, join(root, 'staged.md'))).toBe(true);
      expect(existsTrackedCaseExact(root, root)).toBe(true);

      // Untracked residue is on disk (the plain check accepts it) but is absent
      // from the index (the tracked-tree check rejects it).
      expect(existsCaseExact(root, join(root, 'untracked.md'))).toBe(true);
      expect(existsTrackedCaseExact(root, join(root, 'untracked.md'))).toBe(false);
      expect(existsCaseExact(root, join(root, 'residue'))).toBe(true);
      expect(existsTrackedCaseExact(root, join(root, 'residue'))).toBe(false);

      // Wrong case and repository escape are rejected.
      expect(existsTrackedCaseExact(root, join(root, 'docs', 'GUIDE.md'))).toBe(false);
      expect(existsTrackedCaseExact(root, join(root, '..', 'outside.md'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not share cached index state between two repositories', () => {
    const a = gitFixtureRepo();
    const b = gitFixtureRepo();
    try {
      writeFileSync(join(a.root, 'only-in-a.md'), '# a\n');
      a.git('add', 'only-in-a.md');
      a.git('commit', '-qm', 'a');
      writeFileSync(join(b.root, 'only-in-b.md'), '# b\n');
      b.git('add', 'only-in-b.md');
      b.git('commit', '-qm', 'b');

      expect(existsTrackedCaseExact(a.root, join(a.root, 'only-in-a.md'))).toBe(true);
      expect(existsTrackedCaseExact(a.root, join(a.root, 'only-in-b.md'))).toBe(false);
      expect(existsTrackedCaseExact(b.root, join(b.root, 'only-in-b.md'))).toBe(true);
      expect(existsTrackedCaseExact(b.root, join(b.root, 'only-in-a.md'))).toBe(false);
    } finally {
      rmSync(a.root, { recursive: true, force: true });
      rmSync(b.root, { recursive: true, force: true });
    }
  });

  it('fails closed when the git index cannot be read', () => {
    // A fresh temp directory that is not a git repository has no readable index.
    const notARepo = mkdtempSync(join(tmpdir(), 'peac-link-gate-norepo-'));
    try {
      writeFileSync(join(notARepo, 'file.md'), '# f\n');
      expect(() => existsTrackedCaseExact(notARepo, join(notARepo, 'file.md'))).toThrow(
        /tracked-tree link validation cannot continue/
      );
    } finally {
      rmSync(notARepo, { recursive: true, force: true });
    }
  });
});

describe('parser excludes non-links and keeps image/file links', () => {
  it('does not treat a `](x)`-looking substring inside inline code as a link', () => {
    const targets = extractLinkTargets(
      'a regex `[a-z0-9]([a-z0-9-]*[a-z0-9])?` and [real](docs/x.md)'
    );
    expect(targets).toContain('docs/x.md');
    expect(targets).not.toContain('[a-z0-9-]*[a-z0-9');
  });

  it('does not treat a footnote definition as a reference-style link', () => {
    const targets = extractLinkTargets('[^1]: Inclusion of a real name is descriptive only.');
    expect(targets).not.toContain('Inclusion');
    // A genuine reference definition is still captured.
    expect(extractLinkTargets('[label]: docs/ref-target.md')).toContain('docs/ref-target.md');
  });

  it('captures image link targets so they are gated too', () => {
    const targets = extractLinkTargets('![diagram](docs/diagrams/flow.svg)');
    expect(targets).toContain('docs/diagrams/flow.svg');
    // isFileLink keeps a repo file target and drops schemes/anchors.
    expect(isFileLink('docs/diagrams/flow.svg')).toBe(true);
    expect(isFileLink('#section')).toBe(false);
    expect(isFileLink('https://example.com/x.png')).toBe(false);
  });
});
