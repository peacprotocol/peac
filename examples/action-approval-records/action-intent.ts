/**
 * Action Intent artifact for the action-approval-records example.
 *
 * The action intent is an application-level, example-local artifact (NOT a PEAC
 * record). Its JCS + SHA-256 digest (`D_intent`) is what the approval, denial,
 * and invocation records bind through `upstream_artifact_digest`.
 *
 * A digest is a binding and correlation mechanism, not a confidentiality
 * mechanism. Digests of low-entropy or guessable values may be dictionary
 * tested. Production integrations should not hash secrets or low-entropy
 * personal data directly, and should use appropriately scoped opaque artifacts
 * or commitment designs when disclosure risk exists.
 */

import { computeJsonDocumentDigestJcs } from '@peac/protocol';
import { CorrelationExtensionSchema, OpaqueRefSchema, Sha256DigestSchema } from '@peac/schema';

export const ACTION_INTENT_ARTIFACT_TYPE = 'com.example/action-intent/1' as const;

/** Maximum serialized action-intent artifact size (UTF-8 bytes). */
export const MAX_INTENT_BYTES = 8 * 1024;

/** The example-local action-intent artifact (exact-key shape). */
export interface ActionIntentV1 {
  readonly artifact_type: typeof ACTION_INTENT_ARTIFACT_TYPE;
  readonly workflow_id: string;
  readonly agent_ref: string;
  readonly action_ref: string;
  readonly target_ref: string;
  readonly parameters_ref: string;
  readonly parameters_digest: string;
}

const REQUIRED_KEYS = [
  'artifact_type',
  'workflow_id',
  'agent_ref',
  'action_ref',
  'target_ref',
  'parameters_ref',
  'parameters_digest',
] as const;

export type ValidateIntentResult =
  | { readonly ok: true; readonly intent: ActionIntentV1 }
  | { readonly ok: false; readonly reason: 'intent-invalid' | 'input-limit-exceeded' };

/** UTF-8 byte length (never JavaScript string `.length`). */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function isValidOpaqueRef(value: unknown): value is string {
  return typeof value === 'string' && OpaqueRefSchema.safeParse(value).success;
}

/**
 * Fail-closed strict validation of an action-intent artifact. Rejects unknown
 * fields, missing fields, malformed references/digests, and oversized input.
 * `workflow_id` is validated with the PUBLIC `CorrelationExtensionSchema` so the
 * intent uses exactly the same workflow-id constraint as the correlation record.
 * On success it returns a frozen, sanitized snapshot built from fields read once,
 * so validation, digesting, and later comparisons all operate on the same bytes.
 */
export function validateActionIntent(value: unknown): ValidateIntentResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'intent-invalid' };
  }

  // Untrusted object introspection and property reads are guarded so a hostile
  // accessor (throwing getter) or Proxy trap (ownKeys / getPrototypeOf / get)
  // fails closed to a structured result instead of escaping as an exception.
  let artifactType: unknown;
  let workflowId: unknown;
  let agentRef: unknown;
  let actionRef: unknown;
  let targetRef: unknown;
  let parametersRef: unknown;
  let parametersDigest: unknown;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return { ok: false, reason: 'intent-invalid' };
    }
    // Exact-key: reject unknown or missing fields BEFORE reading any value, so
    // unknown-property getters/toJSON are never traversed.
    const keys = Object.keys(value);
    if (
      keys.length !== REQUIRED_KEYS.length ||
      keys.some((key) => !(REQUIRED_KEYS as readonly string[]).includes(key))
    ) {
      return { ok: false, reason: 'intent-invalid' };
    }
    const obj = value as Record<string, unknown>;
    artifactType = obj.artifact_type;
    workflowId = obj.workflow_id;
    agentRef = obj.agent_ref;
    actionRef = obj.action_ref;
    targetRef = obj.target_ref;
    parametersRef = obj.parameters_ref;
    parametersDigest = obj.parameters_digest;
  } catch {
    return { ok: false, reason: 'intent-invalid' };
  }

  // Every required field must be a string.
  if (
    typeof artifactType !== 'string' ||
    typeof workflowId !== 'string' ||
    typeof agentRef !== 'string' ||
    typeof actionRef !== 'string' ||
    typeof targetRef !== 'string' ||
    typeof parametersRef !== 'string' ||
    typeof parametersDigest !== 'string'
  ) {
    return { ok: false, reason: 'intent-invalid' };
  }

  // Byte-bound the sanitized candidate (the same object that will be digested),
  // not the raw caller input.
  const candidate = {
    artifact_type: artifactType,
    workflow_id: workflowId,
    agent_ref: agentRef,
    action_ref: actionRef,
    target_ref: targetRef,
    parameters_ref: parametersRef,
    parameters_digest: parametersDigest,
  };
  if (utf8ByteLength(JSON.stringify(candidate)) > MAX_INTENT_BYTES) {
    return { ok: false, reason: 'input-limit-exceeded' };
  }

  // Schema/grammar validation.
  if (artifactType !== ACTION_INTENT_ARTIFACT_TYPE) {
    return { ok: false, reason: 'intent-invalid' };
  }
  if (!CorrelationExtensionSchema.safeParse({ workflow_id: workflowId }).success) {
    return { ok: false, reason: 'intent-invalid' };
  }
  if (
    !isValidOpaqueRef(agentRef) ||
    !isValidOpaqueRef(actionRef) ||
    !isValidOpaqueRef(targetRef) ||
    !isValidOpaqueRef(parametersRef)
  ) {
    return { ok: false, reason: 'intent-invalid' };
  }
  if (!Sha256DigestSchema.safeParse(parametersDigest).success) {
    return { ok: false, reason: 'intent-invalid' };
  }

  // Frozen snapshot built from the validated locals (no caller prototype/getters).
  const intent: ActionIntentV1 = Object.freeze({
    artifact_type: ACTION_INTENT_ARTIFACT_TYPE,
    workflow_id: workflowId,
    agent_ref: agentRef,
    action_ref: actionRef,
    target_ref: targetRef,
    parameters_ref: parametersRef,
    parameters_digest: parametersDigest,
  });
  return { ok: true, intent };
}
/**
 * Compute `D_intent` from a validated action-intent artifact using the
 * canonical JCS + SHA-256 document-digest helper. Returns `sha256:<hex64>`.
 */
export function computeIntentDigest(intent: ActionIntentV1): Promise<string> {
  return computeJsonDocumentDigestJcs(
    intent as unknown as Parameters<typeof computeJsonDocumentDigestJcs>[0]
  );
}
