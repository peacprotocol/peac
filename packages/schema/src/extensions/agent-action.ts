/**
 * Agent Action Records Extension Schema
 *
 * Extension namespace: `org.peacprotocol/agent-action`
 * Record type URIs:    6 (one per event kind; see AGENT_ACTION_TYPE_URIS)
 *
 * Records observations of agent action events reported by a caller, harness,
 * or runtime. The caller observed the event; the caller's issuer is the
 * signer-of-record. PEAC provides the record format, validation, and signing
 * path. PEAC does not approve, deny, authorize, schedule, execute, govern,
 * enforce, monitor, score, or orchestrate actions. Action decisions
 * (approved / denied) are reported by the caller; the record describes what
 * the caller observed, not what PEAC decided.
 *
 * No-inline-content invariant (grammar-based, not heuristic-based):
 *   - 20 forbidden top-level keys reject with `agent.action.inline_content_blocked`
 *   - All `*_ref` fields validated by the `OpaqueRefSchema` grammar (no
 *     whitespace, no `@`, recognized prefix, byte-bounded)
 *   - Per-kind required fields enforced via discriminated union
 *
 * Validation returns the structured error contract:
 *   `{ ok: true, value }` or `{ ok: false, errors: [{ code, path?, message }] }`.
 */
import { z } from 'zod';
import { Sha256DigestSchema } from '../wire-02-extensions/shared-validators.js';
import { createOpaqueRefSchema } from '../opaque-ref.js';

export const AGENT_ACTION_EXTENSION_KEY = 'org.peacprotocol/agent-action' as const;

/** All 6 agent action record type URIs (one per event kind). */
export const AGENT_ACTION_TYPE_URIS = [
  'org.peacprotocol/agent-action-invoked-observed',
  'org.peacprotocol/agent-action-delegated-observed',
  'org.peacprotocol/agent-action-approved-observed',
  'org.peacprotocol/agent-action-denied-observed',
  'org.peacprotocol/agent-action-cancelled-observed',
  'org.peacprotocol/agent-action-timed-out-observed',
] as const;

export type AgentActionTypeUri = (typeof AGENT_ACTION_TYPE_URIS)[number];

/**
 * Event-kind discriminator literal values. Each `event_kind` corresponds
 * 1:1 with a type URI in `AGENT_ACTION_TYPE_URIS` (drop the
 * `org.peacprotocol/` prefix from the URI to get the event_kind).
 */
const EVENT_KINDS = [
  'agent-action-invoked-observed',
  'agent-action-delegated-observed',
  'agent-action-approved-observed',
  'agent-action-denied-observed',
  'agent-action-cancelled-observed',
  'agent-action-timed-out-observed',
] as const;

export type AgentActionEventKind = (typeof EVENT_KINDS)[number];

/** Stable error codes for `validateAgentAction` and `validateAgentActionForType`. */
export const AGENT_ACTION_ERROR_CODES = {
  inlineContentBlocked: 'agent.action.inline_content_blocked',
  unknownField: 'agent.action.unknown_field',
  opaqueRefGrammarViolation: 'agent.action.opaque_ref_grammar_violation',
  refMustBeString: 'agent.action.ref_must_be_string',
  missingRequiredField: 'agent.action.missing_required_field',
  eventKindUnknown: 'agent.action.event_kind_unknown',
  invalidObservedAt: 'agent.action.invalid_observed_at',
  typeEventKindMismatch: 'agent.action.type_event_kind_mismatch',
  typeUriUnknown: 'agent.action.type_uri_unknown',
} as const;

/**
 * Closed-enum of forbidden top-level keys. These represent classes of
 * raw content-bearing fields that must not appear at the extension top level.
 * Any of these keys at the top level rejects with `agent.action.inline_content_blocked`.
 */
export const AGENT_ACTION_FORBIDDEN_TOP_LEVEL_KEYS = [
  'prompt',
  'message',
  'messages',
  'body',
  'input',
  'output',
  'result',
  'response',
  'completion',
  'stdout',
  'stderr',
  'env',
  'secret',
  'token',
  'api_key',
  'private_key',
  'credential',
  'model_output',
  'tool_input',
  'tool_output',
] as const;

/**
 * Generic opaque-reference schema for every `*_ref` field on an agent
 * action record. Shares `OpaqueRefSchema`'s grammar (no whitespace, no `@`,
 * recognized prefix, byte-bounded).
 */
const AgentActionRef = createOpaqueRefSchema({
  errorCode: 'agent.action.opaque_ref_grammar_violation',
  maxBytes: 256,
});

/** RFC 3339 timestamp with timezone offset. */
const ObservedAt = z.string().datetime({ offset: true });

const commonRequiredFields = {
  agent_ref: AgentActionRef,
  action_ref: AgentActionRef,
  observed_at: ObservedAt,
} as const;

const commonOptionalFields = {
  caller_ref: AgentActionRef.optional(),
  policy_ref: AgentActionRef.optional(),
  policy_digest: Sha256DigestSchema.optional(),
  upstream_artifact_ref: AgentActionRef.optional(),
  upstream_artifact_digest: Sha256DigestSchema.optional(),
  parent_ref: AgentActionRef.optional(),
} as const;

/**
 * Per-event-kind variants. Discriminated by `event_kind`. Each variant
 * is `.strict()`-typed so unknown keys at the variant level are rejected.
 */
const ActionInvoked = z
  .object({
    event_kind: z.literal('agent-action-invoked-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
  })
  .strict();

const ActionDelegated = z
  .object({
    event_kind: z.literal('agent-action-delegated-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    delegated_to_ref: AgentActionRef,
  })
  .strict();

const ActionApproved = z
  .object({
    event_kind: z.literal('agent-action-approved-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
  })
  .strict();

const ActionDenied = z
  .object({
    event_kind: z.literal('agent-action-denied-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
  })
  .strict();

const ActionCancelled = z
  .object({
    event_kind: z.literal('agent-action-cancelled-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    cancelled_by_ref: AgentActionRef.optional(),
  })
  .strict();

const ActionTimedOut = z
  .object({
    event_kind: z.literal('agent-action-timed-out-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    timeout_at: ObservedAt.optional(),
  })
  .strict();

/**
 * The full agent action record (discriminated by `event_kind`).
 *
 * Forbidden-top-level-key checks run as a pre-flight inside
 * `validateAgentAction` so callers see `agent.action.inline_content_blocked`
 * with the offending key name rather than Zod's generic `unrecognized_keys`.
 */
export const AgentActionSchema = z.discriminatedUnion('event_kind', [
  ActionInvoked,
  ActionDelegated,
  ActionApproved,
  ActionDenied,
  ActionCancelled,
  ActionTimedOut,
]);

export type AgentAction = z.infer<typeof AgentActionSchema>;

export interface AgentActionValidationError {
  code: string;
  path?: string;
  message: string;
}

export type AgentActionValidationResult =
  | { ok: true; value: AgentAction }
  | { ok: false; errors: AgentActionValidationError[] };

/**
 * All `*_ref` field names that appear anywhere in an agent action payload.
 * Used internally by `validateAgentAction` for the ref-must-be-string pre-flight.
 */
const AGENT_ACTION_REF_FIELDS = [
  'agent_ref',
  'action_ref',
  'caller_ref',
  'policy_ref',
  'upstream_artifact_ref',
  'parent_ref',
  'delegated_to_ref',
  'cancelled_by_ref',
] as const;

/**
 * Per-event-kind required fields (beyond the common required set).
 */
const REQUIRED_BY_KIND: Record<AgentActionEventKind, readonly string[]> = {
  'agent-action-invoked-observed': [],
  'agent-action-delegated-observed': ['delegated_to_ref'],
  'agent-action-approved-observed': [],
  'agent-action-denied-observed': [],
  'agent-action-cancelled-observed': [],
  'agent-action-timed-out-observed': [],
};

/**
 * Validate an agent action payload.
 *
 * Pre-flight order:
 *   1. Forbidden top-level keys -> agent.action.inline_content_blocked
 *   2. event_kind presence/value -> missing_required_field / event_kind_unknown
 *   3. observed_at presence -> missing_required_field
 *   4. Per-kind required fields -> missing_required_field
 *   5. Zod schema parse with priority-mapped stable codes
 */
export function validateAgentAction(data: unknown): AgentActionValidationResult {
  const errors: AgentActionValidationError[] = [];

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    // Pre-flight 1: forbidden top-level keys.
    for (const forbidden of AGENT_ACTION_FORBIDDEN_TOP_LEVEL_KEYS) {
      if (Object.prototype.hasOwnProperty.call(obj, forbidden)) {
        errors.push({
          code: AGENT_ACTION_ERROR_CODES.inlineContentBlocked,
          path: forbidden,
          message: `agent.action.inline_content_blocked: forbidden top-level key '${forbidden}' rejected by the no-inline-content invariant`,
        });
      }
    }

    // Pre-flight 1.5: ref fields must be strings when present.
    for (const field of AGENT_ACTION_REF_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(obj, field) && typeof obj[field] !== 'string') {
        errors.push({
          code: AGENT_ACTION_ERROR_CODES.refMustBeString,
          path: field,
          message: `agent.action.ref_must_be_string: ${field} must be a string`,
        });
      }
    }

    // Pre-flight 2: event_kind presence and value.
    if (!Object.prototype.hasOwnProperty.call(obj, 'event_kind')) {
      errors.push({
        code: AGENT_ACTION_ERROR_CODES.missingRequiredField,
        path: 'event_kind',
        message: 'agent.action.missing_required_field: event_kind is required',
      });
    } else if (
      typeof obj.event_kind !== 'string' ||
      !(EVENT_KINDS as readonly string[]).includes(obj.event_kind)
    ) {
      errors.push({
        code: AGENT_ACTION_ERROR_CODES.eventKindUnknown,
        path: 'event_kind',
        message: `agent.action.event_kind_unknown: event_kind must be one of ${EVENT_KINDS.join(', ')}`,
      });
    }

    // Pre-flight 3: observed_at presence.
    if (!Object.prototype.hasOwnProperty.call(obj, 'observed_at')) {
      errors.push({
        code: AGENT_ACTION_ERROR_CODES.missingRequiredField,
        path: 'observed_at',
        message: 'agent.action.missing_required_field: observed_at is required',
      });
    }

    // Pre-flight 4: per-event-kind required fields.
    if (
      typeof obj.event_kind === 'string' &&
      (EVENT_KINDS as readonly string[]).includes(obj.event_kind)
    ) {
      const ek = obj.event_kind as AgentActionEventKind;
      const requiredCommon: readonly string[] = ['agent_ref', 'action_ref'];
      for (const field of [...requiredCommon, ...REQUIRED_BY_KIND[ek]]) {
        if (!Object.prototype.hasOwnProperty.call(obj, field)) {
          errors.push({
            code: AGENT_ACTION_ERROR_CODES.missingRequiredField,
            path: field,
            message: `agent.action.missing_required_field: ${field} is required for event_kind ${ek}`,
          });
        }
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const result = AgentActionSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }

  for (const issue of result.error.issues) {
    // Handle unrecognized_keys specially: Zod fires one issue carrying all
    // unknown keys in issue.keys[]. Emit one stable error per key so callers
    // get a precise path and a stable (non-Zod) message for each offender.
    if (issue.code === 'unrecognized_keys') {
      const unknownKeys = (issue as unknown as { keys?: string[] }).keys ?? [];
      for (const key of unknownKeys) {
        const dup = errors.some(
          (e) => e.code === AGENT_ACTION_ERROR_CODES.unknownField && e.path === key
        );
        if (!dup) {
          errors.push({
            code: AGENT_ACTION_ERROR_CODES.unknownField,
            path: key,
            message: `agent.action.unknown_field: unknown top-level key '${key}' is not allowed`,
          });
        }
      }
      continue;
    }

    const path = issue.path.map(String).join('.');
    let code: string = AGENT_ACTION_ERROR_CODES.opaqueRefGrammarViolation;

    if (issue.message.startsWith('agent.action.opaque_ref_grammar_violation')) {
      code = AGENT_ACTION_ERROR_CODES.opaqueRefGrammarViolation;
    } else if (issue.message.startsWith('agent.action.missing_required_field')) {
      code = AGENT_ACTION_ERROR_CODES.missingRequiredField;
    } else if (issue.code === 'invalid_type') {
      const received = (issue as unknown as { received?: unknown }).received;
      const isMissing =
        received === undefined || received === 'undefined' || issue.message.includes('undefined');
      if (isMissing) {
        code = AGENT_ACTION_ERROR_CODES.missingRequiredField;
      } else if (path === 'observed_at' || path === 'timeout_at') {
        code = AGENT_ACTION_ERROR_CODES.invalidObservedAt;
      } else if (path.endsWith('_ref')) {
        code = AGENT_ACTION_ERROR_CODES.refMustBeString;
      } else {
        code = AGENT_ACTION_ERROR_CODES.missingRequiredField;
      }
    } else if (issue.code === 'invalid_format') {
      if (path === 'observed_at' || path === 'timeout_at') {
        code = AGENT_ACTION_ERROR_CODES.invalidObservedAt;
      } else {
        code = AGENT_ACTION_ERROR_CODES.opaqueRefGrammarViolation;
      }
    } else if (issue.code === 'invalid_value') {
      if (path === 'event_kind') {
        code = AGENT_ACTION_ERROR_CODES.eventKindUnknown;
      } else {
        code = AGENT_ACTION_ERROR_CODES.opaqueRefGrammarViolation;
      }
    } else if (issue.code === 'invalid_union') {
      code = AGENT_ACTION_ERROR_CODES.eventKindUnknown;
    } else if (issue.code === 'too_big' || issue.code === 'too_small') {
      if (path.endsWith('_ref')) {
        code = AGENT_ACTION_ERROR_CODES.opaqueRefGrammarViolation;
      } else {
        code = AGENT_ACTION_ERROR_CODES.missingRequiredField;
      }
    }

    const dup = errors.some((e) => e.code === code && e.path === (path || undefined));
    if (!dup) {
      errors.push({
        code,
        path: path || undefined,
        message: issue.message,
      });
    }
  }

  return { ok: false, errors };
}

/**
 * Validate an agent action payload AND assert that its `event_kind` agrees
 * with the caller-supplied type URI.
 *
 * The type URI and `event_kind` have a 1:1 relationship: the event_kind
 * value is always `org.peacprotocol/<event_kind>` stripped of its prefix,
 * i.e. `typeUri.slice('org.peacprotocol/'.length)`. If they disagree,
 * `agent.action.type_event_kind_mismatch` is returned in addition to (or
 * instead of) any schema-level errors.
 *
 * Use this helper when the type URI comes from the wire-record envelope
 * and needs to be verified against the extension payload.
 */
export function validateAgentActionForType(
  typeUri: string,
  data: unknown
): AgentActionValidationResult {
  // Runtime guard: TypeScript types can be bypassed by JavaScript callers.
  // Reject unrecognized type URIs before attempting event_kind derivation.
  if (!(AGENT_ACTION_TYPE_URIS as readonly string[]).includes(typeUri)) {
    return {
      ok: false,
      errors: [
        {
          code: AGENT_ACTION_ERROR_CODES.typeUriUnknown,
          path: 'type',
          message: `agent.action.type_uri_unknown: '${typeUri}' is not a recognized agent action type URI`,
        },
      ],
    };
  }

  const base = validateAgentAction(data);

  const PEAC_PREFIX = 'org.peacprotocol/' as const;
  const expectedEventKind = typeUri.startsWith(PEAC_PREFIX)
    ? typeUri.slice(PEAC_PREFIX.length)
    : typeUri;

  if (
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    typeof (data as Record<string, unknown>).event_kind === 'string' &&
    (data as Record<string, unknown>).event_kind !== expectedEventKind
  ) {
    const mismatch: AgentActionValidationError = {
      code: AGENT_ACTION_ERROR_CODES.typeEventKindMismatch,
      path: 'event_kind',
      message: `agent.action.type_event_kind_mismatch: event_kind '${(data as Record<string, unknown>).event_kind}' does not match expected '${expectedEventKind}' for type URI '${typeUri}'`,
    };
    if (base.ok) {
      return { ok: false, errors: [mismatch] };
    }
    return { ok: false, errors: [...base.errors, mismatch] };
  }

  return base;
}
