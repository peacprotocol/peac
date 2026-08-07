/**
 * Canonical evidence provenance for the Ed25519 runtime observations.
 *
 * One implementation, shared by the measurement tools and the integrity checks.
 *
 * Every digest is over unmodified file bytes. Paths are repository-relative and normalized.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, fstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve } from 'node:path';

/** Repository-relative path of the normative corpus. */
export const CORPUS_PATH = 'specs/conformance/parity-corpus/ed25519-peac-profile/vectors.json';

/** Repository-relative path of the workspace lockfile. */
export const LOCKFILE_PATH = 'pnpm-lock.yaml';

/** Repository-relative path of the built artifact the browser wrapper measures. */
export const MEASURED_ARTIFACT_PATH = 'packages/crypto/dist/index.mjs';

/**
 * Production sources whose bytes determine the PEAC verification decision being measured.
 *
 * Sorted and fixed: this set defines what the evidence attests to.
 */
export const PRODUCTION_SOURCES = Object.freeze([
  'packages/crypto/src/ed25519.ts',
  'packages/crypto/src/internal/ed25519-admissibility.ts',
]);

/**
 * Lockfile-resolved dependencies that participate in a measured surface. Browser engines and
 * runners are installed outside the workspace, Node and Go are toolchains, and the PEAC wrapper
 * is bound by its artifact and source-manifest digests; none of those bind through the lockfile.
 */
export const MEASUREMENT_DEPENDENCIES = Object.freeze([
  Object.freeze({ package: '@noble/ed25519', implementationPrefix: 'noble:' }),
]);

export const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

/**
 * Reads a repository-relative path, refusing traversal, absolute paths, symlinks that escape the
 * repository, and anything that is not a regular file.
 */
export function readRepositoryFile(repoRoot, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error('a repository-relative path is required');
  }
  if (isAbsolute(relativePath)) throw new Error(`path must be relative: ${relativePath}`);
  const normalized = normalize(relativePath);
  if (normalized.startsWith('..') || normalized.split('/').includes('..')) {
    throw new Error(`path escapes the repository: ${relativePath}`);
  }
  const absolute = join(resolve(repoRoot), normalized);
  const real = realpathSync(absolute);
  const rootReal = realpathSync(resolve(repoRoot));
  if (relative(rootReal, real).startsWith('..')) {
    throw new Error(`path resolves outside the repository: ${relativePath}`);
  }
  // One descriptor for the type check and the read, so the file cannot change between them.
  const fd = openSync(real, 'r');
  try {
    if (!fstatSync(fd).isFile()) throw new Error(`not a regular file: ${relativePath}`);
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}

export const fileDigest = (repoRoot, relativePath) =>
  sha256(readRepositoryFile(repoRoot, relativePath));

/**
 * Digest over the production sources: one `path digest` line per file, sorted by path, joined by
 * newlines. Duplicate paths are rejected.
 */
export function productionSourceManifestDigest(repoRoot, sources = PRODUCTION_SOURCES) {
  const paths = [...sources].sort();
  if (new Set(paths).size !== paths.length) {
    throw new Error('the production source set contains a duplicate path');
  }
  const lines = paths.map((path) => `${path} ${fileDigest(repoRoot, path)}`);
  return sha256(Buffer.from(lines.join('\n')));
}

/**
 * The commit whose sources are being measured, derived from Git rather than accepted from a
 * caller. Requires a clean worktree.
 */
export function deriveSourceRevision(repoRoot) {
  const git = (args) =>
    execFileSync('git', ['-C', resolve(repoRoot), ...args], { encoding: 'utf8' }).trim();

  let revision;
  try {
    revision = git(['rev-parse', 'HEAD']);
  } catch (err) {
    throw new Error(`cannot determine the source revision from Git: ${err.message}`);
  }
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error(`git rev-parse HEAD returned an unexpected value: ${revision}`);
  }

  const dirty = git(['status', '--porcelain=v2']);
  if (dirty.length > 0) {
    throw new Error(
      `refusing to measure a dirty worktree.\n${dirty.split('\n').slice(0, 10).join('\n')}`
    );
  }
  return revision;
}

/**
 * Distinct versions a pnpm lockfile resolves for a package, sorted. Reads the packages-section
 * keys in their slash, bare and quoted forms, ignoring peer suffixes. An unrecognized format
 * yields an empty result, which callers must treat as a failure.
 */
export function lockfileResolvedVersions(lockfileText, packageName) {
  if (typeof lockfileText !== 'string' || lockfileText.length === 0) {
    throw new Error('lockfile text is required');
  }
  if (typeof packageName !== 'string' || packageName.length === 0) {
    throw new Error('a package name is required');
  }
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const key = new RegExp(`^  ['"]?/?${escaped}@([0-9][^:('"]*)`, 'gm');
  const versions = new Set();
  for (const match of lockfileText.matchAll(key)) {
    versions.add(match[1]);
  }
  return [...versions].sort();
}

/**
 * Applicability of recorded observation environments to a lockfile: every measurement-relevant
 * dependency must resolve to exactly its measured version. Returns problems; empty means
 * applicable. The recorded lockfile digest is provenance of the measurement event and is not
 * compared against the current lockfile.
 */
export function observationDependencyProblems(environments, lockfileText) {
  const problems = [];
  for (const dependency of MEASUREMENT_DEPENDENCIES) {
    const measured = Object.entries(environments).filter(
      ([, environment]) =>
        typeof environment.implementation === 'string' &&
        environment.implementation.startsWith(dependency.implementationPrefix)
    );
    if (measured.length === 0) {
      problems.push(`${dependency.package}: no measured environment records it`);
      continue;
    }
    const recorded = new Set(measured.map(([, environment]) => environment.version));
    if (recorded.size !== 1) {
      problems.push(
        `${dependency.package}: environments record ${recorded.size} distinct versions: ${[...recorded].sort().join(', ')}`
      );
      continue;
    }
    const [measuredVersion] = recorded;
    const resolved = lockfileResolvedVersions(lockfileText, dependency.package);
    if (resolved.length === 0) {
      problems.push(`${dependency.package}: the lockfile resolves no version`);
    } else if (resolved.length > 1) {
      problems.push(
        `${dependency.package}: the lockfile resolves multiple versions: ${resolved.join(', ')}`
      );
    } else if (resolved[0] !== measuredVersion) {
      problems.push(
        `${dependency.package}: measured ${measuredVersion}, the lockfile resolves ${resolved[0]}`
      );
    }
  }
  return problems;
}

/**
 * Bytes of a repository-relative path at a revision, or null when the revision's objects are
 * not present locally. Nothing is fetched.
 */
export function fileAtRevision(repoRoot, revision, relativePath) {
  if (typeof revision !== 'string' || !/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error(`a full lowercase commit SHA is required: ${revision}`);
  }
  if (typeof relativePath !== 'string' || relativePath.length === 0 || isAbsolute(relativePath)) {
    throw new Error(`a repository-relative path is required: ${relativePath}`);
  }
  const normalized = normalize(relativePath);
  if (normalized.startsWith('..') || normalized.split('/').includes('..')) {
    throw new Error(`path escapes the repository: ${relativePath}`);
  }
  const spec = `${revision}:${normalized}`;
  const options = { cwd: resolve(repoRoot), stdio: ['ignore', 'pipe', 'pipe'] };
  try {
    execFileSync('git', ['cat-file', '-e', spec], options);
  } catch {
    return null;
  }
  return execFileSync('git', ['cat-file', 'blob', spec], {
    ...options,
    maxBuffer: 256 * 1024 * 1024,
  });
}

/**
 * Resolves the revision to record. A supplied value is permitted only when it equals the derived
 * one.
 */
export function resolveSourceRevision(repoRoot, supplied) {
  const derived = deriveSourceRevision(repoRoot);
  if (supplied !== null && supplied !== undefined) {
    if (supplied !== derived) {
      throw new Error(
        `--source-revision ${supplied} does not match the checked-out revision ${derived}`
      );
    }
  }
  return derived;
}
