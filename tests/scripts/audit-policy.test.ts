/**
 * Dependency-audit policy tests.
 *
 * A policy is only useful if it distinguishes a revision that improves the dependency state from
 * one that worsens it, while pre-existing findings neither block nor disappear.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFindings,
  computeDelta,
  classifyPath,
  normalizePath,
} from '../../scripts/audit/findings.mjs';
import {
  productionAbsolute,
  workspaceDelta,
  workspaceAbsolute,
} from '../../scripts/audit/policies.mjs';
import { AuditInputError } from '../../scripts/audit/findings.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => JSON.parse(readFileSync(join(HERE, 'fixtures', 'audit', n), 'utf8'));

const baseline = fx('baseline-with-findings.json');
const headRemoves = fx('head-removes-findings.json');
const headAddsPath = fx('head-adds-vulnerable-path.json');
const headAddsAdvisory = fx('head-adds-advisory.json');
const headWindowsPaths = fx('equivalent-windows-paths.json');

const alwaysValid = Object.assign(() => true, { errorsText: () => '' });
const neverValid = Object.assign(() => false, { errorsText: () => 'schema violation' });
const TODAY = '2026-07-31';

describe('counting model', () => {
  it('names each quantity separately and does not conflate them', () => {
    const m = buildFindings(baseline);
    expect(m.counts.rawAdvisoryRecords).toBe(3);
    expect(m.counts.affectedPackageRecords).toBe(3);
    expect(m.counts.vulnerablePaths).toBe(3);
    // registry metadata is reported but never substituted for advisory records
    expect(m.registryMetadata).toEqual({ info: 0, low: 0, moderate: 0, high: 4, critical: 0 });
    expect(m.counts.rawAdvisoryRecords).not.toBe(m.registryMetadata!.high);
  });

  it('counts paths separately from advisories', () => {
    const m = buildFindings(headAddsPath);
    expect(m.counts.rawAdvisoryRecords).toBe(3);
    expect(m.counts.vulnerablePaths).toBe(4); // one advisory gained a second path
  });

  it('produces deterministic ordering', () => {
    expect(JSON.stringify(buildFindings(baseline))).toBe(JSON.stringify(buildFindings(baseline)));
  });
});

describe('path normalization', () => {
  it('treats Windows and POSIX paths identically', () => {
    expect(normalizePath('apps\\api > x')).toBe('apps/api > x');
    const posix = buildFindings(baseline);
    const win = buildFindings(headWindowsPaths);
    expect(win.counts.vulnerablePaths).toBe(posix.counts.vulnerablePaths);
    expect(computeDelta(posix, win).regressed).toBe(false);
  });

  it('classifies unknown roots as unclassified, not as safe', () => {
    expect(classifyPath('mystery/thing > x')).toBe('unclassified');
    expect(classifyPath('examples/a > x')).toBe('example');
    expect(classifyPath('packages/kernel > x')).toBe('package');
  });
});

describe('workspace-delta', () => {
  it('PASSES a change that only removes findings, with debt remaining', () => {
    const r = workspaceDelta({ baseAuditJson: baseline, headAuditJson: headRemoves });
    expect(r.passed).toBe(true);
    expect(r.delta.removed.length).toBe(1);
    expect(r.delta.addedBlocking.length).toBe(0);
    expect(r.head.rawAdvisoryRecords).toBe(2); // debt still present, and that is fine
  });

  it('PASSES unchanged historical debt', () => {
    expect(workspaceDelta({ baseAuditJson: baseline, headAuditJson: baseline }).passed).toBe(true);
  });

  it('FAILS a new vulnerable path on an existing advisory', () => {
    const r = workspaceDelta({ baseAuditJson: baseline, headAuditJson: headAddsPath });
    expect(r.passed).toBe(false);
    expect(r.delta.addedBlocking.length).toBe(1);
  });

  it('FAILS a brand new advisory', () => {
    const r = workspaceDelta({ baseAuditJson: baseline, headAuditJson: headAddsAdvisory });
    expect(r.passed).toBe(false);
  });

  it('FAILS a severity increase', () => {
    const raised = JSON.parse(JSON.stringify(baseline));
    raised.advisories['2'].severity = 'critical';
    const r = workspaceDelta({ baseAuditJson: baseline, headAuditJson: raised });
    expect(r.passed).toBe(false);
    expect(r.delta.severityRaised[0]).toMatchObject({ from: 'high', to: 'critical' });
  });

  it('FAILS when an example dependency becomes production-reachable', () => {
    const moved = JSON.parse(JSON.stringify(baseline));
    moved.advisories['3'].findings[0].paths.push('packages/kernel > protobufjs');
    const r = workspaceDelta({ baseAuditJson: baseline, headAuditJson: moved });
    expect(r.passed).toBe(false);
    expect(r.delta.newlyProductionReachable.length).toBeGreaterThan(0);
  });

  it('fails closed when a baseline reference is absent', () => {
    expect(() => workspaceDelta({ baseAuditJson: null, headAuditJson: baseline })).toThrow(
      AuditInputError
    );
  });
});

describe('production-absolute', () => {
  it('blocks a high advisory on a production path', () => {
    const r = productionAbsolute({
      auditJson: baseline,
      exceptions: [],
      today: TODAY,
      validate: alwaysValid,
    });
    expect(r.passed).toBe(false);
    expect(r.effective.some((e: any) => e.module === 'fast-uri')).toBe(true);
  });

  it('excludes example-only paths from production policy', () => {
    const r = productionAbsolute({
      auditJson: baseline,
      exceptions: [],
      today: TODAY,
      validate: alwaysValid,
    });
    expect(r.excluded.some((e: any) => e.module === 'protobufjs')).toBe(true);
  });

  it('passes once the production finding is removed', () => {
    const onlyExample = { advisories: { '3': baseline.advisories['3'] } };
    const r = productionAbsolute({
      auditJson: onlyExample,
      exceptions: [],
      today: TODAY,
      validate: alwaysValid,
    });
    expect(r.passed).toBe(true);
  });

  it('honours a complete, unexpired, path-scoped exception', () => {
    const ex = [
      {
        advisory: 'GHSA-aaaa-1111-bbbb',
        package: 'fast-uri',
        affectedPaths: ['apps/api > @peac/receipts > ajv > fast-uri'],
        reachability: 'production-reachable',
        reason: 'documented and tracked for remediation',
        owner: 'maintainer',
        expiresOn: '2099-01-01',
        remediationIssue: 'ISSUE-1',
        fixedVersionOrMigration: '3.1.5',
      },
    ];
    const r = productionAbsolute({
      auditJson: baseline,
      exceptions: ex,
      today: TODAY,
      validate: alwaysValid,
    });
    expect(r.exceptioned.some((e: any) => e.module === 'fast-uri')).toBe(true);
  });

  it('FAILS on an expired exception rather than ignoring it', () => {
    const ex = [
      {
        advisory: 'GHSA-aaaa-1111-bbbb',
        package: 'fast-uri',
        affectedPaths: ['apps/api > @peac/receipts > ajv > fast-uri'],
        reachability: 'production-reachable',
        reason: 'documented and tracked for remediation',
        owner: 'maintainer',
        expiresOn: '2020-01-01',
        remediationIssue: 'ISSUE-1',
        fixedVersionOrMigration: '3.1.5',
      },
    ];
    const r = productionAbsolute({
      auditJson: baseline,
      exceptions: ex,
      today: TODAY,
      validate: alwaysValid,
    });
    expect(r.passed).toBe(false);
    expect(r.problems.some((p: string) => /expired/.test(p))).toBe(true);
  });

  it('FAILS on a malformed exception rather than ignoring it', () => {
    const r = productionAbsolute({
      auditJson: baseline,
      exceptions: [{ advisory: 'GHSA-x' }],
      today: TODAY,
      validate: neverValid,
    });
    expect(r.passed).toBe(false);
    expect(r.problems.some((p: string) => /malformed/.test(p))).toBe(true);
  });

  it('treats an unclassified path as production, not as safe', () => {
    const odd = {
      advisories: {
        '1': {
          github_advisory_id: 'GHSA-z',
          severity: 'high',
          module_name: 'x',
          findings: [{ paths: ['mystery/loc > x'] }],
        },
      },
    };
    const r = productionAbsolute({
      auditJson: odd,
      exceptions: [],
      today: TODAY,
      validate: alwaysValid,
    });
    expect(r.passed).toBe(false);
  });

  it('fails closed on missing or unparseable audit output', () => {
    expect(() =>
      productionAbsolute({ auditJson: null, exceptions: [], today: TODAY, validate: alwaysValid })
    ).toThrow(AuditInputError);
  });

  it('rejects an unknown severity rather than ranking it lowest', () => {
    const odd = {
      advisories: {
        '1': { module_name: 'x', severity: 'spicy', findings: [{ paths: ['packages/a > x'] }] },
      },
    };
    expect(() =>
      productionAbsolute({ auditJson: odd, exceptions: [], today: TODAY, validate: alwaysValid })
    ).toThrow(AuditInputError);
  });

  it('rejects an exception whose prefix collides with a sibling path', () => {
    const collide = {
      advisories: {
        '1': {
          github_advisory_id: 'GHSA-c',
          module_name: 'x',
          severity: 'high',
          findings: [{ paths: ['apps/api-other > x'] }],
        },
      },
    };
    const ex = [
      {
        advisory: 'GHSA-c',
        package: 'x',
        affectedPaths: ['apps/api'],
        reachability: 'production-reachable',
        reason: 'scoped to the api application only',
        owner: 'maintainer',
        expiresOn: '2099-01-01',
        remediationIssue: 'ISSUE-2',
        fixedVersionOrMigration: '1.0.0',
      },
    ];
    const r = productionAbsolute({
      auditJson: collide,
      exceptions: ex,
      today: TODAY,
      validate: alwaysValid,
    });
    expect(r.passed).toBe(false); // apps/api must not cover apps/api-other
  });

  it('reconciles its arithmetic explicitly', () => {
    const r = productionAbsolute({
      auditJson: baseline,
      exceptions: [],
      today: TODAY,
      validate: alwaysValid,
    });
    expect(r.reconciliation.reconciles).toBe(true);
    expect(r.reconciliation.lines.join('\n')).toMatch(/effectivePolicyFindings/);
  });
});

describe('workspace-absolute', () => {
  it('is advisory: completes successfully while reporting debt', () => {
    const r = workspaceAbsolute({ auditJson: baseline });
    expect(r.blocking).toBe(false);
    expect(r.passed).toBe(true);
    expect(r.debtRecords).toBe(3);
  });

  it('accepts an explicitly empty audit', () => {
    expect(workspaceAbsolute({ auditJson: { advisories: {} } }).debtRecords).toBe(0);
  });

  it('rejects a report with no advisories field, which is not the same as an empty audit', () => {
    expect(() => workspaceAbsolute({ auditJson: {} })).toThrow(AuditInputError);
  });
});
