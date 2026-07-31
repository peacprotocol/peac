#!/usr/bin/env node
/**
 * Audit policy runner.
 *
 *   node scripts/audit/run-policy.mjs production-absolute
 *   node scripts/audit/run-policy.mjs workspace-delta --base <ref>
 *   node scripts/audit/run-policy.mjs workspace-absolute [--out <file>]
 *
 * Each policy prints its own reconciliation, so a reported number can always be traced back to the
 * raw advisory records it came from.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  productionAbsolute,
  workspaceDelta,
  workspaceAbsolute,
  AuditPolicyError,
} from './policies.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const policy = argv[0];
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};

/** Run pnpm audit and parse. A tool failure is a policy failure, never an empty result. */
function audit(extra = []) {
  let out;
  try {
    out = execFileSync('pnpm', ['audit', '--json', ...extra], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    // pnpm audit exits non-zero when findings exist; stdout is still the report.
    out = e.stdout;
    if (!out) throw new AuditPolicyError(`audit command produced no output: ${e.message}`);
  }
  try {
    return JSON.parse(out);
  } catch {
    throw new AuditPolicyError('audit output was not parseable JSON');
  }
}

function loadExceptions() {
  const p = resolve(ROOT, 'security/audit-exceptions.json');
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    return Array.isArray(parsed) ? parsed : (parsed.exceptions ?? []);
  } catch {
    throw new AuditPolicyError('security/audit-exceptions.json is not parseable');
  }
}

function exceptionValidator() {
  const schema = JSON.parse(
    readFileSync(resolve(ROOT, 'security/audit-exception.schema.json'), 'utf8')
  );
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const v = ajv.compile(schema);
  return Object.assign((x) => v(x), { errorsText: () => ajv.errorsText(v.errors) });
}

const today = new Date().toISOString().slice(0, 10);

try {
  if (policy === 'production-absolute') {
    const r = productionAbsolute({
      auditJson: audit(['--prod']),
      exceptions: loadExceptions(),
      today,
      validate: exceptionValidator(),
    });
    console.log('== Audit: Production Absolute (blocking) ==');
    r.reconciliation.lines.forEach((l) => console.log(l));
    r.problems.forEach((p) => console.error(`  PROBLEM  ${p}`));
    r.effective.forEach((f) =>
      console.error(`  BLOCKING ${f.severity} ${f.id} (${f.module}) ${f.paths.length} path(s)`)
    );
    console.log(r.passed ? '  RESULT: PASS' : '  RESULT: FAIL');
    process.exit(r.passed ? 0 : 1);
  }

  if (policy === 'workspace-delta') {
    const baseRef = arg('--base', 'origin/main');
    const headJson = audit();
    // Produce the base report from a clean checkout of the base ref in a temp worktree.
    const tmp = execFileSync('mktemp', ['-d'], { encoding: 'utf8' }).trim();
    execFileSync('git', ['worktree', 'add', '-q', '--detach', tmp, baseRef], { cwd: ROOT });
    let baseJson;
    try {
      execFileSync('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], {
        cwd: tmp,
        stdio: 'ignore',
      });
      let out;
      try {
        out = execFileSync('pnpm', ['audit', '--json'], {
          cwd: tmp,
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (e) {
        out = e.stdout;
      }
      baseJson = JSON.parse(out);
    } finally {
      execFileSync('git', ['worktree', 'remove', '--force', tmp], { cwd: ROOT, stdio: 'ignore' });
    }
    const r = workspaceDelta({ baseAuditJson: baseJson, headAuditJson: headJson });
    console.log('== Audit: Workspace Delta (blocking) ==');
    console.log(`  base advisories ${r.base.rawAdvisoryRecords}  paths ${r.base.vulnerablePaths}`);
    console.log(`  head advisories ${r.head.rawAdvisoryRecords}  paths ${r.head.vulnerablePaths}`);
    console.log(
      `  removed ${r.delta.removed.length}  added(blocking) ${r.delta.addedBlocking.length}`
    );
    r.delta.addedBlocking.forEach((k) => console.error(`  NEW      ${k}`));
    r.delta.severityRaised.forEach((s) => console.error(`  RAISED   ${s.id} ${s.from} -> ${s.to}`));
    r.delta.newlyProductionReachable.forEach((n) =>
      console.error(`  REACHES  ${n.id} now ${n.newClass}`)
    );
    console.log(r.passed ? '  RESULT: PASS' : '  RESULT: FAIL');
    process.exit(r.passed ? 0 : 1);
  }

  if (policy === 'workspace-absolute') {
    const r = workspaceAbsolute({ auditJson: audit() });
    console.log('== Audit: Workspace Debt Report (advisory) ==');
    console.log(`  advisory records ${r.debtRecords}   vulnerable paths ${r.debtPaths}`);
    r.records.forEach((x) =>
      console.log(
        `  ${x.severity.padEnd(8)} ${x.advisory} ${x.package} [${x.pathClasses.join(',')}] paths=${x.pathCount}`
      )
    );
    const out = arg('--out');
    if (out) {
      writeFileSync(out, JSON.stringify(r, null, 2) + '\n');
      console.log(`  wrote ${out}`);
    }
    console.log('  RESULT: ADVISORY (reported, not blocking)');
    process.exit(0);
  }

  console.error('usage: run-policy.mjs <production-absolute|workspace-delta|workspace-absolute>');
  process.exit(2);
} catch (e) {
  // Fail closed: an audit that could not run is not an audit that found nothing.
  console.error(`AUDIT POLICY ERROR: ${e.message}`);
  process.exit(1);
}
