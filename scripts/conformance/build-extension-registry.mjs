#!/usr/bin/env node
/**
 * Extension Registry Builder: non-WIRE02 conformance requirements.
 *
 * ============================================================================
 * CANONICAL SOURCE OF TRUTH for non-WIRE02 requirement IDs.
 * ============================================================================
 *
 * The conformance registry has two canonical sources:
 *
 *   1. scripts/conformance/build-registry.mjs
 *      - Owns WIRE02-* requirements
 *      - Source: inline REQUIREMENTS array
 *      - Governing spec: docs/specs/WIRE-0.2.md
 *
 *   2. scripts/conformance/build-extension-registry.mjs (THIS FILE)
 *      - Owns non-WIRE02 requirements (32 IDs across 7 namespaces)
 *      - Source: inline EXTENSION_REQUIREMENTS array below
 *      - Per-section governing_spec field
 *      - Namespaces: DID-RES, GRPC-META, PKCE, RURL, SC, X402V2, RTGOV
 *
 * The main builder composes both sources into the final requirement-ids.json.
 * Regeneration order:
 *   1. node scripts/conformance/build-extension-registry.mjs
 *   2. node scripts/conformance/build-registry.mjs
 *
 * ============================================================================
 * ANNOTATION LEDGER (spec-presence follow-up)
 * ============================================================================
 *
 * Source fragments for the 25 non-WIRE02 IDs below are derived from
 * implementation contracts and normative profile docs. Hash integrity is
 * verified by verify-registry-drift.mjs (blocking for all IDs).
 *
 * Governing spec presence is currently advisory (not blocking) because the
 * governing spec docs below do not yet contain exact inline annotations
 * matching the source fragments verbatim.
 *
 * The bounded follow-up list lives at:
 *   specs/conformance/non-wire02-annotation-ledger.md
 *
 * That ledger is the single tracked artifact for promoting spec-presence from
 * advisory to blocking. No new non-WIRE02 requirement IDs may be added here
 * without either (a) shipping the governing-spec annotation in the same
 * change, or (b) appending a row to the ledger in the same PR.
 *
 * Usage: node scripts/conformance/build-extension-registry.mjs
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUTPUT_PATH = join(ROOT, 'specs/conformance/extension-requirement-ids.json');

const VERSION = '0.12.9';

function hash(fragment) {
  return 'sha256:' + createHash('sha256').update(fragment, 'utf-8').digest('hex');
}

/**
 * Non-WIRE02 requirements. Each entry specifies:
 * - id: explicit ID (no auto-generation for extension namespaces)
 * - keyword: BCP 14 keyword
 * - summary: human-readable requirement
 * - source_fragment: normative text from governing spec or implementation
 * - governing_spec: path to the governing spec doc
 * - enforcement_class: hard_fail | advisory | issuance | warning_only
 */
const EXTENSION_REQUIREMENTS = [
  // --- Section 21: x402 V2 Wire Extensions ---
  {
    section: 21,
    title: 'x402 V2 Wire Extensions',
    anchor: 'x402-v2-wire-extensions',
    governing_spec: 'docs/specs/X402-V2-PROFILE.md',
    requirements: [
      {
        id: 'X402V2-001',
        keyword: 'MUST',
        summary: 'V2 offers must include maxTimeoutSeconds as a positive number',
        source_fragment: 'maxTimeoutSeconds: must be a positive number (duration, not epoch)',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'X402V2-002',
        keyword: 'MUST',
        summary: 'V2 verification rejects offers when supportedVersions excludes 2',
        source_fragment: 'V2 offers require supportedVersions to include 2',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'X402V2-003',
        keyword: 'MUST',
        summary: 'Unknown V2 shapes rejected in strict mode',
        source_fragment: 'Unknown V2 shapes are rejected in strict mode (fail-closed)',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'X402V2-004',
        keyword: 'MUST',
        summary: 'Default supportedVersions does not include 2',
        source_fragment: 'Default: [1] (V2 rejected unless explicitly enabled)',
        enforcement_class: 'hard_fail',
      },
    ],
  },
  // --- Section 22: DID Resolution ---
  {
    section: 22,
    title: 'DID Resolution',
    anchor: 'did-resolution',
    governing_spec: 'docs/specs/DID-RESOLUTION-PROFILE.md',
    requirements: [
      {
        id: 'DID-RES-001',
        keyword: 'MUST',
        summary: 'did:key resolves z (base58btc) multibase prefix',
        source_fragment: 'Supports both multibase forms: z (base58btc) and u (base64url)',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'DID-RES-002',
        keyword: 'MUST',
        summary: 'did:key resolves u (base64url) multibase prefix',
        source_fragment: 'u prefix: base64url encoding (multibase)',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'DID-RES-003',
        keyword: 'MUST',
        summary: 'did:key rejects non-Ed25519 keys without timing oracle',
        source_fragment:
          'Non-Ed25519 keys are rejected without oracle (no early-return, prevents timing side-channels)',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'DID-RES-004',
        keyword: 'MUST',
        summary: 'did:web transforms path segments to URL path components',
        source_fragment:
          'URL transformation: did:web:example.com:path:to transforms to https://example.com/path/to/did.json',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'DID-RES-005',
        keyword: 'MUST',
        summary: 'did:web handles percent-encoded port in DID',
        source_fragment:
          'Percent-encoded port: did:web:example.com%3A8443 transforms to https://example.com:8443/.well-known/did.json',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'DID-RES-006',
        keyword: 'MUST',
        summary: 'did:web rejects IP literal hostnames',
        source_fragment: 'IP literal rejection: did:web with IP literal hostname is rejected',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'DID-RES-007',
        keyword: 'MUST',
        summary: 'Resolved document id matches input DID exactly',
        source_fragment: 'Exact id match: resolved document id must match the input DID',
        enforcement_class: 'hard_fail',
      },
    ],
  },
  // --- Section 23: gRPC Transport ---
  {
    section: 23,
    title: 'gRPC Transport',
    anchor: 'grpc-transport',
    governing_spec: 'docs/specs/GRPC-TRANSPORT-PROFILE.md',
    requirements: [
      {
        id: 'GRPC-META-001',
        keyword: 'MUST',
        summary: 'gRPC carrier computes real SHA-256 receipt_ref',
        source_fragment:
          'extract(): reads receipt from metadata, computes real SHA-256 receipt_ref via node:crypto',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'GRPC-META-002',
        keyword: 'MUST',
        summary: 'gRPC carrier rejects binary metadata keys',
        source_fragment:
          'Binary metadata (gRPC -bin suffix convention) is rejected for PEAC receipt data',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'GRPC-META-003',
        keyword: 'MUST',
        summary: 'Default receipt type is interaction-record+jwt',
        source_fragment: 'Default receipt type: interaction-record+jwt (Wire 0.2)',
        enforcement_class: 'hard_fail',
      },
    ],
  },
  // --- Section 24: PKCE for OAuth MCP ---
  {
    section: 24,
    title: 'PKCE for OAuth MCP',
    anchor: 'pkce-oauth-mcp',
    governing_spec: 'docs/specs/A2A-AUTH-PROFILE.md',
    requirements: [
      {
        id: 'PKCE-001',
        keyword: 'MUST',
        summary: 'PKCE verifier is 43-128 chars from unreserved set',
        source_fragment: 'Verifier: 43-128 chars from RFC 7636 unreserved set',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'PKCE-002',
        keyword: 'MUST',
        summary: 'S256 is the only supported challenge method',
        source_fragment: 'S256 only; plain method is rejected',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'PKCE-003',
        keyword: 'MUST',
        summary: 'Auth observation never produces allow or deny decision',
        source_fragment: 'decision: always review (never allow or deny)',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'PKCE-004',
        keyword: 'MUST',
        summary: 'Token material never appears in auth evidence output',
        source_fragment: 'Token material never included in evidence output',
        enforcement_class: 'hard_fail',
      },
    ],
  },
  // --- Section 25: Receipt URL Resolution ---
  {
    section: 25,
    title: 'Receipt URL Resolution',
    anchor: 'receipt-url-resolution',
    governing_spec: 'docs/specs/EVIDENCE-CARRIER-CONTRACT.md',
    requirements: [
      {
        id: 'RURL-001',
        keyword: 'MUST',
        summary: 'Resolver verifies sha256(jws) equals receipt_ref',
        source_fragment: 'Caller MUST verify: sha256(fetched_jws) == carrier.receipt_ref',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'RURL-002',
        keyword: 'MUST',
        summary: 'Carrier middleware returns pure PeacEvidenceCarrier',
        source_fragment: 'The returned carrier is always a pure PeacEvidenceCarrier',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'RURL-003',
        keyword: 'MUST',
        summary: 'Resolver does not cache failed resolutions',
        source_fragment: 'No negative caching: failed resolutions are never cached',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'RURL-004',
        keyword: 'MUST',
        summary: 'Non-strict mode returns carrier unchanged on failure',
        source_fragment:
          'Resolution fails or ref mismatch: strict false (default) returned unchanged',
        enforcement_class: 'advisory',
      },
    ],
  },
  // --- Section 26: Supply Chain Mappings ---
  {
    section: 26,
    title: 'Supply Chain Mappings',
    anchor: 'supply-chain-mappings',
    governing_spec: 'docs/specs/SUPPLY-CHAIN-PROFILE.md',
    requirements: [
      {
        id: 'SC-001',
        keyword: 'MUST',
        summary: 'in-toto mapping uses first subject for source_ref',
        source_fragment: 'subject[0].uri -> source_ref (first subject; multi-subject uses first)',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'SC-003',
        keyword: 'MUST',
        summary: 'SLSA mapping sets slsa.version to 1.2',
        source_fragment: 'Maps SLSA v1.2 provenance: slsa track/level/version fields',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'SC-004',
        keyword: 'MUST',
        summary: 'in-toto mapping targets v1.0 Statement type only',
        source_fragment: 'Throws Error if statement._type is not in-toto v1.0',
        enforcement_class: 'hard_fail',
      },
    ],
  },
  {
    section: 27,
    title: 'Runtime Governance Records',
    anchor: 'runtime-governance-records',
    governing_spec: 'docs/specs/RUNTIME-GOVERNANCE-PROFILE.md',
    requirements: [
      {
        id: 'RTGOV-001',
        keyword: 'MUST',
        summary: 'All runtime-governance records use evidence kind',
        source_fragment: 'All categories produce Interaction Records with kind: "evidence"',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'RTGOV-002',
        keyword: 'MUST',
        summary: 'Type URIs use org.peacprotocol/runtime-governance- prefix',
        source_fragment: 'org.peacprotocol/runtime-governance-{observation-type}',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'RTGOV-003',
        keyword: 'MUST',
        summary: 'Extension namespace is org.peacprotocol/runtime-governance',
        source_fragment: 'All runtime-governance adapters share a single extension namespace',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'RTGOV-004',
        keyword: 'MUST',
        summary: 'Provider field is present in extension and never empty',
        source_fragment: 'Provider name. Caller-supplied; never hardcoded',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'RTGOV-005',
        keyword: 'MUST',
        summary: 'Upstream integrity artifacts preserved as opaque strings',
        source_fragment: 'Adapters SHOULD preserve raw upstream artifacts as opaque blobs',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'RTGOV-006',
        keyword: 'MUST NOT',
        summary: 'PEAC must not derive, recompute, rank, or authoritatively assess trust',
        source_fragment: 'PEAC never computes, validates, or weights trust scores',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'RTGOV-007',
        keyword: 'MUST',
        summary: 'Compliance observations are observational, never authoritative determinations',
        source_fragment: 'PEAC never makes compliance determinations',
        enforcement_class: 'hard_fail',
      },
    ],
  },
];

// Build sections with hashes
const sections = EXTENSION_REQUIREMENTS.map((section) => ({
  section_number: section.section,
  section_title: section.title,
  section_anchor: section.anchor,
  governing_spec: section.governing_spec,
  requirements: section.requirements.map((req) => ({
    id: req.id,
    keyword: req.keyword,
    summary: req.summary,
    source_fragment: req.source_fragment,
    source_fragment_hash: hash(req.source_fragment),
    enforcement_class: req.enforcement_class,
    introduced_in: VERSION,
    last_reviewed_in: VERSION,
  })),
}));

let totalReqs = 0;
for (const s of sections) totalReqs += s.requirements.length;

const output = {
  $schema:
    'https://www.peacprotocol.org/schemas/conformance/extension-requirement-registry.schema.json',
  description:
    'Non-WIRE02 conformance requirements. Generated by build-extension-registry.mjs. Composed into requirement-ids.json by the main build pipeline.',
  version: VERSION,
  total_requirements: totalReqs,
  sections,
};

writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
console.log(
  `Generated ${OUTPUT_PATH}: ${totalReqs} requirements across ${sections.length} sections`
);
