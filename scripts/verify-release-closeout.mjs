#!/usr/bin/env node
/**
 * Post-release truth reconciler.
 *
 * Audits, for a given release version, that every public and local
 * release-state surface is coherent end to end:
 *
 *   1. npm `latest` dist-tag equals the version across every package in
 *      `scripts/publish-manifest.json` (or a targeted subset via --package).
 *      Skipped when --stage=publish (Mode 2 mid-soak).
 *   2. npm `next` dist-tag equals the version (Mode 2 stage) or is at
 *      least at the version (Mode 2 post-promote). Skipped for Mode 1.
 *   3. Git tag `v<version>` exists and points at a commit reachable from
 *      origin/main.
 *   4. A GitHub Release exists at the tag with the expected draft /
 *      prerelease state for the declared stage:
 *        --stage=publish   -> draft or prerelease is expected.
 *        --stage=promote   -> non-draft, non-prerelease.
 *        --stage=mode1     -> non-draft, non-prerelease (single-step latest).
 *   5. `docs/releases/facts.json` has release_date set and dist_tag
 *      aligned with the current stage.
 *   6. `docs/releases/current.json` has version equal to the given version.
 *   7. `REPO_SURFACE_STATUS.json` updated within the last 24 hours (best
 *      effort; set --max-updated-age-hours to override; pass 0 to skip).
 *
 * The reconciler reads npm state via `npm view` and GitHub Release state
 * via `gh release view`. Network failures are reported; offline runs can
 * pass --skip-remote to verify local artifacts only.
 *
 * Usage:
 *   node scripts/verify-release-closeout.mjs --version 0.12.13 --stage promote
 *   node scripts/verify-release-closeout.mjs --version 0.12.13 --stage publish
 *   node scripts/verify-release-closeout.mjs --version 0.12.13 --stage mode1
 *   node scripts/verify-release-closeout.mjs --version 0.12.13 --skip-remote
 *
 * Exit codes:
 *   0  All rows GREEN.
 *   1  At least one row RED or YELLOW with --strict.
 *   2  Usage error.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
let version = null;
let stage = null;
let skipRemote = false;
let strict = false;
let jsonOutput = false;
let maxUpdatedAgeHours = 24;
const targetedPackages = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  // Accept a standalone "--" sentinel so invocations like
  // `pnpm run verify:release-closeout -- --version 0.12.13 --stage promote`
  // pass through cleanly; pnpm forwards the sentinel as a literal arg.
  if (a === '--') continue;
  if (a === '--version' && args[i + 1]) {
    version = args[i + 1];
    i += 1;
  } else if (a === '--stage' && args[i + 1]) {
    stage = args[i + 1];
    i += 1;
  } else if (a === '--package' && args[i + 1]) {
    targetedPackages.push(args[i + 1]);
    i += 1;
  } else if (a === '--max-updated-age-hours' && args[i + 1]) {
    maxUpdatedAgeHours = Number(args[i + 1]);
    i += 1;
  } else if (a === '--skip-remote') {
    skipRemote = true;
  } else if (a === '--strict') {
    strict = true;
  } else if (a === '--json') {
    jsonOutput = true;
  } else {
    process.stderr.write(`unknown argument: ${a}\n`);
    process.exit(2);
  }
}

if (!version) {
  process.stderr.write(
    'usage: verify-release-closeout.mjs --version <X.Y.Z> --stage <publish|promote|mode1> [--skip-remote] [--strict] [--json]\n'
  );
  process.exit(2);
}

if (!stage || !['publish', 'promote', 'mode1'].includes(stage)) {
  process.stderr.write(
    'error: --stage must be one of publish, promote, mode1\n'
  );
  process.exit(2);
}

const rows = [];

function row(name, status, detail) {
  rows.push({ name, status, detail });
}

function loadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    return { __error: err.message };
  }
}

function run(cmd, cmdArgs, opts = {}) {
  try {
    return execFileSync(cmd, cmdArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      ...opts,
    }).trim();
  } catch (_err) {
    return null;
  }
}

// 1 & 2. npm dist-tag reconciliation.
const manifestPath = resolve(REPO_ROOT, 'scripts/publish-manifest.json');
const manifest = loadJson(manifestPath);
const packages =
  targetedPackages.length > 0
    ? targetedPackages
    : (manifest.packages || []);

if (skipRemote) {
  row('npm-dist-tags', 'YELLOW', 'skipped via --skip-remote');
} else if (packages.length === 0) {
  row('npm-dist-tags', 'RED', 'publish manifest is empty or unreadable');
} else {
  let latestMatch = 0;
  let latestMismatch = [];
  let nextMatch = 0;
  let nextMismatch = [];
  for (const pkg of packages) {
    const distTags = run('npm', ['view', pkg, 'dist-tags', '--json']);
    if (!distTags) {
      latestMismatch.push(`${pkg} (npm view failed)`);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(distTags);
    } catch {
      latestMismatch.push(`${pkg} (malformed npm view output)`);
      continue;
    }
    if (parsed.latest === version) latestMatch += 1;
    else latestMismatch.push(`${pkg} latest=${parsed.latest}`);
    if (parsed.next === version) nextMatch += 1;
    else nextMismatch.push(`${pkg} next=${parsed.next}`);
  }

  if (stage === 'publish') {
    if (nextMismatch.length === 0) {
      row('npm-next', 'GREEN', `${nextMatch}/${packages.length} packages at next=${version}`);
    } else {
      row(
        'npm-next',
        'RED',
        `${nextMatch}/${packages.length} packages at next=${version}; mismatches: ${nextMismatch.slice(0, 5).join(', ')}${nextMismatch.length > 5 ? `; +${nextMismatch.length - 5} more` : ''}`
      );
    }
    row('npm-latest', 'YELLOW', 'not audited at stage=publish (latest is pre-promotion)');
  } else {
    if (latestMismatch.length === 0) {
      row('npm-latest', 'GREEN', `${latestMatch}/${packages.length} packages at latest=${version}`);
    } else {
      row(
        'npm-latest',
        'RED',
        `${latestMatch}/${packages.length} packages at latest=${version}; mismatches: ${latestMismatch.slice(0, 5).join(', ')}${latestMismatch.length > 5 ? `; +${latestMismatch.length - 5} more` : ''}`
      );
    }
    if (stage === 'promote') {
      if (nextMismatch.length === 0) {
        row('npm-next', 'GREEN', `${nextMatch}/${packages.length} packages at next=${version}`);
      } else {
        row(
          'npm-next',
          'YELLOW',
          `${nextMatch}/${packages.length} packages at next=${version}; next often retains the previous soak version`
        );
      }
    } else {
      row('npm-next', 'YELLOW', 'not audited at stage=mode1');
    }
  }
}

// 3. Git tag.
const tagRef = `v${version}`;
const tagSha = run('git', ['rev-parse', '--verify', `${tagRef}^{commit}`], { cwd: REPO_ROOT });
if (!tagSha) {
  row('git-tag', 'RED', `tag ${tagRef} not found locally`);
} else {
  const reachable = run('git', ['merge-base', '--is-ancestor', tagSha, 'origin/main'], { cwd: REPO_ROOT });
  row(
    'git-tag',
    reachable !== null ? 'GREEN' : 'YELLOW',
    reachable !== null
      ? `tag ${tagRef} points at ${tagSha.slice(0, 10)} (reachable from origin/main)`
      : `tag ${tagRef} exists but origin/main reachability could not be verified (run 'git fetch origin main' if offline)`
  );
}

// 4. GitHub Release.
if (skipRemote) {
  row('github-release', 'YELLOW', 'skipped via --skip-remote');
} else {
  const releaseJson = run('gh', ['release', 'view', tagRef, '--json', 'tagName,isDraft,isPrerelease,url']);
  if (!releaseJson) {
    row('github-release', 'RED', `no GitHub Release at tag ${tagRef}`);
  } else {
    let rel;
    try {
      rel = JSON.parse(releaseJson);
    } catch {
      row('github-release', 'RED', `malformed gh release view output for ${tagRef}`);
      rel = null;
    }
    if (rel) {
      if (stage === 'publish') {
        if (rel.isDraft || rel.isPrerelease) {
          row('github-release', 'GREEN', `${tagRef} is ${rel.isDraft ? 'draft' : 'prerelease'}; stage 2 will finalize`);
        } else {
          row(
            'github-release',
            'RED',
            `${tagRef} is finalized but stage=publish expected draft/prerelease; check workflow ordering`
          );
        }
      } else {
        if (!rel.isDraft && !rel.isPrerelease) {
          row('github-release', 'GREEN', `${tagRef} is finalized (non-draft, non-prerelease)`);
        } else {
          row(
            'github-release',
            'RED',
            `${tagRef} is still ${rel.isDraft ? 'draft' : 'prerelease'}; expected finalized at stage=${stage}`
          );
        }
      }
    }
  }
}

// 5. docs/releases/facts.json.
const factsPath = resolve(REPO_ROOT, 'docs/releases/facts.json');
const facts = loadJson(factsPath);
if (facts.__error) {
  row('facts.json', 'RED', `unreadable: ${facts.__error}`);
} else {
  const releaseDate = facts.release_date;
  const distTag = facts.dist_tag;
  const facts_version = facts.version || facts.current_version;
  const problems = [];
  if (!releaseDate || releaseDate === '') problems.push('release_date is empty');
  if (facts_version && facts_version !== version) problems.push(`version=${facts_version} (expected ${version})`);
  const expectedDistTag = stage === 'publish' ? 'next' : 'latest';
  if (distTag && distTag !== expectedDistTag) {
    problems.push(`dist_tag=${distTag} (expected ${expectedDistTag})`);
  }
  row(
    'facts.json',
    problems.length === 0 ? 'GREEN' : 'RED',
    problems.length === 0
      ? `release_date=${releaseDate} dist_tag=${distTag}`
      : problems.join('; ')
  );
}

// 6. docs/releases/current.json.
const currentPath = resolve(REPO_ROOT, 'docs/releases/current.json');
const current = loadJson(currentPath);
if (current.__error) {
  row('current.json', 'RED', `unreadable: ${current.__error}`);
} else {
  const current_version = current.version || current.current_version;
  row(
    'current.json',
    current_version === version ? 'GREEN' : 'RED',
    current_version === version
      ? `version=${current_version}`
      : `version=${current_version} (expected ${version})`
  );
}

// 7. REPO_SURFACE_STATUS.json updated date.
if (maxUpdatedAgeHours === 0) {
  row('repo-surface-status', 'YELLOW', 'skipped via --max-updated-age-hours 0');
} else {
  const surfacePath = resolve(REPO_ROOT, 'REPO_SURFACE_STATUS.json');
  const surface = loadJson(surfacePath);
  if (surface.__error) {
    row('repo-surface-status', 'RED', `unreadable: ${surface.__error}`);
  } else {
    const updated = surface.updated || surface.last_updated;
    if (!updated) {
      row('repo-surface-status', 'RED', 'updated field missing');
    } else {
      const ts = Date.parse(updated);
      if (Number.isNaN(ts)) {
        row('repo-surface-status', 'RED', `updated=${updated} is not a parseable date`);
      } else {
        const ageHours = (Date.now() - ts) / (60 * 60 * 1000);
        if (ageHours <= maxUpdatedAgeHours) {
          row('repo-surface-status', 'GREEN', `updated=${updated} (${ageHours.toFixed(1)}h old)`);
        } else {
          row(
            'repo-surface-status',
            'YELLOW',
            `updated=${updated} is ${ageHours.toFixed(1)}h old (> ${maxUpdatedAgeHours}h); run pnpm release:stamp before finalizing`
          );
        }
      }
    }
  }
}

const reds = rows.filter((r) => r.status === 'RED');
const yellows = rows.filter((r) => r.status === 'YELLOW');
const greens = rows.filter((r) => r.status === 'GREEN');

if (jsonOutput) {
  process.stdout.write(
    JSON.stringify(
      {
        version,
        stage,
        rows,
        counts: { GREEN: greens.length, YELLOW: yellows.length, RED: reds.length },
      },
      null,
      2
    ) + '\n'
  );
} else {
  process.stdout.write(`verify-release-closeout: version=${version} stage=${stage}\n`);
  for (const r of rows) {
    process.stdout.write(`  [${r.status}] ${r.name}: ${r.detail}\n`);
  }
  process.stdout.write(
    `summary: ${greens.length} GREEN / ${yellows.length} YELLOW / ${reds.length} RED\n`
  );
}

if (reds.length > 0) process.exit(1);
if (strict && yellows.length > 0) process.exit(1);
process.exit(0);
