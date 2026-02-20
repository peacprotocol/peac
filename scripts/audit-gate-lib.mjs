/**
 * Audit gate library -- exported functions for deterministic audit parsing.
 *
 * This module handles:
 * - Allowlist loading with time-bounded expiry, fail-closed semantics
 * - pnpm audit JSON normalization (advisories + vulnerabilities tree)
 * - Advisory extraction from both pnpm v8/v9 output shapes
 *
 * Used by scripts/audit-gate.mjs (CLI wrapper) and tested directly
 * in tests/scripts/audit-gate.test.ts.
 */

/** Maximum days an allowlist entry can be valid (dev/examples scope) */
export const MAX_EXPIRY_DAYS = 90;

/** Maximum days for prod-scope entries (stricter) */
export const MAX_EXPIRY_DAYS_PROD = 30;

/** Days remaining before expiry warning fires */
export const EXPIRY_WARNING_DAYS = 14;

/**
 * Maximum days an allowlist entry can exist without reviewed_at before
 * strict mode rejects it. Default mode warns at 30 days; strict mode
 * fails closed at this threshold.
 */
export const REVIEW_WINDOW_DAYS = 60;

/** Valid scope values */
export const VALID_SCOPES = ['dev', 'examples', 'prod'];

/** Strict ISO-8601 date format: YYYY-MM-DD */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @typedef {Object} AllowlistEntry
 * @property {string} advisory_id - GHSA ID or numeric advisory ID
 * @property {string} package - Affected package name
 * @property {string} reason - Why this advisory is allowlisted
 * @property {string} why_not_exploitable - Why the advisory is not exploitable in our context
 * @property {string} where_used - Which surface/package depends on it
 * @property {string} expires_at - Expiry date (YYYY-MM-DD)
 * @property {string} remediation - Planned remediation action
 * @property {string} issue_url - Tracking issue URL
 * @property {string} scope - Where the vuln appears: "dev" | "examples" | "prod"
 * @property {string[]} dependency_chain - Dep path from root to vulnerable package
 * @property {string} verified_by - Exact verification command(s) used
 * @property {string} owner - Who added this exception
 * @property {string} added_at - ISO 8601 date when entry was added (YYYY-MM-DD)
 * @property {string} [reviewed_at] - ISO 8601 date of last renewal review (YYYY-MM-DD, optional)
 */

/**
 * @typedef {Object} AllowlistResult
 * @property {Map<string, AllowlistEntry>} active - Active allowlist entries
 * @property {string[]} expired - Advisory IDs of expired entries
 * @property {string[]} invalid - Advisory IDs/descriptions of invalid entries
 * @property {string[]} warnings - Non-blocking warnings (e.g., expiring soon)
 */

/**
 * Parse and validate an allowlist object.
 * Fails closed: malformed dates, missing fields, or excessive expiry -> entry rejected.
 *
 * @param {object} raw - Parsed allowlist JSON
 * @param {Date} [now] - Reference date (defaults to current time)
 * @param {{ strict?: boolean }} [opts] - Options (strict: enforce reviewed_at freshness)
 * @returns {AllowlistResult}
 */
export function parseAllowlist(raw, now = new Date(), opts = {}) {
  const active = new Map();
  const expired = [];
  const invalid = [];
  const warnings = [];

  if (!raw || !Array.isArray(raw.allowlist)) {
    return { active, expired, invalid, warnings };
  }

  for (const entry of raw.allowlist) {
    // Fail closed: all required fields must be present
    if (
      !entry.advisory_id ||
      !entry.package ||
      !entry.reason ||
      !entry.why_not_exploitable ||
      !entry.where_used ||
      !entry.expires_at ||
      !entry.remediation ||
      !entry.issue_url ||
      !entry.scope ||
      !entry.verified_by ||
      !entry.owner ||
      !entry.added_at ||
      !Array.isArray(entry.dependency_chain) ||
      entry.dependency_chain.length === 0
    ) {
      invalid.push(entry.advisory_id || '<missing id>');
      continue;
    }

    // Validate scope enum
    if (!VALID_SCOPES.includes(entry.scope)) {
      invalid.push(`${entry.advisory_id} (invalid scope: ${entry.scope})`);
      continue;
    }

    // Validate dependency_chain entries (non-empty, max 20)
    if (entry.dependency_chain.length > 20) {
      invalid.push(`${entry.advisory_id} (dependency_chain exceeds 20 entries)`);
      continue;
    }

    // Fail closed: dates must be strict YYYY-MM-DD
    if (!DATE_REGEX.test(entry.expires_at)) {
      invalid.push(`${entry.advisory_id} (bad date format: ${entry.expires_at}, expected YYYY-MM-DD)`);
      continue;
    }
    if (!DATE_REGEX.test(entry.added_at)) {
      invalid.push(`${entry.advisory_id} (bad added_at format: ${entry.added_at}, expected YYYY-MM-DD)`);
      continue;
    }

    // Parse and validate dates
    const expiry = new Date(entry.expires_at + 'T00:00:00Z');
    if (isNaN(expiry.getTime())) {
      invalid.push(`${entry.advisory_id} (bad date: ${entry.expires_at})`);
      continue;
    }

    const addedAt = new Date(entry.added_at + 'T00:00:00Z');
    if (isNaN(addedAt.getTime())) {
      invalid.push(`${entry.advisory_id} (bad added_at: ${entry.added_at})`);
      continue;
    }

    // Enforce scope-aware max expiry window
    const maxDays = entry.scope === 'prod' ? MAX_EXPIRY_DAYS_PROD : MAX_EXPIRY_DAYS;
    const daysDiff = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    if (daysDiff > maxDays) {
      invalid.push(
        `${entry.advisory_id} (expiry ${entry.expires_at} exceeds ${maxDays}-day max for scope=${entry.scope})`
      );
      continue;
    }

    if (expiry < now) {
      expired.push(entry.advisory_id);
      continue;
    }

    // 14-day expiry warning (non-blocking)
    if (daysDiff <= EXPIRY_WARNING_DAYS) {
      warnings.push(`${entry.advisory_id} expires in ${daysDiff} day(s) (${entry.expires_at})`);
    }

    // Optional reviewed_at: if present, must be valid ISO date
    if (entry.reviewed_at !== undefined) {
      if (!DATE_REGEX.test(entry.reviewed_at)) {
        invalid.push(`${entry.advisory_id} (bad reviewed_at format: ${entry.reviewed_at}, expected YYYY-MM-DD)`);
        continue;
      }
      const reviewedAt = new Date(entry.reviewed_at + 'T00:00:00Z');
      if (isNaN(reviewedAt.getTime())) {
        invalid.push(`${entry.advisory_id} (bad reviewed_at: ${entry.reviewed_at})`);
        continue;
      }
    }

    // Renewal tracking: warn or reject entries without reviewed_at
    const addedDaysAgo = Math.floor((now - addedAt) / (1000 * 60 * 60 * 24));
    if (addedDaysAgo > REVIEW_WINDOW_DAYS && !entry.reviewed_at && opts.strict) {
      // Strict mode: entries older than REVIEW_WINDOW_DAYS without review are rejected
      invalid.push(
        `${entry.advisory_id} added ${addedDaysAgo} day(s) ago without reviewed_at (strict mode requires review within ${REVIEW_WINDOW_DAYS} days)`
      );
      continue;
    }
    if (addedDaysAgo > 30 && !entry.reviewed_at) {
      warnings.push(
        `${entry.advisory_id} added ${addedDaysAgo} day(s) ago without reviewed_at -- consider renewal review`
      );
    }

    active.set(entry.advisory_id, entry);
  }

  return { active, expired, invalid, warnings };
}

/**
 * @typedef {Object} NormalizedAdvisory
 * @property {string} id - Primary advisory ID (numeric string)
 * @property {string} ghsaId - GHSA ID (e.g., "GHSA-xxxx-yyyy-zzzz")
 * @property {string} severity - "critical" | "high" | "moderate" | "low" | "info"
 * @property {string} module - Module name
 * @property {string} title - Advisory title
 */

/**
 * Extract advisories from pnpm audit JSON output.
 *
 * pnpm audit has two known output shapes:
 * 1. `advisories` object (pnpm v8+): keyed by numeric advisory ID
 * 2. `vulnerabilities` object (npm-compatible): keyed by package name,
 *    with `via` arrays containing advisory objects or string references
 *
 * This function normalizes both into a flat list.
 *
 * @param {object} auditResult - Parsed pnpm audit JSON
 * @returns {NormalizedAdvisory[]}
 */
export function extractAdvisories(auditResult) {
  if (!auditResult) return [];

  const advisories = [];
  const seen = new Set();

  // Shape 1: pnpm native -- advisories object keyed by numeric ID
  if (auditResult.advisories && typeof auditResult.advisories === 'object') {
    for (const [id, adv] of Object.entries(auditResult.advisories)) {
      const key = String(adv.id || id);
      if (seen.has(key)) continue;
      seen.add(key);

      advisories.push({
        id: key,
        ghsaId: adv.github_advisory_id || '',
        severity: adv.severity || 'unknown',
        module: adv.module_name || '',
        title: adv.title || '',
      });
    }
  }

  // Shape 2: npm-compatible -- vulnerabilities object keyed by package name
  // Each vulnerability has a `via` array with advisory objects or string refs
  if (auditResult.vulnerabilities && typeof auditResult.vulnerabilities === 'object') {
    for (const [, vuln] of Object.entries(auditResult.vulnerabilities)) {
      if (!Array.isArray(vuln.via)) continue;

      for (const via of vuln.via) {
        // String refs point to other packages, not direct advisories
        if (typeof via === 'string') continue;
        if (!via || typeof via !== 'object') continue;

        // via objects have: source (numeric ID), name, severity, url, title, etc.
        const key = String(via.source || via.url || '');
        if (!key || seen.has(key)) continue;
        seen.add(key);

        advisories.push({
          id: key,
          ghsaId: via.url ? via.url.match(/GHSA-[a-z0-9-]+/)?.[0] || '' : '',
          severity: via.severity || vuln.severity || 'unknown',
          module: via.name || vuln.name || '',
          title: via.title || '',
        });
      }
    }
  }

  return advisories;
}

/**
 * @typedef {Object} AuditFindings
 * @property {string[]} critical
 * @property {string[]} high
 * @property {string[]} moderate
 * @property {string[]} low
 */

/**
 * Classify advisories by severity, filtering out allowlisted entries.
 *
 * @param {NormalizedAdvisory[]} advisories
 * @param {Map<string, AllowlistEntry>} allowlist
 * @returns {AuditFindings}
 */
export function classifyAdvisories(advisories, allowlist) {
  const findings = { critical: [], high: [], moderate: [], low: [] };

  for (const adv of advisories) {
    // Check both numeric ID and GHSA ID against allowlist
    if (allowlist.has(adv.id) || (adv.ghsaId && allowlist.has(adv.ghsaId))) {
      continue;
    }

    if (adv.severity === 'critical') findings.critical.push(adv.id);
    else if (adv.severity === 'high') findings.high.push(adv.id);
    else if (adv.severity === 'moderate') findings.moderate.push(adv.id);
    else findings.low.push(adv.id);
  }

  return findings;
}
