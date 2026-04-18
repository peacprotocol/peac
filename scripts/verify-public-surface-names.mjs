#!/usr/bin/env node
/**
 * Public surface-name verifier.
 *
 * Fails CI if tracked/public artifacts reference retired filenames,
 * retired directory paths, or retired public boundary-doc headings that
 * have been consolidated under new canonical names.
 *
 * Scope (tracked files plus untracked-but-not-ignored):
 *   README.md
 *   SECURITY.md
 *   .github/SECURITY.md
 *   docs/**\/*.md
 *   examples/**\/*.md
 *   surfaces/**\/*.md
 *   packages/*\/README.md
 *
 * Excluded:
 *   CHANGELOG.md (historical)
 *   docs/maintainers/** (maintainer-facing; not public-product surface)
 *   archive/**, paper/**, node_modules/**
 *   verifier scripts themselves (would match their own pattern strings)
 *
 * Usage:
 *   node scripts/verify-public-surface-names.mjs           # human-readable
 *   node scripts/verify-public-surface-names.mjs --json    # machine-readable
 *
 * Exit codes:
 *   0  No violations
 *   1  One or more violations
 *   2  Internal script error
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');

// ---------------------------------------------------------------------------
// Objective rules. Every rule names a retired public-surface identifier and
// points consumers at the canonical replacement.
// ---------------------------------------------------------------------------

const RULES = [
  {
    id: 'retired-filename-enterprise-trust-posture',
    pattern: /ENTERPRISE_TRUST_POSTURE/,
    message:
      'retired filename "ENTERPRISE_TRUST_POSTURE" - use docs/KEY-CUSTODY-AND-TENANCY.md',
  },
  {
    id: 'retired-filename-security-posture',
    pattern: /SECURITY_POSTURE\.md/,
    message:
      'retired filename "SECURITY_POSTURE.md" - use docs/SECURITY-OPERATIONS.md',
  },
  {
    id: 'retired-path-trust-center',
    pattern: /trust-center\//,
    message: 'retired path "trust-center/" - use docs/TRUST-ARTIFACTS.md',
  },
  {
    id: 'retired-boundary-what-peac-owns',
    pattern: /\bWhat\s+PEAC\s+owns\b/,
    message:
      'retired boundary heading "What PEAC owns" - use "What PEAC standardizes"',
  },
  {
    id: 'retired-label-enterprise-trust-posture',
    pattern: /\bEnterprise\s+Trust\s+Posture\b/,
    message:
      'retired label "Enterprise Trust Posture" - use "Key custody and tenancy"',
  },
  {
    id: 'retired-label-security-posture',
    pattern: /\bSecurity\s+Posture\b/,
    message: 'retired label "Security Posture" - use "Security operations"',
  },
  {
    id: 'retired-label-trust-center',
    pattern: /\bTrust\s+center\b/,
    message: 'retired label "Trust center" - use "Trust artifacts"',
  },
];

// ---------------------------------------------------------------------------
// Scope resolution.
// ---------------------------------------------------------------------------

const PATH_INCLUDES = [
  /^README\.md$/,
  /^SECURITY\.md$/,
  /^\.github\/SECURITY\.md$/,
  /^docs\/.*\.md$/,
  /^examples\/.*\.md$/,
  /^surfaces\/.*\.md$/,
  /^packages\/[^/]+\/README\.md$/,
];

const PATH_EXCLUDES = [
  /^CHANGELOG\.md$/,
  /^docs\/maintainers\//,
  /^archive\//,
  /^paper\//,
  /^node_modules\//,
  // Verifier sources contain rule patterns as strings; skip to avoid
  // self-match on the retired names this very file documents.
  /^scripts\/verify-public-surface-names\.mjs$/,
  /^scripts\/verify-trust-artifacts\.mjs$/,
  /^scripts\/check-public-artifacts\.mjs$/,
];

function listFiles() {
  try {
    const out = execSync(
      'git ls-files -z --cached --others --exclude-standard',
      { cwd: REPO_ROOT, encoding: 'buffer' }
    );
    return out
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .filter((p) => PATH_INCLUDES.some((re) => re.test(p)))
      .filter((p) => !PATH_EXCLUDES.some((re) => re.test(p)))
      .map((p) => resolve(REPO_ROOT, p));
  } catch (err) {
    throw new Error(`git ls-files failed: ${err?.message ?? err}`);
  }
}

// ---------------------------------------------------------------------------
// Scan.
// ---------------------------------------------------------------------------

const violations = [];

function scanFile(absPath) {
  const rel = relative(REPO_ROOT, absPath);
  const text = readFileSync(absPath, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        violations.push({
          rule: rule.id,
          file: rel,
          line: i + 1,
          excerpt: line.trim().slice(0, 160),
          message: rule.message,
        });
      }
    }
  }
}

try {
  const files = listFiles();
  for (const f of files) scanFile(f);
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
    process.stdout.write('verify-public-surface-names: OK\n');
    process.stdout.write(`  scanned ${listFiles().length} tracked files\n`);
    process.stdout.write(`  enforced ${RULES.length} rules\n`);
  } else {
    process.stderr.write(
      `verify-public-surface-names: ${violations.length} violation(s)\n\n`
    );
    for (const v of violations) {
      process.stderr.write(`  [${v.rule}] ${v.file}:${v.line}\n`);
      process.stderr.write(`    ${v.message}\n`);
      process.stderr.write(`    ${v.excerpt}\n\n`);
    }
  }
}

process.exit(violations.length === 0 ? 0 : 1);
