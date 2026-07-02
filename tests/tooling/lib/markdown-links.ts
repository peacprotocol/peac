/**
 * Shared Markdown link-resolution helpers.
 *
 * Extracted from tests/tooling/entry-links-doc-truth.test.ts so the repo-wide
 * link gate (tests/tooling/repo-links-doc-truth.test.ts) reuses the same
 * parser instead of duplicating it. The entry gate keeps its own inline copy so
 * that curated, high-traffic gate cannot be affected by changes here.
 *
 * Filesystem-only: node:fs + node:path, no spawn, no network, no dependency.
 *
 * Case-exact note: development commonly happens on case-insensitive filesystems
 * (APFS/NTFS) while CI runs on case-sensitive Linux. `existsSync` would accept a
 * link whose case does not match the real file, then fail in CI. `existsCaseExact`
 * verifies every path segment against its parent directory listing.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

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
    if (!existsCaseExact(repoRoot, resolved)) {
      failures.add(`"${target}" -> ${relative(repoRoot, resolved)}`);
    }
  }
  return [...failures].sort();
}
