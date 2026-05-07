/**
 * Lifecycle Observation Extension Schema
 *
 * Extension namespace: `org.peacprotocol/lifecycle-observation`
 * Record type URIs:    9 (one per event kind; see LIFECYCLE_OBSERVATION_TYPE_URIS)
 *
 * Records observations of lifecycle events emitted by external systems
 * (orchestrators, workflow engines, evaluation systems, approval systems,
 * agent runtimes). The caller observed the event; the CLI issues a record
 * using the caller-provided issuer key. The caller's issuer is the
 * signer-of-record. PEAC provides the record format, validation, and
 * signing path. PEAC does not capture, observe, decide, evaluate, score,
 * transition, or vouch for the truth of the lifecycle event.
 *
 * No-inline-value invariant (grammar-based, not heuristic-based):
 *   - 20 forbidden top-level keys reject with `lifecycle.inline_value_blocked`
 *   - All `*_ref` fields validated by `OpaqueRefSchema` grammar
 *   - `approver_ref` priority chain:
 *       non-string  -> lifecycle.ref_must_be_string
 *       contains @  -> lifecycle.approver_ref_pii_blocked   (more specific; runs first)
 *       else        -> lifecycle.opaque_ref_grammar_violation
 *   - Numeric strings like "0.92" reject through the opaque-reference grammar
 *     (no recognized prefix) with `lifecycle.opaque_ref_grammar_violation`,
 *     not `lifecycle.inline_value_blocked`. No language-specific or
 *     numeric-specific heuristics.
 *
 * Forbidden top-level keys vs event_kind enum values:
 *   The `event_kind` enum value `'lifecycle-approval-granted'` is REQUIRED
 *   on the `event_kind` field. An extension top-level field literally named
 *   `granted: true` is FORBIDDEN. The no-inline-value check inspects the
 *   extension top level only, never the `event_kind` field.
 *
 * Validation returns the structured error contract:
 *   `{ ok: true, value }` or `{ ok: false, errors: [{ code, path?, message }] }`.
 */
import { z } from 'zod';
import { Sha256DigestSchema } from '../wire-02-extensions/shared-validators.js';
import { createOpaqueRefSchema } from '../opaque-ref.js';

export const LIFECYCLE_OBSERVATION_EXTENSION_KEY =
  'org.peacprotocol/lifecycle-observation' as const;

/** All 9 lifecycle observation record type URIs (one per event kind). */
export const LIFECYCLE_OBSERVATION_TYPE_URIS = [
  'org.peacprotocol/lifecycle-approval-requested',
  'org.peacprotocol/lifecycle-approval-granted',
  'org.peacprotocol/lifecycle-approval-denied',
  'org.peacprotocol/lifecycle-evaluation-started',
  'org.peacprotocol/lifecycle-evaluation-completed',
  'org.peacprotocol/lifecycle-experiment-assigned',
  'org.peacprotocol/lifecycle-experiment-result',
  'org.peacprotocol/lifecycle-workflow-transition',
  'org.peacprotocol/lifecycle-mode-observed',
] as const;

export type LifecycleObservationTypeUri = (typeof LIFECYCLE_OBSERVATION_TYPE_URIS)[number];

/**
 * Event-kind discriminator literal values. Each `event_kind` corresponds
 * 1:1 with a type URI in `LIFECYCLE_OBSERVATION_TYPE_URIS` (drop the
 * `org.peacprotocol/` prefix from the URI to get the event_kind).
 */
const EVENT_KINDS = [
  'lifecycle-approval-requested',
  'lifecycle-approval-granted',
  'lifecycle-approval-denied',
  'lifecycle-evaluation-started',
  'lifecycle-evaluation-completed',
  'lifecycle-experiment-assigned',
  'lifecycle-experiment-result',
  'lifecycle-workflow-transition',
  'lifecycle-mode-observed',
] as const;

export type LifecycleEventKind = (typeof EVENT_KINDS)[number];

/** Stable error codes for `validateLifecycleObservation`. */
export const LIFECYCLE_OBSERVATION_ERROR_CODES = {
  inlineValueBlocked: 'lifecycle.inline_value_blocked',
  opaqueRefGrammarViolation: 'lifecycle.opaque_ref_grammar_violation',
  approverRefPiiBlocked: 'lifecycle.approver_ref_pii_blocked',
  refMustBeString: 'lifecycle.ref_must_be_string',
  missingRequiredField: 'lifecycle.missing_required_field',
  eventKindUnknown: 'lifecycle.event_kind_unknown',
  invalidObservedAt: 'lifecycle.invalid_observed_at',
  invalidState: 'lifecycle.invalid_state',
  invalidObservedMode: 'lifecycle.invalid_observed_mode',
} as const;

/**
 * Closed-enum constant of forbidden top-level keys. Each key here
 * represents a class of inline-value smuggling that the observational
 * invariant must reject. Changes to this list require an explicit
 * schema and conformance update.
 *
 * NOTE: enum LITERAL values like 'lifecycle-approval-granted' live in the
 * `event_kind` FIELD, not at the extension top level. A top-level field
 * literally named `granted: true` is FORBIDDEN; the enum value 'granted'
 * inside event_kind is REQUIRED.
 */
export const FORBIDDEN_TOP_LEVEL_KEYS = [
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
] as const;

/**
 * Generic opaque-reference schema for every `*_ref` field on a lifecycle
 * observation. Shares `OpaqueRefSchema`'s grammar (no whitespace, no `@`,
 * recognized prefix, byte-bounded). The `errorCode` option attaches the
 * stable lifecycle code so downstream validators bubble the same string.
 */
const LifecycleRef = createOpaqueRefSchema({
  errorCode: 'lifecycle.opaque_ref_grammar_violation',
  maxBytes: 256,
});

/**
 * Approver-ref priority chain (BINDING):
 *   1. non-string  -> lifecycle.ref_must_be_string  (Zod's z.string() guard
 *                     with stable message; mapped in
 *                     validateLifecycleObservation)
 *   2. contains @  -> lifecycle.approver_ref_pii_blocked  (more specific;
 *                     ahead of the general grammar refinements)
 *   3. else        -> lifecycle.opaque_ref_grammar_violation  (general
 *                     grammar via the LifecycleRef pipe)
 */
const ApproverRef = z
  .string({
    error: () =>
      'lifecycle.ref_must_be_string: approver_ref must be a string (number, object, array, boolean, null rejected)',
  })
  .superRefine((s, ctx) => {
    if (s.includes('@')) {
      ctx.addIssue({
        code: 'custom',
        message: 'lifecycle.approver_ref_pii_blocked: @ not allowed in approver_ref',
      });
      return z.NEVER;
    }
  })
  .pipe(LifecycleRef);

/** UTF-8 byte length helper (counts bytes, not JS UTF-16 code units). */
const utf8ByteLength = (value: string): number => new TextEncoder().encode(value).byteLength;

/**
 * Free-form workflow state name (NOT an opaque ref).
 *
 * Caller-reported lifecycle state is preserved exactly: no silent trim, no
 * normalization. Empty string is rejected; leading/trailing whitespace is
 * rejected explicitly so callers see a stable lifecycle code rather than
 * silent transformation. Length bound is 256 UTF-8 bytes (not JS character
 * count) to bound multi-byte payloads precisely.
 */
const STATE_MAX_BYTES = 256;
const StateString = z
  .string({
    error: () =>
      'lifecycle.invalid_state: workflow state must be a non-empty string of <= 256 UTF-8 bytes with no leading or trailing whitespace',
  })
  .refine((s) => s.length > 0, {
    message: 'lifecycle.invalid_state: workflow state must not be empty',
  })
  .refine((s) => !/^\s|\s$/.test(s), {
    message: 'lifecycle.invalid_state: workflow state must not have leading or trailing whitespace',
  })
  .refine((s) => utf8ByteLength(s) <= STATE_MAX_BYTES, {
    message: `lifecycle.invalid_state: workflow state must be <= ${STATE_MAX_BYTES} UTF-8 bytes`,
  });

/** RFC 3339 timestamp with timezone offset. */
const ObservedAt = z.string().datetime({ offset: true });

/** Mode taxonomy mirrors the cli-execution `execution_mode` enum. */
const OBSERVED_MODES = [
  'deterministic_script',
  'templated_flow',
  'agent_loop',
  'human_step',
  'hybrid',
] as const;

/**
 * Observed-mode enum. Wraps `z.enum` with a custom message so non-string
 * and out-of-enum values surface as `lifecycle.invalid_observed_mode`
 * rather than the generic Zod `invalid_value` text.
 */
const ObservedModeSchema = z.enum(OBSERVED_MODES, {
  error: () =>
    `lifecycle.invalid_observed_mode: observed_mode must be one of ${OBSERVED_MODES.join(', ')}`,
});

/**
 * Common fields present on every event kind. Per-kind variants extend
 * this with the kind-specific required + optional fields.
 */
const commonOptionalFields = {
  parent_ref: LifecycleRef.optional(),
  upstream_artifact_ref: LifecycleRef.optional(),
  upstream_artifact_digest: Sha256DigestSchema.optional(),
  policy_ref: LifecycleRef.optional(),
  policy_digest: Sha256DigestSchema.optional(),
  rubric_ref: LifecycleRef.optional(),
  score_ref: LifecycleRef.optional(),
  result_digest: Sha256DigestSchema.optional(),
} as const;

const commonRequiredFields = {
  subject_ref: LifecycleRef,
  observed_at: ObservedAt,
} as const;

/**
 * Per-event-kind variants. Discriminated by `event_kind`. Each variant
 * is `.strict()`-typed so unknown keys at the variant level are rejected
 * (separately from the no-inline-value pre-flight which catches the 20
 * forbidden keys with the lifecycle stable code).
 */
const ApprovalRequested = z
  .object({
    event_kind: z.literal('lifecycle-approval-requested'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    approval_ref: LifecycleRef,
    approver_ref: ApproverRef,
    observed_mode: ObservedModeSchema.optional(),
  })
  .strict();

const ApprovalGranted = z
  .object({
    event_kind: z.literal('lifecycle-approval-granted'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    approval_ref: LifecycleRef,
    approver_ref: ApproverRef,
    observed_mode: ObservedModeSchema.optional(),
  })
  .strict();

const ApprovalDenied = z
  .object({
    event_kind: z.literal('lifecycle-approval-denied'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    approval_ref: LifecycleRef,
    approver_ref: ApproverRef,
    observed_mode: ObservedModeSchema.optional(),
  })
  .strict();

const EvaluationStarted = z
  .object({
    event_kind: z.literal('lifecycle-evaluation-started'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    observed_mode: ObservedModeSchema.optional(),
  })
  .strict();

const EvaluationCompleted = z
  .object({
    event_kind: z.literal('lifecycle-evaluation-completed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    result_ref: LifecycleRef,
    observed_mode: ObservedModeSchema.optional(),
  })
  .strict();

const ExperimentAssigned = z
  .object({
    event_kind: z.literal('lifecycle-experiment-assigned'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    experiment_ref: LifecycleRef,
    cohort_ref: LifecycleRef.optional(),
    variant_ref: LifecycleRef.optional(),
    observed_mode: ObservedModeSchema.optional(),
  })
  .strict();

const ExperimentResult = z
  .object({
    event_kind: z.literal('lifecycle-experiment-result'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    experiment_ref: LifecycleRef,
    cohort_ref: LifecycleRef.optional(),
    variant_ref: LifecycleRef.optional(),
    result_ref: LifecycleRef,
    observed_mode: ObservedModeSchema.optional(),
  })
  .strict();

const WorkflowTransition = z
  .object({
    event_kind: z.literal('lifecycle-workflow-transition'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    from_state: StateString,
    to_state: StateString,
    observed_mode: ObservedModeSchema.optional(),
  })
  .strict();

const ModeObserved = z
  .object({
    event_kind: z.literal('lifecycle-mode-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    observed_mode: ObservedModeSchema,
  })
  .strict();

/**
 * The full lifecycle observation record (discriminated by `event_kind`).
 *
 * Forbidden-top-level-key checks run as a pre-flight inside
 * `validateLifecycleObservation` so callers see `lifecycle.inline_value_blocked`
 * with the offending key name rather than Zod's generic `unrecognized_keys`.
 */
export const LifecycleObservationSchema = z.discriminatedUnion('event_kind', [
  ApprovalRequested,
  ApprovalGranted,
  ApprovalDenied,
  EvaluationStarted,
  EvaluationCompleted,
  ExperimentAssigned,
  ExperimentResult,
  WorkflowTransition,
  ModeObserved,
]);

export type LifecycleObservation = z.infer<typeof LifecycleObservationSchema>;

export interface LifecycleValidationError {
  code: string;
  path?: string;
  message: string;
}

export type LifecycleValidationResult =
  | { ok: true; value: LifecycleObservation }
  | { ok: false; errors: LifecycleValidationError[] };

/**
 * Validate a lifecycle observation payload. Mirrors the
 * `validateCliExecution` structured-error contract.
 *
 * Pre-flight order:
 *   1. forbidden top-level keys -> lifecycle.inline_value_blocked
 *   2. event_kind presence/value -> missing_required_field / event_kind_unknown
 *   3. observed_at presence -> missing_required_field
 *   4. Zod schema parse with priority-mapped stable codes
 *
 * Generic Zod string-error messages are NEVER surfaced as public diagnostics.
 */
export function validateLifecycleObservation(data: unknown): LifecycleValidationResult {
  const errors: LifecycleValidationError[] = [];

  // Pre-flight 1: forbidden top-level keys.
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    for (const forbidden of FORBIDDEN_TOP_LEVEL_KEYS) {
      if (Object.prototype.hasOwnProperty.call(obj, forbidden)) {
        errors.push({
          code: LIFECYCLE_OBSERVATION_ERROR_CODES.inlineValueBlocked,
          path: forbidden,
          message: `lifecycle.inline_value_blocked: forbidden top-level key '${forbidden}' present at extension top level (the no-inline-value invariant rejects all 20 verdict-shaped keys)`,
        });
      }
    }

    // Pre-flight 2: event_kind presence and value (gives stable codes
    // independent of the discriminator path through Zod).
    if (!Object.prototype.hasOwnProperty.call(obj, 'event_kind')) {
      errors.push({
        code: LIFECYCLE_OBSERVATION_ERROR_CODES.missingRequiredField,
        path: 'event_kind',
        message: 'lifecycle.missing_required_field: event_kind is required',
      });
    } else if (
      typeof obj.event_kind !== 'string' ||
      !(EVENT_KINDS as readonly string[]).includes(obj.event_kind)
    ) {
      errors.push({
        code: LIFECYCLE_OBSERVATION_ERROR_CODES.eventKindUnknown,
        path: 'event_kind',
        message: `lifecycle.event_kind_unknown: event_kind must be one of ${EVENT_KINDS.join(', ')}`,
      });
    }

    // Pre-flight 3: observed_at presence (missing observed_at gets the
    // stable missing-required-field code, not invalid_observed_at).
    if (!Object.prototype.hasOwnProperty.call(obj, 'observed_at')) {
      errors.push({
        code: LIFECYCLE_OBSERVATION_ERROR_CODES.missingRequiredField,
        path: 'observed_at',
        message: 'lifecycle.missing_required_field: observed_at is required',
      });
    }

    // Pre-flight 4: per-event-kind required fields (on top of common
    // required). Done BEFORE the schema parse so missing-required-field
    // gets the stable code reliably regardless of how Zod represents
    // the absence on a custom-error string schema.
    if (
      typeof obj.event_kind === 'string' &&
      (EVENT_KINDS as readonly string[]).includes(obj.event_kind)
    ) {
      const ek = obj.event_kind as LifecycleEventKind;
      const requiredCommon: readonly string[] = ['subject_ref'];
      const requiredByKind: Record<LifecycleEventKind, readonly string[]> = {
        'lifecycle-approval-requested': ['approval_ref', 'approver_ref'],
        'lifecycle-approval-granted': ['approval_ref', 'approver_ref'],
        'lifecycle-approval-denied': ['approval_ref', 'approver_ref'],
        'lifecycle-evaluation-started': [],
        'lifecycle-evaluation-completed': ['result_ref'],
        'lifecycle-experiment-assigned': ['experiment_ref'],
        'lifecycle-experiment-result': ['experiment_ref', 'result_ref'],
        'lifecycle-workflow-transition': ['from_state', 'to_state'],
        'lifecycle-mode-observed': ['observed_mode'],
      };
      for (const field of [...requiredCommon, ...requiredByKind[ek]]) {
        if (!Object.prototype.hasOwnProperty.call(obj, field)) {
          errors.push({
            code: LIFECYCLE_OBSERVATION_ERROR_CODES.missingRequiredField,
            path: field,
            message: `lifecycle.missing_required_field: ${field} is required for event_kind ${ek}`,
          });
        }
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const result = LifecycleObservationSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }

  for (const issue of result.error.issues) {
    const path = issue.path.map(String).join('.');
    let code: string = LIFECYCLE_OBSERVATION_ERROR_CODES.opaqueRefGrammarViolation;

    // Custom-message-based mapping FIRST (superRefine output takes priority
    // over path-based fallback so a PII-blocked subclass is never miscategorized
    // by its location in the tree).
    if (issue.message.startsWith('lifecycle.approver_ref_pii_blocked')) {
      code = LIFECYCLE_OBSERVATION_ERROR_CODES.approverRefPiiBlocked;
    } else if (issue.message.startsWith('lifecycle.opaque_ref_grammar_violation')) {
      code = LIFECYCLE_OBSERVATION_ERROR_CODES.opaqueRefGrammarViolation;
    } else if (issue.message.startsWith('lifecycle.ref_must_be_string')) {
      code = LIFECYCLE_OBSERVATION_ERROR_CODES.refMustBeString;
    } else if (issue.message.startsWith('lifecycle.missing_required_field')) {
      code = LIFECYCLE_OBSERVATION_ERROR_CODES.missingRequiredField;
    } else if (issue.message.startsWith('lifecycle.invalid_state')) {
      code = LIFECYCLE_OBSERVATION_ERROR_CODES.invalidState;
    } else if (issue.message.startsWith('lifecycle.invalid_observed_mode')) {
      code = LIFECYCLE_OBSERVATION_ERROR_CODES.invalidObservedMode;
    }
    // Issue-code-based mapping for cases the custom-message path doesn't
    // catch (Zod 4 emits its own messages for invalid_type / invalid_format).
    else if (issue.code === 'invalid_type') {
      // Zod 4 represents missing-required-field as invalid_type with
      // `received: undefined`. Distinguish that from non-string-but-present.
      const received = (issue as unknown as { received?: unknown }).received;
      const isMissing =
        received === undefined || received === 'undefined' || issue.message.includes('undefined');
      if (isMissing) {
        code = LIFECYCLE_OBSERVATION_ERROR_CODES.missingRequiredField;
      } else if (path === 'observed_at') {
        // Non-string observed_at (e.g., number, object): schema expects string.
        // Surface as invalid_observed_at since the observed-at semantics are
        // distinct from a generic *_ref non-string case.
        code = LIFECYCLE_OBSERVATION_ERROR_CODES.invalidObservedAt;
      } else if (path === 'observed_mode') {
        code = LIFECYCLE_OBSERVATION_ERROR_CODES.invalidObservedMode;
      } else if (path === 'from_state' || path === 'to_state') {
        code = LIFECYCLE_OBSERVATION_ERROR_CODES.invalidState;
      } else if (
        path.endsWith('_ref') ||
        path.endsWith('subject_ref') ||
        path.endsWith('approver_ref')
      ) {
        code = LIFECYCLE_OBSERVATION_ERROR_CODES.refMustBeString;
      } else {
        // Unrecognized non-ref path: refuse to default to a ref code; surface
        // as a generic invalid-state code since it indicates an unexpected
        // field shape that was not caught by the path-based dispatch.
        code = LIFECYCLE_OBSERVATION_ERROR_CODES.invalidState;
      }
    } else if (issue.code === 'invalid_format') {
      // Zod 4 emits invalid_format for failed string validators (e.g.,
      // datetime, regex). Distinguish observed_at from *_ref grammar.
      if (path === 'observed_at') {
        code = LIFECYCLE_OBSERVATION_ERROR_CODES.invalidObservedAt;
      } else {
        code = LIFECYCLE_OBSERVATION_ERROR_CODES.opaqueRefGrammarViolation;
      }
    } else if (issue.code === 'invalid_value') {
      // Zod 4 emits invalid_value for literal / enum mismatches.
      if (path === 'event_kind') {
        code = LIFECYCLE_OBSERVATION_ERROR_CODES.eventKindUnknown;
      } else if (path === 'observed_mode') {
        code = LIFECYCLE_OBSERVATION_ERROR_CODES.invalidObservedMode;
      } else if (path === 'from_state' || path === 'to_state') {
        code = LIFECYCLE_OBSERVATION_ERROR_CODES.invalidState;
      } else {
        code = LIFECYCLE_OBSERVATION_ERROR_CODES.opaqueRefGrammarViolation;
      }
    } else if (issue.code === 'invalid_union') {
      // Zod 4 discriminated-union dispatch failure (e.g., the discriminator
      // value is missing or doesn't match any branch).
      code = LIFECYCLE_OBSERVATION_ERROR_CODES.eventKindUnknown;
    } else if (issue.code === 'unrecognized_keys') {
      // Unknown key at the variant level: the 20 forbidden top-level keys
      // are caught by the pre-flight; this catches typos / other unknown
      // keys. Map to the same stable code so callers see one diagnostic.
      code = LIFECYCLE_OBSERVATION_ERROR_CODES.inlineValueBlocked;
    } else if (issue.code === 'too_big' || issue.code === 'too_small') {
      // Length-bounded fields. Path determines the precise code so a
      // bounds violation on from_state / to_state surfaces as
      // invalid_state, not opaque_ref_grammar_violation.
      if (path === 'from_state' || path === 'to_state') {
        code = LIFECYCLE_OBSERVATION_ERROR_CODES.invalidState;
      } else if (
        path.endsWith('_ref') ||
        path.endsWith('subject_ref') ||
        path.endsWith('approver_ref')
      ) {
        code = LIFECYCLE_OBSERVATION_ERROR_CODES.opaqueRefGrammarViolation;
      } else {
        code = LIFECYCLE_OBSERVATION_ERROR_CODES.invalidState;
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
