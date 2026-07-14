#!/usr/bin/env node
/**
 * verify-github-release-npm-consistency
 *
 * Reconciles a GitHub Release against npm dist-tags for every package in
 * `scripts/publish-manifest.json`. A GitHub Release marked as the
 * repository's current Latest release must carry the same version at
 * npm's `latest` dist-tag across the whole publish manifest, not just a
 * single representative package. A finalized release that is not the
 * current Latest (a historical release) only needs the version to exist
 * on npm; it does not need to own the `latest` dist-tag.
 *
 * Import-safe: `reconcile()` and `parseReleaseTag()` are pure functions
 * with all registry access injected through `distTagsFor`, so they can be
 * unit-tested without any network or git access. The CLI behavior,
 * including the real npm- and gh-backed registry lookups, lives in
 * `main()`, which only runs when this file is executed directly.
 *
 * Usage:
 *   node scripts/verify-github-release-npm-consistency.mjs --tag v0.16.2
 *   node scripts/verify-github-release-npm-consistency.mjs --tag v0.16.2 --draft
 *   node scripts/verify-github-release-npm-consistency.mjs --tag v0.16.2 --json
 *
 * Exit codes:
 *   0  Reconciliation passed, or was skipped for a draft or prerelease release.
 *   1  A version is missing, npm latest disagrees, or a registry lookup failed.
 *   2  Usage error.
 */

import { appendFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const MANIFEST_PATH = resolve(REPO_ROOT, 'scripts/publish-manifest.json');

export const RELEASE_STATES = Object.freeze([
  'actual-latest',
  'historical-stable',
  'prerelease',
  'draft',
]);

export const ERROR_KINDS = Object.freeze({
  STATE_MISMATCH: 'STATE_MISMATCH',
  VERSION_MISSING: 'VERSION_MISSING',
  PACKAGE_MISSING: 'PACKAGE_MISSING',
  REGISTRY_TRANSIENT_FAILURE: 'REGISTRY_TRANSIENT_FAILURE',
  REGISTRY_PERMANENT_FAILURE: 'REGISTRY_PERMANENT_FAILURE',
  MALFORMED_REGISTRY_RESPONSE: 'MALFORMED_REGISTRY_RESPONSE',
  MALFORMED_GITHUB_RESPONSE: 'MALFORMED_GITHUB_RESPONSE',
  INVALID_MANIFEST: 'INVALID_MANIFEST',
  INVALID_RELEASE_TAG: 'INVALID_RELEASE_TAG',
  INVALID_RELEASE_ID: 'INVALID_RELEASE_ID',
});

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const RELEASE_TAG_PATTERN = /^v(\d+\.\d+\.\d+)$/;

/** Typed error carrying one of the ERROR_KINDS values on `.kind`. */
export class ReleaseConsistencyError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'ReleaseConsistencyError';
    this.kind = kind;
  }
}

/**
 * Parse and validate a release tag. Accepts only `vMAJOR.MINOR.PATCH`
 * (no prerelease or build suffix); this is a strict subset of the looser
 * `vMAJOR.MINOR.PATCH(-prerelease)?` grammar validated by publish.yml, so
 * every tag this function accepts is also valid there. This guard exists
 * to reconcile finalized releases against npm `latest`, which only ever
 * applies to a plain `vX.Y.Z` tag.
 *
 * Returns the version string with the leading `v` stripped.
 */
export function parseReleaseTag(tag) {
  if (typeof tag !== 'string') {
    throw new ReleaseConsistencyError(
      ERROR_KINDS.INVALID_RELEASE_TAG,
      `release tag must be a string, got ${typeof tag}`
    );
  }
  const match = RELEASE_TAG_PATTERN.exec(tag.trim());
  if (!match) {
    throw new ReleaseConsistencyError(
      ERROR_KINDS.INVALID_RELEASE_TAG,
      `release tag "${tag}" does not match the required format vMAJOR.MINOR.PATCH`
    );
  }
  return match[1];
}

/**
 * Normalize a GitHub REST release id to a canonical decimal string.
 *
 * GitHub REST release objects carry a positive integer `id`; the GraphQL API
 * (and `gh release view --json id`) carry an opaque `node_id` such as `RE_...`.
 * Only the REST numeric id is accepted, so a GraphQL node id, a fractional or
 * non-positive value, or a non-numeric string is a resolution failure rather
 * than a comparison that silently returns false. Accepts a positive safe
 * integer (number) or a string of digits with no leading zero; returns the
 * decimal-string form. Throws INVALID_RELEASE_ID on anything else.
 */
export function normalizeReleaseId(raw) {
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw) || raw <= 0 || !Number.isSafeInteger(raw)) {
      throw new ReleaseConsistencyError(
        ERROR_KINDS.INVALID_RELEASE_ID,
        `release id must be a positive safe integer, got ${raw}`
      );
    }
    return String(raw);
  }
  if (typeof raw === 'string' && /^[1-9][0-9]*$/.test(raw)) {
    return raw;
  }
  throw new ReleaseConsistencyError(
    ERROR_KINDS.INVALID_RELEASE_ID,
    `release id is not a REST numeric id: ${raw === null ? 'null' : JSON.stringify(raw)}`
  );
}

/**
 * Validate a GitHub REST release object and return the fields the reconciler
 * needs, failing closed on any shape violation. One parser is shared by the
 * releases-by-tag and releases/latest lookups. Requires a non-array object, a
 * normalized REST numeric `id`, a non-empty string `tag_name`, and boolean
 * `draft` and `prerelease` flags (no truthiness coercion, so `"false"` or a
 * missing flag is rejected, not silently treated as true or false). When
 * `expectedTag` is supplied, `tag_name` must equal it.
 */
export function parseGithubReleaseObject(value, { expectedTag } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReleaseConsistencyError(
      ERROR_KINDS.MALFORMED_GITHUB_RESPONSE,
      'GitHub release response is not an object'
    );
  }
  const id = normalizeReleaseId(value.id);
  if (typeof value.tag_name !== 'string' || value.tag_name.length === 0) {
    throw new ReleaseConsistencyError(
      ERROR_KINDS.MALFORMED_GITHUB_RESPONSE,
      `GitHub release response has no string tag_name: ${JSON.stringify(value.tag_name)}`
    );
  }
  if (typeof value.draft !== 'boolean') {
    throw new ReleaseConsistencyError(
      ERROR_KINDS.MALFORMED_GITHUB_RESPONSE,
      `GitHub release draft flag is not a boolean: ${JSON.stringify(value.draft)}`
    );
  }
  if (typeof value.prerelease !== 'boolean') {
    throw new ReleaseConsistencyError(
      ERROR_KINDS.MALFORMED_GITHUB_RESPONSE,
      `GitHub release prerelease flag is not a boolean: ${JSON.stringify(value.prerelease)}`
    );
  }
  if (expectedTag != null && value.tag_name !== expectedTag) {
    throw new ReleaseConsistencyError(
      ERROR_KINDS.MALFORMED_GITHUB_RESPONSE,
      `GitHub release tag_name ${value.tag_name} does not match the requested tag ${expectedTag}`
    );
  }
  return { id, tagName: value.tag_name, isDraft: value.draft, isPrerelease: value.prerelease };
}

/** Validate the publish manifest shape and return its package list. */
function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new ReleaseConsistencyError(
      ERROR_KINDS.INVALID_MANIFEST,
      'manifest must be an object with a packages array'
    );
  }
  const packages = manifest.packages;
  if (!Array.isArray(packages) || packages.length === 0) {
    throw new ReleaseConsistencyError(
      ERROR_KINDS.INVALID_MANIFEST,
      'manifest.packages must be a non-empty array'
    );
  }
  const seen = new Set();
  const duplicates = new Set();
  for (const entry of packages) {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new ReleaseConsistencyError(
        ERROR_KINDS.INVALID_MANIFEST,
        `manifest.packages contains a non-string entry: ${JSON.stringify(entry)}`
      );
    }
    if (seen.has(entry)) duplicates.add(entry);
    seen.add(entry);
  }
  if (duplicates.size > 0) {
    throw new ReleaseConsistencyError(
      ERROR_KINDS.INVALID_MANIFEST,
      `manifest.packages contains duplicate entries: ${[...duplicates].join(', ')}`
    );
  }
  if (typeof manifest.totalPackages === 'number' && manifest.totalPackages !== packages.length) {
    throw new ReleaseConsistencyError(
      ERROR_KINDS.INVALID_MANIFEST,
      `manifest.totalPackages=${manifest.totalPackages} does not match packages.length=${packages.length}`
    );
  }
  return packages;
}

/**
 * Reconcile a release against npm dist-tags for every package in the
 * manifest. Pure function: all registry access goes through the injected
 * `distTagsFor(pkgName)`, which returns `{ latest?, next?, versions }` or
 * throws a `ReleaseConsistencyError` (or any error carrying a `.kind`).
 *
 * `draft` and `prerelease` skip the npm `latest` invariant entirely (it
 * does not apply before a release is finalized). `historical-stable`
 * requires only that the release version exists on npm for every
 * package. `actual-latest` requires both that the version exists and
 * that npm `latest` equals it, for every package; the full package set
 * is always checked, so a later mismatch is never masked by an earlier
 * match.
 */
export function reconcile({ manifest, releaseVersion, releaseState, distTagsFor }) {
  if (!RELEASE_STATES.includes(releaseState)) {
    throw new ReleaseConsistencyError(
      ERROR_KINDS.STATE_MISMATCH,
      `releaseState must be one of ${RELEASE_STATES.join(', ')}, got ${JSON.stringify(releaseState)}`
    );
  }
  if (typeof releaseVersion !== 'string' || !VERSION_PATTERN.test(releaseVersion)) {
    throw new ReleaseConsistencyError(
      ERROR_KINDS.INVALID_RELEASE_TAG,
      `releaseVersion must be MAJOR.MINOR.PATCH with no leading "v", got ${JSON.stringify(releaseVersion)}`
    );
  }

  const packages = validateManifest(manifest);
  const packageCount = packages.length;

  if (releaseState === 'draft' || releaseState === 'prerelease') {
    return {
      ok: true,
      releaseState,
      releaseVersion,
      packageCount,
      checked: 0,
      rows: [],
      mismatches: { versionMissing: 0, latestMismatch: 0, registryErrors: 0 },
      errors: [],
      summary: `skipped (${releaseState}); the npm latest invariant does not apply until the release is finalized`,
    };
  }

  const rows = [];
  const errors = [];
  let versionMissingCount = 0;
  let latestMismatchCount = 0;
  let registryErrorCount = 0;

  for (const pkg of packages) {
    let distTags;
    try {
      distTags = distTagsFor(pkg);
    } catch (err) {
      const kind =
        err && typeof err.kind === 'string' ? err.kind : ERROR_KINDS.REGISTRY_PERMANENT_FAILURE;
      const detail = err && err.message ? err.message : String(err);
      registryErrorCount += 1;
      errors.push({ package: pkg, kind, detail });
      rows.push({
        package: pkg,
        versionExists: false,
        latest: null,
        expected: releaseVersion,
        status: `error: ${kind}`,
      });
      continue;
    }

    const versions = Array.isArray(distTags && distTags.versions) ? distTags.versions : [];
    const versionExists = versions.includes(releaseVersion);
    const latest = distTags && distTags.latest != null ? distTags.latest : null;
    const latestMatches = latest === releaseVersion;

    if (!versionExists) {
      versionMissingCount += 1;
      errors.push({
        package: pkg,
        kind: ERROR_KINDS.VERSION_MISSING,
        detail: `${pkg}@${releaseVersion} is not present in npm versions`,
      });
    }
    if (!latestMatches) {
      latestMismatchCount += 1;
      if (releaseState === 'actual-latest') {
        errors.push({
          package: pkg,
          kind: ERROR_KINDS.STATE_MISMATCH,
          detail: `${pkg} npm dist-tags.latest=${latest ?? '<none>'}, expected ${releaseVersion}`,
        });
      }
    }

    let status;
    if (!versionExists) {
      status = 'version-missing';
    } else if (releaseState === 'actual-latest' && !latestMatches) {
      status = 'latest-mismatch';
    } else if (!latestMatches) {
      status = 'ok (latest differs; not required for historical-stable)';
    } else {
      status = 'ok';
    }

    rows.push({ package: pkg, versionExists, latest, expected: releaseVersion, status });
  }

  const checked = packageCount;
  const ok =
    versionMissingCount === 0 &&
    registryErrorCount === 0 &&
    !(releaseState === 'actual-latest' && latestMismatchCount > 0);

  const summary = ok
    ? `${checked}/${checked} packages consistent at ${releaseVersion} (${releaseState})`
    : `inconsistent: ${versionMissingCount} version-missing, ` +
      `${releaseState === 'actual-latest' ? latestMismatchCount : 0} latest-mismatch, ` +
      `${registryErrorCount} registry error(s) (of ${checked} checked)`;

  return {
    ok,
    releaseState,
    releaseVersion,
    packageCount,
    checked,
    rows,
    mismatches: {
      versionMissing: versionMissingCount,
      latestMismatch: latestMismatchCount,
      registryErrors: registryErrorCount,
    },
    errors,
    summary,
  };
}

// ---------------------------------------------------------------------
// Retry policy. Exported so the bounded-retry behavior itself (attempts,
// no infinite loop, transient-only retry) is directly unit-testable with
// a fake operation and an injected no-op sleep, independent of the real
// npm/gh subprocess calls.
// ---------------------------------------------------------------------

const DEFAULT_MAX_ATTEMPTS = 8;
const RETRY_BASE_DELAY_MS = 200;
const RETRY_MAX_DELAY_MS = 2000;

function backoffDelayMs(attempt) {
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
}

function sleepSync(ms) {
  const view = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(view, 0, 0, ms);
}

/**
 * Run `operation` up to `attempts` times. Only a thrown error whose
 * `.kind` is REGISTRY_TRANSIENT_FAILURE is retried; any other error, or
 * the final attempt, is rethrown immediately. `sleep` is injected so
 * tests can pass a no-op and assert the attempt count deterministically
 * without real delays.
 */
export function withRetry(operation, options = {}) {
  const attempts = options.attempts ?? DEFAULT_MAX_ATTEMPTS;
  const sleep = options.sleep ?? sleepSync;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return { value: operation(), attempts: attempt };
    } catch (err) {
      const isTransient = err && err.kind === ERROR_KINDS.REGISTRY_TRANSIENT_FAILURE;
      if (!isTransient || attempt === attempts) {
        throw err;
      }
      sleep(backoffDelayMs(attempt));
    }
  }
  // Unreachable: the loop above always returns or throws.
  throw new ReleaseConsistencyError(
    ERROR_KINDS.REGISTRY_PERMANENT_FAILURE,
    'retry loop exited unexpectedly'
  );
}

/**
 * Decide whether a release is the repository's actual current Latest
 * release. Compares the release id when both sides provide one
 * (strongest signal), otherwise falls back to tag equality. A release
 * with `draft`/`prerelease` true is never passed through this check by
 * the CLI; `latestRelease` being absent (no Latest release resolvable)
 * means the release under test cannot be the actual latest.
 *
 * When both ids are present they must both normalize to REST numeric ids;
 * a GraphQL node id or other malformed id is a resolution failure (throws
 * INVALID_RELEASE_ID), never a silent `false` that would misclassify the
 * current Latest release as historical and skip the npm latest invariant.
 */
export function determineIsActualLatest({ tag, releaseId, latestRelease }) {
  if (!latestRelease) return false;
  if (releaseId != null && latestRelease.id != null) {
    return normalizeReleaseId(releaseId) === normalizeReleaseId(latestRelease.id);
  }
  if (tag && latestRelease.tagName) {
    return latestRelease.tagName === tag;
  }
  return false;
}

// ---------------------------------------------------------------------
// CLI-only: real npm/gh-backed registry access, argument parsing, and
// output formatting. None of this runs on import.
// ---------------------------------------------------------------------

const GH_MAX_ATTEMPTS = 4;
const NPM_VIEW_TIMEOUT_MS = 30_000;
const GH_TIMEOUT_MS = 30_000;
const MAX_BUFFER = 10 * 1024 * 1024;

const TRANSIENT_PATTERNS = [
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i,
  /ENETUNREACH/i,
  /socket hang up/i,
  /request timed out/i,
  /\b429\b/,
  /\b500\b/,
  /\b502\b/,
  /\b503\b/,
  /\b504\b/,
];

const NOT_FOUND_PATTERNS = [/\bE404\b/i, /404 Not Found/i, /is not in (this|the) registry/i];

function firstLine(text) {
  const line = (text || '').split('\n').find((l) => l.trim().length > 0);
  return line ? line.trim() : '';
}

function classifySpawnFailure(result) {
  if (result.error) {
    return { transient: false, notFound: false, detail: result.error.message };
  }
  const stderr = result.stderr || '';
  const detail = firstLine(stderr) || `exit code ${result.status}`;
  const transient = TRANSIENT_PATTERNS.some((p) => p.test(stderr));
  const notFound = !transient && NOT_FOUND_PATTERNS.some((p) => p.test(stderr));
  return { transient, notFound, detail };
}

function npmViewRaw(args) {
  const result = spawnSync('npm', ['view', ...args, '--json'], {
    encoding: 'utf8',
    timeout: NPM_VIEW_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });

  if (!result.error && result.status === 0) {
    try {
      return JSON.parse(result.stdout);
    } catch (err) {
      throw new ReleaseConsistencyError(
        ERROR_KINDS.MALFORMED_REGISTRY_RESPONSE,
        `npm view ${args.join(' ')} returned unparseable JSON: ${err.message}`
      );
    }
  }

  const { transient, notFound, detail } = classifySpawnFailure(result);
  if (notFound) {
    throw new ReleaseConsistencyError(
      ERROR_KINDS.PACKAGE_MISSING,
      `npm view ${args.join(' ')} failed: ${detail}`
    );
  }
  if (transient) {
    throw new ReleaseConsistencyError(
      ERROR_KINDS.REGISTRY_TRANSIENT_FAILURE,
      `npm view ${args.join(' ')} failed: ${detail}`
    );
  }
  throw new ReleaseConsistencyError(
    ERROR_KINDS.REGISTRY_PERMANENT_FAILURE,
    `npm view ${args.join(' ')} failed: ${detail}`
  );
}

/**
 * Build a real, npm-backed `distTagsFor` implementation plus a retry
 * counter. Two `npm view` calls per package (dist-tags, versions), each
 * independently retried per `withRetry`'s bounded transient-only policy.
 */
function createRealDistTagsFor() {
  let retryCount = 0;
  const distTagsFor = (pkgName) => {
    const distTagsResult = withRetry(() => npmViewRaw([pkgName, 'dist-tags']));
    retryCount += distTagsResult.attempts - 1;
    const versionsResult = withRetry(() => npmViewRaw([pkgName, 'versions']));
    retryCount += versionsResult.attempts - 1;

    const distTags = distTagsResult.value;
    const versions = versionsResult.value;

    if (!distTags || typeof distTags !== 'object' || Array.isArray(distTags)) {
      throw new ReleaseConsistencyError(
        ERROR_KINDS.MALFORMED_REGISTRY_RESPONSE,
        `npm view ${pkgName} dist-tags did not return an object`
      );
    }
    if (!Array.isArray(versions)) {
      throw new ReleaseConsistencyError(
        ERROR_KINDS.MALFORMED_REGISTRY_RESPONSE,
        `npm view ${pkgName} versions did not return an array`
      );
    }

    return { latest: distTags.latest, next: distTags.next, versions };
  };
  return { distTagsFor, getRetryCount: () => retryCount };
}

function ghRaw(args) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    timeout: GH_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER,
  });

  if (!result.error && result.status === 0) {
    try {
      return JSON.parse(result.stdout);
    } catch (err) {
      throw new ReleaseConsistencyError(
        ERROR_KINDS.MALFORMED_GITHUB_RESPONSE,
        `gh ${args.join(' ')} returned unparseable JSON: ${err.message}`
      );
    }
  }

  const { transient, detail } = classifySpawnFailure(result);
  if (transient) {
    throw new ReleaseConsistencyError(
      ERROR_KINDS.REGISTRY_TRANSIENT_FAILURE,
      `gh ${args.join(' ')} failed: ${detail}`
    );
  }
  throw new ReleaseConsistencyError(
    ERROR_KINDS.REGISTRY_PERMANENT_FAILURE,
    `gh ${args.join(' ')} failed: ${detail}`
  );
}

// Pin an explicit GitHub REST API version so both release lookups share one
// versioned surface and cannot drift to a moving default. Requests without a
// version currently default to 2022-11-28, but GitHub documents that the
// unversioned default can advance as older versions retire.
const GITHUB_API_VERSION = '2026-03-10';

/**
 * Build the exact `gh api` argument vector for a REST GET, pinned to a single
 * Accept header and API version. Exported so tests can assert both release
 * lookups issue the same explicitly versioned request.
 */
export function buildGithubApiArgs(endpoint) {
  return [
    'api',
    '--method',
    'GET',
    '-H',
    'Accept: application/vnd.github+json',
    '-H',
    `X-GitHub-Api-Version: ${GITHUB_API_VERSION}`,
    endpoint,
  ];
}

/** Real GitHub REST JSON lookup: one versioned `gh api` GET, parsed to an object. */
function ghApiJson(endpoint) {
  return ghRaw(buildGithubApiArgs(endpoint));
}

/**
 * Resolve a release by tag through the REST releases-by-tag endpoint. `request`
 * is injected (defaults to the real `gh api` GET) so the lookup path is
 * directly testable. The response is validated by the shared parser, so its id
 * shares the same REST id space as `fetchActualLatestRelease`; the gh CLI's
 * `release view --json id` (a GraphQL node id) is deliberately not used, since
 * it never equals the REST id and would misclassify the current Latest release
 * as historical on the dispatch and schedule paths.
 */
export function fetchReleaseByTag(tag, repo, request = ghApiJson) {
  if (!repo) {
    throw new ReleaseConsistencyError(
      ERROR_KINDS.REGISTRY_PERMANENT_FAILURE,
      'a repository slug is required to resolve a release by tag (pass --repo or set GITHUB_REPOSITORY)'
    );
  }
  const endpoint = `repos/${repo}/releases/tags/${tag}`;
  const value = withRetry(() => request(endpoint), { attempts: GH_MAX_ATTEMPTS }).value;
  return parseGithubReleaseObject(value, { expectedTag: tag });
}

/**
 * Fetch the repository's actual current Latest release through the REST
 * releases/latest endpoint. `request` is injected (defaults to the real
 * `gh api` GET). The response is validated by the same shared parser, so its
 * id shares the REST id space used by `fetchReleaseByTag`.
 */
export function fetchActualLatestRelease(repo, request = ghApiJson) {
  if (!repo) {
    throw new ReleaseConsistencyError(
      ERROR_KINDS.REGISTRY_PERMANENT_FAILURE,
      'a repository slug is required to resolve the actual latest release (pass --repo or set GITHUB_REPOSITORY)'
    );
  }
  const endpoint = `repos/${repo}/releases/latest`;
  const value = withRetry(() => request(endpoint), { attempts: GH_MAX_ATTEMPTS }).value;
  const { id, tagName } = parseGithubReleaseObject(value);
  return { id, tagName };
}

function printUsage(stream) {
  stream.write(`Usage: verify-github-release-npm-consistency.mjs --tag <vX.Y.Z> [options]

Reconciles a GitHub Release against npm dist-tags for every package in
scripts/publish-manifest.json.

Options:
  --tag <vX.Y.Z>        Release tag to reconcile (required).
  --release-id <id>     Numeric GitHub release id, when known from the event.
  --draft               The release is a draft (skips the npm latest invariant).
  --prerelease          The release is a prerelease (skips the npm latest invariant).
  --repo <owner/name>   Repository slug for release lookups.
                        Defaults to \$GITHUB_REPOSITORY.
  --json                Emit machine-readable JSON instead of a text report.
  --help                Show this message.

When --draft and --prerelease are both omitted, the release state is
looked up from GitHub directly. A non-draft, non-prerelease release is
then compared against the repository's current Latest release (not
inferred from draft/prerelease alone) to decide whether the npm latest
invariant applies.

Exit codes:
  0  Reconciliation passed, or was skipped for a draft or prerelease release.
  1  A version is missing, npm latest disagrees, or a registry lookup failed.
  2  Usage error.
`);
}

function parseArgs(argv) {
  const opts = {
    tag: null,
    releaseId: null,
    draft: false,
    draftGiven: false,
    prerelease: false,
    prereleaseGiven: false,
    repo: process.env.GITHUB_REPOSITORY || null,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      opts.help = true;
    } else if (a === '--tag' && argv[i + 1] !== undefined) {
      opts.tag = argv[i + 1];
      i += 1;
    } else if (a === '--release-id' && argv[i + 1] !== undefined) {
      opts.releaseId = argv[i + 1];
      i += 1;
    } else if (a === '--repo' && argv[i + 1] !== undefined) {
      opts.repo = argv[i + 1];
      i += 1;
    } else if (a === '--draft') {
      opts.draft = true;
      opts.draftGiven = true;
    } else if (a === '--prerelease') {
      opts.prerelease = true;
      opts.prereleaseGiven = true;
    } else if (a === '--json') {
      opts.json = true;
    } else {
      throw new Error(`unknown argument: ${a}`);
    }
  }
  return opts;
}

function printTextSummary(result, context) {
  console.log(
    `verify-github-release-npm-consistency: tag=${context.tag} version=${result.releaseVersion} state=${result.releaseState}`
  );
  console.log(
    `release id=${context.releaseId ?? '<unknown>'} actual-latest=${context.isActualLatest}`
  );
  console.log(`manifest packages=${result.packageCount} checked=${result.checked}`);
  console.log(
    `mismatches: version-missing=${result.mismatches.versionMissing} ` +
      `latest-mismatch=${result.mismatches.latestMismatch} ` +
      `registry-errors=${result.mismatches.registryErrors} retries=${context.retryCount}`
  );
  console.log(`result: ${result.ok ? 'PASS' : 'FAIL'} - ${result.summary}`);
  if (!result.ok && result.errors.length > 0) {
    console.log('');
    console.log('mismatched packages:');
    for (const e of result.errors) {
      console.log(`  ${e.package}: ${e.kind} - ${e.detail}`);
    }
  }
}

function writeStepSummary(result, context) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;

  const lines = [
    '## Release Consistency',
    '',
    `- Release: \`${context.tag}\` (id: ${context.releaseId ?? 'unknown'})`,
    `- State: \`${result.releaseState}\``,
    `- Actual latest: ${context.isActualLatest ? 'yes' : 'no'}`,
    `- Manifest packages: ${result.packageCount}`,
    `- Packages checked: ${result.checked}`,
    `- Version-missing count: ${result.mismatches.versionMissing}`,
    `- Latest-mismatch count: ${result.mismatches.latestMismatch}`,
    `- Registry-error count: ${result.mismatches.registryErrors}`,
    `- Retry count: ${context.retryCount}`,
    `- Result: ${result.ok ? 'PASS' : 'FAIL'}`,
    '',
  ];

  if (result.rows.length > 0) {
    lines.push('| package | version exists | npm latest | expected | status |');
    lines.push('|---|---|---|---|---|');
    for (const row of result.rows) {
      lines.push(
        `| ${row.package} | ${row.versionExists} | ${row.latest ?? '<none>'} | ${row.expected} | ${row.status} |`
      );
    }
  } else {
    lines.push('_Reconciliation skipped: release state is draft or prerelease._');
  }
  lines.push('');

  appendFileSync(summaryPath, lines.join('\n') + '\n', 'utf8');
}

function writeStepSummaryFailure(tag, message) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const lines = [
    '## Release Consistency',
    '',
    `- Release: \`${tag}\``,
    '- Result: FAIL (unable to resolve release state)',
    `- Detail: ${message}`,
    '',
  ];
  appendFileSync(summaryPath, lines.join('\n') + '\n', 'utf8');
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n\n`);
    printUsage(process.stderr);
    process.exit(2);
    return;
  }

  if (opts.help) {
    printUsage(process.stdout);
    process.exit(0);
    return;
  }

  if (!opts.tag) {
    printUsage(process.stderr);
    process.exit(2);
    return;
  }

  let releaseVersion;
  try {
    releaseVersion = parseReleaseTag(opts.tag);
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(2);
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (err) {
    process.stderr.write(
      `error: unable to read publish manifest at ${MANIFEST_PATH}: ${err.message}\n`
    );
    process.exit(2);
    return;
  }

  let releaseState;
  let latestRelease = null;
  let isActualLatest = false;
  let releaseId = opts.releaseId;

  try {
    let isDraft = opts.draft;
    let isPrerelease = opts.prerelease;

    if (!opts.draftGiven && !opts.prereleaseGiven) {
      const release = fetchReleaseByTag(opts.tag, opts.repo);
      isDraft = Boolean(release.isDraft);
      isPrerelease = Boolean(release.isPrerelease);
      if (releaseId == null && release.id != null) {
        releaseId = String(release.id);
      }
    }

    if (isDraft) {
      releaseState = 'draft';
    } else if (isPrerelease) {
      releaseState = 'prerelease';
    } else {
      latestRelease = fetchActualLatestRelease(opts.repo);
      isActualLatest = determineIsActualLatest({ tag: opts.tag, releaseId, latestRelease });
      releaseState = isActualLatest ? 'actual-latest' : 'historical-stable';
    }
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    process.stderr.write(`error: unable to resolve release state for ${opts.tag}: ${message}\n`);
    writeStepSummaryFailure(opts.tag, message);
    process.exit(1);
    return;
  }

  const { distTagsFor, getRetryCount } = createRealDistTagsFor();

  let result;
  try {
    result = reconcile({ manifest, releaseVersion, releaseState, distTagsFor });
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(2);
    return;
  }

  const context = {
    tag: opts.tag,
    releaseId,
    isActualLatest,
    latestReleaseTag: latestRelease ? latestRelease.tagName : null,
    retryCount: getRetryCount(),
  };

  if (opts.json) {
    process.stdout.write(JSON.stringify({ ...result, context }, null, 2) + '\n');
  } else {
    printTextSummary(result, context);
  }

  writeStepSummary(result, context);

  process.exit(result.ok ? 0 : 1);
}

const invokedDirectly =
  Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main();
}
