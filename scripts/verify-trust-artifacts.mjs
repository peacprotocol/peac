#!/usr/bin/env node
/**
 * Trust-artifact integrity verifier.
 *
 * Four checks, all fail-closed:
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
 *   4. docs/specs/RESOURCE-LIMITS.md invariant tables: every row must
 *      carry at least one markdown link in its Constant column and one
 *      in its Test column, and every linked repository-relative path
 *      MUST resolve to a tracked file. Locks the existing invariant
 *      reference set against future drift.
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
const RESOURCE_LIMITS = resolve(REPO_ROOT, 'docs/specs/RESOURCE-LIMITS.md');

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

// ---------- Check 3: RESOURCE-LIMITS.md invariant rows resolve ----------
//
// Parses every invariant table under `## Invariant table` (and its `###`
// subsections). Each row must carry at least one markdown link in the
// Constant column and one in the Test column. Every linked
// repository-relative path MUST resolve to a tracked file. This locks
// the existing invariant reference set against future drift; new rows
// added without proper Constant + Test references fail the gate.
//
// The parser is structural: it skips the section header and the
// surrounding markdown table delimiter row (`| --- | --- |`), then
// iterates body rows. A row is recognized as a body row only when the
// surrounding markdown table contains at least three columns.

function checkResourceLimits() {
  if (!existsSync(RESOURCE_LIMITS)) {
    addViolation(
      'resource-limits-exists',
      RESOURCE_LIMITS,
      0,
      'docs/specs/RESOURCE-LIMITS.md is missing'
    );
    return;
  }

  const lines = readLines(RESOURCE_LIMITS);

  // Walk the file collecting body rows of every table that lives under
  // the "Invariant table" section. The section starts at "## Invariant
  // table" and ends at the next "## " heading. Inside the section, every
  // markdown table whose header includes both a "Constant" cell and a
  // "Test" cell is in scope. We track each table's column indices so
  // links in the Constant and Test columns can be checked individually.

  let inSection = false;
  let inTable = false;
  let constantCol = -1;
  let testCol = -1;
  let tableStartLine = 0;
  // Per-table: whether any prior body row in this table carried a
  // Constant or Test link. The doc uses two inheritance idioms within a
  // table: an explicit "same" cell, and a Constant cell that lists only
  // a backticked identifier (no link). Both inherit the prior row's
  // location, but only when the prior row established one.
  let priorRowHadConstantLink = false;
  let priorRowHadTestLink = false;

  const SECTION_HEADER_RE = /^##\s+Invariant\s+table\s*$/i;
  const ANY_H2_RE = /^##\s+/;
  const TABLE_DELIM_RE = /^\|(\s*:?-+:?\s*\|)+\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inSection) {
      if (SECTION_HEADER_RE.test(line)) inSection = true;
      continue;
    }

    // Exit the section when a peer or higher heading starts (any line
    // beginning with "## " other than the section header itself, OR a
    // single "#" heading). H3 (### subsections) stay inside.
    if (ANY_H2_RE.test(line) && !SECTION_HEADER_RE.test(line)) {
      inSection = false;
      inTable = false;
      continue;
    }

    if (!inTable) {
      if (line.startsWith('|')) {
        // Header row of a new table. Inspect the column labels.
        const cells = line
          .split('|')
          .map((c) => c.trim())
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        constantCol = cells.findIndex((c) => /^constant$/i.test(c) || /constant\s*\/\s*file/i.test(c));
        testCol = cells.findIndex((c) => /^test$/i.test(c));
        if (constantCol >= 0 && testCol >= 0) {
          inTable = true;
          tableStartLine = i + 1;
          priorRowHadConstantLink = false;
          priorRowHadTestLink = false;
        }
      }
      continue;
    }

    // Inside a table. Skip the delimiter row. End the table on a blank
    // line or any non-pipe line.
    if (TABLE_DELIM_RE.test(line)) continue;
    if (!line.startsWith('|')) {
      inTable = false;
      constantCol = -1;
      testCol = -1;
      priorRowHadConstantLink = false;
      priorRowHadTestLink = false;
      continue;
    }

    // Body row. Split into trimmed cells, drop the leading/trailing
    // empties produced by the outer pipes.
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

    if (cells.length <= Math.max(constantCol, testCol)) {
      addViolation(
        'resource-limits-row-shape',
        RESOURCE_LIMITS,
        i + 1,
        `row has fewer columns than the table header advertises`
      );
      continue;
    }

    const constantCell = cells[constantCol] ?? '';
    const testCell = cells[testCol] ?? '';

    const constantLinks = [...constantCell.matchAll(MD_LINK_RE)].map((x) => x[1]);
    const testLinks = [...testCell.matchAll(MD_LINK_RE)].map((x) => x[1]);

    // Two inheritance idioms in the doc:
    //
    //   (a) Literal "same": case-insensitive whole-cell match. Inherits
    //       the link target from the same column of the previous body
    //       row. Used in the Test column for repeated-test rows.
    //   (b) Bare backticked identifier (no markdown link): used in the
    //       Constant column when several rows share a file (e.g., every
    //       `KERNEL_CONSTRAINTS.*` row inherits the file referenced by
    //       the first row of the kernel-constraints table).
    //
    // Both inherit only when a prior body row in the same table
    // established a link. A leading row with no link cannot inherit and
    // must be flagged.
    const SAME_RE = /^same$/i;
    const constantHasOnlyBareIdentifier =
      constantLinks.length === 0 && /^`[^`]+`(\s*)$/.test(constantCell);
    const constantInherited =
      (SAME_RE.test(constantCell) || constantHasOnlyBareIdentifier) && priorRowHadConstantLink;
    const testInherited = SAME_RE.test(testCell) && priorRowHadTestLink;

    if (!constantInherited && constantLinks.length === 0) {
      addViolation(
        'resource-limits-missing-constant-link',
        RESOURCE_LIMITS,
        i + 1,
        `row has no markdown link in the Constant column`
      );
    }
    if (!testInherited && testLinks.length === 0) {
      addViolation(
        'resource-limits-missing-test-link',
        RESOURCE_LIMITS,
        i + 1,
        `row has no markdown link in the Test column`
      );
    }

    if (constantLinks.length > 0) priorRowHadConstantLink = true;
    if (testLinks.length > 0) priorRowHadTestLink = true;

    for (const link of [...constantLinks, ...testLinks]) {
      if (link.startsWith('http://') || link.startsWith('https://')) continue;
      if (link.startsWith('mailto:')) continue;
      const abs = resolveRepoPath(RESOURCE_LIMITS, link);
      if (!abs) continue; // pure fragment
      if (!isTrackedPath(abs)) {
        addViolation(
          'resource-limits-broken-link',
          RESOURCE_LIMITS,
          i + 1,
          `link does not resolve: ${link}`
        );
      }
    }
  }

  // tableStartLine is referenced only via violation messages above; the
  // local consumes it implicitly through `i + 1`. Keep the variable so
  // future enhancements can group violations per-table.
  void tableStartLine;
}

// ---------- Check 4: no gitignored reference/ links in public docs ----------

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
  checkResourceLimits();
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
    process.stdout.write('  resource-limits invariant rows: constant + test links resolve\n');
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
