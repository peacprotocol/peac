/**
 * Offline verifier for agent-run-lineage evidence.
 *
 * Given a relying-party-supplied expected run manifest, one issuer public key,
 * one expected issuer, and a set of compact PEAC records, decide whether the
 * records are internally consistent with the manifest and the signed
 * finalization record's asserted coverage set. The verifier reports only what
 * the evidence establishes; it does not replay, fork, execute, or govern any
 * runtime, and it does not claim that every real-world runtime event was
 * recorded or disclosed.
 *
 * Single-issuer example: every record verifies under the one supplied key and
 * carries the one expected issuer.
 *
 * Every untrusted structure is validated fail-closed: the agent-action
 * extension via the canonical `validateAgentActionForType` (using its sanitized
 * `value`), the correlation extension via the canonical strict
 * `CorrelationExtensionSchema`, and each example-local extension via a guarded
 * strict validator that returns a frozen sanitized snapshot. A present-but-
 * malformed example-local extension is `record-invalid`; it is never silently
 * treated as absent.
 */

import { verifyLocal } from '@peac/protocol';
import {
  type ReceiptRef,
  AGENT_ACTION_EXTENSION_KEY,
  CORRELATION_EXTENSION_KEY,
  CorrelationExtensionSchema,
  OpaqueRefSchema,
  ReceiptRefSchema,
  Sha256DigestSchema,
  computeReceiptRef,
  validateAgentActionForType,
} from '@peac/schema';
import {
  type ReceiptMerkleCommitment,
  MERKLE_HASH_ALG,
  MERKLE_TREE_ALG,
  buildReceiptMerkleCommitment,
} from '@peac/audit';
import {
  type AgentRunManifestV1,
  MANIFEST_LIMITS,
  computeEventDescriptorDigest,
  computeManifestDigest,
  utf8ByteLength,
  validateAgentRunManifest,
} from './manifest.js';

// Canonical PEAC keys/constants are re-exported (never redeclared).
export { AGENT_ACTION_EXTENSION_KEY, CORRELATION_EXTENSION_KEY } from '@peac/schema';
export { MERKLE_TREE_ALG, MERKLE_HASH_ALG } from '@peac/audit';

export const RUN_LINEAGE_EXTENSION_KEY = 'com.example/agent-run-lineage' as const;
export const RUN_SUMMARY_EXTENSION_KEY = 'com.example/agent-run-summary' as const;
export const RUN_FORK_EXTENSION_KEY = 'com.example/agent-run-fork' as const;

export const INVOKED_TYPE = 'org.peacprotocol/agent-action-invoked-observed' as const;
export const DELEGATED_TYPE = 'org.peacprotocol/agent-action-delegated-observed' as const;
export const FINALIZATION_ACTION_REF = 'urn:example:action:agent-run-summary-export' as const;

/**
 * Fixed hard limits; NOT caller-configurable. `maxEvents` and `maxManifestBytes`
 * are sourced from `MANIFEST_LIMITS` so the manifest-shape bounds have a single
 * source of truth.
 */
export const AGENT_RUN_LINEAGE_LIMITS = {
  maxRecords: 32,
  maxJwsBytes: 64 * 1024,
  maxTotalJwsBytes: 512 * 1024,
  maxManifestBytes: MANIFEST_LIMITS.maxManifestBytes,
  maxEvents: MANIFEST_LIMITS.maxEvents,
  maxCoveredRecordRefs: MANIFEST_LIMITS.maxEvents,
} as const;

export interface VerifyAgentRunLineageEvidenceInput {
  readonly expectedManifest: unknown;
  readonly records: readonly string[];
  readonly publicKey: Uint8Array;
  readonly expectedIssuer: string;
  readonly parentEvidence?: {
    readonly summaryRecord: string;
    readonly forkPointRecord: string;
  };
}

export type InvalidAgentRunLineageReason =
  | 'input-limit-exceeded'
  | 'manifest-invalid'
  | 'record-invalid'
  | 'unexpected-issuer'
  | 'unexpected-record-type'
  | 'workflow-mismatch'
  | 'run-manifest-mismatch'
  | 'event-descriptor-mismatch'
  | 'sequence-invalid'
  | 'lineage-link-mismatch'
  | 'dangling-reference'
  | 'ambiguous-reference'
  | 'missing-summary-record'
  | 'multiple-summary-records'
  | 'summary-count-mismatch'
  | 'summary-set-mismatch'
  | 'merkle-commitment-mismatch'
  | 'fork-link-mismatch'
  | 'temporal-order-invalid';

export type AgentRunLineageEvidenceResult =
  | {
      kind: 'run-lineage-evidence-consistent';
      runManifestDigest: string;
      summaryRef: ReceiptRef;
      coveredRecordRefs: readonly ReceiptRef[];
      forkLink?: {
        parentRunSummaryRef: ReceiptRef;
        forkPointRecordRef: ReceiptRef;
        changedEventRef: string;
      };
    }
  | { kind: 'invalid-evidence'; reason: InvalidAgentRunLineageReason };

function invalid(reason: InvalidAgentRunLineageReason): AgentRunLineageEvidenceResult {
  return { kind: 'invalid-evidence', reason };
}

function compareAscii(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function asPlainObject(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return undefined;
  return value as Record<string, unknown>;
}

function exactKeys(obj: Record<string, unknown>, required: readonly string[]): boolean {
  const keys = Object.keys(obj);
  return keys.length === required.length && keys.every((k) => required.includes(k));
}

function isOpaqueRef(value: unknown): value is string {
  return typeof value === 'string' && OpaqueRefSchema.safeParse(value).success;
}
function isReceiptRef(value: unknown): value is ReceiptRef {
  return typeof value === 'string' && ReceiptRefSchema.safeParse(value).success;
}
function isSha256(value: unknown): value is string {
  return typeof value === 'string' && Sha256DigestSchema.safeParse(value).success;
}
function isSafeNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isSortedUnique(refs: readonly string[]): boolean {
  for (let i = 1; i < refs.length; i += 1) {
    if (compareAscii(refs[i - 1], refs[i]) >= 0) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Example-local extension validators (guarded, strict, sanitized-frozen).
// ---------------------------------------------------------------------------

export interface AgentRunLineageV1 {
  readonly run_ref: string;
  readonly run_manifest_digest: string;
  readonly sequence_index: number;
}
export interface AgentRunSummaryV1 {
  readonly covered_record_refs: readonly ReceiptRef[];
  readonly covered_record_count: number;
  readonly merkle_commitment: ReceiptMerkleCommitment;
}
export interface AgentRunForkV1 {
  readonly parent_run_summary_ref: ReceiptRef;
  readonly fork_point_record_ref: ReceiptRef;
  readonly changed_event_ref: string;
  readonly changed_input_digest: string;
  readonly diff_artifact_digest: string;
}

const LINEAGE_KEYS = ['run_ref', 'run_manifest_digest', 'sequence_index'] as const;
const SUMMARY_KEYS = ['covered_record_refs', 'covered_record_count', 'merkle_commitment'] as const;
const COMMITMENT_KEYS = ['tree_alg', 'hash_alg', 'root', 'tree_size'] as const;
const FORK_KEYS = [
  'parent_run_summary_ref',
  'fork_point_record_ref',
  'changed_event_ref',
  'changed_input_digest',
  'diff_artifact_digest',
] as const;

/** Present-but-malformed markers are returned distinctly from `undefined` (absent). */
const MALFORMED = Symbol('malformed');
type Parsed<T> = T | undefined | typeof MALFORMED;

function validateLineageExtension(value: unknown): AgentRunLineageV1 | undefined {
  let obj: Record<string, unknown> | undefined;
  let runRef: unknown;
  let digest: unknown;
  let seq: unknown;
  try {
    obj = asPlainObject(value);
    if (!obj || !exactKeys(obj, LINEAGE_KEYS)) return undefined;
    runRef = obj.run_ref;
    digest = obj.run_manifest_digest;
    seq = obj.sequence_index;
  } catch {
    return undefined;
  }
  if (!isOpaqueRef(runRef) || !isSha256(digest) || !isSafeNonNegativeInt(seq)) return undefined;
  return Object.freeze({ run_ref: runRef, run_manifest_digest: digest, sequence_index: seq });
}

function validateMerkleCommitment(value: unknown): ReceiptMerkleCommitment | undefined {
  let obj: Record<string, unknown> | undefined;
  let treeAlg: unknown;
  let hashAlg: unknown;
  let root: unknown;
  let treeSize: unknown;
  try {
    obj = asPlainObject(value);
    if (!obj || !exactKeys(obj, COMMITMENT_KEYS)) return undefined;
    treeAlg = obj.tree_alg;
    hashAlg = obj.hash_alg;
    root = obj.root;
    treeSize = obj.tree_size;
  } catch {
    return undefined;
  }
  if (
    treeAlg !== MERKLE_TREE_ALG ||
    hashAlg !== MERKLE_HASH_ALG ||
    !isSha256(root) ||
    !isSafeNonNegativeInt(treeSize) ||
    treeSize < 1
  ) {
    return undefined;
  }
  return Object.freeze({
    tree_alg: MERKLE_TREE_ALG,
    hash_alg: MERKLE_HASH_ALG,
    root: root as ReceiptMerkleCommitment['root'],
    tree_size: treeSize,
  });
}

function validateSummaryExtension(value: unknown): Parsed<AgentRunSummaryV1> {
  let count: unknown;
  let commitmentRaw: unknown;
  // A plain snapshot of covered_record_refs, materialized inside the guard so a
  // hostile array `length`/index/iterator trap cannot escape the validator.
  let refsSnapshot: unknown[] = [];
  try {
    const obj = asPlainObject(value);
    if (obj === undefined) return MALFORMED;
    if (!exactKeys(obj, SUMMARY_KEYS)) return MALFORMED;
    const refsRaw = obj.covered_record_refs;
    count = obj.covered_record_count;
    commitmentRaw = obj.merkle_commitment;
    if (!Array.isArray(refsRaw)) return MALFORMED;
    const length = refsRaw.length;
    if (!isSafeNonNegativeInt(length)) return MALFORMED;
    const snap: unknown[] = [];
    for (let i = 0; i < length; i += 1) snap.push(refsRaw[i]);
    refsSnapshot = snap;
  } catch {
    return MALFORMED;
  }
  if (
    refsSnapshot.length < 1 ||
    refsSnapshot.length > AGENT_RUN_LINEAGE_LIMITS.maxCoveredRecordRefs
  ) {
    return MALFORMED;
  }
  const refs: ReceiptRef[] = [];
  for (const r of refsSnapshot) {
    if (!isReceiptRef(r)) return MALFORMED;
    refs.push(r);
  }
  if (!isSortedUnique(refs)) return MALFORMED;
  if (!isSafeNonNegativeInt(count) || count !== refs.length) return MALFORMED;
  const commitment = validateMerkleCommitment(commitmentRaw);
  if (!commitment || commitment.tree_size !== count) return MALFORMED;
  return Object.freeze({
    covered_record_refs: Object.freeze([...refs]),
    covered_record_count: count,
    merkle_commitment: commitment,
  });
}

function validateForkExtension(value: unknown): Parsed<AgentRunForkV1> {
  let obj: Record<string, unknown> | undefined;
  let parentRef: unknown;
  let forkPointRef: unknown;
  let changedEventRef: unknown;
  let changedInputDigest: unknown;
  let diffArtifactDigest: unknown;
  try {
    obj = asPlainObject(value);
    if (obj === undefined) return MALFORMED;
    if (!exactKeys(obj, FORK_KEYS)) return MALFORMED;
    parentRef = obj.parent_run_summary_ref;
    forkPointRef = obj.fork_point_record_ref;
    changedEventRef = obj.changed_event_ref;
    changedInputDigest = obj.changed_input_digest;
    diffArtifactDigest = obj.diff_artifact_digest;
  } catch {
    return MALFORMED;
  }
  if (
    !isReceiptRef(parentRef) ||
    !isReceiptRef(forkPointRef) ||
    !isOpaqueRef(changedEventRef) ||
    !isSha256(changedInputDigest) ||
    !isSha256(diffArtifactDigest)
  ) {
    return MALFORMED;
  }
  return Object.freeze({
    parent_run_summary_ref: parentRef,
    fork_point_record_ref: forkPointRef,
    changed_event_ref: changedEventRef,
    changed_input_digest: changedInputDigest,
    diff_artifact_digest: diffArtifactDigest,
  });
}

/**
 * Issuance-time guards: the demo runs the SAME example-local validators before
 * `issue()` so issuance enforces the same invariants as verification.
 */
export function isValidLineageExtension(value: unknown): boolean {
  return validateLineageExtension(value) !== undefined;
}
export function isValidSummaryExtension(value: unknown): boolean {
  const r = validateSummaryExtension(value);
  return r !== undefined && r !== MALFORMED;
}
export function isValidForkExtension(value: unknown): boolean {
  const r = validateForkExtension(value);
  return r !== undefined && r !== MALFORMED;
}

/** Recompute the CT-style commitment over the covered set and match it. */
function merkleMatches(summary: AgentRunSummaryV1): boolean {
  const expected = buildReceiptMerkleCommitment(summary.covered_record_refs);
  return (
    summary.merkle_commitment.root === expected.root &&
    summary.merkle_commitment.tree_size === expected.tree_size &&
    summary.merkle_commitment.tree_size === summary.covered_record_count
  );
}

// ---------------------------------------------------------------------------
// Record normalization.
// ---------------------------------------------------------------------------

interface NormalizedRecord {
  readonly ref: ReceiptRef;
  readonly iss: string;
  readonly jti: string;
  readonly type: string;
  readonly agentRef: string;
  readonly actionRef: string;
  /** Exact issuer-reported timestamp string (used for descriptor equality). */
  readonly observedAt: string;
  /** Parsed instant in ms (used ONLY for chronological ordering). */
  readonly observedAtMs: number;
  readonly upstreamRef: string | undefined;
  readonly upstreamDigest: string | undefined;
  readonly delegatedToRef: string | undefined;
  readonly parentRef: string | undefined;
  readonly workflowId: string | undefined;
  readonly parentJti: string | undefined;
  readonly dependsOn: readonly string[] | undefined;
  readonly lineage: AgentRunLineageV1;
  readonly summary: AgentRunSummaryV1 | undefined;
  readonly fork: AgentRunForkV1 | undefined;
}

interface VerifiedClaims {
  readonly iss?: unknown;
  readonly jti?: unknown;
  readonly type?: unknown;
  readonly extensions?: unknown;
}

/** Normalize one verified record; returns a reason string on any inconsistency. */
function normalize(
  ref: ReceiptRef,
  claims: VerifiedClaims
): NormalizedRecord | InvalidAgentRunLineageReason {
  const type = claims.type;
  if (type !== INVOKED_TYPE && type !== DELEGATED_TYPE) return 'unexpected-record-type';

  const extensions = asPlainObject(claims.extensions);
  if (!extensions) return 'record-invalid';

  const actionResult = validateAgentActionForType(type, extensions[AGENT_ACTION_EXTENSION_KEY]);
  if (!actionResult.ok) return 'record-invalid';
  const action = actionResult.value as Record<string, unknown>;

  const iss = claims.iss;
  const jti = claims.jti;
  const agentRef = action.agent_ref;
  const actionRef = action.action_ref;
  const observedAt = action.observed_at;
  if (
    typeof iss !== 'string' ||
    typeof jti !== 'string' ||
    typeof agentRef !== 'string' ||
    typeof actionRef !== 'string' ||
    typeof observedAt !== 'string'
  ) {
    return 'record-invalid';
  }
  const observedAtMs = Date.parse(observedAt);
  if (Number.isNaN(observedAtMs)) return 'record-invalid';

  const lineage = validateLineageExtension(extensions[RUN_LINEAGE_EXTENSION_KEY]);
  if (!lineage) return 'record-invalid';

  // Correlation via the canonical strict schema. Every run record carries a
  // correlation extension with `workflow_id` (the root record simply omits
  // `parent_jti`/`depends_on`); a present-but-malformed correlation is
  // record-invalid here, and an absent one later fails the workflow binding.
  let workflowId: string | undefined;
  let parentJti: string | undefined;
  let dependsOn: readonly string[] | undefined;
  if (CORRELATION_EXTENSION_KEY in extensions) {
    const parsed = CorrelationExtensionSchema.safeParse(extensions[CORRELATION_EXTENSION_KEY]);
    if (!parsed.success) return 'record-invalid';
    workflowId = parsed.data.workflow_id;
    parentJti = parsed.data.parent_jti;
    dependsOn = parsed.data.depends_on;
  }

  // Example-local summary/fork: present-but-malformed is record-invalid.
  const summaryParsed =
    RUN_SUMMARY_EXTENSION_KEY in extensions
      ? validateSummaryExtension(extensions[RUN_SUMMARY_EXTENSION_KEY])
      : undefined;
  if (summaryParsed === MALFORMED) return 'record-invalid';
  const forkParsed =
    RUN_FORK_EXTENSION_KEY in extensions
      ? validateForkExtension(extensions[RUN_FORK_EXTENSION_KEY])
      : undefined;
  if (forkParsed === MALFORMED) return 'record-invalid';

  return {
    ref,
    iss,
    jti,
    type,
    agentRef,
    actionRef,
    observedAt,
    observedAtMs,
    upstreamRef:
      typeof action.upstream_artifact_ref === 'string' ? action.upstream_artifact_ref : undefined,
    upstreamDigest:
      typeof action.upstream_artifact_digest === 'string'
        ? action.upstream_artifact_digest
        : undefined,
    delegatedToRef:
      typeof action.delegated_to_ref === 'string' ? action.delegated_to_ref : undefined,
    parentRef: typeof action.parent_ref === 'string' ? action.parent_ref : undefined,
    workflowId,
    parentJti,
    dependsOn,
    lineage,
    summary: summaryParsed,
    fork: forkParsed,
  };
}

async function verifyOne(
  jws: string,
  publicKey: Uint8Array,
  expectedIssuer: string
): Promise<NormalizedRecord | InvalidAgentRunLineageReason> {
  // Catch ONLY the untrusted crypto/parse boundary. `normalize` runs OUTSIDE
  // the catch and is total through its own strict validators, so a bug in
  // trusted normalization surfaces rather than silently mapping to
  // `record-invalid`.
  let claims: VerifiedClaims;
  let ref: ReceiptRef;
  try {
    const verified = await verifyLocal(jws, publicKey, { issuer: expectedIssuer });
    if (!verified.valid) {
      return verified.code === 'E_INVALID_ISSUER' ? 'unexpected-issuer' : 'record-invalid';
    }
    claims = verified.claims as VerifiedClaims;
    ref = await computeReceiptRef(jws);
  } catch {
    return 'record-invalid';
  }
  return normalize(ref, claims);
}

/** Enforce the raw record/JWS byte limits over a plain (already snapshotted) list. */
function checkRawLimits(records: readonly unknown[]): InvalidAgentRunLineageReason | undefined {
  if (records.length > AGENT_RUN_LINEAGE_LIMITS.maxRecords) return 'input-limit-exceeded';
  let totalBytes = 0;
  for (const jws of records) {
    if (typeof jws !== 'string') return 'record-invalid';
    const bytes = utf8ByteLength(jws);
    if (bytes > AGENT_RUN_LINEAGE_LIMITS.maxJwsBytes) return 'input-limit-exceeded';
    totalBytes += bytes;
    if (totalBytes > AGENT_RUN_LINEAGE_LIMITS.maxTotalJwsBytes) return 'input-limit-exceeded';
  }
  return undefined;
}

interface InputSnapshot {
  readonly manifest: unknown;
  readonly records: readonly unknown[];
  readonly publicKey: unknown;
  readonly expectedIssuer: unknown;
  readonly parentEvidence:
    | { readonly summaryRecord: unknown; readonly forkPointRecord: unknown }
    | undefined;
}

/**
 * Read the untrusted top-level input behind a guarded boundary: the input
 * object, the `records` array (length + each index copied once into a new plain
 * array), and `parentEvidence` are all read exactly once, so a hostile getter,
 * a throwing array `length`/index/iterator, or a Proxy trap yields a structured
 * result instead of escaping.
 */
function snapshotInput(input: unknown): InputSnapshot | InvalidAgentRunLineageReason {
  try {
    const obj = asPlainObject(input);
    if (!obj) return 'record-invalid';
    const manifest = obj.expectedManifest;
    const rawRecords = obj.records;
    const publicKey = obj.publicKey;
    const expectedIssuer = obj.expectedIssuer;
    const rawParent = obj.parentEvidence;
    if (!Array.isArray(rawRecords)) return 'record-invalid';
    const length = rawRecords.length;
    if (!Number.isSafeInteger(length) || length < 0) return 'record-invalid';
    if (length > AGENT_RUN_LINEAGE_LIMITS.maxRecords) return 'input-limit-exceeded';
    const records: unknown[] = [];
    for (let i = 0; i < length; i += 1) records.push(rawRecords[i]);
    let parentEvidence: { summaryRecord: unknown; forkPointRecord: unknown } | undefined;
    if (rawParent !== undefined) {
      const p = asPlainObject(rawParent);
      if (!p) return 'record-invalid';
      parentEvidence = { summaryRecord: p.summaryRecord, forkPointRecord: p.forkPointRecord };
    }
    return { manifest, records, publicKey, expectedIssuer, parentEvidence };
  } catch {
    return 'record-invalid';
  }
}

/**
 * Verify agent-run-lineage evidence. Deterministic and permutation-stable: the
 * result depends only on the evidence set, never on caller input order. The
 * untrusted top-level input (the input object, the `records` array, and
 * `parentEvidence`) is read once behind a guarded boundary; all subsequent work
 * uses plain snapshots, so no caller getter or Proxy trap can throw out of this
 * function or mutate its inputs. Performs no network, subprocess, or filesystem
 * access.
 */
export async function verifyAgentRunLineageEvidence(
  input: VerifyAgentRunLineageEvidenceInput
): Promise<AgentRunLineageEvidenceResult> {
  const snapshot = snapshotInput(input);
  if (typeof snapshot === 'string') return invalid(snapshot);
  const {
    manifest: expectedManifest,
    records,
    publicKey,
    expectedIssuer,
    parentEvidence,
  } = snapshot;

  // 1. Manifest.
  const manifestResult = validateAgentRunManifest(expectedManifest);
  if (!manifestResult.ok) return invalid(manifestResult.reason);
  const manifest: AgentRunManifestV1 = manifestResult.manifest;
  const manifestDigest = await computeManifestDigest(manifest);

  // 2. Raw input limits (byte bounds) over the plain snapshot.
  const rawLimit = checkRawLimits(records);
  if (rawLimit) return invalid(rawLimit);
  const stringRecords = records as readonly string[];
  const pubKey = publicKey as Uint8Array;
  const issuer = expectedIssuer as string;

  // 3. Dedup, canonical order, verify each once; common manifest binding.
  const uniqueJws = [...new Set(stringRecords)].sort(compareAscii);
  const byRef = new Map<string, NormalizedRecord>();
  const seenIssJti = new Map<string, Set<string>>();
  for (const jws of uniqueJws) {
    const r = await verifyOne(jws, pubKey, issuer);
    if (typeof r === 'string') return invalid(r);
    if (byRef.has(r.ref)) return invalid('record-invalid');
    let jtis = seenIssJti.get(r.iss);
    if (!jtis) {
      jtis = new Set();
      seenIssJti.set(r.iss, jtis);
    }
    if (jtis.has(r.jti)) return invalid('ambiguous-reference');
    jtis.add(r.jti);
    if (r.workflowId !== manifest.workflow_id) return invalid('workflow-mismatch');
    if (
      r.lineage.run_ref !== manifest.run_ref ||
      r.lineage.run_manifest_digest !== manifestDigest
    ) {
      return invalid('run-manifest-mismatch');
    }
    byRef.set(r.ref, r);
  }

  const all = [...byRef.values()];

  // 4. Classify by semantics: finalization = invoked-observed + finalization
  // action_ref. Exactly one; it carries the summary; events carry neither
  // summary nor fork.
  const finalizationCandidates = all.filter(
    (r) => r.type === INVOKED_TYPE && r.actionRef === FINALIZATION_ACTION_REF
  );
  if (finalizationCandidates.length === 0) return invalid('missing-summary-record');
  if (finalizationCandidates.length > 1) return invalid('multiple-summary-records');
  const finalization = finalizationCandidates[0];
  if (finalization.summary === undefined) return invalid('missing-summary-record');
  // A run-summary-export action is not an event: it binds no event descriptor.
  if (finalization.upstreamRef !== undefined || finalization.upstreamDigest !== undefined) {
    return invalid('unexpected-record-type');
  }
  // The finalization subject is the run's root agent (the same rule issuance
  // applies), so a finalization naming a different agent is rejected.
  if (finalization.agentRef !== manifest.events[0].agent_ref) {
    return invalid('event-descriptor-mismatch');
  }

  const eventRecords = all.filter((r) => r !== finalization);
  for (const rec of eventRecords) {
    if (rec.summary !== undefined || rec.fork !== undefined) {
      return invalid('record-invalid');
    }
  }

  // 5. Event records match the manifest descriptors by sequence index.
  if (eventRecords.length !== manifest.event_count) return invalid('sequence-invalid');
  const bySeq = new Map<number, NormalizedRecord>();
  for (const rec of eventRecords) {
    if (
      rec.lineage.sequence_index >= manifest.event_count ||
      bySeq.has(rec.lineage.sequence_index)
    ) {
      return invalid('sequence-invalid');
    }
    bySeq.set(rec.lineage.sequence_index, rec);
  }
  for (let i = 0; i < manifest.event_count; i += 1) {
    const rec = bySeq.get(i);
    if (!rec) return invalid('sequence-invalid');
    const descriptor = manifest.events[i];
    const expectedType = descriptor.event_kind === 'delegation' ? DELEGATED_TYPE : INVOKED_TYPE;
    if (rec.type !== expectedType) return invalid('event-descriptor-mismatch');
    const descriptorDigest = await computeEventDescriptorDigest(descriptor);
    if (rec.upstreamRef !== descriptor.event_ref || rec.upstreamDigest !== descriptorDigest) {
      return invalid('event-descriptor-mismatch');
    }
    if (rec.agentRef !== descriptor.agent_ref || rec.actionRef !== descriptor.action_ref) {
      return invalid('event-descriptor-mismatch');
    }
    // Exact string equality: two representations of the same instant are NOT
    // the same descriptor field. (Ordering uses observedAtMs elsewhere.)
    if (rec.observedAt !== descriptor.observed_at) {
      return invalid('event-descriptor-mismatch');
    }
    if (
      descriptor.event_kind === 'delegation' &&
      rec.delegatedToRef !== descriptor.delegated_to_ref
    ) {
      return invalid('event-descriptor-mismatch');
    }
  }

  // 6. Chain: root has no parent metadata; each later event links to the prior.
  const root = bySeq.get(0)!;
  if (
    root.parentRef !== undefined ||
    root.parentJti !== undefined ||
    root.dependsOn !== undefined
  ) {
    return invalid('lineage-link-mismatch');
  }
  for (let i = 1; i < manifest.event_count; i += 1) {
    const prev = bySeq.get(i - 1)!;
    const cur = bySeq.get(i)!;
    if (cur.parentRef === undefined) return invalid('dangling-reference');
    if (
      cur.parentRef !== prev.ref ||
      cur.parentJti !== prev.jti ||
      cur.dependsOn === undefined ||
      cur.dependsOn.length !== 1 ||
      cur.dependsOn[0] !== prev.jti
    ) {
      return invalid('lineage-link-mismatch');
    }
  }

  // 7. Finalization links to the last event; its sequence index is event_count.
  const lastEvent = bySeq.get(manifest.event_count - 1)!;
  if (finalization.lineage.sequence_index !== manifest.event_count) {
    return invalid('sequence-invalid');
  }
  if (finalization.parentRef === undefined) return invalid('dangling-reference');
  if (
    finalization.parentRef !== lastEvent.ref ||
    finalization.parentJti !== lastEvent.jti ||
    finalization.dependsOn === undefined ||
    finalization.dependsOn.length !== 1 ||
    finalization.dependsOn[0] !== lastEvent.jti
  ) {
    return invalid('lineage-link-mismatch');
  }
  if (finalization.observedAtMs < lastEvent.observedAtMs) return invalid('temporal-order-invalid');

  // 8. Summary: coverage set == event records; mandatory Merkle commitment.
  const summary = finalization.summary;
  if (summary.covered_record_count !== manifest.event_count)
    return invalid('summary-count-mismatch');
  const eventRefs = eventRecords.map((r) => r.ref).sort(compareAscii);
  if (
    summary.covered_record_refs.length !== eventRefs.length ||
    summary.covered_record_refs.some((r, i) => r !== eventRefs[i])
  ) {
    return invalid('summary-set-mismatch');
  }
  if (!merkleMatches(summary)) return invalid('merkle-commitment-mismatch');

  // 9. Fork (optional).
  let forkLink:
    | { parentRunSummaryRef: ReceiptRef; forkPointRecordRef: ReceiptRef; changedEventRef: string }
    | undefined;
  if (finalization.fork !== undefined) {
    const forkResult = await verifyForkEvidence(
      finalization.fork,
      manifest,
      parentEvidence,
      pubKey,
      issuer
    );
    if (typeof forkResult === 'string') return invalid(forkResult);
    forkLink = forkResult;
  } else if (parentEvidence) {
    return invalid('fork-link-mismatch');
  }

  return {
    kind: 'run-lineage-evidence-consistent',
    runManifestDigest: manifestDigest,
    summaryRef: finalization.ref,
    coveredRecordRefs: Object.freeze([...summary.covered_record_refs]),
    ...(forkLink ? { forkLink } : {}),
  };
}

/**
 * Strictly validate a fork extension against its parent evidence and the
 * current (forked) manifest. Establishes a link to a signed parent coverage
 * assertion; it does not fully re-verify the entire historical parent run
 * unless that run is separately supplied and verified. `diff_artifact_digest`
 * is validated as a signed grammar but is NOT independently recomputed (the
 * diff artifact itself is not supplied to this verifier).
 */
async function verifyForkEvidence(
  fork: AgentRunForkV1,
  manifest: AgentRunManifestV1,
  parentEvidence:
    | { readonly summaryRecord: unknown; readonly forkPointRecord: unknown }
    | undefined,
  publicKey: Uint8Array,
  expectedIssuer: string
): Promise<
  | { parentRunSummaryRef: ReceiptRef; forkPointRecordRef: ReceiptRef; changedEventRef: string }
  | InvalidAgentRunLineageReason
> {
  if (!parentEvidence) return 'fork-link-mismatch';

  // changed_event_ref identifies exactly one event in the CHILD (forked)
  // manifest, and changed_input_digest equals that descriptor's input_digest.
  const changed = manifest.events.filter((e) => e.event_ref === fork.changed_event_ref);
  if (changed.length !== 1) return 'fork-link-mismatch';
  const changedEvent = changed[0];
  if (changedEvent.input_digest !== fork.changed_input_digest) return 'fork-link-mismatch';

  // Bound + type-check the two parent-evidence strings before cryptographic work.
  const rawLimit = checkRawLimits([parentEvidence.summaryRecord, parentEvidence.forkPointRecord]);
  if (rawLimit) return rawLimit;

  const parentSummary = await verifyOne(
    parentEvidence.summaryRecord as string,
    publicKey,
    expectedIssuer
  );
  const parentForkPoint = await verifyOne(
    parentEvidence.forkPointRecord as string,
    publicKey,
    expectedIssuer
  );
  if (typeof parentSummary === 'string' || typeof parentForkPoint === 'string') {
    return 'fork-link-mismatch';
  }
  if (parentSummary.ref !== fork.parent_run_summary_ref) return 'fork-link-mismatch';
  if (parentForkPoint.ref !== fork.fork_point_record_ref) return 'fork-link-mismatch';

  // Parent summary must itself be a valid finalization/export action with a
  // self-consistent coverage set + Merkle commitment.
  if (parentSummary.type !== INVOKED_TYPE || parentSummary.actionRef !== FINALIZATION_ACTION_REF) {
    return 'fork-link-mismatch';
  }
  const parentSummaryExt = parentSummary.summary;
  if (parentSummaryExt === undefined) return 'fork-link-mismatch';
  if (!merkleMatches(parentSummaryExt)) return 'fork-link-mismatch';

  // Parent summary finalization causal shape (a coherent finalization record,
  // not an arbitrary signed summary-shaped record).
  if (
    parentSummary.parentRef === undefined ||
    parentSummary.parentJti === undefined ||
    parentSummary.dependsOn === undefined ||
    parentSummary.dependsOn.length !== 1 ||
    parentSummary.dependsOn[0] !== parentSummary.parentJti ||
    !parentSummaryExt.covered_record_refs.includes(parentSummary.parentRef as ReceiptRef)
  ) {
    return 'fork-link-mismatch';
  }
  // Parent summary's own lineage sequence sits just past its coverage set.
  if (parentSummary.lineage.sequence_index !== parentSummaryExt.covered_record_count) {
    return 'fork-link-mismatch';
  }
  // The parent run is a DIFFERENT run than the child.
  if (parentSummary.lineage.run_ref === manifest.run_ref) return 'fork-link-mismatch';

  // Parent fork-point must be an ordinary record of the parent run (not a
  // finalization), sharing run identity, inside the parent coverage set.
  if (
    parentForkPoint.type === INVOKED_TYPE &&
    parentForkPoint.actionRef === FINALIZATION_ACTION_REF
  ) {
    return 'fork-link-mismatch';
  }
  if (parentForkPoint.summary !== undefined || parentForkPoint.fork !== undefined) {
    return 'fork-link-mismatch';
  }
  if (
    parentForkPoint.lineage.run_ref !== parentSummary.lineage.run_ref ||
    parentForkPoint.lineage.run_manifest_digest !== parentSummary.lineage.run_manifest_digest
  ) {
    return 'fork-link-mismatch';
  }
  if (!parentSummaryExt.covered_record_refs.includes(fork.fork_point_record_ref)) {
    return 'fork-link-mismatch';
  }
  if (parentForkPoint.lineage.sequence_index >= parentSummaryExt.covered_record_count) {
    return 'fork-link-mismatch';
  }

  // Workflow ids present, equal across parent records, and equal the child's.
  if (
    parentSummary.workflowId === undefined ||
    parentForkPoint.workflowId === undefined ||
    parentSummary.workflowId !== parentForkPoint.workflowId ||
    parentSummary.workflowId !== manifest.workflow_id
  ) {
    return 'fork-link-mismatch';
  }

  // Child changed event corresponds to the parent fork-point's sequence.
  if (changedEvent.sequence_index !== parentForkPoint.lineage.sequence_index) {
    return 'fork-link-mismatch';
  }

  return {
    parentRunSummaryRef: fork.parent_run_summary_ref,
    forkPointRecordRef: fork.fork_point_record_ref,
    changedEventRef: fork.changed_event_ref,
  };
}
