/**
 * Runtime smoke test for examples/action-approval-records.
 *
 * The example is a public, copy-paste artifact, so its end-to-end behavior is
 * gated here (vitest aliases @peac/* to source, so no build/install is needed).
 * Covers the documented evidence state machine and invalid-evidence
 * classifications, including adversarial linkage, identity, intent, ordering,
 * ambiguity, and resource-limit cases. Test-local
 * issuers build invalid-profile fixtures the public builders intentionally
 * cannot produce (parent metadata on decision records, explicit shared jti,
 * unsupported record types, missing linkage fields).
 *
 * No network, no subprocess.
 */

import { describe, it, expect } from 'vitest';
import { issue, verifyLocal } from '@peac/protocol';
import { computeReceiptRef } from '@peac/schema';
import {
  computeIntentDigest,
  validateActionIntent,
} from '../../examples/action-approval-records/action-intent';
import {
  ACTION_APPROVAL_LIMITS,
  AGENT_ACTION_EXTENSION_KEY,
  CORRELATION_EXTENSION_KEY,
  APPROVED_TYPE,
  DENIED_TYPE,
  INVOKED_TYPE,
  verifyActionApprovalEvidence,
} from '../../examples/action-approval-records/verify';
import {
  ISSUER,
  KID,
  WORKFLOW_ID,
  AGENT_REF,
  ACTION_REF,
  APPROVAL_OBSERVED_AT,
  INVOCATION_OBSERVED_AT,
  EXAMPLE_PARAMETERS,
  buildActionIntent,
  exampleParametersDigest,
  issueApproval,
  issueDenial,
  issueInvocation,
  newKeypair,
  runActionApprovalDemo,
  tamperPayload,
} from '../../examples/action-approval-records/demo';

async function jtiOf(jws: string, publicKey: Uint8Array): Promise<string> {
  const v = await verifyLocal(jws, publicKey, { issuer: ISSUER });
  if (!v.valid) throw new Error(`verify failed: ${v.code}`);
  return (v.claims as unknown as { jti: string }).jti;
}

/** Test-local issuer that can emit invalid-profile records the builders cannot. */
async function issueRaw(opts: {
  privateKey: Uint8Array;
  type: string;
  action: Record<string, unknown>;
  correlation: Record<string, unknown>;
  jti?: string;
}): Promise<string> {
  const { jws } = await issue({
    iss: ISSUER,
    kind: 'evidence',
    type: opts.type as never,
    pillars: ['safety'],
    ...(opts.jti !== undefined ? { jti: opts.jti } : {}),
    extensions: {
      [AGENT_ACTION_EXTENSION_KEY]: opts.action,
      [CORRELATION_EXTENSION_KEY]: opts.correlation,
    },
    privateKey: opts.privateKey,
    kid: KID,
  });
  return jws;
}

async function setup() {
  const { publicKey, privateKey } = await newKeypair();
  const intent = await buildActionIntent();
  const intentDigest = await computeIntentDigest(intent);
  const approval = await issueApproval({ privateKey, intentDigest });
  const approvalRef = await computeReceiptRef(approval);
  const approvalJti = await jtiOf(approval, publicKey);
  const expected = { expectedIntent: intent, publicKey, expectedIssuer: ISSUER } as const;
  return {
    publicKey,
    privateKey,
    intent,
    intentDigest,
    approval,
    approvalRef,
    approvalJti,
    expected,
  };
}

describe('action-approval-records example', () => {
  it('1. approval + correctly linked invocation -> approval-linked-invocation-observed', async () => {
    const s = await setup();
    const invocation = await issueInvocation({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      approvalRef: s.approvalRef,
      approvalJti: s.approvalJti,
    });
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [s.approval, invocation],
    });
    expect(r.kind).toBe('approval-linked-invocation-observed');
  });

  it('2. approval with no invocation -> approval-observed', async () => {
    const s = await setup();
    const r = await verifyActionApprovalEvidence({ ...s.expected, records: [s.approval] });
    expect(r.kind).toBe('approval-observed');
  });

  it('3. denial with no invocation -> denial-observed', async () => {
    const s = await setup();
    const denial = await issueDenial({ privateKey: s.privateKey, intentDigest: s.intentDigest });
    const r = await verifyActionApprovalEvidence({ ...s.expected, records: [denial] });
    expect(r.kind).toBe('denial-observed');
  });

  it('4. no decision and no invocation -> approval-not-established', async () => {
    const s = await setup();
    const r = await verifyActionApprovalEvidence({ ...s.expected, records: [] });
    expect(r).toEqual({ kind: 'approval-not-established', reason: 'missing-decision-record' });
  });

  it('5. invocation with missing approval -> dangling-reference', async () => {
    const s = await setup();
    const invocation = await issueInvocation({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      approvalRef: s.approvalRef,
      approvalJti: s.approvalJti,
    });
    const r = await verifyActionApprovalEvidence({ ...s.expected, records: [invocation] });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'dangling-reference' });
  });

  it('6. invocation whose action_ref differs from the expected intent -> identity-mismatch', async () => {
    const s = await setup();
    const changed = await buildActionIntent({ action_ref: 'urn:action:refund-request:99' });
    const digestChanged = await computeIntentDigest(changed);
    const invocation = await issueInvocation({
      privateKey: s.privateKey,
      intentDigest: digestChanged,
      approvalRef: s.approvalRef,
      approvalJti: s.approvalJti,
      actionRef: 'urn:action:refund-request:99',
    });
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [s.approval, invocation],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'identity-mismatch' });
  });

  it('6b. same agent/action but changed intent digest -> intent-mismatch', async () => {
    const s = await setup();
    const changed = await buildActionIntent({ target_ref: 'urn:order:99' });
    const digestChanged = await computeIntentDigest(changed);
    const invocation = await issueInvocation({
      privateKey: s.privateKey,
      intentDigest: digestChanged,
      approvalRef: s.approvalRef,
      approvalJti: s.approvalJti,
    });
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [s.approval, invocation],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'intent-mismatch' });
  });

  it('7. approval observed after invocation -> temporal-order-invalid', async () => {
    const s = await setup();
    const lateApproval = await issueApproval({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      observedAt: '2026-01-15T11:00:00Z',
    });
    const lateApprovalRef = await computeReceiptRef(lateApproval);
    const lateApprovalJti = await jtiOf(lateApproval, s.publicKey);
    const invocation = await issueInvocation({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      approvalRef: lateApprovalRef,
      approvalJti: lateApprovalJti,
      observedAt: '2026-01-15T10:00:00Z',
    });
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [lateApproval, invocation],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'temporal-order-invalid' });
  });

  it('8. equal RFC 3339 instants with different offsets are treated as equal', async () => {
    const s = await setup();
    const approval = await issueApproval({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      observedAt: '2026-01-15T06:00:00-04:00',
    });
    const approvalRef = await computeReceiptRef(approval);
    const approvalJti = await jtiOf(approval, s.publicKey);
    const invocation = await issueInvocation({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      approvalRef,
      approvalJti,
      observedAt: '2026-01-15T10:00:00Z',
    });
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [approval, invocation],
    });
    expect(r.kind).toBe('approval-linked-invocation-observed');
  });

  it('9. ordered instants with different offsets order correctly -> temporal-order-invalid', async () => {
    const s = await setup();
    const approval = await issueApproval({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      observedAt: '2026-01-15T06:00:00-04:00',
    });
    const approvalRef = await computeReceiptRef(approval);
    const approvalJti = await jtiOf(approval, s.publicKey);
    const invocation = await issueInvocation({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      approvalRef,
      approvalJti,
      observedAt: '2026-01-15T09:00:00Z',
    });
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [approval, invocation],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'temporal-order-invalid' });
  });

  it('10. approval + denial conflict -> conflicting-decision-records', async () => {
    const s = await setup();
    const denial = await issueDenial({ privateKey: s.privateKey, intentDigest: s.intentDigest });
    const r = await verifyActionApprovalEvidence({ ...s.expected, records: [s.approval, denial] });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'conflicting-decision-records' });
  });

  it('11. denial + invocation conflict -> denial-with-invocation', async () => {
    const s = await setup();
    const denial = await issueDenial({ privateKey: s.privateKey, intentDigest: s.intentDigest });
    const invocation = await issueInvocation({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      approvalRef: s.approvalRef,
      approvalJti: s.approvalJti,
    });
    const r = await verifyActionApprovalEvidence({ ...s.expected, records: [denial, invocation] });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'denial-with-invocation' });
  });

  it('12. multiple distinct approvals -> conflicting-decision-records', async () => {
    const s = await setup();
    const approval2 = await issueApproval({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      observedAt: '2026-01-15T09:59:00Z',
    });
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [s.approval, approval2],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'conflicting-decision-records' });
  });

  it('13. multiple distinct denials -> conflicting-decision-records', async () => {
    const s = await setup();
    const d1 = await issueDenial({ privateKey: s.privateKey, intentDigest: s.intentDigest });
    const d2 = await issueDenial({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      observedAt: '2026-01-15T09:59:00Z',
    });
    const r = await verifyActionApprovalEvidence({ ...s.expected, records: [d1, d2] });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'conflicting-decision-records' });
  });

  it('14. multiple distinct invocations -> multiple-invocations', async () => {
    const s = await setup();
    const inv1 = await issueInvocation({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      approvalRef: s.approvalRef,
      approvalJti: s.approvalJti,
    });
    const inv2 = await issueInvocation({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      approvalRef: s.approvalRef,
      approvalJti: s.approvalJti,
      observedAt: '2026-01-15T10:06:00Z',
    });
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [s.approval, inv1, inv2],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'multiple-invocations' });
  });

  it('15. exact duplicate JWS deduplicated safely (not ambiguous) -> approval-observed', async () => {
    const s = await setup();
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [s.approval, s.approval],
    });
    expect(r.kind).toBe('approval-observed');
  });

  it('16. two byte-distinct records sharing (iss, jti) -> ambiguous-reference', async () => {
    const s = await setup();
    const sharedJti = '01JQ0000000000000000000001';
    const a1 = await issueRaw({
      privateKey: s.privateKey,
      type: APPROVED_TYPE,
      jti: sharedJti,
      action: {
        event_kind: 'agent-action-approved-observed',
        agent_ref: AGENT_REF,
        action_ref: ACTION_REF,
        observed_at: '2026-01-15T10:00:00Z',
        upstream_artifact_digest: s.intentDigest,
      },
      correlation: { workflow_id: WORKFLOW_ID },
    });
    const a2 = await issueRaw({
      privateKey: s.privateKey,
      type: APPROVED_TYPE,
      jti: sharedJti,
      action: {
        event_kind: 'agent-action-approved-observed',
        agent_ref: AGENT_REF,
        action_ref: ACTION_REF,
        observed_at: '2026-01-15T10:01:00Z',
        upstream_artifact_digest: s.intentDigest,
      },
      correlation: { workflow_id: WORKFLOW_ID },
    });
    expect(a1).not.toBe(a2);
    const r = await verifyActionApprovalEvidence({ ...s.expected, records: [a1, a2] });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'ambiguous-reference' });
  });

  it('17. wrong parent_ref -> link-mismatch', async () => {
    const s = await setup();
    const invocation = await issueInvocation({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      approvalRef: `sha256:${'0'.repeat(64)}`,
      approvalJti: s.approvalJti,
    });
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [s.approval, invocation],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'link-mismatch' });
  });

  it('18. parent_ref and parent_jti resolving to different records -> link-mismatch', async () => {
    const s = await setup();
    const invocation = await issueInvocation({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      approvalRef: s.approvalRef,
      approvalJti: '01JQ0000000000000000WRONG1',
    });
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [s.approval, invocation],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'link-mismatch' });
  });

  it('19. wrong single depends_on -> link-mismatch', async () => {
    const s = await setup();
    const invocation = await issueInvocation({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      approvalRef: s.approvalRef,
      approvalJti: s.approvalJti,
      dependsOn: ['01JQ000000000000000OTHER1'],
    });
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [s.approval, invocation],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'link-mismatch' });
  });

  it('19b. multiple depends_on entries -> link-mismatch', async () => {
    const s = await setup();
    const invocation = await issueInvocation({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      approvalRef: s.approvalRef,
      approvalJti: s.approvalJti,
      dependsOn: [s.approvalJti, '01JQ0000000000000000EXTRA1'],
    });
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [s.approval, invocation],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'link-mismatch' });
  });

  it('19c. invocation missing parent_ref -> dangling-reference', async () => {
    const s = await setup();
    const invocation = await issueRaw({
      privateKey: s.privateKey,
      type: INVOKED_TYPE,
      action: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: AGENT_REF,
        action_ref: ACTION_REF,
        observed_at: INVOCATION_OBSERVED_AT,
        upstream_artifact_digest: s.intentDigest,
      },
      correlation: {
        workflow_id: WORKFLOW_ID,
        parent_jti: s.approvalJti,
        depends_on: [s.approvalJti],
      },
    });
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [s.approval, invocation],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'dangling-reference' });
  });

  it('19d. invocation missing parent_jti -> link-mismatch', async () => {
    const s = await setup();
    const invocation = await issueRaw({
      privateKey: s.privateKey,
      type: INVOKED_TYPE,
      action: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: AGENT_REF,
        action_ref: ACTION_REF,
        observed_at: INVOCATION_OBSERVED_AT,
        upstream_artifact_digest: s.intentDigest,
        parent_ref: s.approvalRef,
      },
      correlation: { workflow_id: WORKFLOW_ID, depends_on: [s.approvalJti] },
    });
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [s.approval, invocation],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'link-mismatch' });
  });

  it('19e. invocation missing depends_on -> link-mismatch', async () => {
    const s = await setup();
    const invocation = await issueRaw({
      privateKey: s.privateKey,
      type: INVOKED_TYPE,
      action: {
        event_kind: 'agent-action-invoked-observed',
        agent_ref: AGENT_REF,
        action_ref: ACTION_REF,
        observed_at: INVOCATION_OBSERVED_AT,
        upstream_artifact_digest: s.intentDigest,
        parent_ref: s.approvalRef,
      },
      correlation: { workflow_id: WORKFLOW_ID, parent_jti: s.approvalJti },
    });
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [s.approval, invocation],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'link-mismatch' });
  });

  it('20. workflow mismatch -> workflow-mismatch', async () => {
    const s = await setup();
    const denial = await issueDenial({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      workflowId: 'workflow-other-999',
    });
    const r = await verifyActionApprovalEvidence({ ...s.expected, records: [denial] });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'workflow-mismatch' });
  });

  it('21. agent_ref mismatch -> identity-mismatch', async () => {
    const s = await setup();
    const denial = await issueDenial({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      agentRef: 'urn:agent:other-bot',
    });
    const r = await verifyActionApprovalEvidence({ ...s.expected, records: [denial] });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'identity-mismatch' });
  });

  it('22. action_ref mismatch -> identity-mismatch', async () => {
    const s = await setup();
    const denial = await issueDenial({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      actionRef: 'urn:action:other:1',
    });
    const r = await verifyActionApprovalEvidence({ ...s.expected, records: [denial] });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'identity-mismatch' });
  });

  it('23. unexpected issuer -> unexpected-issuer', async () => {
    const s = await setup();
    const otherIssuerApproval = await issueApproval({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      issuer: 'https://other.example',
    });
    const r = await verifyActionApprovalEvidence({ ...s.expected, records: [otherIssuerApproval] });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'unexpected-issuer' });
  });

  it('24. valid but unsupported agent-action type (cancelled-observed) -> unexpected-record-type', async () => {
    const s = await setup();
    const cancelled = await issueRaw({
      privateKey: s.privateKey,
      type: 'org.peacprotocol/agent-action-cancelled-observed',
      action: {
        event_kind: 'agent-action-cancelled-observed',
        agent_ref: AGENT_REF,
        action_ref: ACTION_REF,
        observed_at: APPROVAL_OBSERVED_AT,
        upstream_artifact_digest: s.intentDigest,
      },
      correlation: { workflow_id: WORKFLOW_ID },
    });
    const r = await verifyActionApprovalEvidence({ ...s.expected, records: [cancelled] });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'unexpected-record-type' });
  });

  it('25. malformed intent -> intent-invalid', async () => {
    const s = await setup();
    const r = await verifyActionApprovalEvidence({
      expectedIntent: { not: 'an intent' } as never,
      publicKey: s.publicKey,
      expectedIssuer: ISSUER,
      records: [s.approval],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'intent-invalid' });
  });

  it('26. unknown intent field -> intent-invalid', async () => {
    const s = await setup();
    const r = await verifyActionApprovalEvidence({
      expectedIntent: { ...(await buildActionIntent()), extra: 'x' } as never,
      publicKey: s.publicKey,
      expectedIssuer: ISSUER,
      records: [s.approval],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'intent-invalid' });
  });

  it('27. oversized intent -> input-limit-exceeded', async () => {
    const s = await setup();
    const huge = await buildActionIntent({
      target_ref: `urn:x:${'y'.repeat(ACTION_APPROVAL_LIMITS.maxIntentBytes)}`,
    });
    const r = await verifyActionApprovalEvidence({
      expectedIntent: huge,
      publicKey: s.publicKey,
      expectedIssuer: ISSUER,
      records: [s.approval],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'input-limit-exceeded' });
  });

  it('28. record-count limit -> input-limit-exceeded', async () => {
    const s = await setup();
    const records = Array.from({ length: ACTION_APPROVAL_LIMITS.maxRecords + 1 }, () => s.approval);
    const r = await verifyActionApprovalEvidence({ ...s.expected, records });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'input-limit-exceeded' });
  });

  it('29. per-record byte limit -> input-limit-exceeded', async () => {
    const s = await setup();
    const big = 'x'.repeat(ACTION_APPROVAL_LIMITS.maxJwsBytes + 1);
    const r = await verifyActionApprovalEvidence({ ...s.expected, records: [big] });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'input-limit-exceeded' });
  });

  it('30. total-record-byte limit -> input-limit-exceeded', async () => {
    const s = await setup();
    const chunk = 'x'.repeat(ACTION_APPROVAL_LIMITS.maxJwsBytes - 1);
    const records = Array.from({ length: 5 }, (_, i) => chunk + String(i));
    const r = await verifyActionApprovalEvidence({ ...s.expected, records });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'input-limit-exceeded' });
  });

  it('31. tampered approval JWS -> record-invalid', async () => {
    const s = await setup();
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [tamperPayload(s.approval)],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'record-invalid' });
  });

  it('32. tampered denial JWS -> record-invalid', async () => {
    const s = await setup();
    const denial = await issueDenial({ privateKey: s.privateKey, intentDigest: s.intentDigest });
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [tamperPayload(denial)],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'record-invalid' });
  });

  it('33. tampered invocation JWS -> record-invalid', async () => {
    const s = await setup();
    const invocation = await issueInvocation({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      approvalRef: s.approvalRef,
      approvalJti: s.approvalJti,
    });
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [s.approval, tamperPayload(invocation)],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'record-invalid' });
  });

  it('34. every permutation of the same valid set returns the same result', async () => {
    const s = await setup();
    const invocation = await issueInvocation({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      approvalRef: s.approvalRef,
      approvalJti: s.approvalJti,
    });
    const a = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [s.approval, invocation],
    });
    const b = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [invocation, s.approval],
    });
    expect(a).toEqual(b);
    expect(a.kind).toBe('approval-linked-invocation-observed');
  });

  it('35. input arrays and intent remain unchanged after verification', async () => {
    const s = await setup();
    const invocation = await issueInvocation({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      approvalRef: s.approvalRef,
      approvalJti: s.approvalJti,
    });
    const records = [s.approval, invocation];
    const recordsCopy = [...records];
    const intentCopy = JSON.stringify(s.intent);
    await verifyActionApprovalEvidence({ ...s.expected, records });
    expect(records).toEqual(recordsCopy);
    expect(JSON.stringify(s.intent)).toBe(intentCopy);
  });

  it('36. approval carrying parent metadata -> link-mismatch', async () => {
    const s = await setup();
    const approvalWithParent = await issueRaw({
      privateKey: s.privateKey,
      type: APPROVED_TYPE,
      action: {
        event_kind: 'agent-action-approved-observed',
        agent_ref: AGENT_REF,
        action_ref: ACTION_REF,
        observed_at: APPROVAL_OBSERVED_AT,
        upstream_artifact_digest: s.intentDigest,
        parent_ref: `sha256:${'1'.repeat(64)}`,
      },
      correlation: {
        workflow_id: WORKFLOW_ID,
        parent_jti: '01JQ0000000000000000PARNT1',
        depends_on: ['01JQ0000000000000000PARNT1'],
      },
    });
    const r = await verifyActionApprovalEvidence({ ...s.expected, records: [approvalWithParent] });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'link-mismatch' });
  });

  it('36b. denial carrying parent metadata -> link-mismatch', async () => {
    const s = await setup();
    const denialWithParent = await issueRaw({
      privateKey: s.privateKey,
      type: DENIED_TYPE,
      action: {
        event_kind: 'agent-action-denied-observed',
        agent_ref: AGENT_REF,
        action_ref: ACTION_REF,
        observed_at: APPROVAL_OBSERVED_AT,
        upstream_artifact_digest: s.intentDigest,
      },
      correlation: {
        workflow_id: WORKFLOW_ID,
        parent_jti: '01JQ0000000000000000PARNT2',
      },
    });
    const r = await verifyActionApprovalEvidence({ ...s.expected, records: [denialWithParent] });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'link-mismatch' });
  });

  it('37. non-string record input -> record-invalid (does not throw)', async () => {
    const s = await setup();
    const r = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [42 as unknown as string, s.approval],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'record-invalid' });
  });

  it('38. sanitized intent snapshot is stable if the caller mutates the original', async () => {
    const original = await buildActionIntent();
    const result = validateActionIntent(original);
    expect(result.ok).toBe(true);
    const digestBefore = result.ok ? await computeIntentDigest(result.intent) : '';
    // Mutate the caller's original object after validation.
    (original as { target_ref: string }).target_ref = 'urn:order:tampered';
    const digestAfter = result.ok ? await computeIntentDigest(result.intent) : 'x';
    expect(digestAfter).toBe(digestBefore);
  });

  it('39. intent parameters_digest equals the computed example parameters digest', async () => {
    const intent = await buildActionIntent();
    expect(intent.parameters_digest).toBe(await exampleParametersDigest());
    expect(intent.parameters_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('40. runActionApprovalDemo end to end is ok with exact result names', async () => {
    const r = await runActionApprovalDemo();
    expect(r.ok).toBe(true);
    expect(r.approvedResult).toBe('approval-linked-invocation-observed');
    expect(r.deniedResult).toBe('denial-observed');
    expect(r.missingResult).toBe('approval-not-established');
    expect(r.mismatchResult).toBe('invalid-evidence: intent-mismatch');
    expect(r.tamperResult).toBe('invalid-evidence: record-invalid');
  });

  it('41. two independently invalid records are permutation-stable (same reason)', async () => {
    const s = await setup();
    const wrongIssuer = await issueApproval({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      issuer: 'https://other.example',
    });
    const wrongAgent = await issueDenial({
      privateKey: s.privateKey,
      intentDigest: s.intentDigest,
      agentRef: 'urn:agent:other-bot',
    });
    const a = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [wrongIssuer, wrongAgent],
    });
    const b = await verifyActionApprovalEvidence({
      ...s.expected,
      records: [wrongAgent, wrongIssuer],
    });
    expect(a).toEqual(b);
    expect(a.kind).toBe('invalid-evidence');
  });

  it('42. unknown intent property with a getter is rejected without invoking the getter', async () => {
    const s = await setup();
    let getterCalls = 0;
    const base = await buildActionIntent();
    const tricky: Record<string, unknown> = { ...base };
    Object.defineProperty(tricky, 'surprise', {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('getter should never run');
      },
    });
    const r = await verifyActionApprovalEvidence({
      expectedIntent: tricky as never,
      publicKey: s.publicKey,
      expectedIssuer: ISSUER,
      records: [s.approval],
    });
    expect(r).toEqual({ kind: 'invalid-evidence', reason: 'intent-invalid' });
    expect(getterCalls).toBe(0);
  });

  it('42b. required target_ref getter that throws -> intent-invalid without throwing', async () => {
    const base = await buildActionIntent();
    const tricky: Record<string, unknown> = { ...base };
    Object.defineProperty(tricky, 'target_ref', {
      enumerable: true,
      get() {
        throw new Error('getter should fail closed');
      },
    });
    expect(() => validateActionIntent(tricky)).not.toThrow();
    expect(validateActionIntent(tricky)).toEqual({ ok: false, reason: 'intent-invalid' });
  });

  it('42c. Proxy ownKeys trap that throws -> intent-invalid without throwing', async () => {
    const base = await buildActionIntent();
    const trap = new Proxy(base as Record<string, unknown>, {
      ownKeys() {
        throw new Error('ownKeys should fail closed');
      },
    });
    expect(() => validateActionIntent(trap)).not.toThrow();
    expect(validateActionIntent(trap)).toEqual({ ok: false, reason: 'intent-invalid' });
  });

  it('43. EXAMPLE_PARAMETERS is frozen at runtime', () => {
    expect(Object.isFrozen(EXAMPLE_PARAMETERS)).toBe(true);
  });

  it('validateActionIntent + computeIntentDigest are stable', async () => {
    const intent = await buildActionIntent();
    expect(validateActionIntent(intent).ok).toBe(true);
    const d1 = await computeIntentDigest(intent);
    const d2 = await computeIntentDigest(await buildActionIntent());
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('constants match the documented profile and instants compare numerically', () => {
    expect(WORKFLOW_ID).toBe('workflow-action-approval-001');
    expect(AGENT_REF).toBe('urn:agent:research-bot');
    expect(ACTION_REF).toBe('urn:action:refund-request:42');
    expect(Date.parse(APPROVAL_OBSERVED_AT)).toBeLessThan(Date.parse(INVOCATION_OBSERVED_AT));
  });
});
