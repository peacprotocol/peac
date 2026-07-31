/**
 * Dependency-audit policies.
 *
 * Production policy blocks unexcepted high and critical findings on production-classified paths.
 * Delta policy blocks newly introduced or worsened findings. Workspace inventory reports the
 * complete dependency state without conflating existing findings with changes introduced by the
 * current revision.
 */
import {
  buildFindings,
  computeDelta,
  reconcile,
  BLOCKING_SEVERITIES,
  classifyPath,
  normalizePath,
  assertValidAuditInput,
} from './findings.mjs';

/** Path classes that count as production for the absolute policy. */
const PRODUCTION_CLASSES = new Set(['package', 'application', 'surface', 'unclassified']);

export class AuditPolicyError extends Error {}

/**
 * Validate exceptions and return only those that are structurally complete and unexpired.
 * Anything malformed or expired is a policy failure, never a silent skip.
 */
export function selectActiveExceptions(exceptions, today, validate) {
  const active = [];
  const problems = [];
  for (const ex of exceptions ?? []) {
    if (!validate(ex)) {
      problems.push(
        `malformed exception ${ex?.advisory ?? '(no advisory)'}: ${validate.errorsText?.() ?? 'schema violation'}`
      );
      continue;
    }
    if (ex.expiresOn < today) {
      problems.push(`expired exception ${ex.advisory} (${ex.package}) expired ${ex.expiresOn}`);
      continue;
    }
    active.push(ex);
  }
  return { active, problems };
}

/**
 * Match an exception to a finding path.
 *
 * Descendant matching is anchored at the dependency separator: an unconstrained prefix test would
 * let an exception scoped to `apps/api` also cover `apps/api-other`.
 */
const matchesException = (record, path, ex) =>
  ex.advisory === record.id &&
  ex.package === record.module &&
  ex.affectedPaths.some((prefix) => {
    const a = normalizePath(path);
    const b = normalizePath(prefix);
    return a === b || a.startsWith(`${b} > `);
  });

/**
 * production-absolute.
 *
 * Fails closed: malformed input, an unclassified path, an expired exception or an audit that could
 * not run are all failures. "We could not check" must never read as "nothing found".
 */
export function productionAbsolute({ auditJson, exceptions, today, validate }) {
  assertValidAuditInput(auditJson, 'production-absolute');
  const model = buildFindings(auditJson);
  const { active, problems } = selectActiveExceptions(exceptions, today, validate);

  const excluded = [];
  const exceptioned = [];
  const effective = [];

  for (const record of model.records) {
    if (!BLOCKING_SEVERITIES.includes(record.severity)) continue;

    const productionPaths = record.paths.filter((p) => PRODUCTION_CLASSES.has(classifyPath(p)));
    if (productionPaths.length === 0) {
      excluded.push({
        id: record.id,
        module: record.module,
        reason: 'no production-classified path',
      });
      continue;
    }
    const uncovered = productionPaths.filter(
      (p) => !active.some((ex) => matchesException(record, p, ex))
    );
    if (uncovered.length === 0) {
      exceptioned.push({ id: record.id, module: record.module, paths: productionPaths });
      continue;
    }
    effective.push({
      id: record.id,
      module: record.module,
      severity: record.severity,
      paths: uncovered,
    });
  }

  const report = reconcile({ model, excluded, exceptioned, effective });
  return {
    policy: 'production-absolute',
    blocking: true,
    passed: effective.length === 0 && problems.length === 0,
    model,
    excluded,
    exceptioned,
    effective,
    problems,
    reconciliation: report,
  };
}

/** workspace-delta: block regressions; pre-existing findings pass unchanged. */
export function workspaceDelta({ baseAuditJson, headAuditJson }) {
  assertValidAuditInput(baseAuditJson, 'workspace-delta base');
  assertValidAuditInput(headAuditJson, 'workspace-delta head');
  const base = buildFindings(baseAuditJson);
  const head = buildFindings(headAuditJson);
  const delta = computeDelta(base, head);
  return {
    policy: 'workspace-delta',
    blocking: true,
    passed: !delta.regressed,
    base: base.counts,
    head: head.counts,
    delta,
  };
}

/** workspace-absolute: advisory inventory. Reports debt; does not fail the build on it. */
export function workspaceAbsolute({ auditJson }) {
  assertValidAuditInput(auditJson, 'workspace-absolute');
  const model = buildFindings(auditJson);
  const debt = model.records.filter((r) => BLOCKING_SEVERITIES.includes(r.severity));
  return {
    policy: 'workspace-absolute',
    blocking: false,
    passed: true, // advisory: completes successfully while reporting debt truthfully
    debtRecords: debt.length,
    debtPaths: debt.reduce((n, r) => n + r.paths.length, 0),
    counts: model.counts,
    registryMetadata: model.registryMetadata,
    records: debt.map((r) => ({
      advisory: r.id,
      package: r.module,
      severity: r.severity,
      pathClasses: r.pathClasses,
      pathCount: r.paths.length,
      patchedVersions: r.patchedVersions,
      url: r.url,
    })),
  };
}
