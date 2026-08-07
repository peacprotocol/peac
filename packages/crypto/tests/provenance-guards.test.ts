/**
 * Guards on the shared evidence-provenance module.
 *
 * Covers the module's refusals: a dirty worktree, a supplied revision that disagrees with the
 * checkout, and paths that leave the repository.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  CORPUS_PATH,
  LOCKFILE_PATH,
  PRODUCTION_SOURCES,
  deriveSourceRevision,
  fileDigest,
  productionSourceManifestDigest,
  readRepositoryFile,
  resolveSourceRevision,
  sha256,
} from './tools/evidence-provenance.mjs';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** A throwaway repository in which the dirty-worktree refusal can be exercised. */
function scratchRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'peac-provenance-'));
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.invalid');
  git('config', 'user.name', 't');
  writeFileSync(join(dir, 'seed.txt'), 'seed\n');
  git('add', 'seed.txt');
  git('commit', '-qm', 'seed');
  return dir;
}

describe('the source revision is derived, not asserted', () => {
  it('refuses to measure a dirty worktree', () => {
    const dir = scratchRepo();
    try {
      expect(deriveSourceRevision(dir)).toMatch(/^[0-9a-f]{40}$/);
      writeFileSync(join(dir, 'seed.txt'), 'modified\n');
      expect(() => deriveSourceRevision(dir)).toThrow(/dirty worktree/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a supplied revision that is not the checked-out one', () => {
    const dir = scratchRepo();
    try {
      const head = deriveSourceRevision(dir);
      expect(resolveSourceRevision(dir, head)).toBe(head);
      expect(resolveSourceRevision(dir, null)).toBe(head);
      expect(() => resolveSourceRevision(dir, 'b'.repeat(40))).toThrow(/does not match/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when Git identity cannot be established', () => {
    const dir = mkdtempSync(join(tmpdir(), 'peac-not-a-repo-'));
    try {
      expect(() => deriveSourceRevision(dir)).toThrow(/cannot determine the source revision/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('repository file access is constrained', () => {
  it.each(['../outside.txt', '/etc/hosts', 'packages/../../escape.txt'])(
    'refuses %s',
    (candidate) => {
      expect(() => readRepositoryFile(REPO_ROOT, candidate)).toThrow();
    }
  );

  it('reads a repository-relative path', () => {
    expect(readRepositoryFile(REPO_ROOT, LOCKFILE_PATH).length).toBeGreaterThan(0);
  });

  it('refuses an empty or non-string path', () => {
    expect(() => readRepositoryFile(REPO_ROOT, '')).toThrow();
    expect(() => readRepositoryFile(REPO_ROOT, undefined as unknown as string)).toThrow();
  });
});

describe('the production source manifest is deterministic and closed', () => {
  it('is order independent', () => {
    const forward = productionSourceManifestDigest(REPO_ROOT, PRODUCTION_SOURCES);
    const reversed = productionSourceManifestDigest(REPO_ROOT, [...PRODUCTION_SOURCES].reverse());
    expect(reversed).toBe(forward);
  });

  it('rejects a duplicated path', () => {
    expect(() =>
      productionSourceManifestDigest(REPO_ROOT, [...PRODUCTION_SOURCES, PRODUCTION_SOURCES[0]])
    ).toThrow(/duplicate/);
  });

  it('changes when any covered source changes', () => {
    const base = productionSourceManifestDigest(REPO_ROOT, PRODUCTION_SOURCES);
    const altered = productionSourceManifestDigest(REPO_ROOT, [
      PRODUCTION_SOURCES[0],
      LOCKFILE_PATH,
    ]);
    expect(altered).not.toBe(base);
  });

  it('covers exactly the declared production sources', () => {
    expect([...PRODUCTION_SOURCES]).toEqual([
      'packages/crypto/src/ed25519.ts',
      'packages/crypto/src/internal/ed25519-admissibility.ts',
    ]);
  });
});

describe('digests are over unmodified file bytes', () => {
  it('matches a direct hash of the corpus', () => {
    expect(fileDigest(REPO_ROOT, CORPUS_PATH)).toBe(
      sha256(readRepositoryFile(REPO_ROOT, CORPUS_PATH))
    );
  });
});
