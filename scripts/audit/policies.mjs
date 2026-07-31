/**
 * The three audit policies.
 *
 *   production-absolute  zero unexcepted high/critical reaching published packages or deployed
 *                        applications. Blocking. Fails closed.
 *   workspace-delta      head must not introduce or worsen findings relative to base. Blocking on
 *                        pull requests. Historical debt passes unchanged.
 *   workspace-absolute   complete debt inventory across examples, surfaces and tooling. Advisory:
 *                        it reports truthfully and completes successfully.
 *
 * Splitting these replaces a single ambiguous "strict mode" that failed on unrelated historical debt
 * and so could not distinguish "this change is unsafe" from "this repository has known debt".
 */
import {
  buildFindings,
  computeDelta,
  reconcile,
  BLOCKING_SEVERITIES,
  classifyPath,
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

const matchesException = (record, path, ex) =>
  ex.advisory === record.id &&
  ex.package === record.module &&
  ex.affectedPaths.some((p) => path === p || path.startsWith(p));

/**
 * production-absolute.
 *
 * Fails closed: malformed input, an unclassified path, an expired exception or an audit that could
 * not run are all failures. "We could not check" must never read as "nothing found".
 */
export function productionAbsolute({ auditJson, exceptions, today, validate }) {
  if (!auditJson || typeof auditJson !== 'object') {
    throw new AuditPolicyError('production-absolute: audit output missing or unparseable');
  }
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

/** workspace-delta: block regressions, permit unchanged historical debt. */
export function workspaceDelta({ baseAuditJson, headAuditJson }) {
  if (!baseAuditJson || !headAuditJson) {
    throw new AuditPolicyError('workspace-delta: base or head audit output missing');
  }
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
  const model = buildFindings(auditJson ?? {});
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
