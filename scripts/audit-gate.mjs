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
 * Env vars:
 *   AUDIT_STRICT=1        block critical + high + stale allowlist entries
 *   PEAC_AUDIT_STRICT=1   block ANY prod vulnerability (enterprise CI, zero tolerance)
 *   PEAC_PERF_UPDATE=1    (unrelated) opt-in for perf baseline file writes
 *
 * Usage:
 *   node scripts/audit-gate.mjs                      # default: block critical, warn high
 *   AUDIT_STRICT=1 node scripts/audit-gate.mjs        # block critical + high + stale allowlist
 *   PEAC_AUDIT_STRICT=1 node scripts/audit-gate.mjs   # block ANY prod vulnerability (enterprise CI)
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAllowlist, extractAdvisories, classifyAdvisories } from './audit-gate-lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const ALLOWLIST_PATH = join(REPO_ROOT, 'security', 'audit-allowlist.json');
const strict = process.env.AUDIT_STRICT === '1';
const prodStrict = process.env.PEAC_AUDIT_STRICT === '1';

/**
 * Common spawnSync options for cross-platform pnpm invocation.
 *
 * On Windows, pnpm is a .cmd/.ps1 shim that cannot be spawned directly
 * by Node.js (EINVAL). shell: true is required for PATH + shim resolution.
 * On POSIX, shell: false avoids shell-expansion risks -- the args array
 * is passed directly to the process. This is the standard Node.js
 * cross-platform pattern for child_process.
 */
const SPAWN_OPTS = {
  encoding: /** @type {const} */ ('utf-8'),
  maxBuffer: 50 * 1024 * 1024,
  cwd: REPO_ROOT,
  shell: process.platform === 'win32',
};

/**
 * Run pnpm audit with given args, return stdout (ignoring stderr).
 * Uses spawnSync with platform-aware shell setting (see SPAWN_OPTS).
 */
function runPnpmAudit(args) {
  const result = spawnSync('pnpm', ['audit', ...args], SPAWN_OPTS);

  if (result.error) {
    if (result.error.code === 'ENOENT') {
      console.error(
        "FAIL: 'pnpm' not found. Ensure pnpm is installed and on PATH."
      );
      process.exit(1);
    }
    throw result.error;
  }

  // pnpm audit exits non-zero when vulnerabilities are found -- that's normal
  return result.stdout || '';
}

/**
 * Parse audit JSON output (handles single JSON and NDJSON).
 */
function parseAuditOutput(output) {
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

  const result = parseAllowlist(raw, new Date(), { strict });

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
 * Run a production-only audit (no allowlist).
 *
 * Policy (printed to CI logs for auditability):
 *   Default: fail on HIGH/CRITICAL in prod deps (no allowlist escape).
 *   PEAC_AUDIT_STRICT=1: fail on ANY prod vulnerability (LOW+) for enterprise CI.
 */
function runProdAudit() {
  const policyLabel = prodStrict ? 'strict (zero tolerance)' : 'default (block HIGH/CRITICAL)';
  console.log(`== production dependency audit [policy: ${policyLabel}] ==`);

  const output = runPnpmAudit(['--prod', '--json']);
  const auditResult = parseAuditOutput(output);

  if (!auditResult) {
    console.log('  prod audit: clean (no JSON output)');
    return true;
  }

  const advisories = extractAdvisories(auditResult);
  const noAllowlist = new Map();
  const findings = classifyAdvisories(advisories, noAllowlist);

  const totalFindings =
    findings.critical.length + findings.high.length +
    findings.moderate.length + findings.low.length;

  // PEAC_AUDIT_STRICT: fail on ANY prod vulnerability (enterprise CI)
  if (prodStrict && totalFindings > 0) {
    const parts = [];
    if (findings.critical.length) parts.push(`${findings.critical.length} critical`);
    if (findings.high.length) parts.push(`${findings.high.length} high`);
    if (findings.moderate.length) parts.push(`${findings.moderate.length} moderate`);
    if (findings.low.length) parts.push(`${findings.low.length} low`);
    console.log(`  prod audit FAIL: ${parts.join(', ')} (PEAC_AUDIT_STRICT requires zero prod findings)`);
    return false;
  }

  // Default: fail on HIGH/CRITICAL only
  if (findings.critical.length > 0 || findings.high.length > 0) {
    const parts = [];
    if (findings.critical.length) parts.push(`${findings.critical.length} critical`);
    if (findings.high.length) parts.push(`${findings.high.length} high`);
    console.log(`  prod audit FAIL: ${parts.join(', ')} in production dependencies`);
    console.log('  Production dependencies must be clean (no allowlist)');
    return false;
  }

  if (findings.moderate.length > 0) {
    console.log(`  prod audit WARNING: ${findings.moderate.length} moderate in prod deps`);
  }

  console.log('  prod audit: OK');
  return true;
}

function main() {
  // Phase 1: prod-only audit (must be clean, no allowlist)
  const prodClean = runProdAudit();
  if (!prodClean) {
    process.exit(1);
  }

  // Phase 2: full audit (dev + prod, allowlist applies)
  console.log(`\n== full dependency audit (${strict ? 'strict' : 'default'} mode) ==`);

  const { active: allowlist, warnings: expiryWarnings } = loadAllowlist();

  // Display expiry warnings (non-blocking)
  if (expiryWarnings && expiryWarnings.length > 0) {
    for (const w of expiryWarnings) {
      console.log(`  WARNING: ${w}`);
    }
  }

  const output = runPnpmAudit(['--json']);
  const auditResult = parseAuditOutput(output);

  // If JSON parsing failed, fall back to simple exit-code check
  if (!auditResult) {
    console.log('  audit JSON unavailable -- falling back to exit-code mode');
    const fallback = spawnSync('pnpm', ['audit', '--audit-level=critical'], {
      cwd: REPO_ROOT,
      shell: process.platform === 'win32',
      stdio: 'ignore',
    });
    if (fallback.status === 0) {
      console.log('OK');
      process.exit(0);
    } else {
      console.log('FAIL: pnpm audit found critical vulnerabilities');
      process.exit(1);
    }
  }

  // Extract and classify advisories
  const advisories = extractAdvisories(auditResult);
  const findings = classifyAdvisories(advisories, allowlist);

  // Enforce: prod-scope entries must never allowlist HIGH/CRITICAL
  // Check all advisories that were filtered out by the allowlist
  for (const adv of advisories) {
    const entry = allowlist.get(adv.id) || (adv.ghsaId && allowlist.get(adv.ghsaId));
    if (!entry) continue; // not allowlisted
    if (entry.scope === 'prod' && (adv.severity === 'critical' || adv.severity === 'high')) {
      console.log(
        `FAIL: ${adv.id} (${adv.severity}) is allowlisted with scope=prod -- ` +
          'HIGH/CRITICAL vulnerabilities in prod scope can never be allowlisted'
      );
      process.exit(1);
    }
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
