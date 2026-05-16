/**
 * Shared conformance core module.
 *
 * Single source of truth for:
 * - Requirement ID parsing and validation
 * - Coverage status enum and classification
 * - Deferred section sets
 * - Implicit coverage classes
 * - Deterministic sort rules
 * - Namespace classification (WIRE02 vs CARRIER)
 *
 * All conformance tooling (generate-matrix, check-matrix, generate-inventory,
 * validate-schemas) imports from this module. No duplication.
 */

// ---------------------------------------------------------------------------
// Requirement ID
// ---------------------------------------------------------------------------

/**
 * Canonical requirement ID pattern.
 * Accepts namespace-prefixed IDs: WIRE02, CARRIER, X402V2, DID-RES,
 * PKCE, GRPC-META, RURL, SC, RTGOV, A2A-HANDOFF, CLI-EXEC, LIFE-OBS,
 * PROV-LIFE, AGENT-ACT, COMM-MAN.
 * Section/transport part allows uppercase letters and digits (e.g., A2A).
 */
export const REQUIREMENT_ID_PATTERN =
  /^(WIRE02|CARRIER)-[A-Z0-9]+-[0-9]{3}$|^(X402V2|DID-RES|PKCE|GRPC-META|RURL|SC|RTGOV|A2A-HANDOFF|CLI-EXEC|LIFE-OBS|PROV-LIFE|AGENT-ACT|COMM-MAN)-[0-9]{3}$/;

/**
 * Requirement ID namespaces.
 */
export const NAMESPACES = /** @type {const} */ ([
  'WIRE02',
  'CARRIER',
  'X402V2',
  'DID-RES',
  'PKCE',
  'GRPC-META',
  'RURL',
  'SC',
  'RTGOV',
  'A2A-HANDOFF',
  'CLI-EXEC',
  'LIFE-OBS',
  'PROV-LIFE',
  'AGENT-ACT',
  'COMM-MAN',
]);

/**
 * Parse a requirement ID into its components.
 *
 * Two ID shapes are supported:
 *
 *   1. WIRE02 / CARRIER: namespace-section-number
 *      (e.g. WIRE02-JOSE-009, CARRIER-MCP-001): three segments, with a
 *      separate section identifier.
 *   2. Extension namespaces: namespace-number
 *      (e.g. X402V2-001, DID-RES-002, A2A-HANDOFF-010, CLI-EXEC-006,
 *      LIFE-OBS-010, PROV-LIFE-001): two segments. The namespace
 *      encodes the section; `section` is returned as an empty string so
 *      downstream tooling can sort by namespace.
 *
 * @param {string} id
 * @returns {{ namespace: string, section: string, number: string } | null}
 */
export function parseRequirementId(id) {
  let m = id.match(/^(WIRE02|CARRIER)-([A-Z0-9]+)-([0-9]{3})$/);
  if (m) return { namespace: m[1], section: m[2], number: m[3] };

  m = id.match(
    /^(X402V2|DID-RES|PKCE|GRPC-META|RURL|SC|RTGOV|A2A-HANDOFF|CLI-EXEC|LIFE-OBS|PROV-LIFE|AGENT-ACT)-([0-9]{3})$/
  );
  if (m) return { namespace: m[1], section: '', number: m[2] };

  return null;
}

/**
 * Validate a requirement ID.
 * @param {string} id
 * @returns {boolean}
 */
export function isValidRequirementId(id) {
  return REQUIREMENT_ID_PATTERN.test(id);
}

// ---------------------------------------------------------------------------
// Coverage Status
// ---------------------------------------------------------------------------

/**
 * Coverage status enum. Every requirement falls into exactly one of these.
 * This is the single source of truth for all conformance tooling.
 *
 * @enum {string}
 */
export const CoverageStatus = /** @type {const} */ ({
  /** Covered by fixture(s), test mapping(s), or both */
  COVERED: 'covered',
  /** Advisory/issuance class: implicitly covered by matrix documentation */
  IMPLICIT: 'implicit',
  /** Deferred to PR 3 (challenge/warning/dual-stack/strictness: sections 13-16) */
  DEFERRED_PR3: 'deferred_pr3',
  /** Deferred to v0.12.1 (media/envelope/compat: sections 2-4) */
  DEFERRED_V0121: 'deferred_v0121',
  /** Not covered and not deferred: a gap */
  UNCOVERED: 'uncovered',
});

/**
 * All valid coverage status values.
 * @type {ReadonlySet<string>}
 */
export const VALID_COVERAGE_STATUSES = new Set(Object.values(CoverageStatus));

/**
 * Human-readable labels for coverage statuses. Used in matrix and summaries.
 */
export const COVERAGE_LABELS = /** @type {const} */ ({
  [CoverageStatus.COVERED]: 'covered',
  [CoverageStatus.IMPLICIT]: 'implicit (advisory/issuance)',
  [CoverageStatus.DEFERRED_PR3]: 'deferred (PR 3)',
  [CoverageStatus.DEFERRED_V0121]: 'deferred (v0.12.1)',
  [CoverageStatus.UNCOVERED]: '**UNCOVERED**',
});

// ---------------------------------------------------------------------------
// Deferred Sections
// ---------------------------------------------------------------------------

/**
 * Sections deferred to PR 3: Challenge Body, Warning Plumbing, Dual-Stack, Strictness.
 * @type {ReadonlySet<number>}
 */
export const DEFERRED_PR3_SECTIONS = new Set([13, 14, 15, 16]);

/**
 * Sections deferred to v0.12.1: Media Type, Envelope Structure, Compatibility Contract.
 * @type {ReadonlySet<number>}
 */
export const DEFERRED_V0121_SECTIONS = new Set([2, 3, 4]);

// ---------------------------------------------------------------------------
// Enforcement Classes
// ---------------------------------------------------------------------------

/**
 * Enforcement classes that are implicitly covered by being documented in the matrix.
 * advisory: "Documented in matrix + at least one observable assertion if executable"
 * issuance: "Covered by valid-generation vectors"
 *
 * These do NOT require explicit fixture or test-mapping coverage.
 * @type {ReadonlySet<string>}
 */
export const IMPLICIT_COVERAGE_CLASSES = new Set(['advisory', 'issuance']);

/**
 * All valid enforcement classes.
 * @type {ReadonlySet<string>}
 */
export const VALID_ENFORCEMENT_CLASSES = new Set([
  'hard_fail',
  'warning_only',
  'routing',
  'issuance',
  'advisory',
]);

// ---------------------------------------------------------------------------
// BCP 14 Keywords
// ---------------------------------------------------------------------------

/**
 * Valid BCP 14 keywords (RFC 2119 + RFC 8174).
 * @type {ReadonlyArray<string>}
 */
export const BCP14_KEYWORDS = [
  'MUST',
  'MUST NOT',
  'REQUIRED',
  'SHALL',
  'SHALL NOT',
  'SHOULD',
  'SHOULD NOT',
  'RECOMMENDED',
  'MAY',
  'OPTIONAL',
];

// ---------------------------------------------------------------------------
// Coverage Classification
// ---------------------------------------------------------------------------

/**
 * Classify a requirement's coverage status.
 * This is the ONE function that all tools use to determine coverage.
 *
 * @param {object} params
 * @param {string} params.id - Requirement ID
 * @param {string} params.enforcement_class - Enforcement class
 * @param {number} params.section_number - Section number
 * @param {ReadonlySet<string>} params.coveredIds - Set of IDs with fixture/test coverage
 * @returns {string} One of CoverageStatus values
 */
export function classifyCoverage({ id, enforcement_class, section_number, coveredIds }) {
  if (coveredIds.has(id)) return CoverageStatus.COVERED;
  if (IMPLICIT_COVERAGE_CLASSES.has(enforcement_class)) return CoverageStatus.IMPLICIT;
  if (DEFERRED_PR3_SECTIONS.has(section_number)) return CoverageStatus.DEFERRED_PR3;
  if (DEFERRED_V0121_SECTIONS.has(section_number)) return CoverageStatus.DEFERRED_V0121;
  return CoverageStatus.UNCOVERED;
}

/**
 * Build the set of requirement IDs that have explicit coverage
 * (from fixtures or test-mappings).
 *
 * @param {object} inventory - Parsed inventory.json
 * @param {object} testMappings - Parsed test-mappings.json
 * @returns {Set<string>}
 */
export function buildCoveredIds(inventory, testMappings) {
  const ids = new Set();
  for (const entry of inventory.entries) {
    if (entry.requirement_ids) {
      for (const id of entry.requirement_ids) ids.add(id);
    }
  }
  for (const m of testMappings.mappings) {
    ids.add(m.requirement_id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Deterministic Sorting
// ---------------------------------------------------------------------------

/**
 * Deterministic sort for requirement IDs.
 * Groups by namespace, then section prefix, then numeric suffix.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function sortRequirementIds(a, b) {
  const pa = parseRequirementId(a);
  const pb = parseRequirementId(b);
  if (!pa || !pb) return a.localeCompare(b);
  if (pa.namespace !== pb.namespace) return pa.namespace.localeCompare(pb.namespace);
  if (pa.section !== pb.section) return pa.section.localeCompare(pb.section);
  return pa.number.localeCompare(pb.number);
}

/**
 * Deterministic sort for file paths. Ascending lexicographic.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function sortPaths(a, b) {
  return a.localeCompare(b);
}

/**
 * Deduplicate and sort a string array.
 * @param {string[]} arr
 * @returns {string[]}
 */
export function dedupeSort(arr) {
  return [...new Set(arr)].sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Error Code Pattern
// ---------------------------------------------------------------------------

/**
 * Valid error code pattern.
 * @type {RegExp}
 */
export const ERROR_CODE_PATTERN = /^E_[A-Z0-9_]+$/;

/**
 * Valid source fragment hash pattern.
 * @type {RegExp}
 */
export const FRAGMENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
