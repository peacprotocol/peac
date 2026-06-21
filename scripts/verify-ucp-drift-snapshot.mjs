#!/usr/bin/env node
/**
 * UCP signing-spec drift verifier.
 *
 * Compares a vendored snapshot of signing-critical UCP invariants
 * (specs/upstream/ucp/signatures-snapshot.json) against the pinned upstream
 * signing specification, and detects when a newer upstream release appears.
 * This is a scheduled drift guard (see .github/workflows/ucp-drift.yml), not a
 * required PR check, and it makes no claim of official UCP conformance.
 *
 * Two lanes (both hard failures in --live):
 *   Lane 1 - pinned snapshot integrity: fetch the raw markdown at
 *            source.version_tag and assert every invariant token still parses.
 *   Lane 2 - latest-release detection: discover the latest upstream v* tag via
 *            `git ls-remote --tags` and fail if it differs from
 *            source.version_tag (the real upstream-change signal).
 *
 * Modes:
 *   --snapshot-only          Parse + validate the snapshot JSON only (offline).
 *   --source <markdown-file> Compare invariants against a local markdown file
 *                            (offline; used for synthetic-drift self-tests).
 *   --live                   Lane 1 (fetch pinned markdown) + Lane 2 (latest tag).
 *   --snapshot <path>        Override snapshot path (default below).
 *
 * Node built-ins only; read-only (never writes files, never opens issues).
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const DEFAULT_SNAPSHOT = 'specs/upstream/ucp/signatures-snapshot.json';
const FETCH_TIMEOUT_MS = 20_000;
// Only real UCP release tags (vYYYY-MM-DD); ignore any non-release v* tags
// (e.g. vnext, v2026-04-08-rc1) so Lane 2 never false-fails on those.
const VERSION_TAG = /^v\d{4}-\d{2}-\d{2}$/;

// Allowlisted upstream identity. Outbound network targets are derived from
// these CONSTANTS plus a regex-validated version tag -- never built from
// snapshot file fields -- so file data cannot control the request.
const EXPECTED_REPO = 'Universal-Commerce-Protocol/ucp';
const EXPECTED_PATH = 'docs/specification/signatures.md';
const EXPECTED_SPEC_URL = 'https://ucp.dev/specification/signatures/';

const REQUIRED_SOURCE_FIELDS = [
  'spec_url',
  'repo',
  'path',
  'version_tag',
  'release_published_at',
  'release_commit',
  'raw_url',
];
const REQUIRED_INVARIANT_GROUPS = [
  'standards',
  'required_signature_algorithms',
  'optional_signature_algorithms',
  'required_curves',
  'optional_curves',
  'required_digest_algorithms',
  'required_headers',
  'conditional_headers',
  'key_discovery',
  'content_digest_semantics',
];

function parseArgs(argv) {
  const args = { mode: null, source: null, snapshot: DEFAULT_SNAPSHOT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--snapshot-only') {
      args.mode = 'snapshot-only';
    } else if (a === '--live') {
      args.mode = 'live';
    } else if (a === '--source') {
      args.mode = 'source';
      args.source = argv[++i];
    } else if (a === '--snapshot') {
      args.snapshot = argv[++i];
    } else {
      throw new Error(`unknown argument: ${a}`);
    }
  }
  return args;
}

function loadSnapshot(path) {
  const snapshot = JSON.parse(readFileSync(path, 'utf8'));
  const errors = [];
  if (!snapshot.source || typeof snapshot.source !== 'object') errors.push('missing source object');
  else {
    for (const f of REQUIRED_SOURCE_FIELDS) {
      if (typeof snapshot.source[f] !== 'string' || !snapshot.source[f]) {
        errors.push(`missing source.${f}`);
      }
    }
  }
  if (!snapshot.invariants || typeof snapshot.invariants !== 'object') {
    errors.push('missing invariants object');
  } else {
    for (const g of REQUIRED_INVARIANT_GROUPS) {
      const v = snapshot.invariants[g];
      if (!Array.isArray(v) || v.length === 0 || !v.every((s) => typeof s === 'string' && s)) {
        errors.push(`invariants.${g} must be a non-empty array of strings`);
      }
    }
  }
  if (errors.length) {
    throw new Error(`invalid snapshot ${path}:\n  - ${errors.join('\n  - ')}`);
  }
  return snapshot;
}

function invariantTokens(snapshot) {
  return Object.values(snapshot.invariants).flat();
}

function missingTokens(text, snapshot) {
  return invariantTokens(snapshot).filter((t) => !text.includes(t));
}

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`fetch failed: ${url} -> HTTP ${res.status}`);
  }
  return res.text();
}

// Build the outbound URL from CONSTANTS + a regex-validated tag only.
function derivedRawUrl(versionTag) {
  if (!VERSION_TAG.test(versionTag)) {
    throw new Error(`invalid version tag: ${versionTag}`);
  }
  return `https://raw.githubusercontent.com/${EXPECTED_REPO}/${versionTag}/${EXPECTED_PATH}`;
}

// The snapshot is repo-controlled, but pin its identity to the allowlist so a
// stray edit cannot redirect the network request to an arbitrary host.
function validateExpectedSource(snapshot) {
  const { source } = snapshot;
  if (source.repo !== EXPECTED_REPO) throw new Error(`unexpected source.repo: ${source.repo}`);
  if (source.path !== EXPECTED_PATH) throw new Error(`unexpected source.path: ${source.path}`);
  if (source.spec_url !== EXPECTED_SPEC_URL) {
    throw new Error(`unexpected source.spec_url: ${source.spec_url}`);
  }
  if (!VERSION_TAG.test(source.version_tag)) {
    throw new Error(`invalid source.version_tag: ${source.version_tag}`);
  }
  const expectedRawUrl = derivedRawUrl(source.version_tag);
  if (source.raw_url !== expectedRawUrl) {
    throw new Error(`unexpected source.raw_url: ${source.raw_url} (expected ${expectedRawUrl})`);
  }
}

// Resolve the commit a pinned tag points to (deref annotated tags via ^{}).
function tagCommit(tag) {
  if (!VERSION_TAG.test(tag)) throw new Error(`invalid tag: ${tag}`);
  const out = execFileSync(
    'git',
    [
      'ls-remote',
      '--tags',
      `https://github.com/${EXPECTED_REPO}.git`,
      `refs/tags/${tag}`,
      `refs/tags/${tag}^{}`,
    ],
    { encoding: 'utf8', timeout: FETCH_TIMEOUT_MS }
  );
  const lines = out.trim().split('\n').filter(Boolean);
  const deref = lines.find((line) => line.endsWith(`refs/tags/${tag}^{}`));
  const direct = lines.find((line) => line.endsWith(`refs/tags/${tag}`));
  const selected = deref || direct;
  return selected ? selected.split('\t')[0] : null;
}

function latestVersionTag() {
  const out = execFileSync(
    'git',
    ['ls-remote', '--tags', `https://github.com/${EXPECTED_REPO}.git`, 'refs/tags/v*'],
    { encoding: 'utf8', timeout: FETCH_TIMEOUT_MS }
  );
  const tags = out
    .split('\n')
    .map((line) => line.split('\t')[1])
    .filter((ref) => ref && ref.startsWith('refs/tags/') && !ref.endsWith('^{}'))
    .map((ref) => ref.slice('refs/tags/'.length))
    .filter((tag) => VERSION_TAG.test(tag));
  if (tags.length === 0) return null;
  // The vYYYY-MM-DD scheme sorts lexically; pick the greatest.
  return [...new Set(tags)].sort().at(-1);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    usage();
    process.exit(2);
  }
  if (!args.mode) {
    usage();
    process.exit(2);
  }

  const snapshot = loadSnapshot(args.snapshot);
  validateExpectedSource(snapshot);

  if (args.mode === 'snapshot-only') {
    process.stdout.write(
      `OK: snapshot valid (${args.snapshot}); pinned ${snapshot.source.repo}@${snapshot.source.version_tag}\n`
    );
    return;
  }

  if (args.mode === 'source') {
    if (!args.source) throw new Error('--source requires a markdown file path');
    const text = readFileSync(args.source, 'utf8');
    const missing = missingTokens(text, snapshot);
    if (missing.length) {
      process.stderr.write(
        `DRIFT: ${args.source} is missing ${missing.length} signing invariant(s):\n  - ${missing.join('\n  - ')}\n`
      );
      process.exit(1);
    }
    process.stdout.write(
      `OK: ${args.source} contains all ${invariantTokens(snapshot).length} invariants\n`
    );
    return;
  }

  // --live
  const failures = [];

  // Lane 1: pinned snapshot integrity (content + the commit the tag resolves to).
  try {
    const commit = tagCommit(snapshot.source.version_tag);
    if (!commit) {
      failures.push(`Lane 1: could not resolve tag ${snapshot.source.version_tag}`);
    } else if (commit !== snapshot.source.release_commit) {
      failures.push(
        `Lane 1: pinned tag ${snapshot.source.version_tag} resolves to ${commit}, expected ${snapshot.source.release_commit}`
      );
    }
    const text = await fetchText(derivedRawUrl(snapshot.source.version_tag));
    const missing = missingTokens(text, snapshot);
    if (missing.length) {
      failures.push(
        `Lane 1 (pinned ${snapshot.source.version_tag}): missing invariant(s):\n  - ${missing.join('\n  - ')}`
      );
    } else {
      process.stdout.write(
        `Lane 1 OK: pinned ${snapshot.source.version_tag} (${snapshot.source.release_commit.slice(0, 12)}) still contains all ${invariantTokens(snapshot).length} invariants\n`
      );
    }
  } catch (err) {
    failures.push(`Lane 1: could not verify pinned source: ${err.message}`);
  }

  // Lane 2: latest-release detection (hard drift).
  try {
    const latest = latestVersionTag();
    if (!latest) {
      failures.push(`Lane 2: no v* tags found for ${snapshot.source.repo}`);
    } else if (latest !== snapshot.source.version_tag) {
      failures.push(
        `Lane 2: UCP has a newer release (${latest}) than the pinned snapshot (${snapshot.source.version_tag}). ` +
          `Review upstream signing-spec changes and update ${args.snapshot}.`
      );
    } else {
      process.stdout.write(`Lane 2 OK: latest upstream tag is the pinned ${latest}\n`);
    }
  } catch (err) {
    failures.push(`Lane 2: could not discover latest tag: ${err.message}`);
  }

  if (failures.length) {
    process.stderr.write(`\nUCP SIGNING-SPEC DRIFT DETECTED:\n- ${failures.join('\n- ')}\n`);
    process.exit(1);
  }
  process.stdout.write('OK: UCP signing-spec snapshot matches the pinned upstream release.\n');
}

function usage() {
  process.stderr.write(
    'usage: verify-ucp-drift-snapshot.mjs (--snapshot-only | --source <md> | --live) [--snapshot <path>]\n'
  );
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
