/**
 * Canonical model for dependency-audit findings.
 *
 * Advisory records, affected packages, and dependency paths are distinct quantities and are
 * reported separately; a single conflated total cannot be traced back to its inputs. Output is
 * normalized and sorted deterministically so policy decisions are reproducible across platforms.
 */

export class AuditInputError extends Error {}

/** Severities recognised by policy. An unrecognised severity is an error, never a low rank. */
export const KNOWN_SEVERITIES = ['critical', 'high', 'moderate', 'low', 'info'];

/**
 * Validate audit output before any policy runs.
 *
 * An absent or malformed report must not present as a clean result: an unreadable audit and an
 * audit with zero findings are different outcomes, and only one of them is safe to proceed on.
 */
export function assertValidAuditInput(auditJson, label) {
  if (!auditJson || typeof auditJson !== 'object' || Array.isArray(auditJson)) {
    throw new AuditInputError(`${label}: audit output missing or not an object`);
  }
  if (!('advisories' in auditJson)) {
    throw new AuditInputError(
      `${label}: audit output has no advisories field; an empty audit must state {"advisories":{}}`
    );
  }
  const advisories = auditJson.advisories;
  if (advisories === null || typeof advisories !== 'object' || Array.isArray(advisories)) {
    throw new AuditInputError(`${label}: advisories must be an object`);
  }
  for (const [key, adv] of Object.entries(advisories)) {
    if (!adv || typeof adv !== 'object')
      throw new AuditInputError(`${label}: advisory ${key} is not an object`);
    if (!adv.module_name) throw new AuditInputError(`${label}: advisory ${key} has no module_name`);
    const sev = String(adv.severity ?? '').toLowerCase();
    if (!KNOWN_SEVERITIES.includes(sev)) {
      throw new AuditInputError(`${label}: advisory ${key} has unknown severity "${adv.severity}"`);
    }
    if (!Array.isArray(adv.findings))
      throw new AuditInputError(`${label}: advisory ${key} has no findings array`);
    for (const fnd of adv.findings) {
      if (!Array.isArray(fnd?.paths))
        throw new AuditInputError(`${label}: advisory ${key} has a finding without paths`);
    }
  }
  return true;
}

/** Severities this policy treats as blocking, most severe first. */
export const BLOCKING_SEVERITIES = ['critical', 'high'];

/** Normalise a dependency path so Windows and POSIX runners produce identical results. */
export function normalizePath(p) {
  return String(p).replace(/\\/g, '/').trim();
}

/**
 * Classify a dependency path by workspace area.
 *
 * Deliberately conservative: anything not recognised is `unclassified`, which production policy
 * treats as blocking. An unknown path must never be silently assumed non-production.
 */
export function classifyPath(rawPath) {
  const p = normalizePath(rawPath);
  const root = p.split(' > ')[0] ?? p;
  if (root.startsWith('examples/')) return 'example';
  if (root.startsWith('surfaces/')) return 'surface';
  if (root.startsWith('apps/')) return 'application';
  if (root.startsWith('packages/')) return 'package';
  if (root === '.' || root === '') return 'workspace-root';
  return 'unclassified';
}

/**
 * Build the canonical findings model from raw audit JSON.
 *
 * Pure: no I/O, no process exit, no logging. Callers decide policy.
 */
export function buildFindings(auditJson) {
  const advisories = auditJson?.advisories ?? {};
  const records = [];

  for (const [key, adv] of Object.entries(advisories)) {
    const id = adv?.github_advisory_id || adv?.url?.split('/').pop() || String(key);
    const severity = String(adv?.severity ?? 'unknown').toLowerCase();
    const module = adv?.module_name ?? 'unknown';

    const paths = new Set();
    for (const finding of adv?.findings ?? []) {
      for (const p of finding?.paths ?? []) paths.add(normalizePath(p));
    }

    const sortedPaths = [...paths].sort();
    records.push({
      id,
      module,
      severity,
      title: adv?.title ?? '',
      url: adv?.url ?? '',
      vulnerableRange: adv?.vulnerable_versions ?? '',
      patchedVersions: adv?.patched_versions ?? '',
      paths: sortedPaths,
      pathClasses: [...new Set(sortedPaths.map(classifyPath))].sort(),
    });
  }

  // Deterministic ordering so two runs of the same state produce byte-identical output.
  records.sort((a, b) =>
    a.id === b.id ? a.module.localeCompare(b.module) : a.id.localeCompare(b.id)
  );

  return {
    records,
    counts: {
      rawAdvisoryRecords: records.length,
      affectedPackageRecords: new Set(records.map((r) => `${r.id}::${r.module}`)).size,
      vulnerablePaths: new Set(records.flatMap((r) => r.paths)).size,
      bySeverityAdvisory: countBy(records, (r) => r.severity),
      bySeverityPath: records.reduce((acc, r) => {
        acc[r.severity] = (acc[r.severity] ?? 0) + r.paths.length;
        return acc;
      }, {}),
    },
    // Reported separately and never treated as equal to rawAdvisoryRecords.
    registryMetadata: auditJson?.metadata?.vulnerabilities ?? null,
  };
}

function countBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const k = keyFn(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

/** A stable identity for delta comparison: one advisory reaching one package by one path. */
export function findingKeys(model) {
  const keys = new Set();
  for (const r of model.records) {
    for (const p of r.paths) keys.add(`${r.id}::${r.module}::${p}`);
  }
  return keys;
}

/**
 * Compare a base model with a head model.
 *
 * Blocks only on regressions: a revision that removes findings, or leaves existing ones
 * unchanged, passes; any newly introduced or worsened finding fails.
 */
export function computeDelta(baseModel, headModel) {
  const baseKeys = findingKeys(baseModel);
  const headKeys = findingKeys(headModel);

  const added = [...headKeys].filter((k) => !baseKeys.has(k)).sort();
  const removed = [...baseKeys].filter((k) => !headKeys.has(k)).sort();

  const baseSeverity = new Map(baseModel.records.map((r) => [`${r.id}::${r.module}`, r.severity]));
  const raised = [];
  for (const r of headModel.records) {
    const prev = baseSeverity.get(`${r.id}::${r.module}`);
    if (prev && severityRank(r.severity) > severityRank(prev)) {
      raised.push({ id: r.id, module: r.module, from: prev, to: r.severity });
    }
  }

  // A dependency that becomes production-reachable is a regression even with no new advisory.
  const baseClasses = new Map(
    baseModel.records.map((r) => [`${r.id}::${r.module}`, new Set(r.pathClasses)])
  );
  const newlyProductionReachable = [];
  const PRODUCTION_CLASSES = new Set(['package', 'application', 'surface', 'unclassified']);
  for (const r of headModel.records) {
    const before = baseClasses.get(`${r.id}::${r.module}`);
    if (!before) continue;
    for (const cls of r.pathClasses) {
      if (PRODUCTION_CLASSES.has(cls) && !before.has(cls)) {
        newlyProductionReachable.push({ id: r.id, module: r.module, newClass: cls });
      }
    }
  }

  const addedBlocking = added.filter((k) => {
    const id = k.split('::')[0];
    const rec = headModel.records.find((r) => r.id === id);
    return rec && BLOCKING_SEVERITIES.includes(rec.severity);
  });

  return {
    added,
    addedBlocking,
    removed,
    severityRaised: raised,
    newlyProductionReachable,
    regressed: addedBlocking.length > 0 || raised.length > 0 || newlyProductionReachable.length > 0,
  };
}

export function severityRank(s) {
  return { critical: 4, high: 3, moderate: 2, low: 1, info: 0 }[String(s).toLowerCase()] ?? 0;
}

/**
 * Reconciliation report: the explicit arithmetic from advisory records to the blocking count.
 *
 * A policy number is only auditable if every step from raw input to decision is shown.
 */
export function reconcile({ model, excluded, exceptioned, effective }) {
  // Reconcile like with like: the buckets contain only blocking-severity records, so the arithmetic
  // starts from the blocking subset rather than from every advisory at every severity.
  const blocking = model.records.filter((r) => BLOCKING_SEVERITIES.includes(r.severity)).length;
  const lines = [];
  lines.push(`  rawAdvisoryRecords          ${model.counts.rawAdvisoryRecords}  (all severities)`);
  lines.push(`  blockingSeverityRecords     ${blocking}  (critical + high)`);
  lines.push(`  affectedPackageRecords      ${model.counts.affectedPackageRecords}`);
  lines.push(`  vulnerablePaths             ${model.counts.vulnerablePaths}`);
  lines.push(`  - excludedNonProduction     ${excluded.length}`);
  lines.push(`  - activeExceptionRecords    ${exceptioned.length}`);
  lines.push(`  = effectivePolicyFindings   ${effective.length}`);
  if (model.registryMetadata) {
    lines.push(
      `  registryMetadata (separate) ${JSON.stringify(model.registryMetadata)}` +
        ' -- tool-derived, not equal to advisory records'
    );
  }
  const arithmetic = blocking - excluded.length - exceptioned.length === effective.length;
  lines.push(
    `  reconciles                  ${arithmetic ? 'yes' : 'NO -- counts do not balance'}` +
      ` (${blocking} - ${excluded.length} - ${exceptioned.length} = ${effective.length})`
  );
  return { lines, reconciles: arithmetic, blockingSeverityRecords: blocking };
}
