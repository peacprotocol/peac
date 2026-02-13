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

/** Maximum days an allowlist entry can be valid */
export const MAX_EXPIRY_DAYS = 90;

/**
 * @typedef {Object} AllowlistEntry
 * @property {string} advisory_id - GHSA ID or numeric advisory ID
 * @property {string} reason - Why this advisory is allowlisted
 * @property {string} expires_at - Expiry date (YYYY-MM-DD)
 * @property {string} remediation - Planned remediation action
 * @property {string} issue_url - Tracking issue URL
 */

/**
 * @typedef {Object} AllowlistResult
 * @property {Map<string, AllowlistEntry>} active - Active allowlist entries
 * @property {string[]} expired - Advisory IDs of expired entries
 * @property {string[]} invalid - Advisory IDs/descriptions of invalid entries
 */

/**
 * Parse and validate an allowlist object.
 * Fails closed: malformed dates, missing fields, or excessive expiry -> entry rejected.
 *
 * @param {object} raw - Parsed allowlist JSON
 * @param {Date} [now] - Reference date (defaults to current time)
 * @returns {AllowlistResult}
 */
export function parseAllowlist(raw, now = new Date()) {
  const active = new Map();
  const expired = [];
  const invalid = [];

  if (!raw || !Array.isArray(raw.allowlist)) {
    return { active, expired, invalid };
  }

  for (const entry of raw.allowlist) {
    // Fail closed: all required fields must be present
    if (
      !entry.advisory_id ||
      !entry.reason ||
      !entry.expires_at ||
      !entry.remediation ||
      !entry.issue_url
    ) {
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
      invalid.push(
        `${entry.advisory_id} (expiry ${entry.expires_at} exceeds ${MAX_EXPIRY_DAYS}-day max)`
      );
      continue;
    }

    if (expiry < now) {
      expired.push(entry.advisory_id);
      continue;
    }

    active.set(entry.advisory_id, entry);
  }

  return { active, expired, invalid };
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
