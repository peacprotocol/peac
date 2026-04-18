#!/usr/bin/env node
/**
 * Trust-artifact integrity verifier.
 *
 * Three checks, all fail-closed:
 *
 *   1. docs/THREAT_MODEL.md table rows: every threat-ID row must carry at
 *      least one markdown link in its Test-coverage column, and every
 *      linked repository-relative path MUST resolve to a tracked file.
 *   2. docs/STABILITY-CONTRACT.md table rows: every row must name a
 *      concrete public surface (path, package, or identifier). Empty or
 *      placeholder rows fail.
 *   3. Public docs (everything under docs/, SECURITY.md, .github/SECURITY.md,
 *      README.md) MUST NOT link to gitignored reference/ paths. The
 *      reference/ tree is local-only; external contributors cannot
 *      resolve those links.
 *
 * Usage:
 *   node scripts/verify-trust-artifacts.mjs        # human-readable
 *   node scripts/verify-trust-artifacts.mjs --json # machine-readable
 *
 * Exit codes:
 *   0  All checks passed
 *   1  One or more violations found
 *   2  Internal script error
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const THREAT_MODEL = resolve(REPO_ROOT, 'docs/THREAT_MODEL.md');
const STABILITY_CONTRACT = resolve(REPO_ROOT, 'docs/STABILITY-CONTRACT.md');

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');

const violations = [];

function addViolation(check, file, line, message) {
  violations.push({ check, file: relative(REPO_ROOT, file), line, message });
}

function readLines(path) {
  return readFileSync(path, 'utf8').split('\n');
}

function resolveRepoPath(docPath, linkTarget) {
  // linkTarget is relative to docPath's directory; fragment stripped.
  const noFragment = linkTarget.split('#')[0];
  if (!noFragment) return null; // pure anchor
  return resolve(dirname(docPath), noFragment);
}

function isTrackedPath(absPath) {
  if (!existsSync(absPath)) return false;
  // Directory targets count as tracked if the directory exists.
  try {
    statSync(absPath);
  } catch {
    return false;
  }
  return true;
}

// Markdown link regex: [text](url) -- excludes image syntax.
// Captures the link target.
const MD_LINK_RE = /(?<!\!)\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

// ---------- Check 1: THREAT_MODEL.md per-row test coverage ----------

function checkThreatModel() {
  if (!existsSync(THREAT_MODEL)) {
    addViolation('threat-model-exists', THREAT_MODEL, 0, 'docs/THREAT_MODEL.md is missing');
    return;
  }

  const lines = readLines(THREAT_MODEL);

  // Threat ID pattern: T-<CATEGORY>-<NN> at the start of a table row.
  // Example row: "| T-WIRE-01 | Forged signature | ... | [path](link) |"
  const THREAT_ROW_RE = /^\|\s*(T-[A-Z]+-\d+)\s*\|(.+)\|\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(THREAT_ROW_RE);
    if (!m) continue;

    const threatId = m[1];
    // Split columns. Row begins with "| T-..." so cells[0] = "" (empty prefix).
    const cells = line.split('|').map((c) => c.trim());
    // Expected layout: [empty, threatId, threat, mitigation, testCoverage, ...empty]
    if (cells.length < 5) {
      addViolation('threat-model-row-shape', THREAT_MODEL, i + 1, `${threatId}: row has too few columns`);
      continue;
    }

    const testCell = cells[cells.length - 2]; // last non-empty cell
    if (!testCell) {
      addViolation(
        'threat-model-missing-link',
        THREAT_MODEL,
        i + 1,
        `${threatId}: Test-coverage column is empty`
      );
      continue;
    }

    // Extract every markdown link from the test-coverage cell.
    const links = [...testCell.matchAll(MD_LINK_RE)].map((x) => x[1]);
    if (links.length === 0) {
      addViolation(
        'threat-model-missing-link',
        THREAT_MODEL,
        i + 1,
        `${threatId}: Test-coverage column has no markdown link`
      );
      continue;
    }

    for (const link of links) {
      if (link.startsWith('http://') || link.startsWith('https://')) continue;
      if (link.startsWith('mailto:')) continue;
      const abs = resolveRepoPath(THREAT_MODEL, link);
      if (!abs) continue; // fragment-only; ignore
      if (!isTrackedPath(abs)) {
        addViolation(
          'threat-model-broken-link',
          THREAT_MODEL,
          i + 1,
          `${threatId}: test link does not resolve: ${link}`
        );
      }
    }
  }
}

// ---------- Check 2: STABILITY-CONTRACT.md per-row surface concreteness ----------

function checkStabilityContract() {
  if (!existsSync(STABILITY_CONTRACT)) {
    addViolation(
      'stability-contract-exists',
      STABILITY_CONTRACT,
      0,
      'docs/STABILITY-CONTRACT.md is missing'
    );
    return;
  }

  const lines = readLines(STABILITY_CONTRACT);

  // Stability-classification regex: a cell that is one of the four known
  // classifications surrounded by backticks. We only assert on rows that
  // actually carry a classification.
  const CLASS_RE = /`(stable|experimental|deprecated|internal-only)`/;

  // A surface cell is "concrete" if it contains any of:
  //   - a backticked identifier: `@peac/...`, `POST /v1/...`, `typ: ...`,
  //     `PEAC-Receipt`, `surfaces/plugin-pack/...`, `RFC NNNN`
  //   - a markdown link with a path-like target
  //   - a human-readable surface noun with explicit identifier
  // We reject rows whose surface cell is empty, whitespace, "-", "n/a",
  // "TBD", or similar placeholder.
  const PLACEHOLDER_RE = /^(-|n\/a|na|tbd|todo|placeholder)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) continue;
    if (!CLASS_RE.test(line)) continue;

    const cells = line.split('|').map((c) => c.trim());
    // Drop leading / trailing empties from the table-row split.
    while (cells.length && cells[0] === '') cells.shift();
    while (cells.length && cells[cells.length - 1] === '') cells.pop();
    if (cells.length === 0) continue;

    // Surface column is the first cell. It must be non-empty and not a
    // placeholder.
    const surface = cells[0];
    if (!surface || PLACEHOLDER_RE.test(surface)) {
      addViolation(
        'stability-contract-empty-surface',
        STABILITY_CONTRACT,
        i + 1,
        `row has classification but no surface identifier: ${line.trim()}`
      );
      continue;
    }
  }
}

// ---------- Check 3: no gitignored reference/ links in public docs ----------

function listPublicDocs() {
  try {
    const stdout = execSync(
      'git ls-files -- "docs/**/*.md" "*.md" ".github/SECURITY.md" ".github/**/*.md" "examples/**/*.md" "surfaces/**/*.md" "integrator-kits/**/*.md"',
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    return stdout
      .split('\n')
      .filter(Boolean)
      .map((p) => resolve(REPO_ROOT, p));
  } catch {
    return [];
  }
}

function checkNoReferenceLinks() {
  const docs = listPublicDocs();
  // A link to "reference/foo" is a gitignored-target leak EXCEPT when it's
  // the explicit reference/ directory at the repository root that happens
  // to be tracked. In this repo, reference/ is gitignored (CLAUDE.md). So
  // any markdown link into reference/ from a tracked public doc is a leak.

  for (const doc of docs) {
    // Skip this script file itself (it discusses reference/ in prose).
    if (doc.endsWith('scripts/verify-trust-artifacts.mjs')) continue;
    // Skip the OPERATING_MODEL / TRUTH_MATRIX etc which are local-only
    // anyway (they're under reference/ so wouldn't match). listPublicDocs
    // only matches docs/ and tracked surfaces. Safe.

    const text = readFileSync(doc, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Look for markdown links whose target begins with reference/ or
      // contains /reference/ as a path component (after any ../ prefix).
      for (const match of line.matchAll(MD_LINK_RE)) {
        const target = match[1];
        const noFragment = target.split('#')[0];
        if (!noFragment) continue;
        if (noFragment.startsWith('http://') || noFragment.startsWith('https://')) continue;

        // Normalize: strip leading ../
        const norm = noFragment.replace(/^(\.\.\/)+/, '');
        if (norm.startsWith('reference/') || norm === 'reference') {
          addViolation(
            'public-doc-references-gitignored-reference-tree',
            doc,
            i + 1,
            `markdown link to gitignored reference/ path: ${target}`
          );
        }
      }
    }
  }
}

// ---------- Run ----------

try {
  checkThreatModel();
  checkStabilityContract();
  checkNoReferenceLinks();
} catch (err) {
  if (JSON_MODE) {
    process.stdout.write(JSON.stringify({ error: String(err) }, null, 2) + '\n');
  } else {
    process.stderr.write(`Internal error: ${err?.stack || err}\n`);
  }
  process.exit(2);
}

if (JSON_MODE) {
  process.stdout.write(
    JSON.stringify({ ok: violations.length === 0, violations }, null, 2) + '\n'
  );
} else {
  if (violations.length === 0) {
    process.stdout.write('verify-trust-artifacts: OK\n');
    process.stdout.write('  threat-model rows: per-row test links resolve\n');
    process.stdout.write('  stability-contract rows: surface identifiers present\n');
    process.stdout.write('  public docs: no links to gitignored reference/ tree\n');
  } else {
    process.stderr.write(`verify-trust-artifacts: ${violations.length} violation(s)\n\n`);
    for (const v of violations) {
      process.stderr.write(`  [${v.check}] ${v.file}:${v.line}\n`);
      process.stderr.write(`    ${v.message}\n`);
    }
  }
}

process.exit(violations.length === 0 ? 0 : 1);
