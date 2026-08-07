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
  MEASUREMENT_DEPENDENCIES,
  PRODUCTION_SOURCES,
  deriveSourceRevision,
  fileAtRevision,
  fileDigest,
  lockfileResolvedVersions,
  observationDependencyProblems,
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

describe('observation applicability is bound to measurement-relevant dependencies', () => {
  const lockfile = readRepositoryFile(REPO_ROOT, LOCKFILE_PATH).toString('utf8');
  const noblePackage = '@noble/ed25519';

  /** Environments recording the noble version the current lockfile resolves, with the lockfile
   * digest of their measurement event, as the committed document records both. */
  const environments = (): Record<
    string,
    { implementation: string; version: string; lockfile_sha256: string }
  > => {
    const [version] = lockfileResolvedVersions(lockfile, noblePackage);
    expect(version, 'the lockfile resolves the measured dependency').toBeTruthy();
    const lockfileSha256 = sha256(lockfile);
    return {
      'noble-strict': { implementation: 'noble:strict', version, lockfile_sha256: lockfileSha256 },
      'noble-zip215': { implementation: 'noble:zip215', version, lockfile_sha256: lockfileSha256 },
      'node-crypto': {
        implementation: 'node:crypto',
        version: '24.19.0',
        lockfile_sha256: lockfileSha256,
      },
    };
  };

  it('declares the noble dependency as measurement relevant', () => {
    expect(MEASUREMENT_DEPENDENCIES.map((d) => d.package)).toEqual([noblePackage]);
  });

  it('resolves the measured dependency from the committed lockfile', () => {
    expect(lockfileResolvedVersions(lockfile, noblePackage)).toHaveLength(1);
  });

  it('accepts the committed lockfile', () => {
    expect(observationDependencyProblems(environments(), lockfile)).toEqual([]);
  });

  it('a resolution change outside the measurement closure does not invalidate the observations', () => {
    const changed = lockfile.replace(/^  \/js-yaml@[0-9][^:]*:/gm, '  /js-yaml@9.9.9:');
    expect(changed, 'the unrelated mutation applied').not.toBe(lockfile);
    expect(observationDependencyProblems(environments(), changed)).toEqual([]);
  });

  it('a measurement-relevant resolution change invalidates the observations', () => {
    const changed = lockfile.replace(
      /^  \/@noble\/ed25519@[0-9][^:(]*/gm,
      '  /@noble/ed25519@9.9.9'
    );
    expect(changed, 'the relevant mutation applied').not.toBe(lockfile);
    const problems = observationDependencyProblems(environments(), changed);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(noblePackage);
    expect(problems[0]).toContain('9.9.9');
  });

  it('a lockfile that resolves no version for a measured dependency is a failure, not an absence', () => {
    const removed = lockfile
      .split('\n')
      .filter((line) => !/^  \/@noble\/ed25519@/.test(line))
      .join('\n');
    expect(removed, 'the removal applied').not.toBe(lockfile);
    const problems = observationDependencyProblems(environments(), removed);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('resolves no version');
  });

  it('an unrecognized lockfile format is a failure, not an absence', () => {
    const problems = observationDependencyProblems(environments(), 'lockfileVersion: unknown\n');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('resolves no version');
  });

  it('environments that disagree on the measured version are a failure', () => {
    const disagreeing = {
      ...environments(),
      'noble-other': { implementation: 'noble:strict', version: '0.0.1' },
    };
    const problems = observationDependencyProblems(disagreeing, lockfile);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('distinct versions');
  });

  it('a document without the measured surface is a failure', () => {
    const problems = observationDependencyProblems(
      { 'node-crypto': { implementation: 'node:crypto', version: '24.19.0' } },
      lockfile
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no measured environment');
  });

  it('parses the packages-section key forms with and without a leading slash or quotes', () => {
    const fixture = [
      'packages:',
      '  /left@1.0.0:',
      '  right@2.0.0:',
      "  'quoted@3.0.0':",
      '  /peer@4.0.0(host@1.0.0):',
      '',
    ].join('\n');
    expect(lockfileResolvedVersions(fixture, 'left')).toEqual(['1.0.0']);
    expect(lockfileResolvedVersions(fixture, 'right')).toEqual(['2.0.0']);
    expect(lockfileResolvedVersions(fixture, 'quoted')).toEqual(['3.0.0']);
    expect(lockfileResolvedVersions(fixture, 'peer')).toEqual(['4.0.0']);
    expect(lockfileResolvedVersions(fixture, 'absent')).toEqual([]);
  });
});

describe('historical files resolve only through the recorded revision', () => {
  it('reads a committed file at an available revision and reports an unavailable one as null', () => {
    const dir = scratchRepo();
    try {
      const head = deriveSourceRevision(dir);
      expect(fileAtRevision(dir, head, 'seed.txt').toString()).toBe('seed\n');
      expect(fileAtRevision(dir, 'f'.repeat(40), 'seed.txt')).toBeNull();
      expect(fileAtRevision(dir, head, 'absent.txt')).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a malformed revision and a path that escapes the repository', () => {
    expect(() => fileAtRevision(REPO_ROOT, 'HEAD', LOCKFILE_PATH)).toThrow(/commit SHA/);
    expect(() => fileAtRevision(REPO_ROOT, 'a'.repeat(40), '../outside.txt')).toThrow(/escapes/);
    expect(() => fileAtRevision(REPO_ROOT, 'a'.repeat(40), '/etc/hosts')).toThrow(/relative/);
  });
});
