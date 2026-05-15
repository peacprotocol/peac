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
 *      - Owns non-WIRE02 requirements (78 IDs across 12 sections)
 *      - Source: inline EXTENSION_REQUIREMENTS array below
 *      - Per-section governing_spec field
 *      - Namespaces: X402V2, DID-RES, GRPC-META, PKCE, RURL, SC, RTGOV,
 *        A2A-HANDOFF, CLI-EXEC, LIFE-OBS, PROV-LIFE, AGENT-ACT
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
 * Source fragments for the non-WIRE02 IDs below are derived from
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

// Default version for sections introduced before v0.14.3.
// Individual sections may override introduced_in/last_reviewed_in.
const DEFAULT_VERSION = '0.14.2';

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
  {
    section: 28,
    title: 'A2A Handoff Records',
    anchor: 'a2a-handoff-records',
    governing_spec: 'docs/specs/A2A-HANDOFF-RECORDS.md',
    requirements: [
      {
        id: 'A2A-HANDOFF-001',
        keyword: 'MUST',
        summary:
          'Records carry exactly one of the 10 A2A handoff type URIs in the extension payload',
        source_fragment: 'A record carries exactly one type URI',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'A2A-HANDOFF-002',
        keyword: 'MUST',
        summary: 'Extension payload type field equals the wire-record type URI',
        source_fragment:
          "The payload's type field MUST equal the type URI declared at the wire-record level",
        enforcement_class: 'hard_fail',
      },
      {
        id: 'A2A-HANDOFF-003',
        keyword: 'MUST',
        summary:
          'All *_ref fields use the OpaqueRefSchema grammar (no whitespace, no @, recognized prefix)',
        source_fragment: 'All *_ref fields in this profile use the shared opaque-reference grammar',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'A2A-HANDOFF-004',
        keyword: 'MUST',
        summary:
          'Agent Card observation uses signature_observation.caller_reported_verification (not legacy signature.verified)',
        source_fragment:
          'The legacy shape signature: { verified: true, ... } was REJECTED in v0.14.1',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'A2A-HANDOFF-005',
        keyword: 'MUST NOT',
        summary:
          'Helper file does not import signature-verification APIs (artifact-shape import-graph test enforces)',
        source_fragment: 'The Agent Card observation helper MUST NOT verify Agent Card signatures',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'A2A-HANDOFF-006',
        keyword: 'MUST NOT',
        summary:
          'Extension payload top-level keys do not include decision/verdict/score/result/etc.',
        source_fragment:
          "An emitted record's extension payload MUST NOT contain any of: decision, verdict, score, result, passed, failed, policy_result, approval_result, outcome, judgment, rating, grade, pass, fail, allow, deny, authorized, denied, granted, rejected_reason as top-level keys",
        enforcement_class: 'hard_fail',
      },
      {
        id: 'A2A-HANDOFF-007',
        keyword: 'MUST',
        summary: "Agent Card payload's discovery_path is one of the three recognized values",
        source_fragment:
          'discovery_path: enum (one of /.well-known/agent-card.json, /.well-known/peac.json, header-probe)',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'A2A-HANDOFF-008',
        keyword: 'MUST',
        summary: 'Task observation event field matches the type URI',
        source_fragment: 'event: enum (one of task.submitted, task.accepted, ...) MUST match type',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'A2A-HANDOFF-009',
        keyword: 'MUST',
        summary: 'observed_at and discovered_at are RFC 3339 timestamps with offset',
        source_fragment: 'RFC 3339 timestamp',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'A2A-HANDOFF-010',
        keyword: 'MUST',
        summary: 'upstream_event_digest, when present, is sha256:<64 hex>',
        source_fragment: 'sha256:<64 hex> digest of the upstream A2A event payload',
        enforcement_class: 'hard_fail',
      },
    ],
  },
  {
    section: 29,
    title: 'CLI Execution Records',
    anchor: 'cli-execution-records',
    governing_spec: 'docs/specs/CLI-CARRIER-PROFILE.md',
    requirements: [
      {
        id: 'CLI-EXEC-001',
        keyword: 'MUST',
        summary:
          'CLI execution record has type org.peacprotocol/cli-command-execution and surface.kind = cli',
        source_fragment: "type: org.peacprotocol/cli-command-execution; surface: { kind: 'cli' }",
        enforcement_class: 'hard_fail',
      },
      {
        id: 'CLI-EXEC-002',
        keyword: 'MUST',
        summary: 'command.program is basename-only (no path separators)',
        source_fragment:
          "command.program rejects '/' and '\\\\'; path disclosure lives only under binary.path_*",
        enforcement_class: 'hard_fail',
      },
      {
        id: 'CLI-EXEC-003',
        keyword: 'MUST',
        summary:
          'command.argv_mode = raw requires capture_policy.raw_capture_unsafely_allowed = true',
        source_fragment: 'argv_mode raw requires --unsafe-allow-raw-capture',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'CLI-EXEC-004',
        keyword: 'MUST',
        summary: 'env.entries keys are a subset of capture_policy.env_allowlist',
        source_fragment: 'env_allowlist subset constraint',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'CLI-EXEC-005',
        keyword: 'MUST',
        summary:
          'stream sample_base64 and sample_suppressed_reason are mutually exclusive; matched_pattern_category is biconditional with sample_suppressed_reason',
        source_fragment: 'sample/suppression mutual exclusion + matched_pattern_category coupling',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'CLI-EXEC-006',
        keyword: 'MUST',
        summary:
          "shell_mode = true requires binary.shell_ref present, binary.path_mode != 'none'; under hashed mode shell_ref equals binary.path_sha256",
        source_fragment: 'shell_mode <-> shell_ref biconditional + canonical-digest equivalence',
        enforcement_class: 'hard_fail',
      },
    ],
  },
  {
    section: 30,
    title: 'Lifecycle Observation Records',
    anchor: 'lifecycle-observation-records',
    governing_spec: 'docs/specs/LIFECYCLE-OBSERVATION-PROFILE.md',
    requirements: [
      {
        id: 'LIFE-OBS-001',
        keyword: 'MUST',
        summary:
          'Validator rejects 20 forbidden top-level keys with lifecycle.inline_value_blocked',
        source_fragment:
          'lifecycle.inline_value_blocked rejects all 20 forbidden top-level keys at extension top level',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'LIFE-OBS-002',
        keyword: 'MUST',
        summary:
          'All *_ref fields validated by the OpaqueRefSchema grammar (no whitespace, no @, recognized prefix); numeric strings reject via no-prefix',
        source_fragment: 'all *_ref fields validated by the OpaqueRefSchema grammar',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'LIFE-OBS-003',
        keyword: 'MUST',
        summary:
          'approver_ref containing @ rejects with lifecycle.approver_ref_pii_blocked (priority over general grammar code)',
        source_fragment: 'approver_ref @-detection prioritized as a PII-blocked subclass',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'LIFE-OBS-004',
        keyword: 'MUST',
        summary:
          'Non-string *_ref values reject with lifecycle.ref_must_be_string; no generic Zod string error leaks as a public diagnostic',
        source_fragment:
          'non-string *_ref values reject with lifecycle.ref_must_be_string; no Zod-string error leaks as a public diagnostic',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'LIFE-OBS-005',
        keyword: 'MUST',
        summary:
          'Per-event-kind required fields enforced via discriminated union; missing observed_at and other missing required fields surface lifecycle.missing_required_field',
        source_fragment:
          'per-event-kind required fields enforced via discriminated union; missing observed_at uses lifecycle.missing_required_field',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'LIFE-OBS-006',
        keyword: 'MUST',
        summary: 'Unknown event_kind rejects with lifecycle.event_kind_unknown',
        source_fragment: 'unknown event_kind rejects with lifecycle.event_kind_unknown',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'LIFE-OBS-007',
        keyword: 'MUST',
        summary:
          'Malformed observed_at rejects with lifecycle.invalid_observed_at; missing observed_at is covered by missing_required_field',
        source_fragment:
          'malformed observed_at rejects with lifecycle.invalid_observed_at; missing observed_at is covered by lifecycle.missing_required_field',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'LIFE-OBS-008',
        keyword: 'MUST',
        summary: 'Lifecycle records round-trip through @peac/protocol.issue() and verifyLocal()',
        source_fragment:
          'lifecycle records round-trip through @peac/protocol.issue() and verifyLocal()',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'LIFE-OBS-009',
        keyword: 'MUST',
        summary:
          'Every type URI in LIFECYCLE_OBSERVATION_TYPE_URIS maps to org.peacprotocol/lifecycle-observation in TYPE_TO_EXTENSION_MAP',
        source_fragment:
          'every URI in LIFECYCLE_OBSERVATION_TYPE_URIS maps to org.peacprotocol/lifecycle-observation in TYPE_TO_EXTENSION_MAP',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'LIFE-OBS-010',
        keyword: 'MUST',
        summary:
          'Spec orchestrator-boundary text is normative and vendor-neutral; PEAC does not assign work, run agents, schedule tasks, manage issue trackers, route approvals, decide step ordering, or enforce workflow policy',
        source_fragment:
          'the orchestrator-boundary text is normative and vendor-neutral; PEAC does not assign work, run agents, schedule tasks, manage issue trackers, route approvals, decide step ordering, or enforce workflow policy',
        enforcement_class: 'hard_fail',
      },
    ],
  },
  // --- Section 31: Provisioning Lifecycle Records ---
  {
    section: 31,
    title: 'Provisioning Lifecycle Records',
    anchor: 'provisioning-lifecycle-records',
    governing_spec: 'docs/specs/PROVISIONING-LIFECYCLE-PROFILE.md',
    requirements: [
      {
        id: 'PROV-LIFE-001',
        keyword: 'MUST',
        summary:
          'Validator rejects 20 forbidden top-level credential-bearing keys with provisioning.inline_credential_blocked',
        source_fragment:
          'provisioning.inline_credential_blocked rejects 20 forbidden top-level credential-bearing keys at extension top level',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'PROV-LIFE-002',
        keyword: 'MUST',
        summary:
          'Recursive secret-scanner walker rejects forbidden key names at any depth with provisioning.forbidden_key_name and credential-shaped value strings with provisioning.token_material_blocked',
        source_fragment:
          'recursive walker inspects key names AND value strings at every depth; forbidden key names reject with provisioning.forbidden_key_name; credential-shaped value strings reject with provisioning.token_material_blocked',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'PROV-LIFE-003',
        keyword: 'MUST',
        summary:
          'All *_ref fields validated by the OpaqueRefSchema grammar; all *_digest fields validated by the Sha256DigestSchema grammar',
        source_fragment:
          'all *_ref fields validated by the OpaqueRefSchema grammar; all *_digest fields validated by the Sha256DigestSchema grammar',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'PROV-LIFE-004',
        keyword: 'MUST',
        summary:
          'storage_surface object uses abstract kind enum (external_secret_store, local_encrypted_file, local_plaintext_file, environment_file, runtime_secret_binding, none, unknown); no vendor-specific values',
        source_fragment:
          'storage_surface kind is one of external_secret_store, local_encrypted_file, local_plaintext_file, environment_file, runtime_secret_binding, none, unknown',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'PROV-LIFE-005',
        keyword: 'MUST',
        summary:
          'scheme_id follows a bounded ASCII grammar (max 128 UTF-8 bytes; allowed characters [a-z0-9._:/+-]); scheme_id and scheme_ref are mutually exclusive',
        source_fragment:
          'scheme_id is a bounded ASCII token (max 128 UTF-8 bytes; allowed [a-z0-9._:/+-]); mutually exclusive with scheme_ref',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'PROV-LIFE-006',
        keyword: 'MUST',
        summary:
          'payment_authorization_observation.max_amount_minor is a non-negative bounded decimal-integer string; negative values reject with provisioning.invalid_amount_minor',
        source_fragment:
          'max_amount_minor is non-negative bounded decimal string; negative values reject with provisioning.invalid_amount_minor',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'PROV-LIFE-007',
        keyword: 'MUST',
        summary:
          'Per-event-kind required fields enforced via discriminated union; missing observed_at and other missing required fields surface provisioning.missing_required_field',
        source_fragment:
          'per-event-kind required fields enforced via discriminated union; missing required fields surface provisioning.missing_required_field',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'PROV-LIFE-008',
        keyword: 'MUST',
        summary:
          'Unknown event_kind rejects with provisioning.invalid_event_kind; the discriminator is closed over the 10 *-observed event families',
        source_fragment:
          'unknown event_kind rejects with provisioning.invalid_event_kind; closed-enum discriminator over 10 -observed event families',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'PROV-LIFE-009',
        keyword: 'MUST',
        summary:
          'Every type URI in PROVISIONING_LIFECYCLE_TYPE_URIS maps to org.peacprotocol/provisioning-lifecycle in TYPE_TO_EXTENSION_MAP',
        source_fragment:
          'every URI in PROVISIONING_LIFECYCLE_TYPE_URIS maps to org.peacprotocol/provisioning-lifecycle in TYPE_TO_EXTENSION_MAP',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'PROV-LIFE-010',
        keyword: 'MUST',
        summary:
          'Spec boundary text is normative and vendor-neutral; PEAC does not authorize the action, verify legal acceptance, provision resources, validate credentials, process payments, vouch for provider state, settle transactions, manage credential vaults, or operate the runtime',
        source_fragment:
          'PEAC does not authorize the action, verify legal acceptance, provision resources, validate credentials, process payments, vouch for provider state, settle transactions, manage credential vaults, or operate the runtime',
        enforcement_class: 'hard_fail',
      },
    ],
  },

  // --- Section 32: Agent Action Records ---
  {
    section: 32,
    title: 'Agent Action Records',
    anchor: 'agent-action-records',
    governing_spec: 'docs/specs/AGENT-ACTION-RECORDS.md',
    introduced_in: '0.14.3',
    last_reviewed_in: '0.14.3',
    requirements: [
      {
        id: 'AGENT-ACT-001',
        keyword: 'MUST',
        summary:
          'Validator rejects 20 forbidden top-level content-bearing keys with agent.action.inline_content_blocked',
        source_fragment:
          'agent.action.inline_content_blocked rejects 20 forbidden top-level content-bearing keys at extension top level',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'AGENT-ACT-002',
        keyword: 'MUST',
        summary:
          'All *_ref fields validated by the OpaqueRefSchema grammar (no whitespace, no @, recognized prefix, byte-bounded)',
        source_fragment:
          'all *_ref fields validated by the OpaqueRefSchema grammar (no whitespace, no @, recognized prefix, byte-bounded)',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'AGENT-ACT-003',
        keyword: 'MUST',
        summary:
          'Non-string *_ref values reject with agent.action.ref_must_be_string; no Zod string error leaks as a public diagnostic',
        source_fragment:
          'non-string *_ref values reject with agent.action.ref_must_be_string; no Zod string error leaks as a public diagnostic',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'AGENT-ACT-004',
        keyword: 'MUST',
        summary:
          'Per-event-kind required fields enforced; missing agent_ref, action_ref, observed_at, and event-kind-specific required fields surface agent.action.missing_required_field',
        source_fragment:
          'per-event-kind required fields enforced via discriminated union; missing required fields surface agent.action.missing_required_field',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'AGENT-ACT-005',
        keyword: 'MUST',
        summary: 'Unknown event_kind rejects with agent.action.event_kind_unknown',
        source_fragment:
          'unknown event_kind rejects with agent.action.event_kind_unknown; closed-enum discriminator over 6 *-observed event kinds',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'AGENT-ACT-006',
        keyword: 'MUST',
        summary:
          'Malformed observed_at rejects with agent.action.invalid_observed_at; missing observed_at is covered by missing_required_field',
        source_fragment:
          'malformed observed_at rejects with agent.action.invalid_observed_at; missing observed_at is covered by agent.action.missing_required_field',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'AGENT-ACT-007',
        keyword: 'MUST',
        summary:
          'agent-action-delegated-observed requires delegated_to_ref; absent delegated_to_ref rejects with agent.action.missing_required_field',
        source_fragment:
          'agent-action-delegated-observed requires delegated_to_ref; absent delegated_to_ref rejects with agent.action.missing_required_field',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'AGENT-ACT-008',
        keyword: 'MUST',
        summary: 'Agent action records round-trip through @peac/protocol.issue() and verifyLocal()',
        source_fragment:
          'agent action records round-trip through @peac/protocol.issue() and verifyLocal()',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'AGENT-ACT-009',
        keyword: 'MUST',
        summary:
          'Every type URI in AGENT_ACTION_TYPE_URIS maps to org.peacprotocol/agent-action in TYPE_TO_EXTENSION_MAP; validateAgentActionForType rejects unknown type URIs (type_uri_unknown) and type URI / event_kind mismatches (type_event_kind_mismatch)',
        source_fragment:
          'every URI in AGENT_ACTION_TYPE_URIS maps to org.peacprotocol/agent-action in TYPE_TO_EXTENSION_MAP; validateAgentActionForType runtime guard: unknown type URI -> agent.action.type_uri_unknown; mismatched event_kind -> agent.action.type_event_kind_mismatch',
        enforcement_class: 'hard_fail',
      },
      {
        id: 'AGENT-ACT-010',
        keyword: 'MUST',
        summary:
          'Spec boundary text is normative and vendor-neutral; PEAC does not approve, deny, authorize, schedule, execute, govern, enforce, monitor, score, or orchestrate actions',
        source_fragment:
          'PEAC does not approve, deny, authorize, schedule, execute, govern, enforce, monitor, score, or orchestrate actions; action decisions are reported by the caller',
        enforcement_class: 'hard_fail',
      },
    ],
  },
];

// Build sections with hashes
const sections = EXTENSION_REQUIREMENTS.map((section) => {
  const sectionIntroduced = section.introduced_in ?? DEFAULT_VERSION;
  const sectionReviewed = section.last_reviewed_in ?? DEFAULT_VERSION;
  return {
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
      introduced_in: req.introduced_in ?? sectionIntroduced,
      last_reviewed_in: req.last_reviewed_in ?? sectionReviewed,
    })),
  };
});

let totalReqs = 0;
for (const s of sections) totalReqs += s.requirements.length;

// The top-level version tracks the current released package version.
// Per-section introduced_in may reference a future version when new sections
// are added during staged development ahead of a release (e.g. Section 32
// has introduced_in '0.14.3' while DEFAULT_VERSION is '0.14.2').
const output = {
  $schema:
    'https://www.peacprotocol.org/schemas/conformance/extension-requirement-registry.schema.json',
  description:
    'Non-WIRE02 conformance requirements. Generated by build-extension-registry.mjs. Composed into requirement-ids.json by the main build pipeline.',
  version: DEFAULT_VERSION,
  total_requirements: totalReqs,
  sections,
};

writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n');
console.log(
  `Generated ${OUTPUT_PATH}: ${totalReqs} requirements across ${sections.length} sections`
);
