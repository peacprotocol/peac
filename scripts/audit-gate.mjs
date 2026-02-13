#!/usr/bin/env node
/**
 * Deterministic audit gate for PEAC CI
 *
 * Reads pnpm audit JSON output, applies time-bounded allowlist,
 * and exits with a stable, parseable summary.
 *
 * Policy:
 *   critical -> always blocks (exit 1)
 *   high     -> blocks in strict mode (AUDIT_STRICT=1), warns otherwise
 *
 * Usage:
 *   node scripts/audit-gate.mjs              # default: block critical, warn high
 *   AUDIT_STRICT=1 node scripts/audit-gate.mjs  # block critical + high
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ALLOWLIST_PATH = join(__dirname, '..', 'security', 'audit-allowlist.json');
const MAX_EXPIRY_DAYS = 90;
const strict = process.env.AUDIT_STRICT === '1';

/**
 * Load and validate the allowlist. Returns active (non-expired) entries.
 * Fails closed: malformed dates or missing fields -> entry NOT allowlisted.
 */
function loadAllowlist() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf-8'));
  } catch {
    console.log('  allowlist: not found or invalid JSON -- no exceptions applied');
    return new Map();
  }

  if (!Array.isArray(raw.allowlist)) {
    console.log('  allowlist: missing "allowlist" array -- no exceptions applied');
    return new Map();
  }

  const now = new Date();
  const active = new Map();
  const expired = [];
  const invalid = [];

  for (const entry of raw.allowlist) {
    // Fail closed: all required fields must be present
    if (!entry.advisory_id || !entry.reason || !entry.expires_at || !entry.remediation || !entry.issue_url) {
      invalid.push(entry.advisory_id || '<missing id>');
      continue;
    }

    // Fail closed: date must parse
    const expiry = new Date(entry.expires_at + 'T00:00:00Z');
    if (isNaN(expiry.getTime())) {
      invalid.push(`${entry.advisory_id} (bad date: ${entry.expires_at})`);
      continue;
    }

    // Enforce max expiry window
    const daysDiff = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    if (daysDiff > MAX_EXPIRY_DAYS) {
      invalid.push(`${entry.advisory_id} (expiry ${entry.expires_at} exceeds ${MAX_EXPIRY_DAYS}-day max)`);
      continue;
    }

    if (expiry < now) {
      expired.push(entry.advisory_id);
      continue;
    }

    active.set(entry.advisory_id, entry);
  }

  if (expired.length > 0) {
    console.log(`  allowlist: ${expired.length} expired (treated as active): ${expired.join(', ')}`);
  }
  if (invalid.length > 0) {
    console.log(`  allowlist: ${invalid.length} invalid (rejected): ${invalid.join(', ')}`);
  }
  if (active.size > 0) {
    console.log(`  allowlist: ${active.size} active exceptions`);
  }

  return active;
}

/**
 * Run pnpm audit and parse JSON output.
 */
function runAudit() {
  try {
    const output = execSync('pnpm audit --json 2>/dev/null', {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(output);
  } catch (err) {
    // pnpm audit exits non-zero when vulnerabilities are found
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch {
        // Fall through to error
      }
    }
    // If we can't parse JSON, fall back to exit-code-only mode
    return null;
  }
}

function main() {
  console.log(`== dependency audit (${strict ? 'strict' : 'default'} mode) ==`);

  const allowlist = loadAllowlist();
  const auditResult = runAudit();

  // If JSON parsing failed, fall back to simple exit-code check
  if (!auditResult) {
    console.log('  audit JSON unavailable -- falling back to exit-code mode');
    try {
      execSync('pnpm audit --audit-level=critical 2>/dev/null', { stdio: 'ignore' });
      console.log('OK');
      process.exit(0);
    } catch {
      console.log('FAIL: pnpm audit found critical vulnerabilities');
      process.exit(1);
    }
  }

  // Parse advisories from pnpm audit JSON
  const advisories = auditResult.advisories || auditResult.vulnerabilities || {};
  const findings = { critical: [], high: [], moderate: [], low: [] };

  for (const [id, advisory] of Object.entries(advisories)) {
    const severity = advisory.severity || 'unknown';
    const ghsaId = advisory.ghpiId || advisory.github_advisory_id || id;

    // Check allowlist
    if (allowlist.has(ghsaId) || allowlist.has(id)) {
      continue;
    }

    if (severity === 'critical') findings.critical.push(id);
    else if (severity === 'high') findings.high.push(id);
    else if (severity === 'moderate') findings.moderate.push(id);
    else findings.low.push(id);
  }

  // Summary
  const parts = [];
  if (findings.critical.length) parts.push(`${findings.critical.length} critical`);
  if (findings.high.length) parts.push(`${findings.high.length} high`);
  if (findings.moderate.length) parts.push(`${findings.moderate.length} moderate`);
  if (findings.low.length) parts.push(`${findings.low.length} low`);

  if (parts.length === 0) {
    console.log('OK (no unallowlisted vulnerabilities)');
    process.exit(0);
  }

  console.log(`  found: ${parts.join(', ')}`);

  // Critical always blocks
  if (findings.critical.length > 0) {
    console.log(`FAIL: ${findings.critical.length} critical vulnerabilities`);
    process.exit(1);
  }

  // High blocks in strict mode only
  if (strict && findings.high.length > 0) {
    console.log(`FAIL: ${findings.high.length} high vulnerabilities (strict mode)`);
    process.exit(1);
  }

  if (findings.high.length > 0) {
    console.log(`WARNING: ${findings.high.length} high vulnerabilities -- review before release`);
  }

  console.log('OK');
  process.exit(0);
}

main();
