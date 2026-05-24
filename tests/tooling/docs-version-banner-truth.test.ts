/**
 * Doc-truth gate for public documentation status banners.
 *
 * Public docs MUST NOT use the legacy banner pattern
 *
 *   > Version: <X.Y.Z> | Status: Current
 *
 * because the embedded version becomes stale as soon as the package
 * release moves forward. Evergreen guidance uses the version-neutral
 * pattern
 *
 *   > Status: Current
 *
 * (as in docs/REFERENCE_ARCHITECTURES.md). Release-specific notes
 * already live under docs/release-notes/ and are not in scope.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const DOCS_ROOT = join(REPO_ROOT, 'docs');

// Subdirectories that intentionally carry version-pinned banners
// (release-specific notes, frozen historical references, generated
// truth artifacts).
const EXCLUDED_SUBDIRS = new Set(['release-notes', 'releases', 'reboot', 'baselines']);

// Pattern that should never appear in evergreen public docs.
const STALE_BANNER = /^>\s*Version:\s*\d+\.\d+\.\d+\s*\|\s*Status:\s*Current\b/m;

function collectMarkdownFiles(root: string, results: string[] = []): string[] {
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (EXCLUDED_SUBDIRS.has(entry)) continue;
      collectMarkdownFiles(full, results);
    } else if (st.isFile() && entry.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

const MD_FILES = collectMarkdownFiles(DOCS_ROOT);

describe('docs status banners: no versioned "Status: Current" claims', () => {
  it('finds at least one markdown file under docs/', () => {
    expect(MD_FILES.length).toBeGreaterThan(0);
  });

  for (const path of MD_FILES) {
    const rel = path.slice(REPO_ROOT.length + 1);
    it(`${rel} does not carry a versioned "Status: Current" banner`, () => {
      const text = readFileSync(path, 'utf8');
      expect(text).not.toMatch(STALE_BANNER);
    });
  }
});
