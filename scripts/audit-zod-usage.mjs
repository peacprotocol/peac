#!/usr/bin/env node
/**
 * Zod API Usage Audit
 *
 * Scans PEAC packages for Zod API usage patterns that need attention
 * during Zod 4 migration. Reports:
 * - .superRefine() (deprecated in Zod 4, replace with .check())
 * - .strict() (still available but z.strictObject() preferred)
 * - .describe() (verify MCP tool descriptions preserved)
 * - ZodError imports (check .errors vs .issues property usage)
 * - z.string().uuid() (stricter RFC 4122 in Zod 4)
 * - z.infer<> usage (verify types don't shift)
 *
 * Usage: node scripts/audit-zod-usage.mjs
 */

import { execSync } from 'node:child_process';

const PATTERNS = [
  {
    name: '.superRefine()',
    pattern: '\\.superRefine\\(',
    risk: 'HIGH',
    migration: 'Replace with .check() in Zod 4 (same semantics, new name)',
  },
  {
    name: '.strict()',
    pattern: '\\.strict\\(\\)',
    risk: 'LOW',
    migration: 'Still available for compat; optionally migrate to z.strictObject()',
  },
  {
    name: '.describe()',
    pattern: '\\.describe\\(',
    risk: 'MEDIUM',
    migration: 'Verify MCP tool descriptions preserved post-migration',
  },
  {
    name: 'ZodError import',
    pattern: 'ZodError',
    risk: 'MEDIUM',
    migration: 'Check if code accesses .errors property (renamed to .issues in Zod 4)',
  },
  {
    name: 'z.string().uuid()',
    pattern: 'z\\.string\\(\\)\\.uuid\\(\\)',
    risk: 'MEDIUM',
    migration: 'Stricter RFC 4122 in Zod 4; use z.guid() for v3-compatible behavior',
  },
  {
    name: 'z.infer<>',
    pattern: 'z\\.infer<',
    risk: 'NONE',
    migration: 'Unchanged in Zod 4; verify types after migration',
  },
  {
    name: '.refine()',
    pattern: '\\.refine\\(',
    risk: 'NONE',
    migration: 'Unchanged in Zod 4',
  },
  {
    name: '.transform()',
    pattern: '\\.transform\\(',
    risk: 'NONE',
    migration: 'Unchanged in Zod 4',
  },
  {
    name: '.pipe()',
    pattern: '\\.pipe\\(',
    risk: 'NONE',
    migration: 'Unchanged in Zod 4',
  },
];

const SCAN_PATHS = [
  'packages/schema/src/',
  'packages/control/src/',
  'packages/protocol/src/',
  'packages/policy-kit/src/',
  'packages/mcp-server/src/',
  'apps/sandbox-issuer/src/',
  'apps/api/src/',
];

function grep(pattern, paths) {
  try {
    const pathArgs = paths.join(' ');
    const result = execSync(
      `grep -rnE '${pattern}' ${pathArgs} 2>/dev/null || true`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
    return result
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

console.log('=== Zod API Usage Audit ===');
console.log(`Scanning: ${SCAN_PATHS.join(', ')}`);
console.log();

let totalFindings = 0;
const summary = [];

for (const { name, pattern, risk, migration } of PATTERNS) {
  const matches = grep(pattern, SCAN_PATHS);
  const count = matches.length;
  totalFindings += count;

  summary.push({ name, count, risk, migration });

  if (count > 0) {
    console.log(`## ${name} (${count} occurrences, risk: ${risk})`);
    console.log(`   Migration: ${migration}`);
    for (const match of matches) {
      console.log(`   ${match}`);
    }
    console.log();
  }
}

console.log('=== Summary ===');
console.log();
console.log('| API | Count | Risk | Migration |');
console.log('|-----|-------|------|-----------|');
for (const { name, count, risk, migration } of summary) {
  if (count > 0) {
    console.log(`| ${name} | ${count} | ${risk} | ${migration} |`);
  }
}
console.log();
console.log(`Total findings: ${totalFindings}`);

// Count by risk
const byRisk = {};
for (const { count, risk } of summary) {
  byRisk[risk] = (byRisk[risk] || 0) + count;
}
console.log(`By risk: HIGH=${byRisk.HIGH || 0}, MEDIUM=${byRisk.MEDIUM || 0}, LOW=${byRisk.LOW || 0}, NONE=${byRisk.NONE || 0}`);
console.log();
console.log('=== Audit Complete ===');
