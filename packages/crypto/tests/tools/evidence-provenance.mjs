/**
 * Canonical evidence provenance for the Ed25519 runtime observations.
 *
 * One implementation, used by both the measurement tools and the integrity checks. Two
 * implementations of the same digest rule would create a parity problem of their own: the check
 * could agree with a wrong measurement.
 *
 * Every digest here is over unmodified file bytes. Paths are repository-relative and normalized.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
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
 * Sorted and fixed. Broadening or narrowing this set changes what the evidence attests to, so it is
 * declared here once rather than derived at each call site.
 */
export const PRODUCTION_SOURCES = Object.freeze([
  'packages/crypto/src/ed25519.ts',
  'packages/crypto/src/internal/ed25519-admissibility.ts',
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
  if (!statSync(real).isFile()) throw new Error(`not a regular file: ${relativePath}`);
  return readFileSync(real);
}

export const fileDigest = (repoRoot, relativePath) =>
  sha256(readRepositoryFile(repoRoot, relativePath));

/**
 * Digest over the production sources: one `path digest` line per file, sorted by path, joined by
 * newlines. Duplicate paths are rejected so the set cannot be silently inflated.
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
 * The commit whose sources are being measured, derived from Git rather than accepted from a caller.
 *
 * Requires a clean worktree: measuring a dirty checkout would attribute the result to a commit that
 * does not contain what ran.
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
      'refusing to measure a dirty worktree: evidence would name a commit that does not contain ' +
        `what ran.\n${dirty.split('\n').slice(0, 10).join('\n')}`
    );
  }
  return revision;
}

/**
 * Resolves the revision to record. A supplied value is permitted only when it equals the derived
 * one, so a caller cannot label evidence with a commit it did not measure.
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
