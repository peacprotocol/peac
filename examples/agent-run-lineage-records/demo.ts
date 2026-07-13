/**
 * Agent Run Lineage Records example.
 *
 * Issues single-issuer PEAC agent-action records for a recorded, deterministic
 * agent run (model call, delegation, tool call) plus a run-finalization record
 * carrying example-local run-summary metadata, and verifies offline that the
 * records are internally consistent with an issuer-supplied run manifest.
 *
 * PEAC is not a runtime, graph engine, scheduler, orchestrator, replay engine,
 * or fork engine; it records what the runtime reports. Raw prompts, model
 * outputs, tool inputs/outputs, headers, and credentials never appear in the
 * manifest, the records, or the logs.
 *
 * Issuance runs the same strict validators as verification: the manifest is
 * validated and its sanitized snapshot is used, and every agent-action,
 * correlation, and example-local extension is validated before `issue()`.
 */

import { computeJsonDocumentDigestJcs, issue, verifyLocal } from '@peac/protocol';
import {
  type ReceiptRef,
  CorrelationExtensionSchema,
  computeReceiptRef,
  validateAgentActionForType,
} from '@peac/schema';
import { buildReceiptMerkleCommitment } from '@peac/audit';
import {
  type AgentRunEventDescriptorV1,
  type AgentRunManifestV1,
  AGENT_RUN_MANIFEST_ARTIFACT_TYPE,
  computeEventDescriptorDigest,
  computeManifestDigest,
  validateAgentRunManifest,
} from './manifest.js';
import {
  type AgentRunLineageEvidenceResult,
  AGENT_ACTION_EXTENSION_KEY,
  CORRELATION_EXTENSION_KEY,
  DELEGATED_TYPE,
  FINALIZATION_ACTION_REF,
  INVOKED_TYPE,
  RUN_FORK_EXTENSION_KEY,
  RUN_LINEAGE_EXTENSION_KEY,
  RUN_SUMMARY_EXTENSION_KEY,
  isValidForkExtension,
  isValidLineageExtension,
  isValidSummaryExtension,
  verifyAgentRunLineageEvidence,
} from './verify.js';

export const ISSUER = 'https://runtime.example';
export const KID = 'runtime-key-2026';
export const WORKFLOW_ID = 'agent-run-workflow-001';
export const RUN_REF = 'urn:example:agent-run:001';
export const FORK_RUN_REF = 'urn:example:agent-run:002';
export const AGENT_REF = 'urn:agent:research-bot';

export interface Keypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

async function digestOf(value: Record<string, unknown>): Promise<string> {
  return computeJsonDocumentDigestJcs(
    value as unknown as Parameters<typeof computeJsonDocumentDigestJcs>[0]
  );
}

/** Build the deterministic three-event run manifest (digests only). */
export async function buildAgentRunManifest(
  overrides: { runRef?: string } = {}
): Promise<AgentRunManifestV1> {
  const runRef = overrides.runRef ?? RUN_REF;
  const modelInput = await digestOf({ kind: 'model-request', model_ref: 'urn:example:model:m1' });
  const modelOutput = await digestOf({ kind: 'model-response', tokens: 12 });
  const delegationInput = await digestOf({ kind: 'delegation-request', task: 'summarize' });
  const toolInput = await digestOf({ kind: 'tool-request', tool_ref: 'urn:example:tool:search' });
  const toolOutput = await digestOf({ kind: 'tool-response', rows: 3 });
  const events: AgentRunEventDescriptorV1[] = [
    {
      event_ref: 'urn:example:event:001',
      sequence_index: 0,
      event_kind: 'model-call',
      agent_ref: AGENT_REF,
      action_ref: 'urn:example:action:model-call',
      observed_at: '2026-01-15T10:00:00Z',
      input_digest: modelInput,
      output_digest: modelOutput,
    },
    {
      event_ref: 'urn:example:event:002',
      sequence_index: 1,
      event_kind: 'delegation',
      agent_ref: AGENT_REF,
      action_ref: 'urn:example:action:delegate',
      observed_at: '2026-01-15T10:01:00Z',
      input_digest: delegationInput,
      delegated_to_ref: 'urn:agent:summarizer-bot',
    },
    {
      event_ref: 'urn:example:event:003',
      sequence_index: 2,
      event_kind: 'tool-call',
      agent_ref: AGENT_REF,
      action_ref: 'urn:example:action:tool-call',
      observed_at: '2026-01-15T10:02:00Z',
      input_digest: toolInput,
      output_digest: toolOutput,
    },
  ];
  return {
    artifact_type: AGENT_RUN_MANIFEST_ARTIFACT_TYPE,
    run_ref: runRef,
    workflow_id: WORKFLOW_ID,
    event_count: events.length,
    events,
  };
}

/**
 * Build a forked-run manifest that diverges from the parent at one event: the
 * event at `changedSequenceIndex` gets a new `event_ref` and a new
 * `input_digest`. The changed event is identified by sequence, not by any
 * hash-sorted position.
 */
export async function buildForkManifest(changedSequenceIndex: number): Promise<{
  manifest: AgentRunManifestV1;
  changedEventRef: string;
  changedInputDigest: string;
}> {
  const base = await buildAgentRunManifest({ runRef: FORK_RUN_REF });
  if (
    !Number.isSafeInteger(changedSequenceIndex) ||
    changedSequenceIndex < 0 ||
    changedSequenceIndex >= base.event_count
  ) {
    throw new Error(
      `buildForkManifest: changedSequenceIndex out of range: ${changedSequenceIndex}`
    );
  }
  const changedEventRef = 'urn:example:event:f02';
  if (base.events.some((e) => e.event_ref === changedEventRef)) {
    throw new Error('buildForkManifest: changed event_ref collides with a base event_ref');
  }
  const changedKind = base.events[changedSequenceIndex].event_kind;
  const requestKind =
    changedKind === 'delegation'
      ? 'delegation-request'
      : changedKind === 'tool-call'
        ? 'tool-request'
        : 'model-request';
  const changedInputDigest = await digestOf({ kind: requestKind, variant: 'forked', seed: 7 });
  const events = base.events.map((e, i) =>
    i === changedSequenceIndex
      ? ({
          ...e,
          event_ref: changedEventRef,
          input_digest: changedInputDigest,
        } as AgentRunEventDescriptorV1)
      : e
  );
  // Ensure the descriptor actually changed.
  if (
    events[changedSequenceIndex].input_digest === base.events[changedSequenceIndex].input_digest
  ) {
    throw new Error('buildForkManifest: changed event did not change');
  }
  return {
    manifest: { ...base, events },
    changedEventRef,
    changedInputDigest,
  };
}

async function jtiOf(jws: string, publicKey: Uint8Array): Promise<string> {
  const v = await verifyLocal(jws, publicKey, { issuer: ISSUER });
  if (!v.valid) throw new Error(`record did not verify: ${v.code}`);
  const jti = (v.claims as unknown as { jti?: unknown }).jti;
  if (typeof jti !== 'string') throw new Error('record missing jti');
  return jti;
}

interface EventLink {
  readonly ref: ReceiptRef;
  readonly jti: string;
}

export interface IssuedRun {
  readonly manifest: AgentRunManifestV1;
  readonly manifestDigest: string;
  readonly eventJws: readonly string[];
  /** Event-record refs in sequence order (parallel to `eventJws`). */
  readonly eventRefs: readonly ReceiptRef[];
  readonly finalizationJws: string;
  readonly finalizationRef: ReceiptRef;
  /** Coverage set: event-record refs, canonically ASCII-sorted. */
  readonly coveredRecordRefs: readonly ReceiptRef[];
}

/** Reject an agent-action payload that would not pass verification. */
function assertAgentActionValid(type: string, action: Record<string, unknown>): void {
  const result = validateAgentActionForType(type, action);
  if (!result.ok) throw new Error(`agent-action payload invalid for issuance: ${type}`);
}

/** Reject a correlation payload that would not pass the canonical strict schema. */
function assertCorrelationValid(correlation: Record<string, unknown>): void {
  if (!CorrelationExtensionSchema.safeParse(correlation).success) {
    throw new Error('correlation payload invalid for issuance');
  }
}

/**
 * Issue a full run: event records + a finalization record whose summary carries
 * the sorted coverage set and the mandatory Merkle commitment. When `fork` is
 * supplied, the finalization record also carries the fork extension. The
 * manifest is validated and its sanitized snapshot is used.
 */
export async function issueRun(opts: {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  manifest: AgentRunManifestV1;
  finalizationObservedAt?: string;
  fork?: {
    parent_run_summary_ref: string;
    fork_point_record_ref: string;
    changed_event_ref: string;
    changed_input_digest: string;
    diff_artifact_digest: string;
  };
}): Promise<IssuedRun> {
  const validated = validateAgentRunManifest(opts.manifest);
  if (!validated.ok) throw new Error(`manifest invalid for issuance: ${validated.reason}`);
  const manifest = validated.manifest;
  const workflowId = manifest.workflow_id;
  const manifestDigest = await computeManifestDigest(manifest);

  const eventJws: string[] = [];
  const eventRefs: ReceiptRef[] = [];
  const links: EventLink[] = [];
  let parent: EventLink | undefined;
  for (const descriptor of manifest.events) {
    const { jws } = await issueEventCaptured({
      privateKey: opts.privateKey,
      publicKey: opts.publicKey,
      descriptor,
      workflowId,
      runRef: manifest.run_ref,
      runManifestDigest: manifestDigest,
      parent,
    });
    eventJws.push(jws);
    const link: EventLink = {
      ref: await computeReceiptRef(jws),
      jti: await jtiOf(jws, opts.publicKey),
    };
    eventRefs.push(link.ref);
    links.push(link);
    parent = link;
  }

  const coveredRecordRefs = [...eventRefs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const commitment = buildReceiptMerkleCommitment(coveredRecordRefs);
  const last = links[links.length - 1];

  const action: Record<string, unknown> = {
    event_kind: 'agent-action-invoked-observed',
    // The finalization subject is the run's ROOT agent, derived from the
    // supplied manifest, never a hardcoded constant.
    agent_ref: manifest.events[0].agent_ref,
    action_ref: FINALIZATION_ACTION_REF,
    observed_at: opts.finalizationObservedAt ?? '2026-01-15T10:03:00Z',
    parent_ref: last.ref,
  };
  const correlation: Record<string, unknown> = {
    workflow_id: workflowId,
    parent_jti: last.jti,
    depends_on: [last.jti],
  };
  const lineage = {
    run_ref: manifest.run_ref,
    run_manifest_digest: manifestDigest,
    sequence_index: manifest.event_count,
  };
  const summary = {
    covered_record_refs: coveredRecordRefs,
    covered_record_count: coveredRecordRefs.length,
    merkle_commitment: {
      tree_alg: commitment.tree_alg,
      hash_alg: commitment.hash_alg,
      root: commitment.root,
      tree_size: commitment.tree_size,
    },
  };
  assertAgentActionValid(INVOKED_TYPE, action);
  assertCorrelationValid(correlation);
  if (!isValidLineageExtension(lineage)) throw new Error('lineage extension invalid for issuance');
  if (!isValidSummaryExtension(summary)) throw new Error('summary extension invalid for issuance');

  const extensions: Record<string, unknown> = {
    [AGENT_ACTION_EXTENSION_KEY]: action,
    [CORRELATION_EXTENSION_KEY]: correlation,
    [RUN_LINEAGE_EXTENSION_KEY]: lineage,
    [RUN_SUMMARY_EXTENSION_KEY]: summary,
  };
  if (opts.fork) {
    if (!isValidForkExtension(opts.fork)) throw new Error('fork extension invalid for issuance');
    extensions[RUN_FORK_EXTENSION_KEY] = { ...opts.fork };
  }

  const { jws: finalizationJws } = await issue({
    iss: ISSUER,
    kind: 'evidence',
    type: INVOKED_TYPE,
    pillars: ['provenance'],
    extensions,
    privateKey: opts.privateKey,
    kid: KID,
  });
  return {
    manifest,
    manifestDigest,
    eventJws: Object.freeze([...eventJws]),
    eventRefs: Object.freeze([...eventRefs]),
    finalizationJws,
    finalizationRef: await computeReceiptRef(finalizationJws),
    coveredRecordRefs: Object.freeze([...coveredRecordRefs]),
  };
}

/** Issue one event record; validates its agent-action + correlation before issue. */
async function issueEventCaptured(opts: {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  descriptor: AgentRunEventDescriptorV1;
  workflowId: string;
  runRef: string;
  runManifestDigest: string;
  parent?: EventLink;
}): Promise<{ jws: string }> {
  const { descriptor } = opts;
  const descriptorDigest = await computeEventDescriptorDigest(descriptor);
  const type = descriptor.event_kind === 'delegation' ? DELEGATED_TYPE : INVOKED_TYPE;
  const action: Record<string, unknown> = {
    event_kind:
      descriptor.event_kind === 'delegation'
        ? 'agent-action-delegated-observed'
        : 'agent-action-invoked-observed',
    agent_ref: descriptor.agent_ref,
    action_ref: descriptor.action_ref,
    observed_at: descriptor.observed_at,
    upstream_artifact_ref: descriptor.event_ref,
    upstream_artifact_digest: descriptorDigest,
  };
  if (descriptor.event_kind === 'delegation') {
    action.delegated_to_ref = descriptor.delegated_to_ref;
  }
  const correlation: Record<string, unknown> = { workflow_id: opts.workflowId };
  if (opts.parent) {
    action.parent_ref = opts.parent.ref;
    correlation.parent_jti = opts.parent.jti;
    correlation.depends_on = [opts.parent.jti];
  }
  const lineage = {
    run_ref: opts.runRef,
    run_manifest_digest: opts.runManifestDigest,
    sequence_index: descriptor.sequence_index,
  };
  assertAgentActionValid(type, action);
  assertCorrelationValid(correlation);
  if (!isValidLineageExtension(lineage)) throw new Error('lineage extension invalid for issuance');
  return issue({
    iss: ISSUER,
    kind: 'evidence',
    type,
    pillars: ['provenance'],
    extensions: {
      [AGENT_ACTION_EXTENSION_KEY]: action,
      [CORRELATION_EXTENSION_KEY]: correlation,
      [RUN_LINEAGE_EXTENSION_KEY]: lineage,
    },
    privateKey: opts.privateKey,
    kid: KID,
  });
}

/** Flip one character in the JWS payload segment (signature stays, verify fails). */
export function tamperPayload(jws: string): string {
  const parts = jws.split('.');
  if (parts.length !== 3) return jws;
  const payload = parts[1];
  const idx = Math.floor(payload.length / 2);
  const swapped = payload[idx] === 'A' ? 'B' : 'A';
  parts[1] = payload.slice(0, idx) + swapped + payload.slice(idx + 1);
  return parts.join('.');
}

export interface AgentRunLineageDemoResult {
  readonly ok: boolean;
  readonly parentResult: string;
  readonly manifestTamperResult: string;
  readonly payloadTamperResult: string;
  readonly forkResult: string;
}

function reasonOf(r: AgentRunLineageEvidenceResult): string {
  return r.kind === 'invalid-evidence' ? `invalid-evidence: ${r.reason}` : r.kind;
}

export async function runAgentRunLineageDemo(keypair: Keypair): Promise<AgentRunLineageDemoResult> {
  const { publicKey, privateKey } = keypair;

  const manifest = await buildAgentRunManifest();
  const run = await issueRun({ privateKey, publicKey, manifest });
  const records = [...run.eventJws, run.finalizationJws];
  const expected = { expectedManifest: manifest, publicKey, expectedIssuer: ISSUER } as const;

  const parent = await verifyAgentRunLineageEvidence({ ...expected, records });

  // Modify one manifest event descriptor after issuance: the records bind the
  // original whole-manifest digest, so the change is caught globally as
  // run-manifest-mismatch.
  const tamperedManifest: AgentRunManifestV1 = {
    ...manifest,
    events: manifest.events.map((e, i) =>
      i === 0 ? { ...e, output_digest: `sha256:${'0'.repeat(64)}` } : e
    ),
  };
  const manifestTamper = await verifyAgentRunLineageEvidence({
    expectedManifest: tamperedManifest,
    publicKey,
    expectedIssuer: ISSUER,
    records,
  });

  // Tamper a JWS payload -> record-invalid.
  const payloadTamper = await verifyAgentRunLineageEvidence({
    ...expected,
    records: [tamperPayload(run.eventJws[0]), ...run.eventJws.slice(1), run.finalizationJws],
  });

  // Forked run: diverges from the parent at sequence index 1 with a real
  // changed event descriptor; linked to the parent run summary and the parent
  // record at that same sequence position (chosen by sequence, not by sorted
  // ref position).
  const forkSequenceIndex = 1;
  const forked = await buildForkManifest(forkSequenceIndex);
  const forkPointRef = run.eventRefs[forkSequenceIndex];
  const forkPointJws = run.eventJws[forkSequenceIndex];
  const forkRun = await issueRun({
    privateKey,
    publicKey,
    manifest: forked.manifest,
    fork: {
      parent_run_summary_ref: run.finalizationRef,
      fork_point_record_ref: forkPointRef,
      changed_event_ref: forked.changedEventRef,
      changed_input_digest: forked.changedInputDigest,
      diff_artifact_digest: await digestOf({ diff: 'summary', from: RUN_REF, to: FORK_RUN_REF }),
    },
  });
  const fork = await verifyAgentRunLineageEvidence({
    expectedManifest: forked.manifest,
    publicKey,
    expectedIssuer: ISSUER,
    records: [...forkRun.eventJws, forkRun.finalizationJws],
    parentEvidence: { summaryRecord: run.finalizationJws, forkPointRecord: forkPointJws },
  });

  return {
    ok:
      parent.kind === 'run-lineage-evidence-consistent' &&
      manifestTamper.kind === 'invalid-evidence' &&
      manifestTamper.reason === 'run-manifest-mismatch' &&
      payloadTamper.kind === 'invalid-evidence' &&
      payloadTamper.reason === 'record-invalid' &&
      fork.kind === 'run-lineage-evidence-consistent',
    parentResult: reasonOf(parent),
    manifestTamperResult: reasonOf(manifestTamper),
    payloadTamperResult: reasonOf(payloadTamper),
    forkResult: reasonOf(fork),
  };
}

async function main(): Promise<void> {
  const { generateKeypair } = await import('@peac/crypto');
  const keypair = await generateKeypair();
  const result = await runAgentRunLineageDemo(keypair);
  const log = (...args: unknown[]): void => {
    console.log(...args);
  };
  log('Agent Run Lineage Records demo\n');
  log('  parent run            :', result.parentResult);
  log('  manifest tamper       :', result.manifestTamperResult);
  log('  payload tamper        :', result.payloadTamperResult);
  log('  forked run            :', result.forkResult);
  log('\n  overall ok:', result.ok);
  if (!result.ok) process.exitCode = 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && /agent-run-lineage-records[/\\]demo\.ts$/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
