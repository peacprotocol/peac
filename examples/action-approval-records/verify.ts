/**
 * Offline verifier for action-approval evidence.
 *
 * Given a relying-party-supplied expected action intent, one issuer public key,
 * one expected issuer, and a set of compact PEAC records, decide what the
 * evidence establishes about the reported approval/denial/invocation of that
 * action intent. The verifier reports only what the evidence establishes; it
 * does not approve, deny, authorize, or make a policy decision, and never
 * synthesizes a denial from a missing approval or a digest mismatch.
 *
 * Single-issuer example: every record must verify under the one supplied key
 * and carry the one expected issuer. Multi-issuer approval, approver
 * signatures, countersignatures, quorum, and delegated authority are out of
 * scope.
 */

import { verifyLocal } from '@peac/protocol';
import { computeReceiptRef } from '@peac/schema';
import {
  type ActionIntentV1,
  MAX_INTENT_BYTES,
  computeIntentDigest,
  utf8ByteLength,
  validateActionIntent,
} from './action-intent.js';

export const AGENT_ACTION_EXTENSION_KEY = 'org.peacprotocol/agent-action' as const;
export const CORRELATION_EXTENSION_KEY = 'org.peacprotocol/correlation' as const;

export const APPROVED_TYPE = 'org.peacprotocol/agent-action-approved-observed' as const;
export const DENIED_TYPE = 'org.peacprotocol/agent-action-denied-observed' as const;
export const INVOKED_TYPE = 'org.peacprotocol/agent-action-invoked-observed' as const;

/** Fixed hard limits; NOT caller-configurable (no public limits option). */
export const ACTION_APPROVAL_LIMITS = {
  maxRecords: 16,
  maxJwsBytes: 64 * 1024,
  maxTotalJwsBytes: 256 * 1024,
  maxIntentBytes: MAX_INTENT_BYTES,
} as const;

const EXPECTED_EVENT_KIND: Record<Decision, string> = {
  approved: 'agent-action-approved-observed',
  denied: 'agent-action-denied-observed',
  invoked: 'agent-action-invoked-observed',
};

export interface VerifyActionApprovalEvidenceInput {
  readonly expectedIntent: ActionIntentV1;
  readonly records: readonly string[];
  readonly publicKey: Uint8Array;
  readonly expectedIssuer: string;
}

export type InvalidEvidenceReason =
  | 'intent-invalid'
  | 'record-invalid'
  | 'unexpected-record-type'
  | 'unexpected-issuer'
  | 'identity-mismatch'
  | 'workflow-mismatch'
  | 'intent-mismatch'
  | 'link-mismatch'
  | 'dangling-reference'
  | 'ambiguous-reference'
  | 'temporal-order-invalid'
  | 'conflicting-decision-records'
  | 'denial-with-invocation'
  | 'multiple-invocations'
  | 'input-limit-exceeded';

export type ActionApprovalEvidenceResult =
  | {
      kind: 'approval-linked-invocation-observed';
      intentDigest: string;
      approvalRef: string;
      invocationRef: string;
    }
  | { kind: 'approval-observed'; intentDigest: string; approvalRef: string }
  | { kind: 'denial-observed'; intentDigest: string; denialRef: string }
  | { kind: 'approval-not-established'; reason: 'missing-decision-record' }
  | { kind: 'invalid-evidence'; reason: InvalidEvidenceReason };

type Decision = 'approved' | 'denied' | 'invoked';

interface NormalizedRecord {
  readonly ref: string;
  readonly iss: string;
  readonly jti: string;
  readonly decision: Decision;
  readonly agentRef: string;
  readonly actionRef: string;
  readonly observedAtMs: number;
  readonly upstreamDigest: string;
  readonly workflowId: string | undefined;
  readonly parentRef: string | undefined;
  readonly parentJti: string | undefined;
  readonly dependsOn: readonly string[] | undefined;
}

function invalid(reason: InvalidEvidenceReason): ActionApprovalEvidenceResult {
  return { kind: 'invalid-evidence', reason };
}

function decisionForType(type: unknown): Decision | undefined {
  if (type === APPROVED_TYPE) return 'approved';
  if (type === DENIED_TYPE) return 'denied';
  if (type === INVOKED_TYPE) return 'invoked';
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Locale-independent ASCII ordering (compact JWS is ASCII-safe). */
function compareAscii(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Verify action-approval evidence. Deterministic and permutation-stable: the
 * result depends only on the evidence set, never on input order. Does not
 * mutate the caller's `records` array or `expectedIntent` object, and performs
 * no network, subprocess, or filesystem access.
 */
export async function verifyActionApprovalEvidence(
  input: VerifyActionApprovalEvidenceInput
): Promise<ActionApprovalEvidenceResult> {
  const { expectedIntent, records, publicKey, expectedIssuer } = input;

  // 1. Validate the expected intent and recompute D_intent (never trust a
  //    caller-supplied digest).
  const intentResult = validateActionIntent(expectedIntent);
  if (!intentResult.ok) {
    return invalid(intentResult.reason);
  }
  const intentDigest = await computeIntentDigest(intentResult.intent);

  // 2. Raw input limits (count + UTF-8 bytes) BEFORE any cryptographic work.
  //    Fail closed on non-string evidence supplied through a runtime cast.
  if (records.length > ACTION_APPROVAL_LIMITS.maxRecords) {
    return invalid('input-limit-exceeded');
  }
  let totalBytes = 0;
  for (const jws of records) {
    if (typeof jws !== 'string') {
      return invalid('record-invalid');
    }
    const bytes = utf8ByteLength(jws);
    if (bytes > ACTION_APPROVAL_LIMITS.maxJwsBytes) {
      return invalid('input-limit-exceeded');
    }
    totalBytes += bytes;
    if (totalBytes > ACTION_APPROVAL_LIMITS.maxTotalJwsBytes) {
      return invalid('input-limit-exceeded');
    }
  }

  // 3. Deduplicate byte-identical compact JWS strings, then order them
  //    canonically so the result (including the first-error reason) depends only
  //    on the evidence set, never on caller input order. Does not mutate input.
  const uniqueJws = [...new Set(records)].sort(compareAscii);

  // 4. Verify each unique record once and normalize it. Detect receipt_ref
  //    collisions (same ref, different bytes) and (iss, jti) ambiguity.
  const byRef = new Map<string, NormalizedRecord>();
  const refsByIssuerAndJti = new Map<string, Map<string, string>>();

  for (const jws of uniqueJws) {
    let verified: Awaited<ReturnType<typeof verifyLocal>>;
    let ref: string;
    try {
      verified = await verifyLocal(jws, publicKey, { issuer: expectedIssuer });
      if (verified.valid) {
        ref = await computeReceiptRef(jws);
      } else {
        ref = '';
      }
    } catch {
      // Malformed evidence or a crypto/parser exception fails closed.
      return invalid('record-invalid');
    }
    if (!verified.valid) {
      return invalid(verified.code === 'E_INVALID_ISSUER' ? 'unexpected-issuer' : 'record-invalid');
    }

    const existing = byRef.get(ref);
    if (existing) {
      // Impossible after string-dedup (ref === sha256(jws)), but assert.
      return invalid('record-invalid');
    }

    const claims = verified.claims as unknown as {
      iss?: unknown;
      jti?: unknown;
      type?: unknown;
      extensions?: unknown;
    };

    const decision = decisionForType(claims.type);
    if (decision === undefined) {
      return invalid('unexpected-record-type');
    }

    const extensions = asRecord(claims.extensions);
    const action = asRecord(extensions?.[AGENT_ACTION_EXTENSION_KEY]);
    if (!action) {
      return invalid('record-invalid');
    }
    if (action.event_kind !== EXPECTED_EVENT_KIND[decision]) {
      return invalid('record-invalid');
    }

    const iss = claims.iss;
    const jti = claims.jti;
    const agentRef = action.agent_ref;
    const actionRef = action.action_ref;
    const observedAt = action.observed_at;
    const upstreamDigest = action.upstream_artifact_digest;
    if (
      typeof iss !== 'string' ||
      typeof jti !== 'string' ||
      typeof agentRef !== 'string' ||
      typeof actionRef !== 'string' ||
      typeof observedAt !== 'string' ||
      typeof upstreamDigest !== 'string'
    ) {
      return invalid('record-invalid');
    }

    const observedAtMs = Date.parse(observedAt);
    if (Number.isNaN(observedAtMs)) {
      return invalid('record-invalid');
    }

    // Identity + workflow + intent-digest binding.
    if (
      agentRef !== intentResult.intent.agent_ref ||
      actionRef !== intentResult.intent.action_ref
    ) {
      return invalid('identity-mismatch');
    }
    const correlation = asRecord(extensions?.[CORRELATION_EXTENSION_KEY]);
    const workflowId =
      typeof correlation?.workflow_id === 'string' ? correlation.workflow_id : undefined;
    if (workflowId !== intentResult.intent.workflow_id) {
      return invalid('workflow-mismatch');
    }
    if (upstreamDigest !== intentDigest) {
      return invalid('intent-mismatch');
    }

    // Detect (iss, jti) ambiguity across distinct records using a nested map
    // (no delimiter composition, so no control-character key separators).
    let refsByJti = refsByIssuerAndJti.get(iss);
    if (!refsByJti) {
      refsByJti = new Map<string, string>();
      refsByIssuerAndJti.set(iss, refsByJti);
    }
    if (refsByJti.has(jti)) {
      return invalid('ambiguous-reference');
    }
    refsByJti.set(jti, ref);

    const parentRef = typeof action.parent_ref === 'string' ? action.parent_ref : undefined;
    const parentJti =
      typeof correlation?.parent_jti === 'string' ? correlation.parent_jti : undefined;
    const dependsOn = Array.isArray(correlation?.depends_on)
      ? (correlation.depends_on as unknown[]).filter((v): v is string => typeof v === 'string')
      : undefined;

    // Decision records (approved/denied) are roots in this minimal profile: no
    // parent_ref, parent_jti, or depends_on (including an empty array). Enforced
    // during normalization so a malformed decision record fails consistently.
    if (
      (decision === 'approved' || decision === 'denied') &&
      (parentRef !== undefined || parentJti !== undefined || dependsOn !== undefined)
    ) {
      return invalid('link-mismatch');
    }

    byRef.set(ref, {
      ref,
      iss,
      jti,
      decision,
      agentRef,
      actionRef,
      observedAtMs,
      upstreamDigest,
      workflowId,
      parentRef,
      parentJti,
      dependsOn: Array.isArray(correlation?.depends_on) ? dependsOn : undefined,
    });
  }

  const all = [...byRef.values()];
  const approvals = all.filter((r) => r.decision === 'approved');
  const denials = all.filter((r) => r.decision === 'denied');
  const invocations = all.filter((r) => r.decision === 'invoked');

  // 5. Evidence state machine (order-independent; fail closed).
  if (approvals.length > 1 || denials.length > 1) {
    return invalid('conflicting-decision-records');
  }
  if (approvals.length === 1 && denials.length === 1) {
    return invalid('conflicting-decision-records');
  }
  if (invocations.length > 1) {
    return invalid('multiple-invocations');
  }
  if (denials.length === 1 && invocations.length === 1) {
    return invalid('denial-with-invocation');
  }

  const invocation = invocations[0];

  // No decision record present.
  if (approvals.length === 0 && denials.length === 0) {
    if (invocation) {
      // Invocation whose approval is absent.
      return invalid('dangling-reference');
    }
    return { kind: 'approval-not-established', reason: 'missing-decision-record' };
  }

  // Denial present, no invocation (denial-with-invocation handled above).
  if (denials.length === 1) {
    return { kind: 'denial-observed', intentDigest, denialRef: denials[0].ref };
  }

  // Approval present. Decision-record root enforcement happens during
  // normalization (see the approved/denied roots check above).
  const approval = approvals[0];

  if (!invocation) {
    return { kind: 'approval-observed', intentDigest, approvalRef: approval.ref };
  }

  // Approved path: exact linkage from invocation to the approval.
  if (approval.observedAtMs > invocation.observedAtMs) {
    return invalid('temporal-order-invalid');
  }
  if (invocation.parentRef === undefined) {
    return invalid('dangling-reference');
  }
  if (invocation.parentRef !== approval.ref) {
    return invalid('link-mismatch');
  }
  if (invocation.parentJti !== approval.jti) {
    return invalid('link-mismatch');
  }
  if (
    invocation.dependsOn === undefined ||
    invocation.dependsOn.length !== 1 ||
    invocation.dependsOn[0] !== approval.jti
  ) {
    return invalid('link-mismatch');
  }

  return {
    kind: 'approval-linked-invocation-observed',
    intentDigest,
    approvalRef: approval.ref,
    invocationRef: invocation.ref,
  };
}
