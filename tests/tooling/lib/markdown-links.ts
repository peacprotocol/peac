/**
 * Shared Markdown link-resolution helpers.
 *
 * Extracted from tests/tooling/entry-links-doc-truth.test.ts so the repo-wide
 * link gate (tests/tooling/repo-links-doc-truth.test.ts) reuses the same
 * parser instead of duplicating it. The entry gate keeps its own inline copy so
 * that curated, high-traffic gate cannot be affected by changes here.
 *
 * Case-exact note: development commonly happens on case-insensitive filesystems
 * (APFS/NTFS) while CI runs on case-sensitive Linux. `existsSync` would accept a
 * link whose case does not match the real file, then fail in CI. `existsCaseExact`
 * verifies every path segment against its parent directory listing.
 *
 * Tracked-tree note: a link target that exists on disk but is NOT part of the git
 * index (untracked working-directory residue such as a stale `node_modules` or an
 * old build output) must NOT satisfy a repository link. `existsTrackedCaseExact`
 * validates against the git index (via `git ls-files --cached`) so the link gate
 * cannot be silently satisfied by residue that is absent from a clean checkout. It
 * fails closed: if the git index cannot be read it throws rather than degrading to
 * a weaker check. For deliberate filesystem-only validation (for example a source
 * tarball with no `.git`) call `existsCaseExact` explicitly.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Remove fenced code blocks AND inline code spans so code text (e.g. a regex
 * like `[a-z0-9]([a-z0-9-]*[a-z0-9])?`) is not misread as a Markdown link.
 */
export function stripFencedCode(markdown: string): string {
  const withoutFences = markdown.replace(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm, '');
  // Inline code spans: `...` (single-backtick, non-newline). Removes the code
  // content so a `](...)`-looking substring inside code is not scanned.
  return withoutFences.replace(/`[^`\n]*`/g, '');
}

/** Collect every link target referenced by a Markdown document. */
export function extractLinkTargets(markdown: string): string[] {
  const body = stripFencedCode(markdown);
  const targets: string[] = [];

  // Inline links: ](target) and ](target "title").
  const inline = /\]\(\s*([^)\s]+)(?:\s+[^)]*)?\)/g;
  let m: RegExpExecArray | null;
  while ((m = inline.exec(body)) !== null) {
    targets.push(m[1]);
  }

  // Reference-style definitions: [label]: target (line start). The negative
  // lookahead skips footnote definitions ([^1]: ...), which are not links.
  const ref = /^[ \t]*\[(?!\^)[^\]]+\]:\s+(\S+)/gm;
  while ((m = ref.exec(body)) !== null) {
    targets.push(m[1]);
  }

  return targets;
}

/** True for a link that points at a repository file (not a scheme/anchor). */
export function isFileLink(target: string): boolean {
  if (target.startsWith('#')) return false; // anchor-only
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return false; // any URI scheme
  return true;
}

/**
 * Resolve a relative or repo-root-relative file link to an absolute path.
 * `/docs/...` resolves against the repository root, not the filesystem root.
 */
export function resolveTarget(repoRoot: string, docPath: string, target: string): string {
  const noFragment = target.split('#')[0];
  if (noFragment.startsWith('/')) {
    return join(repoRoot, noFragment.slice(1));
  }
  return resolve(dirname(docPath), noFragment);
}

/** True if an absolute path is the repository root or lives inside it. */
export function isInsideRepo(repoRoot: string, absPath: string): boolean {
  const root = resolve(repoRoot);
  const target = resolve(absPath);
  return target === root || target.startsWith(root + sep);
}

/**
 * Case-exact existence check: every path segment below `repoRoot` must match a
 * real directory entry with identical case. Returns false on the first
 * mismatch or missing segment.
 */
export function existsCaseExact(repoRoot: string, absPath: string): boolean {
  const rel = relative(repoRoot, absPath);
  if (rel === '') return true;
  if (rel.startsWith('..')) return false;
  const segments = rel.split(sep).filter(Boolean);
  let current = repoRoot;
  for (const segment of segments) {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return false;
    }
    if (!entries.includes(segment)) return false;
    current = join(current, segment);
  }
  return true;
}

interface TrackedIndex {
  files: ReadonlySet<string>;
  dirs: ReadonlySet<string>;
}

const trackedIndexCache = new Map<string, TrackedIndex>();

/**
 * Build (and cache) the set of git-tracked file and directory paths for a repo,
 * keyed by the canonical (resolved) repo root. Paths are POSIX-separated and
 * case-sensitive, exactly as the git index stores them.
 *
 * Fails closed: if the git index cannot be read (git missing, non-zero exit,
 * a process error/signal, or unreadable output) this throws rather than quietly
 * degrading to a weaker check. Callers that deliberately want filesystem-only
 * validation (for example a source tarball with no `.git`) call `existsCaseExact`
 * explicitly instead.
 */
function getTrackedIndex(root: string): TrackedIndex {
  const cached = trackedIndexCache.get(root);
  if (cached) return cached;

  const res = spawnSync('git', ['-C', root, 'ls-files', '-z', '--cached'], {
    encoding: 'utf8',
    timeout: 10_000,
    // `git ls-files -z` is on the order of 120 KiB for this repository; 32 MiB
    // is generous but bounded headroom that rejects pathological output rather
    // than allocating without limit.
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });

  if (res.error) {
    throw new Error(
      `Unable to read the git tracked-file index (git ls-files failed: ${res.error.message}); tracked-tree link validation cannot continue.`
    );
  }
  if (res.signal) {
    throw new Error(
      `git ls-files was terminated by signal ${res.signal}; tracked-tree link validation cannot continue.`
    );
  }
  if (res.status !== 0) {
    const stderr = typeof res.stderr === 'string' ? res.stderr.trim() : '';
    throw new Error(
      `git ls-files exited with status ${String(res.status)}${stderr ? `: ${stderr}` : ''}; tracked-tree link validation cannot continue.`
    );
  }
  if (typeof res.stdout !== 'string') {
    throw new Error(
      'git ls-files produced no readable output; tracked-tree link validation cannot continue.'
    );
  }

  const files = new Set<string>();
  const dirs = new Set<string>();
  for (const path of res.stdout.split('\0')) {
    if (!path) continue;
    files.add(path);
    const segments = path.split('/');
    for (let i = 1; i < segments.length; i++) {
      dirs.add(segments.slice(0, i).join('/'));
    }
  }

  const index: TrackedIndex = { files, dirs };
  trackedIndexCache.set(root, index);
  return index;
}

/**
 * True when `absPath` resolves to a git-TRACKED file, or a directory that
 * contains at least one tracked file, matched case-exactly against the git
 * index. Untracked working-directory residue (a file or directory present on
 * disk but absent from the index) does NOT satisfy the check, so a broken link
 * cannot be masked by local residue that a clean checkout would not have.
 *
 * Fails closed: throws when the git index cannot be read (see getTrackedIndex).
 * For deliberate filesystem-only validation, use `existsCaseExact`.
 */
export function existsTrackedCaseExact(repoRoot: string, absPath: string): boolean {
  const root = resolve(repoRoot);
  const rel = relative(root, resolve(absPath));
  if (rel === '') return true;
  if (rel.startsWith('..')) return false;

  const index = getTrackedIndex(root);
  const relPosix = rel.split(sep).join('/');
  return index.files.has(relPosix) || index.dirs.has(relPosix);
}

/**
 * Recursively collect repo-relative paths of Markdown files under the given
 * repo-relative roots, skipping generated/vendored directories.
 */
export function walkMarkdownFiles(
  repoRoot: string,
  roots: readonly string[],
  skipDirs: ReadonlySet<string>
): string[] {
  const out: string[] = [];
  const visit = (absDir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(absDir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (skipDirs.has(name)) continue;
      const abs = join(absDir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        visit(abs);
      } else if (st.isFile() && name.toLowerCase().endsWith('.md')) {
        out.push(relative(repoRoot, abs));
      }
    }
  };
  for (const root of roots) {
    visit(join(repoRoot, root));
  }
  return out.sort();
}

/** Read a doc and return its sorted, de-duplicated broken file links. */
export function brokenLinksForDoc(repoRoot: string, relDocPath: string): string[] {
  const docPath = join(repoRoot, relDocPath);
  const markdown = readFileSync(docPath, 'utf8');
  const failures = new Set<string>();
  for (const target of extractLinkTargets(markdown)) {
    if (!isFileLink(target)) continue;
    const resolved = resolveTarget(repoRoot, docPath, target);
    if (!isInsideRepo(repoRoot, resolved)) {
      failures.add(`"${target}" escapes repository root`);
      continue;
    }
    if (!existsTrackedCaseExact(repoRoot, resolved)) {
      failures.add(`"${target}" -> ${relative(repoRoot, resolved)}`);
    }
  }
  return [...failures].sort();
}
