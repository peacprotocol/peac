/**
 * Commerce Mandate Records Extension Schema
 *
 * Extension namespace: `org.peacprotocol/commerce-mandate`
 * Record type URIs:    7 (one per event kind; see COMMERCE_MANDATE_TYPE_URIS)
 *
 * Records observations of commerce-lifecycle events (mandate / authorization /
 * capture / void / refund / settlement / budget) scoped to a mandate. The
 * caller observed the event; the caller's issuer is the signer-of-record.
 * PEAC provides the record format, validation, and signing path. PEAC does
 * not authorize payments, process payments, settle funds, enforce mandates,
 * compute payment finality, evaluate budgets, validate payment rails, or
 * vouch for the legal validity of any commerce decision. Commerce decisions
 * are reported by the caller; the record describes what the caller observed.
 *
 * No-inline-payment-data invariant (grammar-based, not heuristic-based):
 *   - 20 forbidden top-level keys reject with
 *     `commerce.mandate.inline_payment_data_blocked` (card number, PAN, CVV,
 *     token, API key, private key, bearer token, connection string, etc.)
 *   - All `*_ref` fields validated by the `OpaqueRefSchema` grammar
 *   - Per-event-kind required fields enforced via discriminated union
 *
 * Finality-synthesis boundary:
 *   - `settlement_state` is REJECTED on `commerce-authorization-observed`
 *     records with `commerce.mandate.finality_synthesis_blocked`.
 *     Authorization is not settlement; PEAC does not allow a caller to
 *     synthesize settlement finality from an authorization event.
 *
 * Money-boundary invariant:
 *   - All amount fields use a non-negative wrapper around the shared
 *     `AmountMinorStringSchema` (base-10 integer string). JS `number`,
 *     decimals, empty strings, and negative amounts are rejected. Bounded
 *     length prevents precision loss. Refund semantics are reported via
 *     `commerce-refund-observed`; settlement reversal is reported via
 *     `commerce-settlement-observed` with `settlement_state = 'reversed'`.
 *
 * Scheme identifier rules:
 *   - `scheme_id` (bounded ASCII / URI-like grammar) and `scheme_ref`
 *     (OpaqueRefSchema) are mutually exclusive; setting both rejects with
 *     `commerce.mandate.scheme_conflict`.
 *
 * Validation returns the structured error contract:
 *   `{ ok: true, value }` or `{ ok: false, errors: [{ code, path?, message }] }`.
 */
import { z } from 'zod';
import { Sha256DigestSchema } from '../wire-02-extensions/shared-validators.js';
import { AmountMinorStringSchema } from '../wire-02-extensions/commerce.js';
import { createOpaqueRefSchema } from '../opaque-ref.js';

export const COMMERCE_MANDATE_EXTENSION_KEY = 'org.peacprotocol/commerce-mandate' as const;

/** All 7 commerce-mandate record type URIs (one per event kind). */
export const COMMERCE_MANDATE_TYPE_URIS = [
  'org.peacprotocol/commerce-mandate-observed',
  'org.peacprotocol/commerce-authorization-observed',
  'org.peacprotocol/commerce-capture-observed',
  'org.peacprotocol/commerce-void-observed',
  'org.peacprotocol/commerce-refund-observed',
  'org.peacprotocol/commerce-settlement-observed',
  'org.peacprotocol/commerce-budget-observed',
] as const;

export type CommerceMandateTypeUri = (typeof COMMERCE_MANDATE_TYPE_URIS)[number];

/**
 * Event-kind discriminator literal values. Each `event_kind` corresponds
 * 1:1 with a type URI in `COMMERCE_MANDATE_TYPE_URIS` (drop the
 * `org.peacprotocol/` prefix from the URI to get the event_kind).
 */
const EVENT_KINDS = [
  'commerce-mandate-observed',
  'commerce-authorization-observed',
  'commerce-capture-observed',
  'commerce-void-observed',
  'commerce-refund-observed',
  'commerce-settlement-observed',
  'commerce-budget-observed',
] as const;

export type CommerceMandateEventKind = (typeof EVENT_KINDS)[number];

/** Stable error codes for `validateCommerceMandate` and `validateCommerceMandateForType`. */
export const COMMERCE_MANDATE_ERROR_CODES = {
  inlinePaymentDataBlocked: 'commerce.mandate.inline_payment_data_blocked',
  unknownField: 'commerce.mandate.unknown_field',
  opaqueRefGrammarViolation: 'commerce.mandate.opaque_ref_grammar_violation',
  refMustBeString: 'commerce.mandate.ref_must_be_string',
  missingRequiredField: 'commerce.mandate.missing_required_field',
  invalidEventKind: 'commerce.mandate.invalid_event_kind',
  invalidAmountMinor: 'commerce.mandate.invalid_amount_minor',
  invalidCurrency: 'commerce.mandate.invalid_currency',
  invalidObservedAt: 'commerce.mandate.invalid_observed_at',
  invalidDigest: 'commerce.mandate.invalid_digest',
  invalidSettlementState: 'commerce.mandate.invalid_settlement_state',
  finalitySynthesisBlocked: 'commerce.mandate.finality_synthesis_blocked',
  invalidSchemeId: 'commerce.mandate.invalid_scheme_id',
  schemeConflict: 'commerce.mandate.scheme_conflict',
  typeUriUnknown: 'commerce.mandate.type_uri_unknown',
  typeEventKindMismatch: 'commerce.mandate.type_event_kind_mismatch',
} as const;

/**
 * Closed-enum of forbidden top-level keys. These represent classes of raw
 * payment-data fields that must not appear at the extension top level. Any
 * of these keys at the top level rejects with
 * `commerce.mandate.inline_payment_data_blocked`.
 */
export const COMMERCE_MANDATE_FORBIDDEN_PAYMENT_DATA_KEYS = [
  'card_number',
  'pan',
  'cvv',
  'cvc',
  'expiry_date',
  'card_holder_name',
  'billing_address',
  'shipping_address',
  'token',
  'raw_token',
  'bearer_token',
  'api_key',
  'secret',
  'private_key',
  'private_key_pem',
  'credential',
  'password',
  'connection_string',
  'iban',
  'bank_account',
] as const;

/**
 * Generic opaque-reference schema for every `*_ref` field on a commerce
 * mandate record. Shares `OpaqueRefSchema`'s grammar (no whitespace, no `@`,
 * recognized prefix, byte-bounded).
 */
const CommerceMandateRef = createOpaqueRefSchema({
  errorCode: 'commerce.mandate.opaque_ref_grammar_violation',
  maxBytes: 256,
});

/**
 * Non-negative wrapper around the shared `AmountMinorStringSchema`. Commerce
 * mandate amount fields are non-negative by design. Refund semantics are
 * reported via `commerce-refund-observed`; settlement reversal is reported
 * via `commerce-settlement-observed` with `settlement_state = 'reversed'`.
 * Negative values reject with `commerce.mandate.invalid_amount_minor`.
 */
const NonNegativeAmountMinorStringSchema = AmountMinorStringSchema.refine(
  (value) => !value.startsWith('-'),
  {
    message:
      'commerce.mandate.invalid_amount_minor: amount fields must be non-negative base-10 integer strings',
  }
);

/** RFC 3339 timestamp with timezone offset. */
const ObservedAt = z.string().datetime({ offset: true });

/**
 * Closed enum: `settlement_state`. Reports the upstream-attested state of a
 * settlement event. Only valid on `commerce-settlement-observed` records;
 * present on any other event kind rejects with `finality_synthesis_blocked`.
 */
const SettlementStateSchema = z.enum(['pending', 'completed', 'failed', 'reversed', 'partial'], {
  error: () =>
    'commerce.mandate.invalid_settlement_state: settlement_state must be one of pending / completed / failed / reversed / partial',
});

/**
 * ISO 4217-style currency code or asset identifier.
 * 3-letter uppercase ASCII (ISO 4217) or up to 16 chars of [A-Z0-9_-] for
 * non-fiat tokens. Bounded length prevents unbounded strings.
 */
const CurrencySchema = z
  .string()
  .min(1)
  .max(16)
  .regex(/^[A-Z0-9_-]{1,16}$/, {
    message:
      'commerce.mandate.invalid_currency: currency must be 1-16 chars of uppercase ASCII, digits, underscore, or hyphen (e.g., USD, EUR, USDC)',
  });

/**
 * Bounded scheme_id grammar. ASCII / URI-like; max 128 UTF-8 bytes;
 * lowercase preferred; allowed chars `[a-z0-9._:/-]` plus `+`. NOT a closed
 * enum: any caller-defined scheme identifier is accepted as long as it
 * matches the grammar. Whitespace, `@`, JSON-opening characters, secrets,
 * and bearer-prefix patterns are rejected by construction.
 */
const SchemeIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9._:/+-]{1,128}$/, {
    message:
      'commerce.mandate.invalid_scheme_id: scheme_id must match the bounded grammar [a-z0-9._:/+-]{1,128} (lowercase preferred; no whitespace, no @, no secrets)',
  });

const commonRequiredFields = {
  mandate_ref: CommerceMandateRef,
  observed_at: ObservedAt,
} as const;

const commonOptionalFields = {
  caller_ref: CommerceMandateRef.optional(),
  policy_ref: CommerceMandateRef.optional(),
  policy_digest: Sha256DigestSchema.optional(),
  upstream_artifact_ref: CommerceMandateRef.optional(),
  upstream_artifact_digest: Sha256DigestSchema.optional(),
  parent_ref: CommerceMandateRef.optional(),
  scheme_id: SchemeIdSchema.optional(),
  scheme_ref: CommerceMandateRef.optional(),
} as const;

/**
 * Per-event-kind variants. Discriminated by `event_kind`. Each variant is
 * `.strict()`-typed so unknown keys at the variant level surface as
 * unrecognized_keys.
 */
const MandateObserved = z
  .object({
    event_kind: z.literal('commerce-mandate-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    merchant_ref: CommerceMandateRef,
    payer_ref: CommerceMandateRef,
    max_amount_minor: NonNegativeAmountMinorStringSchema.optional(),
    currency: CurrencySchema.optional(),
    expires_at: ObservedAt.optional(),
  })
  .strict();

const AuthorizationObserved = z
  .object({
    event_kind: z.literal('commerce-authorization-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    authorization_ref: CommerceMandateRef,
    amount_minor: NonNegativeAmountMinorStringSchema,
    currency: CurrencySchema,
    // settlement_state is intentionally NOT in the schema for this variant;
    // a pre-flight check rejects its presence with finality_synthesis_blocked.
  })
  .strict();

const CaptureObserved = z
  .object({
    event_kind: z.literal('commerce-capture-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    authorization_ref: CommerceMandateRef,
    capture_ref: CommerceMandateRef,
    amount_minor: NonNegativeAmountMinorStringSchema,
    currency: CurrencySchema,
  })
  .strict();

const VoidObserved = z
  .object({
    event_kind: z.literal('commerce-void-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    authorization_ref: CommerceMandateRef,
    void_ref: CommerceMandateRef,
  })
  .strict();

const RefundObserved = z
  .object({
    event_kind: z.literal('commerce-refund-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    refund_ref: CommerceMandateRef,
    amount_minor: NonNegativeAmountMinorStringSchema,
    currency: CurrencySchema,
    capture_ref: CommerceMandateRef.optional(),
    authorization_ref: CommerceMandateRef.optional(),
  })
  .strict();

const SettlementObserved = z
  .object({
    event_kind: z.literal('commerce-settlement-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    settlement_ref: CommerceMandateRef,
    amount_minor: NonNegativeAmountMinorStringSchema,
    currency: CurrencySchema,
    settlement_state: SettlementStateSchema,
  })
  .strict();

const BudgetObserved = z
  .object({
    event_kind: z.literal('commerce-budget-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    budget_ref: CommerceMandateRef,
    amount_minor: NonNegativeAmountMinorStringSchema.optional(),
    currency: CurrencySchema.optional(),
  })
  .strict();

/**
 * The full commerce mandate record (discriminated by `event_kind`).
 *
 * Pre-flight checks (forbidden top-level keys, ref-must-be-string,
 * settlement_state on non-settlement variants, scheme conflict) run inside
 * `validateCommerceMandate` before the discriminated union parse so callers
 * see stable codes rather than generic Zod diagnostics.
 */
export const CommerceMandateSchema = z.discriminatedUnion('event_kind', [
  MandateObserved,
  AuthorizationObserved,
  CaptureObserved,
  VoidObserved,
  RefundObserved,
  SettlementObserved,
  BudgetObserved,
]);

export type CommerceMandate = z.infer<typeof CommerceMandateSchema>;

export interface CommerceMandateValidationError {
  code: string;
  path?: string;
  message: string;
}

export type CommerceMandateValidationResult =
  | { ok: true; value: CommerceMandate }
  | { ok: false; errors: CommerceMandateValidationError[] };

/**
 * All `*_ref` field names that appear anywhere in a commerce mandate
 * payload. Used internally by `validateCommerceMandate` for the
 * ref-must-be-string pre-flight.
 */
const COMMERCE_MANDATE_REF_FIELDS = [
  'mandate_ref',
  'merchant_ref',
  'payer_ref',
  'authorization_ref',
  'capture_ref',
  'void_ref',
  'refund_ref',
  'settlement_ref',
  'budget_ref',
  'caller_ref',
  'policy_ref',
  'upstream_artifact_ref',
  'parent_ref',
  'scheme_ref',
] as const;

/**
 * Per-event-kind required fields (beyond the common required set
 * `mandate_ref` + `observed_at`).
 */
const REQUIRED_BY_KIND: Record<CommerceMandateEventKind, readonly string[]> = {
  'commerce-mandate-observed': ['merchant_ref', 'payer_ref'],
  'commerce-authorization-observed': ['authorization_ref', 'amount_minor', 'currency'],
  'commerce-capture-observed': ['authorization_ref', 'capture_ref', 'amount_minor', 'currency'],
  'commerce-void-observed': ['authorization_ref', 'void_ref'],
  'commerce-refund-observed': ['refund_ref', 'amount_minor', 'currency'],
  'commerce-settlement-observed': [
    'settlement_ref',
    'amount_minor',
    'currency',
    'settlement_state',
  ],
  'commerce-budget-observed': ['budget_ref'],
};

/**
 * Amount-bearing field names that must be a non-empty string when present.
 * Numeric input rejects with `commerce.mandate.invalid_amount_minor`.
 */
const AMOUNT_FIELDS = ['amount_minor', 'max_amount_minor'] as const;

/**
 * Validate a commerce mandate payload.
 *
 * Pre-flight order:
 *   1. Forbidden top-level payment-data keys -> inline_payment_data_blocked
 *   2. Ref fields must be strings when present -> ref_must_be_string
 *   3. Amount fields must be strings (not numbers) when present -> invalid_amount_minor
 *   4. event_kind presence/value -> missing_required_field / invalid_event_kind
 *   5. observed_at presence -> missing_required_field
 *   6. Per-kind required fields -> missing_required_field
 *   7. settlement_state present on non-settlement variant -> finality_synthesis_blocked
 *   8. scheme_id + scheme_ref both present -> scheme_conflict
 *   9. Zod schema parse with priority-mapped stable codes
 */
export function validateCommerceMandate(data: unknown): CommerceMandateValidationResult {
  const errors: CommerceMandateValidationError[] = [];

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;

    // Pre-flight 1: forbidden top-level payment-data keys.
    for (const forbidden of COMMERCE_MANDATE_FORBIDDEN_PAYMENT_DATA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(obj, forbidden)) {
        errors.push({
          code: COMMERCE_MANDATE_ERROR_CODES.inlinePaymentDataBlocked,
          path: forbidden,
          message: `commerce.mandate.inline_payment_data_blocked: forbidden top-level key '${forbidden}' rejected by the no-inline-payment-data invariant`,
        });
      }
    }

    // Pre-flight 2: ref fields must be strings when present.
    for (const field of COMMERCE_MANDATE_REF_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(obj, field) && typeof obj[field] !== 'string') {
        errors.push({
          code: COMMERCE_MANDATE_ERROR_CODES.refMustBeString,
          path: field,
          message: `commerce.mandate.ref_must_be_string: ${field} must be a string`,
        });
      }
    }

    // Pre-flight 3: amount fields must be strings (not numbers).
    for (const field of AMOUNT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(obj, field) && typeof obj[field] !== 'string') {
        errors.push({
          code: COMMERCE_MANDATE_ERROR_CODES.invalidAmountMinor,
          path: field,
          message: `commerce.mandate.invalid_amount_minor: ${field} must be a base-10 integer string (e.g., "1999"); numeric, decimal, and empty values are rejected`,
        });
      }
    }

    // Pre-flight 4: event_kind presence and value.
    if (!Object.prototype.hasOwnProperty.call(obj, 'event_kind')) {
      errors.push({
        code: COMMERCE_MANDATE_ERROR_CODES.missingRequiredField,
        path: 'event_kind',
        message: 'commerce.mandate.missing_required_field: event_kind is required',
      });
    } else if (
      typeof obj.event_kind !== 'string' ||
      !(EVENT_KINDS as readonly string[]).includes(obj.event_kind)
    ) {
      errors.push({
        code: COMMERCE_MANDATE_ERROR_CODES.invalidEventKind,
        path: 'event_kind',
        message: `commerce.mandate.invalid_event_kind: event_kind must be one of ${EVENT_KINDS.join(', ')}`,
      });
    }

    // Pre-flight 5: observed_at presence.
    if (!Object.prototype.hasOwnProperty.call(obj, 'observed_at')) {
      errors.push({
        code: COMMERCE_MANDATE_ERROR_CODES.missingRequiredField,
        path: 'observed_at',
        message: 'commerce.mandate.missing_required_field: observed_at is required',
      });
    }

    // Pre-flight 6: per-event-kind required fields.
    if (
      typeof obj.event_kind === 'string' &&
      (EVENT_KINDS as readonly string[]).includes(obj.event_kind)
    ) {
      const ek = obj.event_kind as CommerceMandateEventKind;
      const requiredCommon: readonly string[] = ['mandate_ref'];
      for (const field of [...requiredCommon, ...REQUIRED_BY_KIND[ek]]) {
        if (!Object.prototype.hasOwnProperty.call(obj, field)) {
          errors.push({
            code: COMMERCE_MANDATE_ERROR_CODES.missingRequiredField,
            path: field,
            message: `commerce.mandate.missing_required_field: ${field} is required for event_kind ${ek}`,
          });
        }
      }

      // Pre-flight 7: settlement_state on non-settlement variant rejects with
      // finality_synthesis_blocked. authorization-observed is the canonical
      // failure mode (an authorization is not a settlement), but the rule
      // applies to every non-settlement variant.
      if (
        ek !== 'commerce-settlement-observed' &&
        Object.prototype.hasOwnProperty.call(obj, 'settlement_state')
      ) {
        errors.push({
          code: COMMERCE_MANDATE_ERROR_CODES.finalitySynthesisBlocked,
          path: 'settlement_state',
          message: `commerce.mandate.finality_synthesis_blocked: settlement_state is not allowed on ${ek}; settlement finality may only be reported via commerce-settlement-observed`,
        });
      }
    }

    // Pre-flight 8: scheme_id and scheme_ref are mutually exclusive.
    if (
      Object.prototype.hasOwnProperty.call(obj, 'scheme_id') &&
      Object.prototype.hasOwnProperty.call(obj, 'scheme_ref')
    ) {
      errors.push({
        code: COMMERCE_MANDATE_ERROR_CODES.schemeConflict,
        path: 'scheme_id',
        message:
          'commerce.mandate.scheme_conflict: scheme_id and scheme_ref are mutually exclusive; set exactly one',
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const result = CommerceMandateSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }

  for (const issue of result.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      const unknownKeys = (issue as unknown as { keys?: string[] }).keys ?? [];
      for (const key of unknownKeys) {
        const dup = errors.some(
          (e) => e.code === COMMERCE_MANDATE_ERROR_CODES.unknownField && e.path === key
        );
        if (!dup) {
          errors.push({
            code: COMMERCE_MANDATE_ERROR_CODES.unknownField,
            path: key,
            message: `commerce.mandate.unknown_field: unknown top-level key '${key}' is not allowed`,
          });
        }
      }
      continue;
    }

    const path = issue.path.map(String).join('.');
    let code: string = COMMERCE_MANDATE_ERROR_CODES.opaqueRefGrammarViolation;

    if (issue.message.startsWith('commerce.mandate.opaque_ref_grammar_violation')) {
      code = COMMERCE_MANDATE_ERROR_CODES.opaqueRefGrammarViolation;
    } else if (issue.message.startsWith('commerce.mandate.invalid_currency')) {
      code = COMMERCE_MANDATE_ERROR_CODES.invalidCurrency;
    } else if (issue.message.startsWith('commerce.mandate.invalid_settlement_state')) {
      code = COMMERCE_MANDATE_ERROR_CODES.invalidSettlementState;
    } else if (issue.message.startsWith('commerce.mandate.invalid_scheme_id')) {
      code = COMMERCE_MANDATE_ERROR_CODES.invalidSchemeId;
    } else if (issue.message.startsWith('commerce.mandate.invalid_amount_minor')) {
      code = COMMERCE_MANDATE_ERROR_CODES.invalidAmountMinor;
    } else if (issue.message.startsWith('commerce.mandate.missing_required_field')) {
      code = COMMERCE_MANDATE_ERROR_CODES.missingRequiredField;
    } else if (issue.code === 'invalid_type') {
      const received = (issue as unknown as { received?: unknown }).received;
      const isMissing =
        received === undefined || received === 'undefined' || issue.message.includes('undefined');
      if (isMissing) {
        code = COMMERCE_MANDATE_ERROR_CODES.missingRequiredField;
      } else if (path === 'observed_at' || path === 'expires_at') {
        code = COMMERCE_MANDATE_ERROR_CODES.invalidObservedAt;
      } else if (path.endsWith('_ref')) {
        code = COMMERCE_MANDATE_ERROR_CODES.refMustBeString;
      } else if (path === 'amount_minor' || path === 'max_amount_minor') {
        code = COMMERCE_MANDATE_ERROR_CODES.invalidAmountMinor;
      } else if (path === 'currency') {
        code = COMMERCE_MANDATE_ERROR_CODES.invalidCurrency;
      } else if (path.endsWith('_digest')) {
        code = COMMERCE_MANDATE_ERROR_CODES.invalidDigest;
      } else {
        code = COMMERCE_MANDATE_ERROR_CODES.missingRequiredField;
      }
    } else if (issue.code === 'invalid_format') {
      if (path === 'observed_at' || path === 'expires_at') {
        code = COMMERCE_MANDATE_ERROR_CODES.invalidObservedAt;
      } else if (path.endsWith('_digest')) {
        code = COMMERCE_MANDATE_ERROR_CODES.invalidDigest;
      } else if (path === 'amount_minor' || path === 'max_amount_minor') {
        code = COMMERCE_MANDATE_ERROR_CODES.invalidAmountMinor;
      } else if (path === 'currency') {
        code = COMMERCE_MANDATE_ERROR_CODES.invalidCurrency;
      } else if (path === 'scheme_id') {
        code = COMMERCE_MANDATE_ERROR_CODES.invalidSchemeId;
      } else {
        code = COMMERCE_MANDATE_ERROR_CODES.opaqueRefGrammarViolation;
      }
    } else if (issue.code === 'invalid_value') {
      if (path === 'event_kind') {
        code = COMMERCE_MANDATE_ERROR_CODES.invalidEventKind;
      } else if (path === 'settlement_state') {
        code = COMMERCE_MANDATE_ERROR_CODES.invalidSettlementState;
      } else {
        code = COMMERCE_MANDATE_ERROR_CODES.opaqueRefGrammarViolation;
      }
    } else if (issue.code === 'invalid_union') {
      code = COMMERCE_MANDATE_ERROR_CODES.invalidEventKind;
    } else if (issue.code === 'too_big' || issue.code === 'too_small') {
      if (path === 'amount_minor' || path === 'max_amount_minor') {
        code = COMMERCE_MANDATE_ERROR_CODES.invalidAmountMinor;
      } else if (path === 'currency') {
        code = COMMERCE_MANDATE_ERROR_CODES.invalidCurrency;
      } else if (path === 'scheme_id') {
        code = COMMERCE_MANDATE_ERROR_CODES.invalidSchemeId;
      } else if (path.endsWith('_ref')) {
        code = COMMERCE_MANDATE_ERROR_CODES.opaqueRefGrammarViolation;
      } else {
        code = COMMERCE_MANDATE_ERROR_CODES.missingRequiredField;
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
 * Validate a commerce mandate payload AND assert that its `event_kind`
 * agrees with the caller-supplied type URI.
 *
 * The type URI and `event_kind` have a 1:1 relationship: the event_kind
 * value is always `org.peacprotocol/<event_kind>` stripped of its prefix,
 * i.e. `typeUri.slice('org.peacprotocol/'.length)`. If they disagree,
 * `commerce.mandate.type_event_kind_mismatch` is returned in addition to
 * (or instead of) any schema-level errors.
 *
 * Use this helper when the type URI comes from the wire-record envelope
 * and needs to be verified against the extension payload.
 */
export function validateCommerceMandateForType(
  typeUri: string,
  data: unknown
): CommerceMandateValidationResult {
  // Runtime guard: TypeScript types can be bypassed by JavaScript callers.
  // Reject unrecognized type URIs before attempting event_kind derivation.
  if (!(COMMERCE_MANDATE_TYPE_URIS as readonly string[]).includes(typeUri)) {
    return {
      ok: false,
      errors: [
        {
          code: COMMERCE_MANDATE_ERROR_CODES.typeUriUnknown,
          path: 'type',
          message: `commerce.mandate.type_uri_unknown: '${typeUri}' is not a recognized commerce mandate type URI`,
        },
      ],
    };
  }

  const base = validateCommerceMandate(data);

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
    const mismatch: CommerceMandateValidationError = {
      code: COMMERCE_MANDATE_ERROR_CODES.typeEventKindMismatch,
      path: 'event_kind',
      message: `commerce.mandate.type_event_kind_mismatch: event_kind '${(data as Record<string, unknown>).event_kind}' does not match expected '${expectedEventKind}' for type URI '${typeUri}'`,
    };
    if (base.ok) {
      return { ok: false, errors: [mismatch] };
    }
    return { ok: false, errors: [...base.errors, mismatch] };
  }

  return base;
}
