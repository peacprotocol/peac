/**
 * A2A Handoff Observation Extension Schema (v0.14.1).
 *
 * Records observational events emitted alongside A2A v1.0 task lifecycle
 * transitions. Strictly observational: helpers do NOT verify Agent Card
 * signatures, do NOT fetch upstream events, and do NOT derive auth or trust
 * decisions. PEAC records what an external A2A v1 host or client attested.
 *
 * Extension namespace: `org.peacprotocol/a2a-handoff`.
 *
 * Type URIs (10):
 *   - org.peacprotocol/a2a-agent-card-observation
 *   - org.peacprotocol/a2a-task-submitted
 *   - org.peacprotocol/a2a-task-accepted
 *   - org.peacprotocol/a2a-task-rejected
 *   - org.peacprotocol/a2a-task-state-changed
 *   - org.peacprotocol/a2a-task-completed
 *   - org.peacprotocol/a2a-task-failed
 *   - org.peacprotocol/a2a-human-review-requested
 *   - org.peacprotocol/a2a-human-approved
 *   - org.peacprotocol/a2a-human-rejected
 *
 * Schema invariants (per v0.14.1 plan brutal-honest review):
 *   - `card_ref` (3 places: top-level, from_agent, to_agent) is a strict
 *     `sha256:<64 lowercase hex>` digest. Agent Cards are stable artifacts;
 *     digest references are portable across vendors.
 *   - `task_id`, `parent_task_id`, `upstream_event_ref`, `method_ref`,
 *     `observed_by_ref` are opaque references validated by `OpaqueRefSchema`
 *     (multi-prefix grammar: `ref:` `urn:` `did:` `sha256:` `peac:` `https://`).
 *   - `event` and `type` MUST agree per the 9 task-event variants.
 *   - All observation-payload schemas are `strict()` (extra keys rejected).
 *   - `validateA2AHandoff()` returns structured `{ ok: false, errors: [{code,path,message}] }`
 *     mapping common failures to stable error codes.
 */
import { z } from 'zod';
import { OpaqueRefSchema, createOpaqueRefSchema } from '../opaque-ref';
import { Sha256DigestSchema } from '../wire-02-extensions/shared-validators';

export const A2A_HANDOFF_EXTENSION_KEY = 'org.peacprotocol/a2a-handoff' as const;

export const A2A_AGENT_CARD_OBSERVATION_TYPE =
  'org.peacprotocol/a2a-agent-card-observation' as const;

export const A2A_TASK_EVENT_TYPES = [
  'task.submitted',
  'task.accepted',
  'task.rejected',
  'task.state_changed',
  'task.completed',
  'task.failed',
  'human.review_requested',
  'human.approved',
  'human.rejected',
] as const;

export type A2ATaskEvent = (typeof A2A_TASK_EVENT_TYPES)[number];

export const A2A_TASK_TYPE_URIS: Record<A2ATaskEvent, string> = {
  'task.submitted': 'org.peacprotocol/a2a-task-submitted',
  'task.accepted': 'org.peacprotocol/a2a-task-accepted',
  'task.rejected': 'org.peacprotocol/a2a-task-rejected',
  'task.state_changed': 'org.peacprotocol/a2a-task-state-changed',
  'task.completed': 'org.peacprotocol/a2a-task-completed',
  'task.failed': 'org.peacprotocol/a2a-task-failed',
  'human.review_requested': 'org.peacprotocol/a2a-human-review-requested',
  'human.approved': 'org.peacprotocol/a2a-human-approved',
  'human.rejected': 'org.peacprotocol/a2a-human-rejected',
} as const;

/** All 10 type URIs (Agent Card observation + 9 task-lifecycle events). */
export const A2A_HANDOFF_TYPE_URIS = [
  A2A_AGENT_CARD_OBSERVATION_TYPE,
  ...Object.values(A2A_TASK_TYPE_URIS),
] as const;

/** Stable error codes for `validateA2AHandoff`. */
export const A2A_HANDOFF_ERROR_CODES = {
  observationDecisionBlocked: 'a2a.observation_decision_blocked',
  cardRefDigestInvalid: 'a2a.card_ref_digest_invalid',
  opaqueRefGrammarViolation: 'a2a.opaque_ref_grammar_violation',
  legacySignatureShapeBlocked: 'a2a.legacy_signature_shape_blocked',
  typeEventMismatch: 'a2a.type_event_mismatch',
  timestampInvalid: 'a2a.timestamp_invalid',
  unknownField: 'a2a.unknown_field',
  schemaRejection: 'a2a.schema_rejection',
} as const;

const DISCOVERY_PATHS = [
  '/.well-known/agent-card.json',
  '/.well-known/peac.json',
  'header-probe',
] as const;

const CALLER_REPORTED_VERIFICATION = ['verified', 'unverified', 'not_checked'] as const;

const TASK_ID_REF = createOpaqueRefSchema({
  maxBytes: 256,
  errorCode: A2A_HANDOFF_ERROR_CODES.opaqueRefGrammarViolation,
});

const SELECTED_INTERFACE_URL = z
  .string()
  .max(2048)
  .url()
  .refine((v) => v.startsWith('https://') || v.startsWith('http://'), {
    message: 'a2a.interface_url_must_be_http_or_https',
  });

/**
 * signature_observation: caller-reported verification claim. The helper does
 * NOT verify Agent Card signatures. PEAC records what an external verifier
 * system reported, not what PEAC decided. Field naming is deliberate: the
 * legacy shape `signature: { verified: true, ... }` was rejected in v0.14.1
 * because it reads as "PEAC verified this signature."
 */
const SignatureObservationSchema = z
  .object({
    present: z.boolean(),
    caller_reported_verification: z.enum(CALLER_REPORTED_VERIFICATION),
    method_ref: OpaqueRefSchema.optional(),
    kid: z.string().max(256).optional(),
    observed_by_ref: OpaqueRefSchema.optional(),
  })
  .strict();

const FromAgentSchema = z
  .object({
    card_ref: Sha256DigestSchema,
    selected_interface_url: SELECTED_INTERFACE_URL.optional(),
  })
  .strict();

const ToAgentSchema = z
  .object({
    card_ref: Sha256DigestSchema.optional(),
    selected_interface_url: SELECTED_INTERFACE_URL.optional(),
  })
  .strict();

const RFC_3339 = z.string().datetime({ offset: true });

/** Agent Card observation payload. */
export const A2AAgentCardObservationSchema = z
  .object({
    type: z.literal(A2A_AGENT_CARD_OBSERVATION_TYPE),
    card_ref: Sha256DigestSchema,
    selected_interface_url: SELECTED_INTERFACE_URL.optional(),
    signature_observation: SignatureObservationSchema,
    discovered_at: RFC_3339,
    discovery_path: z.enum(DISCOVERY_PATHS),
  })
  .strict();

/**
 * Build a strict task-observation schema with `type` and `event` literally
 * bound to the same event semantic. This rejects any payload where
 * `type === a2a-task-completed` but `event === task.failed` (and the eight
 * other cross-pairings).
 */
function buildTaskEventSchema<E extends A2ATaskEvent>(event: E) {
  return z
    .object({
      type: z.literal(A2A_TASK_TYPE_URIS[event]),
      event: z.literal(event),
      task_id: TASK_ID_REF,
      parent_task_id: TASK_ID_REF.optional(),
      from_agent: FromAgentSchema,
      to_agent: ToAgentSchema.optional(),
      state: z.string().max(128).optional(),
      reason: z.string().max(1024).optional(),
      observed_at: RFC_3339,
      upstream_event_ref: OpaqueRefSchema.optional(),
      upstream_event_digest: Sha256DigestSchema.optional(),
    })
    .strict();
}

/**
 * Nine explicit per-event schemas. Used as members of the discriminated union
 * so `type` and `event` cannot drift apart.
 */
export const A2A_TASK_EVENT_SCHEMAS = {
  'task.submitted': buildTaskEventSchema('task.submitted'),
  'task.accepted': buildTaskEventSchema('task.accepted'),
  'task.rejected': buildTaskEventSchema('task.rejected'),
  'task.state_changed': buildTaskEventSchema('task.state_changed'),
  'task.completed': buildTaskEventSchema('task.completed'),
  'task.failed': buildTaskEventSchema('task.failed'),
  'human.review_requested': buildTaskEventSchema('human.review_requested'),
  'human.approved': buildTaskEventSchema('human.approved'),
  'human.rejected': buildTaskEventSchema('human.rejected'),
} as const;

/** Aggregate task-observation schema (union over the 9 strict per-event variants). */
export const A2ATaskObservationSchema = z.union([
  A2A_TASK_EVENT_SCHEMAS['task.submitted'],
  A2A_TASK_EVENT_SCHEMAS['task.accepted'],
  A2A_TASK_EVENT_SCHEMAS['task.rejected'],
  A2A_TASK_EVENT_SCHEMAS['task.state_changed'],
  A2A_TASK_EVENT_SCHEMAS['task.completed'],
  A2A_TASK_EVENT_SCHEMAS['task.failed'],
  A2A_TASK_EVENT_SCHEMAS['human.review_requested'],
  A2A_TASK_EVENT_SCHEMAS['human.approved'],
  A2A_TASK_EVENT_SCHEMAS['human.rejected'],
]);

/**
 * A2A handoff extension payload: discriminated union over Agent Card vs the
 * 9 strict per-event task observations.
 */
export const A2AHandoffSchema = z.discriminatedUnion('type', [
  A2AAgentCardObservationSchema,
  A2A_TASK_EVENT_SCHEMAS['task.submitted'],
  A2A_TASK_EVENT_SCHEMAS['task.accepted'],
  A2A_TASK_EVENT_SCHEMAS['task.rejected'],
  A2A_TASK_EVENT_SCHEMAS['task.state_changed'],
  A2A_TASK_EVENT_SCHEMAS['task.completed'],
  A2A_TASK_EVENT_SCHEMAS['task.failed'],
  A2A_TASK_EVENT_SCHEMAS['human.review_requested'],
  A2A_TASK_EVENT_SCHEMAS['human.approved'],
  A2A_TASK_EVENT_SCHEMAS['human.rejected'],
]);

export type A2AAgentCardObservation = z.infer<typeof A2AAgentCardObservationSchema>;
export type A2ATaskObservation = z.infer<typeof A2ATaskObservationSchema>;
export type A2AHandoffPayload = z.infer<typeof A2AHandoffSchema>;

/** 20 forbidden top-level keys (the v0.14.1 lifecycle/A2A no-inline-value family). */
const FORBIDDEN_TOP_LEVEL_KEYS = new Set<string>([
  'decision',
  'verdict',
  'score',
  'result',
  'passed',
  'failed',
  'policy_result',
  'approval_result',
  'outcome',
  'judgment',
  'rating',
  'grade',
  'pass',
  'fail',
  'allow',
  'deny',
  'authorized',
  'denied',
  'granted',
  'rejected_reason',
]);

export interface A2AValidationError {
  code: string;
  path?: string;
  message?: string;
}

export type A2AValidationResult =
  | { ok: true; value: A2AHandoffPayload }
  | { ok: false; errors: A2AValidationError[] };

/**
 * Validate an A2A handoff payload (Agent Card observation or task observation).
 *
 * Returns a structured result with stable error codes for downstream
 * conformance vector assertions. The mapping prioritizes the most specific
 * applicable code when multiple issues are present in the same payload.
 */
export function validateA2AHandoff(data: unknown): A2AValidationResult {
  // Stable-code preflight: surface the high-signal failures as their own
  // top-level diagnostic (independent of zod's per-field message text).
  const preflight: A2AValidationError[] = [];

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    // Reject the legacy `signature` field at the top level of an Agent Card
    // observation (the v0.14.0 draft shape; renamed to `signature_observation`).
    if (
      obj.type === A2A_AGENT_CARD_OBSERVATION_TYPE &&
      Object.prototype.hasOwnProperty.call(obj, 'signature')
    ) {
      preflight.push({
        code: A2A_HANDOFF_ERROR_CODES.legacySignatureShapeBlocked,
        path: 'signature',
        message:
          'legacy signature shape is rejected; use signature_observation.caller_reported_verification (v0.14.1)',
      });
    }

    // Decision-vocabulary injection (any of 20 forbidden top-level keys).
    for (const key of Object.keys(obj)) {
      if (FORBIDDEN_TOP_LEVEL_KEYS.has(key)) {
        preflight.push({
          code: A2A_HANDOFF_ERROR_CODES.observationDecisionBlocked,
          path: key,
          message: `top-level key '${key}' is rejected by the v0.14.1 no-inline-value invariant`,
        });
      }
    }

    // type/event mismatch detection (specific to task observations, where
    // both fields are present).
    const typeVal = obj.type;
    const eventVal = obj.event;
    if (typeof typeVal === 'string' && typeof eventVal === 'string') {
      const expected = A2A_TASK_TYPE_URIS[eventVal as A2ATaskEvent];
      if (expected !== undefined && expected !== typeVal) {
        preflight.push({
          code: A2A_HANDOFF_ERROR_CODES.typeEventMismatch,
          path: 'event',
          message: `event '${eventVal}' does not match type '${typeVal}'`,
        });
      }
    }
  }

  const result = A2AHandoffSchema.safeParse(data);
  if (result.success && preflight.length === 0) {
    return { ok: true, value: result.data };
  }

  // Map zod errors into structured error codes. We classify by issue path/code
  // so conformance vectors can assert against stable identifiers.
  const errors: A2AValidationError[] = [...preflight];
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      let code: string = A2A_HANDOFF_ERROR_CODES.schemaRejection;

      // Strict-object: extra keys rejected.
      if (issue.code === 'unrecognized_keys') {
        code = A2A_HANDOFF_ERROR_CODES.unknownField;
      } else if (path.endsWith('card_ref')) {
        code = A2A_HANDOFF_ERROR_CODES.cardRefDigestInvalid;
      } else if (
        path.endsWith('task_id') ||
        path.endsWith('parent_task_id') ||
        path.endsWith('upstream_event_ref') ||
        path.endsWith('method_ref') ||
        path.endsWith('observed_by_ref')
      ) {
        code = A2A_HANDOFF_ERROR_CODES.opaqueRefGrammarViolation;
      } else if (path.endsWith('observed_at') || path.endsWith('discovered_at')) {
        code = A2A_HANDOFF_ERROR_CODES.timestampInvalid;
      }

      // De-dup with preflight on (code, path).
      const dup = errors.some((e) => e.code === code && e.path === path);
      if (!dup) {
        errors.push({
          code,
          path: path || undefined,
          message: issue.message,
        });
      }
    }
  }

  return { ok: false, errors };
}
