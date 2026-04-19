#!/usr/bin/env node
/**
 * Compliance-mapping integrity verifier.
 *
 * Scans the two standards-and-regulatory mapping docs and enforces
 * artifact-centric, non-claiming discipline. Fail-closed on any violation.
 *
 * Checks:
 *   1. Every table row in each mapping doc has a non-empty Artifact Surface
 *      column containing at least one markdown link OR the literal "-"
 *      placeholder when and only when the Coverage Qualifier is
 *      "out-of-scope for PEAC".
 *   2. Every markdown link in the Artifact Surface column resolves to a
 *      real path under the repository.
 *   3. Every row's Coverage Qualifier is in the allowed vocabulary
 *      (ALLOWED_QUALIFIERS below).
 *   4. Every row's Non-claim column begins with one of the allowed
 *      non-claim patterns (ALLOWED_NON_CLAIMS below).
 *   5. Rows whose Coverage Qualifier is supportive ("supports",
 *      "helps evidence", "provides supporting artifact for") MUST carry
 *      operator-owned action language in the Non-claim column ("operator-
 *      owned" OR "PEAC does not ..." OR "requires upstream attestation").
 *   6. No row prose is a prose-only row: every row cites at least one
 *      concrete artifact surface (markdown link) OR the row is an
 *      out-of-scope row with "-" placeholder.
 *   7. No body text in either mapping doc matches any claim-language
 *      regex in CLAIM_LANGUAGE_REGEXES.
 *
 * Usage:
 *   node scripts/verify-compliance-mappings.mjs        # human-readable
 *   node scripts/verify-compliance-mappings.mjs --json # machine-readable
 *
 * Exit codes:
 *   0  All checks passed
 *   1  One or more violations found
 *   2  Internal script error
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const MAPPINGS = [
  {
    path: resolve(REPO_ROOT, 'docs/compliance/ISO-42001-MAPPING.md'),
    name: 'ISO 42001 mapping',
    firstCellPattern: /^(Clause\s|Annex\sA\s|8\.[1-4]|Clause\s[6-9]|Clause\s10\.)/i,
  },
  {
    path: resolve(REPO_ROOT, 'docs/compliance/EU-AI-ACT-ANNEX-IV-MAPPING.md'),
    name: 'EU AI Act Annex IV mapping',
    firstCellPattern: /^[1-5](\([a-h]\))?$/,
  },
];

const ALLOWED_QUALIFIERS = new Set([
  'supports',
  'can be used as evidence toward',
  'provides primary artifact for',
  'provides supporting artifact for',
  'helps evidence',
  'out-of-scope for PEAC',
]);

const SUPPORTIVE_QUALIFIERS = new Set([
  'supports',
  'helps evidence',
  'provides supporting artifact for',
]);

// Allowed non-claim openers. The non-claim cell must begin with one of these
// strings (case-sensitive for stability). Further prose may follow.
const ALLOWED_NON_CLAIMS = [
  'PEAC does not',
  'operator-owned',
  'requires upstream attestation',
  'evidence only; not a conformance claim',
];

// Operator-owned markers for supportive-qualifier rows. Accepts the short
// label form ("operator-owned") and natural prose variants
// ("the operator owns", "the provider owns", "the deployer owns").
const OPERATOR_OWNED_MARKERS = [
  'operator-owned',
  'PEAC does not',
  'requires upstream attestation',
  'the operator owns',
  'the operator schedules',
  'the operator selects',
  'the operator determines',
  'the operator applies',
  'the provider owns',
  'the provider builds',
  'the provider documents',
  'the provider selects',
  'the deployer owns',
];

// Claim-language regex list. Every regex runs against the body text of both
// mapping docs. Any match is a violation.
const CLAIM_LANGUAGE_REGEXES = [
  /\bcertified\b/i,
  /\bcomplies\s+with\b/i,
  /\bguarantees?\b/i,
  /\bensures?\s+compliance\s+with\b/i,
  /\bmeets?\s+all\s+requirements\s+of\b/i,
  /\bfully\s+compliant\b/i,
  /\bconforms?\s+to\s+[^.]+\sin\s+full\b/i,
  /\bsatisfies?\s+(ISO|EU|Annex|Clause|Article|Regulation)\b/i,
  /\bmeets?\s+the\s+deadline\b/i,
  /\bis\s+ISO\b[^.]*\bcompliant\b/i,
  /\bis\s+[^.]*Annex[^.]*compliant\b/i,
];

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');

const violations = [];

function addViolation(check, file, line, message) {
  violations.push({
    check,
    file: relative(REPO_ROOT, file),
    line,
    message,
  });
}

function readLines(path) {
  return readFileSync(path, 'utf8').split('\n');
}

const MD_LINK_RE = /(?<!\!)\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function resolveRepoPath(docPath, linkTarget) {
  const noFragment = linkTarget.split('#')[0];
  if (!noFragment) return null;
  return resolve(dirname(docPath), noFragment);
}

function stripMdLinks(text) {
  // Replace `[text](url)` with just `text` for prose scanning.
  return text.replace(/(?<!\!)\[([^\]]+)\]\([^)\s]+(?:\s+"[^"]*")?\)/g, '$1');
}

function parseTableRow(line) {
  // Returns cells trimmed, dropping the two empty bookends.
  if (!line.startsWith('|') || !line.endsWith('|')) return null;
  const cells = line.split('|').map((c) => c.trim());
  // Drop first and last empty strings from the leading/trailing pipes.
  return cells.slice(1, -1);
}

function isTableSeparator(line) {
  return /^\|\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|$/.test(line);
}

function verifyMapping(mapping) {
  if (!existsSync(mapping.path)) {
    addViolation('mapping-file-exists', mapping.path, 0, `${mapping.name} is missing`);
    return;
  }

  const lines = readLines(mapping.path);

  // First: scan body text for claim-language regex hits (excludes table
  // rows entirely; allowed qualifiers contain "supports" etc. but claim
  // regexes target free prose). We strip markdown links to avoid false
  // positives on link text.
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.startsWith('|')) continue; // skip table rows
    if (raw.startsWith('#')) continue; // skip headings
    const stripped = stripMdLinks(raw);
    for (const re of CLAIM_LANGUAGE_REGEXES) {
      const m = stripped.match(re);
      if (!m) continue;
      // Allow the regex hit if it is inside a "PEAC does not ..." negation
      // or explicitly a non-claim statement.
      const context = stripped;
      const mIdx = context.indexOf(m[0]);
      const before = context.slice(Math.max(0, mIdx - 32), mIdx);
      if (/does not\s*$/i.test(before)) continue;
      if (/is not a\s*$/i.test(before)) continue;
      if (/not a claim\s/i.test(context)) continue;
      addViolation(
        'claim-language',
        mapping.path,
        i + 1,
        `claim-language hit (${re.source}): ${m[0]}`
      );
    }
  }

  // Table scanning: find the primary mapping table and verify each row.
  // Heuristic: look for the header row containing "Coverage qualifier" and
  // "Non-claim" as column labels. The separator row follows. Data rows
  // follow until the next blank line or heading.

  let headerLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const cells = parseTableRow(lines[i]);
    if (!cells) continue;
    const lower = cells.map((c) => c.toLowerCase());
    if (lower.includes('coverage qualifier') && lower.includes('non-claim')) {
      headerLineIdx = i;
      break;
    }
  }

  if (headerLineIdx === -1) {
    addViolation(
      'mapping-header',
      mapping.path,
      0,
      `${mapping.name}: mapping table with Coverage qualifier + Non-claim columns not found`
    );
    return;
  }

  const headerCells = parseTableRow(lines[headerLineIdx]).map((c) => c.toLowerCase());
  const colArtifact = headerCells.indexOf('artifact surface');
  const colQualifier = headerCells.indexOf('coverage qualifier');
  const colNonClaim = headerCells.indexOf('non-claim');

  if (colArtifact === -1 || colQualifier === -1 || colNonClaim === -1) {
    addViolation(
      'mapping-header-columns',
      mapping.path,
      headerLineIdx + 1,
      `${mapping.name}: header missing one of Artifact surface, Coverage qualifier, Non-claim`
    );
    return;
  }

  // Data rows start two lines after header (header + separator).
  for (let i = headerLineIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (line === '' || line.startsWith('#')) break;
    if (isTableSeparator(line)) continue;
    const cells = parseTableRow(line);
    if (!cells || cells.length !== headerCells.length) continue;

    const artifactCell = cells[colArtifact];
    const qualifierCell = cells[colQualifier];
    const nonClaimCell = cells[colNonClaim];

    // Check Coverage Qualifier vocabulary.
    if (!ALLOWED_QUALIFIERS.has(qualifierCell)) {
      addViolation(
        'qualifier-vocabulary',
        mapping.path,
        i + 1,
        `row qualifier "${qualifierCell}" not in allowed vocabulary`
      );
    }

    // Check Artifact Surface presence.
    const mdLinks = [...artifactCell.matchAll(MD_LINK_RE)].map((x) => x[1]);
    const isOutOfScope = qualifierCell === 'out-of-scope for PEAC';

    if (isOutOfScope) {
      // Accept a literal "-" placeholder OR a valid artifact link set.
      if (artifactCell !== '-' && mdLinks.length === 0) {
        addViolation(
          'out-of-scope-placeholder',
          mapping.path,
          i + 1,
          `out-of-scope row must carry "-" placeholder or valid links; got: ${artifactCell}`
        );
      }
    } else {
      if (mdLinks.length === 0) {
        addViolation(
          'missing-artifact',
          mapping.path,
          i + 1,
          `row has no markdown link in Artifact Surface column (prose-only row rejected)`
        );
      }
      for (const link of mdLinks) {
        if (link.startsWith('http://') || link.startsWith('https://')) continue;
        if (link.startsWith('mailto:')) continue;
        const abs = resolveRepoPath(mapping.path, link);
        if (!abs) continue;
        if (!existsSync(abs)) {
          addViolation(
            'broken-artifact-link',
            mapping.path,
            i + 1,
            `artifact link does not resolve: ${link}`
          );
        }
      }
    }

    // Check Non-claim opener.
    const nonClaimOk = ALLOWED_NON_CLAIMS.some((opener) => nonClaimCell.startsWith(opener));
    if (!nonClaimOk) {
      addViolation(
        'non-claim-opener',
        mapping.path,
        i + 1,
        `Non-claim cell must open with one of [${ALLOWED_NON_CLAIMS.join(' | ')}]; got: ${nonClaimCell.slice(0, 80)}`
      );
    }

    // Supportive-qualifier rows require operator-owned action language.
    if (SUPPORTIVE_QUALIFIERS.has(qualifierCell)) {
      const lowerCell = nonClaimCell.toLowerCase();
      const hasOperatorLanguage = OPERATOR_OWNED_MARKERS.some((marker) =>
        lowerCell.includes(marker.toLowerCase())
      );
      if (!hasOperatorLanguage) {
        addViolation(
          'operator-owned-required',
          mapping.path,
          i + 1,
          `supportive-qualifier row must carry operator-owned action language ([${OPERATOR_OWNED_MARKERS.join(' | ')}])`
        );
      }
    }
  }
}

try {
  for (const mapping of MAPPINGS) verifyMapping(mapping);
} catch (err) {
  if (JSON_MODE) {
    process.stdout.write(JSON.stringify({ ok: false, error: err.message }, null, 2) + '\n');
  } else {
    process.stderr.write(`verify-compliance-mappings: internal error: ${err.stack || err.message}\n`);
  }
  process.exit(2);
}

if (JSON_MODE) {
  process.stdout.write(
    JSON.stringify({ ok: violations.length === 0, violations }, null, 2) + '\n'
  );
} else if (violations.length === 0) {
  process.stdout.write('verify-compliance-mappings: OK\n');
} else {
  for (const v of violations) {
    process.stdout.write(`  ${v.file}:${v.line}  [${v.check}]  ${v.message}\n`);
  }
  process.stdout.write(`\nverify-compliance-mappings: ${violations.length} violation(s)\n`);
}

process.exit(violations.length === 0 ? 0 : 1);
