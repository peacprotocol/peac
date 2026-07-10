/**
 * Action Approval Records example.
 *
 * Issues single-issuer PEAC agent-action records for the action-approval flow
 * (approve or deny an action intent; on the approved path, later report the
 * invocation) and verifies offline what the evidence establishes.
 *
 * PEAC records what an external system reported about action approval, denial,
 * and invocation. It does not request approval, determine authority, apply
 * policy, block execution, approve or deny actions, or execute actions. This
 * example is about action approval, not privacy/data-processing consent.
 *
 * The exported builders are reused by the in-process smoke test so scenarios
 * are constructed without a network or subprocess.
 */

import { computeJsonDocumentDigestJcs, issue, verifyLocal } from '@peac/protocol';
import { generateKeypair } from '@peac/crypto';
import { computeReceiptRef } from '@peac/schema';
import {
  type ActionIntentV1,
  ACTION_INTENT_ARTIFACT_TYPE,
  computeIntentDigest,
} from './action-intent.js';
import {
  AGENT_ACTION_EXTENSION_KEY,
  APPROVED_TYPE,
  CORRELATION_EXTENSION_KEY,
  DENIED_TYPE,
  INVOKED_TYPE,
  verifyActionApprovalEvidence,
} from './verify.js';

export const ISSUER = 'https://runtime.example';
export const KID = 'runtime-key-2026';

export const WORKFLOW_ID = 'workflow-action-approval-001';
export const AGENT_REF = 'urn:agent:research-bot';
export const ACTION_REF = 'urn:action:refund-request:42';

export const APPROVAL_OBSERVED_AT = '2026-01-15T10:00:00Z';
export const INVOCATION_OBSERVED_AT = '2026-01-15T10:05:00Z';

export interface Keypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export function newKeypair(): Promise<Keypair> {
  return generateKeypair();
}

/**
 * A small deterministic example parameters artifact. It is NOT placed in any
 * PEAC record; only its digest is referenced by the action intent.
 */
export const EXAMPLE_PARAMETERS = Object.freeze({
  artifact_type: 'com.example/action-parameters/1',
  order_ref: 'urn:order:42',
  operation: 'request-refund',
} as const);

/** The JCS + SHA-256 digest of `EXAMPLE_PARAMETERS` (`sha256:<hex64>`). */
export function exampleParametersDigest(): Promise<string> {
  return computeJsonDocumentDigestJcs(
    EXAMPLE_PARAMETERS as unknown as Parameters<typeof computeJsonDocumentDigestJcs>[0]
  );
}

/**
 * Build a valid example-local action-intent artifact whose `parameters_digest`
 * is the real digest of `EXAMPLE_PARAMETERS`.
 */
export async function buildActionIntent(
  overrides: Partial<ActionIntentV1> = {}
): Promise<ActionIntentV1> {
  return {
    artifact_type: ACTION_INTENT_ARTIFACT_TYPE,
    workflow_id: WORKFLOW_ID,
    agent_ref: AGENT_REF,
    action_ref: ACTION_REF,
    target_ref: 'urn:order:42',
    parameters_ref: 'urn:example:action-parameters:42',
    parameters_digest: await exampleParametersDigest(),
    ...overrides,
  };
}

export interface DecisionOpts {
  readonly privateKey: Uint8Array;
  readonly intentDigest: string;
  readonly workflowId?: string;
  readonly agentRef?: string;
  readonly actionRef?: string;
  readonly observedAt?: string;
  readonly issuer?: string;
}

async function issueDecision(
  type: typeof APPROVED_TYPE | typeof DENIED_TYPE,
  eventKind: 'agent-action-approved-observed' | 'agent-action-denied-observed',
  opts: DecisionOpts
): Promise<string> {
  const { jws } = await issue({
    iss: opts.issuer ?? ISSUER,
    kind: 'evidence',
    type,
    pillars: ['safety'],
    extensions: {
      [AGENT_ACTION_EXTENSION_KEY]: {
        event_kind: eventKind,
        agent_ref: opts.agentRef ?? AGENT_REF,
        action_ref: opts.actionRef ?? ACTION_REF,
        observed_at: opts.observedAt ?? APPROVAL_OBSERVED_AT,
        upstream_artifact_digest: opts.intentDigest,
      },
      [CORRELATION_EXTENSION_KEY]: { workflow_id: opts.workflowId ?? WORKFLOW_ID },
    },
    privateKey: opts.privateKey,
    kid: KID,
  });
  return jws;
}

/** Issue an approval observation record (a root; no parent metadata). */
export function issueApproval(opts: DecisionOpts): Promise<string> {
  return issueDecision(APPROVED_TYPE, 'agent-action-approved-observed', opts);
}

/** Issue a denial observation record (a root; no parent metadata). */
export function issueDenial(opts: DecisionOpts): Promise<string> {
  return issueDecision(DENIED_TYPE, 'agent-action-denied-observed', opts);
}

export interface InvocationOpts {
  readonly privateKey: Uint8Array;
  readonly intentDigest: string;
  readonly approvalRef: string;
  readonly approvalJti: string;
  readonly workflowId?: string;
  readonly agentRef?: string;
  readonly actionRef?: string;
  readonly observedAt?: string;
  readonly dependsOn?: readonly string[];
  readonly issuer?: string;
}

/** Issue an invocation observation record linked to the approval. */
export async function issueInvocation(opts: InvocationOpts): Promise<string> {
  const { jws } = await issue({
    iss: opts.issuer ?? ISSUER,
    kind: 'evidence',
    type: INVOKED_TYPE,
    pillars: ['safety'],
    extensions: {
      [AGENT_ACTION_EXTENSION_KEY]: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: opts.agentRef ?? AGENT_REF,
        action_ref: opts.actionRef ?? ACTION_REF,
        observed_at: opts.observedAt ?? INVOCATION_OBSERVED_AT,
        upstream_artifact_digest: opts.intentDigest,
        parent_ref: opts.approvalRef,
      },
      [CORRELATION_EXTENSION_KEY]: {
        workflow_id: opts.workflowId ?? WORKFLOW_ID,
        parent_jti: opts.approvalJti,
        depends_on: opts.dependsOn ?? [opts.approvalJti],
      },
    },
    privateKey: opts.privateKey,
    kid: KID,
  });
  return jws;
}

/** Read the `jti` claim of a verified record. */
async function jtiOf(jws: string, publicKey: Uint8Array): Promise<string> {
  const v = await verifyLocal(jws, publicKey, { issuer: ISSUER });
  if (!v.valid) throw new Error(`record did not verify: ${v.code}`);
  const jti = (v.claims as unknown as { jti?: unknown }).jti;
  if (typeof jti !== 'string') throw new Error('record missing jti');
  return jti;
}

/** Flip one character in the JWS payload segment (signature stays, verify fails). */
export function tamperPayload(jws: string): string {
  const parts = jws.split('.');
  if (parts.length !== 3) return jws;
  const payload = parts[1];
  const idx = Math.floor(payload.length / 2);
  const ch = payload[idx];
  const swapped = ch === 'A' ? 'B' : 'A';
  parts[1] = payload.slice(0, idx) + swapped + payload.slice(idx + 1);
  return parts.join('.');
}

export interface ActionApprovalDemoResult {
  readonly ok: boolean;
  readonly approvedResult: string;
  readonly deniedResult: string;
  readonly missingResult: string;
  readonly mismatchResult: string;
  readonly tamperResult: string;
}

/**
 * Run the example end to end and return the result kinds for the primary
 * scenarios. Deterministic for the verifier's classification (the result kind
 * depends only on the evidence set, not on the ephemeral key or issuance time).
 */
export async function runActionApprovalDemo(): Promise<ActionApprovalDemoResult> {
  const { publicKey, privateKey } = await newKeypair();
  const intent = await buildActionIntent();
  const intentDigest = await computeIntentDigest(intent);

  const approval = await issueApproval({ privateKey, intentDigest });
  const approvalRef = await computeReceiptRef(approval);
  const approvalJti = await jtiOf(approval, publicKey);
  const invocation = await issueInvocation({ privateKey, intentDigest, approvalRef, approvalJti });

  const expected = { expectedIntent: intent, publicKey, expectedIssuer: ISSUER };

  const approved = await verifyActionApprovalEvidence({
    ...expected,
    records: [approval, invocation],
  });

  const denial = await issueDenial({ privateKey, intentDigest });
  const denied = await verifyActionApprovalEvidence({ ...expected, records: [denial] });

  const missing = await verifyActionApprovalEvidence({ ...expected, records: [] });

  // Same agent and action, but the underlying intent changed after approval
  // (only target_ref differs), so its digest differs: the invocation cannot
  // reuse the approval -> intent-mismatch.
  const changedIntent = await buildActionIntent({ target_ref: 'urn:order:99' });
  const changedDigest = await computeIntentDigest(changedIntent);
  const invocationChanged = await issueInvocation({
    privateKey,
    intentDigest: changedDigest,
    approvalRef,
    approvalJti,
  });
  const mismatch = await verifyActionApprovalEvidence({
    ...expected,
    records: [approval, invocationChanged],
  });

  const tampered = await verifyActionApprovalEvidence({
    ...expected,
    records: [tamperPayload(approval), invocation],
  });

  return {
    ok:
      approved.kind === 'approval-linked-invocation-observed' &&
      denied.kind === 'denial-observed' &&
      missing.kind === 'approval-not-established' &&
      mismatch.kind === 'invalid-evidence' &&
      mismatch.reason === 'intent-mismatch' &&
      tampered.kind === 'invalid-evidence' &&
      tampered.reason === 'record-invalid',
    approvedResult: approved.kind,
    deniedResult: denied.kind,
    missingResult: missing.kind,
    mismatchResult:
      mismatch.kind === 'invalid-evidence' ? `invalid-evidence: ${mismatch.reason}` : mismatch.kind,
    tamperResult:
      tampered.kind === 'invalid-evidence' ? `invalid-evidence: ${tampered.reason}` : tampered.kind,
  };
}

async function main(): Promise<void> {
  const tamper = process.argv.includes('--tamper');
  const result = await runActionApprovalDemo();
  const log = (...args: unknown[]): void => {
    console.log(...args);
  };
  log('Action Approval Records demo\n');
  log('  approved path      :', result.approvedResult);
  log('  denied path        :', result.deniedResult);
  log('  missing approval    :', result.missingResult);
  log('  intent changed post-approval:', result.mismatchResult);
  if (tamper) {
    log('  tampered approval   :', result.tamperResult, '(signature broken -> record-invalid)');
  }
  log('\n  overall ok:', result.ok);
  if (!result.ok) process.exitCode = 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && /action-approval-records[/\\]demo\.ts$/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
