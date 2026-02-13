#!/usr/bin/env node
/**
 * Deterministic audit gate for PEAC CI (thin CLI wrapper)
 *
 * Reads pnpm audit JSON output, applies time-bounded allowlist,
 * and exits with a stable, parseable summary.
 *
 * Policy:
 *   critical -> always blocks (exit 1)
 *   high     -> blocks in strict mode (AUDIT_STRICT=1), warns otherwise
 *
 * In strict mode, expired or invalid allowlist entries also cause failure
 * (prevents allowlist fossilization).
 *
 * Usage:
 *   node scripts/audit-gate.mjs              # default: block critical, warn high
 *   AUDIT_STRICT=1 node scripts/audit-gate.mjs  # block critical + high + stale allowlist
 */

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAllowlist, extractAdvisories, classifyAdvisories } from './audit-gate-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ALLOWLIST_PATH = join(__dirname, '..', 'security', 'audit-allowlist.json');
const strict = process.env.AUDIT_STRICT === '1';

/**
 * Load and validate the allowlist from disk.
 */
function loadAllowlist() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf-8'));
  } catch {
    console.log('  allowlist: not found or invalid JSON -- no exceptions applied');
    return { active: new Map(), expired: [], invalid: [] };
  }

  const result = parseAllowlist(raw);

  if (result.expired.length > 0) {
    console.log(
      `  allowlist: ${result.expired.length} expired (ignored): ${result.expired.join(', ')}`
    );
  }
  if (result.invalid.length > 0) {
    console.log(
      `  allowlist: ${result.invalid.length} invalid (rejected): ${result.invalid.join(', ')}`
    );
  }
  if (result.active.size > 0) {
    console.log(`  allowlist: ${result.active.size} active exceptions`);
  }

  // In strict mode, fail if any entries are expired or invalid
  if (strict && (result.expired.length > 0 || result.invalid.length > 0)) {
    const stale = result.expired.length + result.invalid.length;
    console.log(
      `FAIL: ${stale} stale/invalid allowlist entries (strict mode requires clean allowlist)`
    );
    process.exit(1);
  }

  return result;
}

/**
 * Run pnpm audit and parse JSON output.
 * Handles both single-JSON and NDJSON output shapes.
 */
function runAudit() {
  let output;
  try {
    output = execSync('pnpm audit --json 2>/dev/null', {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    // pnpm audit exits non-zero when vulnerabilities are found
    output = err.stdout || '';
  }

  if (!output.trim()) return null;

  // Try single JSON object first
  try {
    return JSON.parse(output);
  } catch {
    // Fall through to NDJSON
  }

  // Try NDJSON (newline-delimited JSON) -- merge all objects
  const merged = { advisories: {}, vulnerabilities: {} };
  let parsed = false;
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj.advisories) {
        Object.assign(merged.advisories, obj.advisories);
        parsed = true;
      }
      if (obj.vulnerabilities) {
        Object.assign(merged.vulnerabilities, obj.vulnerabilities);
        parsed = true;
      }
    } catch {
      // Skip unparseable lines
    }
  }

  return parsed ? merged : null;
}

function main() {
  console.log(`== dependency audit (${strict ? 'strict' : 'default'} mode) ==`);

  const { active: allowlist } = loadAllowlist();
  const auditResult = runAudit();

  // If JSON parsing failed, fall back to simple exit-code check
  if (!auditResult) {
    console.log('  audit JSON unavailable -- falling back to exit-code mode');
    try {
      execSync('pnpm audit --audit-level=critical 2>/dev/null', {
        stdio: 'ignore',
      });
      console.log('OK');
      process.exit(0);
    } catch {
      console.log('FAIL: pnpm audit found critical vulnerabilities');
      process.exit(1);
    }
  }

  // Extract and classify advisories
  const advisories = extractAdvisories(auditResult);
  const findings = classifyAdvisories(advisories, allowlist);

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
