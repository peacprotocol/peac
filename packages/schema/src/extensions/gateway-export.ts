/**
 * Gateway Export Records Extension Schema
 *
 * Extension namespace: `org.peacprotocol/gateway-export`
 * Record type URIs:    8 (see GATEWAY_EXPORT_TYPE_URIS)
 *
 * Records caller-reported observations of payment-gateway / facilitator
 * settlement-recovery events. The caller observed the event; the caller's
 * issuer is the signer-of-record. PEAC provides the record format,
 * validation, and signing path. PEAC does not settle transactions, route
 * payments, contact gateways, verify on-chain state, monitor settlements,
 * enforce recovery policy, or resolve settlement disputes. Recovery
 * decisions are reported by the caller; the record describes what the
 * caller observed.
 *
 * Trigger-vs-state invariant:
 *   Gateway Export Records define 8 PEAC receipt-type URIs. Seven
 *   correspond to observed settlement/recovery states: pending, confirmed,
 *   unresolved, polling, confirmed_late, failed, and failed_orphaned. One
 *   URI, gateway-facilitator-timeout-observed, records the
 *   facilitator-timeout trigger event itself. PEAC does NOT introduce a
 *   new settlement state; it records an observable gateway boundary
 *   signal that may precede unresolved recovery.
 *
 *   This profile is a 7-state settlement/recovery model plus one
 *   PEAC timeout-trigger observation. It is not an 8-state gateway
 *   state machine. Upstream payment-facilitator state-machine designs
 *   are cited as informative references; PEAC schema names, error codes,
 *   type URIs, and normative text stay PEAC-neutral.
 *
 * Single-canonical-money-field invariant:
 *   The base `amount_minor` field (AmountMinorStringSchema) is the only
 *   monetary field on a gateway-export record. When the caller-reported
 *   EIP-3009-style four-tuple references (payer_ref / pay_to_ref /
 *   nonce_ref) are present, `amount_minor` represents the four-tuple
 *   value component. No separate `value_minor` field is defined; records
 *   carrying a `value_minor` key reject with `gateway.export.unknown_field`
 *   via the strict variant schema (NOT via the no-inline-payment-data
 *   invariant; `value_minor` is a rejected alternate money-field name,
 *   not raw payment data, so it should not borrow the
 *   `inline_payment_data_blocked` diagnostic).
 *
 * No-inline-payment-data invariant (grammar-based, not heuristic-based):
 *   - 19 forbidden top-level keys reject with
 *     `gateway.export.inline_payment_data_blocked` (raw transaction
 *     payload, raw nonce values, EIP-3009 payer/payTo, payment payloads,
 *     authorization values, card / token / credential material).
 *   - All `*_ref` fields validated by the `OpaqueRefSchema` grammar.
 *
 * Money-boundary invariant:
 *   - `amount_minor` (when present) uses the shared `AmountMinorStringSchema`
 *     grammar (bounded base-10 integer string) wrapped in a Gateway Export
 *     non-negative profile constraint (`NonNegativeAmountMinorStringSchema`).
 *     JS `number`, decimals, empty strings, comma-formatted values, AND
 *     negative values are all rejected with
 *     `gateway.export.invalid_amount_minor`. Bounded length prevents
 *     precision loss above `Number.MAX_SAFE_INTEGER`. Gateway-export
 *     `amount_minor` is caller-reported payment value evidence (not
 *     refund-delta semantics), so the non-negative constraint applies
 *     uniformly across every event variant; refund / void / failure
 *     outcomes are captured by the event_kind discriminator, not by
 *     amount sign.
 *
 * Timeout-profile invariant:
 *   - `timeout_profile` is a closed enum aligned with upstream
 *     environment profiles: `datacenter` / `east_africa_3g` /
 *     `west_africa_3g` / `custom`.
 *   - `timeout_profile` values are caller-reported profile labels. PEAC
 *     does NOT infer geography, network quality, settlement finality,
 *     or settlement guarantees from these labels. The geographic-sounding
 *     labels (`east_africa_3g`, `west_africa_3g`) are upstream-aligned
 *     identifiers, not geographic claims; PEAC records what the caller
 *     reported, not where the call originated.
 *   - When `timeout_profile = 'custom'`, the record MUST include all three
 *     timing fields `facilitator_timeout_ms`, `poll_interval_ms`, and
 *     `max_poll_window_ms`. Missing any timing field rejects with
 *     `gateway.export.missing_required_field`.
 *
 * Polling-strategy invariant:
 *   - `polling_strategy` is a PEAC-defined OBSERVER-scope categorical
 *     descriptor of caller-reported polling behavior. It is NOT an
 *     upstream enum; upstream models express polling as an interval +
 *     window pattern, not a named-strategy enum.
 *
 * Validation returns the structured error contract:
 *   `{ ok: true, value }` or `{ ok: false, errors: [{ code, path?, message }] }`.
 */
import { z } from 'zod';
import { Sha256DigestSchema } from '../wire-02-extensions/shared-validators.js';
import { AmountMinorStringSchema } from '../wire-02-extensions/commerce.js';
import { createOpaqueRefSchema } from '../opaque-ref.js';

export const GATEWAY_EXPORT_EXTENSION_KEY = 'org.peacprotocol/gateway-export' as const;

/** All 8 gateway-export record type URIs (one per event kind). */
export const GATEWAY_EXPORT_TYPE_URIS = [
  'org.peacprotocol/gateway-payment-submitted-observed',
  'org.peacprotocol/gateway-facilitator-timeout-observed',
  'org.peacprotocol/gateway-settlement-unresolved-observed',
  'org.peacprotocol/gateway-settlement-polling-observed',
  'org.peacprotocol/gateway-settlement-confirmed-observed',
  'org.peacprotocol/gateway-settlement-confirmed-late-observed',
  'org.peacprotocol/gateway-settlement-failed-observed',
  'org.peacprotocol/gateway-settlement-failed-orphaned-observed',
] as const;

export type GatewayExportTypeUri = (typeof GATEWAY_EXPORT_TYPE_URIS)[number];

/**
 * Event-kind discriminator literal values. Each `event_kind` corresponds
 * 1:1 with a type URI in `GATEWAY_EXPORT_TYPE_URIS` (drop the
 * `org.peacprotocol/` prefix from the URI to get the event_kind).
 */
const EVENT_KINDS = [
  'gateway-payment-submitted-observed',
  'gateway-facilitator-timeout-observed',
  'gateway-settlement-unresolved-observed',
  'gateway-settlement-polling-observed',
  'gateway-settlement-confirmed-observed',
  'gateway-settlement-confirmed-late-observed',
  'gateway-settlement-failed-observed',
  'gateway-settlement-failed-orphaned-observed',
] as const;

export type GatewayExportEventKind = (typeof EVENT_KINDS)[number];

/** Stable error codes for `validateGatewayExport` and `validateGatewayExportForType`. */
export const GATEWAY_EXPORT_ERROR_CODES = {
  invalidPayload: 'gateway.export.invalid_payload',
  inlinePaymentDataBlocked: 'gateway.export.inline_payment_data_blocked',
  unknownField: 'gateway.export.unknown_field',
  opaqueRefGrammarViolation: 'gateway.export.opaque_ref_grammar_violation',
  refMustBeString: 'gateway.export.ref_must_be_string',
  missingRequiredField: 'gateway.export.missing_required_field',
  invalidEventKind: 'gateway.export.invalid_event_kind',
  invalidObservedAt: 'gateway.export.invalid_observed_at',
  invalidAmountMinor: 'gateway.export.invalid_amount_minor',
  invalidDigest: 'gateway.export.invalid_digest',
  invalidTimeoutProfile: 'gateway.export.invalid_timeout_profile',
  invalidPollingStrategy: 'gateway.export.invalid_polling_strategy',
  invalidPollCount: 'gateway.export.invalid_poll_count',
  invalidCheckCount: 'gateway.export.invalid_check_count',
  invalidDeadlineExceededMs: 'gateway.export.invalid_deadline_exceeded_ms',
  invalidDelayMs: 'gateway.export.invalid_delay_ms',
  invalidValidBeforeUnixSeconds: 'gateway.export.invalid_valid_before_unix_seconds',
  invalidFacilitatorTimeoutMs: 'gateway.export.invalid_facilitator_timeout_ms',
  invalidPollIntervalMs: 'gateway.export.invalid_poll_interval_ms',
  invalidMaxPollWindowMs: 'gateway.export.invalid_max_poll_window_ms',
  fieldTooLarge: 'gateway.export.field_too_large',
  typeUriUnknown: 'gateway.export.type_uri_unknown',
  typeEventKindMismatch: 'gateway.export.type_event_kind_mismatch',
} as const;

/**
 * Closed-enum of forbidden top-level keys. These represent classes of
 * raw payment-data / EIP-3009-style four-tuple raw values that must not
 * appear at the extension top level. Any of these keys at the top level
 * rejects with `gateway.export.inline_payment_data_blocked`.
 *
 * Note: `value_minor` is NOT in this list. It is rejected as
 * `gateway.export.unknown_field` via the strict variant schema, because
 * `value_minor` is a rejected alternate money-field name (the single
 * canonical money field is `amount_minor`), not raw payment data;
 * routing it through `inline_payment_data_blocked` would muddy the
 * public error semantics.
 */
export const GATEWAY_EXPORT_FORBIDDEN_PAYMENT_DATA_KEYS = [
  'transaction_data',
  'raw_tx',
  'tx_hash_value',
  'nonce',
  'raw_nonce',
  'payer',
  'pay_to',
  'payTo',
  'payment_payload',
  'authorization',
  'authorization_payload',
  'card_number',
  'pan',
  'cvv',
  'token',
  'bearer_token',
  'api_key',
  'private_key',
  'credential',
] as const;

/**
 * Generic opaque-reference schema for every `*_ref` field on a
 * gateway-export record. Shares `OpaqueRefSchema`'s grammar (no
 * whitespace, no `@`, recognized prefix, byte-bounded).
 */
const GatewayExportRef = createOpaqueRefSchema({
  errorCode: 'gateway.export.opaque_ref_grammar_violation',
  maxBytes: 256,
});

/** RFC 3339 timestamp with timezone offset. */
const ObservedAt = z.string().datetime({ offset: true });

/**
 * Non-negative safe-integer bounded to 0..2_592_000_000 (30 days in
 * milliseconds). Used by `deadline_exceeded_ms`, `delay_ms`,
 * `facilitator_timeout_ms`, `poll_interval_ms`, `max_poll_window_ms`.
 */
const MAX_BOUNDED_MS = 2_592_000_000;
const BoundedMillis = (code: string) =>
  z
    .number()
    .int()
    .min(0, { message: `${code}: must be a non-negative safe integer` })
    .max(MAX_BOUNDED_MS, { message: `${code}: must be at most ${MAX_BOUNDED_MS} (30 days)` })
    .refine(Number.isSafeInteger, {
      message: `${code}: must be a safe integer (Number.isSafeInteger)`,
    });

/** Non-negative bounded count (0..1_000_000). */
const MAX_COUNT = 1_000_000;
const BoundedCount = (code: string) =>
  z
    .number()
    .int()
    .min(0, { message: `${code}: must be a non-negative safe integer` })
    .max(MAX_COUNT, { message: `${code}: must be at most ${MAX_COUNT}` })
    .refine(Number.isSafeInteger, {
      message: `${code}: must be a safe integer (Number.isSafeInteger)`,
    });

/**
 * Gateway Export profile-specific non-negative wrapper around the shared
 * `AmountMinorStringSchema` grammar. Caller-reported payment value
 * evidence in `amount_minor` MUST be non-negative; refund / void /
 * failure outcomes are captured by the event_kind discriminator, not
 * by amount sign. Negative values reject with
 * `gateway.export.invalid_amount_minor`.
 *
 * Note: this is a per-profile refine, not a change to the shared
 * `AmountMinorStringSchema` (which remains a general base grammar that
 * other profiles can constrain differently).
 */
const NonNegativeAmountMinorStringSchema = AmountMinorStringSchema.refine(
  (value) => !value.startsWith('-'),
  {
    message:
      'gateway.export.invalid_amount_minor: amount_minor must be a canonical non-negative base-10 integer string',
  }
);

/**
 * Non-negative safe-integer Unix-seconds for caller-reported EIP-3009
 * `validBefore` expiry. PEAC records the caller-reported expiry; PEAC
 * does NOT verify EIP-3009 validity. Natural state-expiry boundary.
 */
const ValidBeforeUnixSeconds = z
  .number()
  .int()
  .min(0, {
    message:
      'gateway.export.invalid_valid_before_unix_seconds: must be a non-negative Unix-seconds integer',
  })
  .refine(Number.isSafeInteger, {
    message:
      'gateway.export.invalid_valid_before_unix_seconds: must be a safe integer (Number.isSafeInteger)',
  });

/**
 * Closed enum: `timeout_profile`. Aligned with upstream environment
 * profiles. Caller-reported labels only; PEAC does NOT infer geography,
 * network quality, settlement finality, or settlement guarantees from
 * these values. `custom` requires explicit timing fields enforced by
 * pre-flight check.
 */
const TimeoutProfileSchema = z.enum(['datacenter', 'east_africa_3g', 'west_africa_3g', 'custom'], {
  error: () =>
    'gateway.export.invalid_timeout_profile: timeout_profile must be one of datacenter / east_africa_3g / west_africa_3g / custom',
});

/**
 * Closed enum: `polling_strategy`. PEAC-defined OBSERVER-scope
 * categorical descriptor; NOT an upstream enum.
 */
const PollingStrategySchema = z.enum(['exponential', 'linear', 'immediate', 'webhook', 'unknown'], {
  error: () =>
    'gateway.export.invalid_polling_strategy: polling_strategy must be one of exponential / linear / immediate / webhook / unknown',
});

/**
 * UTF-8 byte length (not JavaScript code-unit length). PEAC schema
 * bounded-string fields are byte-stable across languages; multi-byte
 * characters MUST be counted by their encoded byte length.
 *
 * `z.string().max(N)` would count UTF-16 code units (a 40-character
 * Unicode string can exceed 64 UTF-8 bytes while staying inside
 * `.max(64)`), so we use an explicit `TextEncoder().encode(...).byteLength`
 * refine that enforces per-field byte ceilings.
 */
const textEncoder = new TextEncoder();
function utf8ByteLength(value: string): number {
  return textEncoder.encode(value).byteLength;
}
function boundedUtf8String(field: string, maxBytes: number) {
  return z
    .string()
    .min(1, {
      message: `gateway.export.missing_required_field: ${field} must not be empty`,
    })
    .refine((value) => utf8ByteLength(value) <= maxBytes, {
      message: `gateway.export.field_too_large: ${field} must be at most ${maxBytes} UTF-8 bytes`,
    });
}

const BoundedAsset = boundedUtf8String('asset', 32);
const BoundedNetwork = boundedUtf8String('network', 64);
const BoundedFinalState = boundedUtf8String('final_state', 64);
const BoundedLastKnownState = boundedUtf8String('last_known_state', 64);

const commonRequiredFields = {
  gateway_ref: GatewayExportRef,
  payment_ref: GatewayExportRef,
  observed_at: ObservedAt,
} as const;

/**
 * Common optional fields shared by every variant. EIP-3009 four-tuple
 * references (`payer_ref` / `pay_to_ref` / `nonce_ref`) and the
 * caller-reported EIP-3009 expiry (`valid_before_unix_seconds`) live
 * here; the four-tuple `value` component is carried by the existing
 * base `amount_minor` field (single canonical money field per record).
 */
const commonOptionalFields = {
  facilitator_ref: GatewayExportRef.optional(),
  amount_minor: NonNegativeAmountMinorStringSchema.optional(),
  asset: BoundedAsset.optional(),
  network: BoundedNetwork.optional(),
  tx_ref: GatewayExportRef.optional(),
  nonce_ref: GatewayExportRef.optional(),
  upstream_artifact_ref: GatewayExportRef.optional(),
  upstream_artifact_digest: Sha256DigestSchema.optional(),
  caller_ref: GatewayExportRef.optional(),
  parent_ref: GatewayExportRef.optional(),
  valid_before_unix_seconds: ValidBeforeUnixSeconds.optional(),
  payer_ref: GatewayExportRef.optional(),
  pay_to_ref: GatewayExportRef.optional(),
} as const;

/**
 * Per-event-kind variants. Discriminated by `event_kind`. Each variant
 * is `.strict()`-typed so unknown keys at the variant level surface as
 * `unrecognized_keys`.
 */
const PaymentSubmittedObserved = z
  .object({
    event_kind: z.literal('gateway-payment-submitted-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    submitted_at: ObservedAt,
    timeout_deadline: ObservedAt.optional(),
  })
  .strict();

const FacilitatorTimeoutObserved = z
  .object({
    event_kind: z.literal('gateway-facilitator-timeout-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    timeout_at: ObservedAt,
    timeout_profile: TimeoutProfileSchema,
    deadline_exceeded_ms: BoundedMillis('gateway.export.invalid_deadline_exceeded_ms').optional(),
    facilitator_timeout_ms: BoundedMillis(
      'gateway.export.invalid_facilitator_timeout_ms'
    ).optional(),
    poll_interval_ms: BoundedMillis('gateway.export.invalid_poll_interval_ms').optional(),
    max_poll_window_ms: BoundedMillis('gateway.export.invalid_max_poll_window_ms').optional(),
  })
  .strict();

const SettlementUnresolvedObserved = z
  .object({
    event_kind: z.literal('gateway-settlement-unresolved-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    last_checked_at: ObservedAt,
    check_count: BoundedCount('gateway.export.invalid_check_count'),
  })
  .strict();

const SettlementPollingObserved = z
  .object({
    event_kind: z.literal('gateway-settlement-polling-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    poll_count: BoundedCount('gateway.export.invalid_poll_count'),
    polling_strategy: PollingStrategySchema,
  })
  .strict();

const SettlementConfirmedObserved = z
  .object({
    event_kind: z.literal('gateway-settlement-confirmed-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    confirmed_at: ObservedAt,
    settlement_ref: GatewayExportRef,
  })
  .strict();

const SettlementConfirmedLateObserved = z
  .object({
    event_kind: z.literal('gateway-settlement-confirmed-late-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    confirmed_at: ObservedAt,
    settlement_ref: GatewayExportRef,
    delay_ms: BoundedMillis('gateway.export.invalid_delay_ms'),
  })
  .strict();

const SettlementFailedObserved = z
  .object({
    event_kind: z.literal('gateway-settlement-failed-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    final_state: BoundedFinalState,
    failure_reason_ref: GatewayExportRef.optional(),
  })
  .strict();

const SettlementFailedOrphanedObserved = z
  .object({
    event_kind: z.literal('gateway-settlement-failed-orphaned-observed'),
    ...commonRequiredFields,
    ...commonOptionalFields,
    last_known_state: BoundedLastKnownState,
    chain_ref: GatewayExportRef.optional(),
  })
  .strict();

/**
 * The full gateway-export record (discriminated by `event_kind`).
 *
 * Pre-flight checks (forbidden top-level keys, ref-must-be-string,
 * amount string-only, event_kind presence/value, missing required
 * fields, custom timeout requires three timing fields) run inside
 * `validateGatewayExport` before the discriminated union parse so
 * callers see stable codes rather than generic Zod diagnostics.
 */
export const GatewayExportSchema = z.discriminatedUnion('event_kind', [
  PaymentSubmittedObserved,
  FacilitatorTimeoutObserved,
  SettlementUnresolvedObserved,
  SettlementPollingObserved,
  SettlementConfirmedObserved,
  SettlementConfirmedLateObserved,
  SettlementFailedObserved,
  SettlementFailedOrphanedObserved,
]);

export type GatewayExport = z.infer<typeof GatewayExportSchema>;

export interface GatewayExportValidationError {
  code: string;
  path?: string;
  message: string;
}

export type GatewayExportValidationResult =
  | { ok: true; value: GatewayExport }
  | { ok: false; errors: GatewayExportValidationError[] };

/**
 * All `*_ref` field names that appear anywhere in a gateway-export
 * payload. Used internally by `validateGatewayExport` for the
 * ref-must-be-string pre-flight.
 */
const GATEWAY_EXPORT_REF_FIELDS = [
  'gateway_ref',
  'payment_ref',
  'facilitator_ref',
  'tx_ref',
  'nonce_ref',
  'upstream_artifact_ref',
  'caller_ref',
  'parent_ref',
  'payer_ref',
  'pay_to_ref',
  'settlement_ref',
  'failure_reason_ref',
  'chain_ref',
] as const;

/**
 * Per-event-kind required fields (beyond the common required set
 * `gateway_ref` + `payment_ref` + `observed_at`).
 */
const REQUIRED_BY_KIND: Record<GatewayExportEventKind, readonly string[]> = {
  'gateway-payment-submitted-observed': ['submitted_at'],
  'gateway-facilitator-timeout-observed': ['timeout_at', 'timeout_profile'],
  'gateway-settlement-unresolved-observed': ['last_checked_at', 'check_count'],
  'gateway-settlement-polling-observed': ['poll_count', 'polling_strategy'],
  'gateway-settlement-confirmed-observed': ['confirmed_at', 'settlement_ref'],
  'gateway-settlement-confirmed-late-observed': ['confirmed_at', 'settlement_ref', 'delay_ms'],
  'gateway-settlement-failed-observed': ['final_state'],
  'gateway-settlement-failed-orphaned-observed': ['last_known_state'],
};

/**
 * Amount-bearing field names that must be a non-empty string when
 * present. Numeric input rejects with
 * `gateway.export.invalid_amount_minor`.
 */
const AMOUNT_FIELDS = ['amount_minor'] as const;

/**
 * When `timeout_profile = 'custom'`, all three timing fields are
 * required. Enforced as a pre-flight check so the structured error
 * `gateway.export.missing_required_field` surfaces before Zod's
 * variant parse.
 */
const CUSTOM_TIMEOUT_REQUIRED_FIELDS = [
  'facilitator_timeout_ms',
  'poll_interval_ms',
  'max_poll_window_ms',
] as const;

/**
 * Validate a gateway-export payload.
 *
 * Pre-flight order:
 *   1. Forbidden top-level payment-data keys -> inline_payment_data_blocked
 *   2. Ref fields must be strings when present -> ref_must_be_string
 *   3. Amount fields must be strings (not numbers) when present -> invalid_amount_minor
 *   4. event_kind presence/value -> missing_required_field / invalid_event_kind
 *   5. observed_at presence -> missing_required_field
 *   6. Per-kind required fields -> missing_required_field
 *   7. custom timeout_profile requires three timing fields -> missing_required_field
 *   8. Zod schema parse with priority-mapped stable codes
 */
export function validateGatewayExport(data: unknown): GatewayExportValidationResult {
  const errors: GatewayExportValidationError[] = [];

  // Pre-flight 0: top-level payload must be a JSON object (not null,
  // undefined, array, or primitive). Without this guard, the downstream
  // Zod discriminated-union parse would surface misleading missing-field
  // diagnostics for clearly invalid top-level shapes.
  if (data === null || data === undefined || typeof data !== 'object' || Array.isArray(data)) {
    return {
      ok: false,
      errors: [
        {
          code: GATEWAY_EXPORT_ERROR_CODES.invalidPayload,
          message: 'gateway.export.invalid_payload: gateway-export payload must be a JSON object',
        },
      ],
    };
  }

  {
    const obj = data as Record<string, unknown>;

    // Pre-flight 1: forbidden top-level payment-data keys.
    for (const forbidden of GATEWAY_EXPORT_FORBIDDEN_PAYMENT_DATA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(obj, forbidden)) {
        errors.push({
          code: GATEWAY_EXPORT_ERROR_CODES.inlinePaymentDataBlocked,
          path: forbidden,
          message: `gateway.export.inline_payment_data_blocked: forbidden top-level key '${forbidden}' rejected by the no-inline-payment-data invariant`,
        });
      }
    }

    // Pre-flight 2: ref fields must be strings when present.
    for (const field of GATEWAY_EXPORT_REF_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(obj, field) && typeof obj[field] !== 'string') {
        errors.push({
          code: GATEWAY_EXPORT_ERROR_CODES.refMustBeString,
          path: field,
          message: `gateway.export.ref_must_be_string: ${field} must be a string`,
        });
      }
    }

    // Pre-flight 3: amount fields must be strings (not numbers).
    for (const field of AMOUNT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(obj, field) && typeof obj[field] !== 'string') {
        errors.push({
          code: GATEWAY_EXPORT_ERROR_CODES.invalidAmountMinor,
          path: field,
          message: `gateway.export.invalid_amount_minor: ${field} must be a base-10 integer string (e.g., "1999"); numeric, decimal, and empty values are rejected`,
        });
      }
    }

    // Pre-flight 4: event_kind presence and value.
    if (!Object.prototype.hasOwnProperty.call(obj, 'event_kind')) {
      errors.push({
        code: GATEWAY_EXPORT_ERROR_CODES.missingRequiredField,
        path: 'event_kind',
        message: 'gateway.export.missing_required_field: event_kind is required',
      });
    } else if (
      typeof obj.event_kind !== 'string' ||
      !(EVENT_KINDS as readonly string[]).includes(obj.event_kind)
    ) {
      errors.push({
        code: GATEWAY_EXPORT_ERROR_CODES.invalidEventKind,
        path: 'event_kind',
        message: `gateway.export.invalid_event_kind: event_kind must be one of ${EVENT_KINDS.join(', ')}`,
      });
    }

    // Pre-flight 5: observed_at presence.
    if (!Object.prototype.hasOwnProperty.call(obj, 'observed_at')) {
      errors.push({
        code: GATEWAY_EXPORT_ERROR_CODES.missingRequiredField,
        path: 'observed_at',
        message: 'gateway.export.missing_required_field: observed_at is required',
      });
    }

    // Pre-flight 6: per-event-kind required fields.
    if (
      typeof obj.event_kind === 'string' &&
      (EVENT_KINDS as readonly string[]).includes(obj.event_kind)
    ) {
      const ek = obj.event_kind as GatewayExportEventKind;
      const requiredCommon: readonly string[] = ['gateway_ref', 'payment_ref'];
      for (const field of [...requiredCommon, ...REQUIRED_BY_KIND[ek]]) {
        if (!Object.prototype.hasOwnProperty.call(obj, field)) {
          errors.push({
            code: GATEWAY_EXPORT_ERROR_CODES.missingRequiredField,
            path: field,
            message: `gateway.export.missing_required_field: ${field} is required for event_kind ${ek}`,
          });
        }
      }

      // Pre-flight 7: custom timeout_profile requires three timing fields.
      if (ek === 'gateway-facilitator-timeout-observed' && obj.timeout_profile === 'custom') {
        for (const field of CUSTOM_TIMEOUT_REQUIRED_FIELDS) {
          if (!Object.prototype.hasOwnProperty.call(obj, field)) {
            errors.push({
              code: GATEWAY_EXPORT_ERROR_CODES.missingRequiredField,
              path: field,
              message: `gateway.export.missing_required_field: ${field} is required when timeout_profile is 'custom'`,
            });
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const result = GatewayExportSchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }

  for (const issue of result.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      const unknownKeys = (issue as unknown as { keys?: string[] }).keys ?? [];
      for (const key of unknownKeys) {
        const dup = errors.some(
          (e) => e.code === GATEWAY_EXPORT_ERROR_CODES.unknownField && e.path === key
        );
        if (!dup) {
          errors.push({
            code: GATEWAY_EXPORT_ERROR_CODES.unknownField,
            path: key,
            message: `gateway.export.unknown_field: unknown top-level key '${key}' is not allowed`,
          });
        }
      }
      continue;
    }

    const path = issue.path.map(String).join('.');
    let code: string = GATEWAY_EXPORT_ERROR_CODES.opaqueRefGrammarViolation;

    if (issue.message.startsWith('gateway.export.opaque_ref_grammar_violation')) {
      code = GATEWAY_EXPORT_ERROR_CODES.opaqueRefGrammarViolation;
    } else if (issue.message.startsWith('gateway.export.invalid_timeout_profile')) {
      code = GATEWAY_EXPORT_ERROR_CODES.invalidTimeoutProfile;
    } else if (issue.message.startsWith('gateway.export.invalid_polling_strategy')) {
      code = GATEWAY_EXPORT_ERROR_CODES.invalidPollingStrategy;
    } else if (issue.message.startsWith('gateway.export.invalid_poll_count')) {
      code = GATEWAY_EXPORT_ERROR_CODES.invalidPollCount;
    } else if (issue.message.startsWith('gateway.export.invalid_check_count')) {
      code = GATEWAY_EXPORT_ERROR_CODES.invalidCheckCount;
    } else if (issue.message.startsWith('gateway.export.invalid_deadline_exceeded_ms')) {
      code = GATEWAY_EXPORT_ERROR_CODES.invalidDeadlineExceededMs;
    } else if (issue.message.startsWith('gateway.export.invalid_delay_ms')) {
      code = GATEWAY_EXPORT_ERROR_CODES.invalidDelayMs;
    } else if (issue.message.startsWith('gateway.export.invalid_valid_before_unix_seconds')) {
      code = GATEWAY_EXPORT_ERROR_CODES.invalidValidBeforeUnixSeconds;
    } else if (issue.message.startsWith('gateway.export.invalid_facilitator_timeout_ms')) {
      code = GATEWAY_EXPORT_ERROR_CODES.invalidFacilitatorTimeoutMs;
    } else if (issue.message.startsWith('gateway.export.invalid_poll_interval_ms')) {
      code = GATEWAY_EXPORT_ERROR_CODES.invalidPollIntervalMs;
    } else if (issue.message.startsWith('gateway.export.invalid_max_poll_window_ms')) {
      code = GATEWAY_EXPORT_ERROR_CODES.invalidMaxPollWindowMs;
    } else if (issue.message.startsWith('gateway.export.invalid_amount_minor')) {
      code = GATEWAY_EXPORT_ERROR_CODES.invalidAmountMinor;
    } else if (issue.message.startsWith('gateway.export.field_too_large')) {
      code = GATEWAY_EXPORT_ERROR_CODES.fieldTooLarge;
    } else if (issue.message.startsWith('gateway.export.missing_required_field')) {
      code = GATEWAY_EXPORT_ERROR_CODES.missingRequiredField;
    } else if (issue.code === 'invalid_type') {
      // Zod 4 issue shape: for missing fields, `received === 'undefined'` (string)
      // and the message reads "Invalid input: expected X, received undefined".
      // For wrong-type-on-present-field (e.g. float on .int()), `received` may
      // be omitted entirely (e.g. "expected int, received number"). That is
      // NOT a missing field, so we cannot use `received === undefined` as the
      // missing-field marker (that would false-positive every wrong-type
      // failure where Zod omits `received`).
      const received = (issue as unknown as { received?: unknown }).received;
      const isMissing = received === 'undefined' || issue.message.includes('received undefined');
      if (isMissing) {
        code = GATEWAY_EXPORT_ERROR_CODES.missingRequiredField;
      } else if (
        path === 'observed_at' ||
        path === 'submitted_at' ||
        path === 'timeout_deadline' ||
        path === 'timeout_at' ||
        path === 'last_checked_at' ||
        path === 'confirmed_at'
      ) {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidObservedAt;
      } else if (path.endsWith('_ref')) {
        code = GATEWAY_EXPORT_ERROR_CODES.refMustBeString;
      } else if (path === 'amount_minor') {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidAmountMinor;
      } else if (path === 'valid_before_unix_seconds') {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidValidBeforeUnixSeconds;
      } else if (path.endsWith('_digest')) {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidDigest;
      } else {
        code = GATEWAY_EXPORT_ERROR_CODES.missingRequiredField;
      }
    } else if (issue.code === 'invalid_format') {
      if (
        path === 'observed_at' ||
        path === 'submitted_at' ||
        path === 'timeout_deadline' ||
        path === 'timeout_at' ||
        path === 'last_checked_at' ||
        path === 'confirmed_at'
      ) {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidObservedAt;
      } else if (path.endsWith('_digest')) {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidDigest;
      } else if (path === 'amount_minor') {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidAmountMinor;
      } else {
        code = GATEWAY_EXPORT_ERROR_CODES.opaqueRefGrammarViolation;
      }
    } else if (issue.code === 'invalid_value') {
      if (path === 'event_kind') {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidEventKind;
      } else if (path === 'timeout_profile') {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidTimeoutProfile;
      } else if (path === 'polling_strategy') {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidPollingStrategy;
      } else {
        code = GATEWAY_EXPORT_ERROR_CODES.opaqueRefGrammarViolation;
      }
    } else if (issue.code === 'invalid_union') {
      code = GATEWAY_EXPORT_ERROR_CODES.invalidEventKind;
    } else if (issue.code === 'too_big' || issue.code === 'too_small') {
      if (path === 'amount_minor') {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidAmountMinor;
      } else if (path === 'poll_count') {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidPollCount;
      } else if (path === 'check_count') {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidCheckCount;
      } else if (path === 'deadline_exceeded_ms') {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidDeadlineExceededMs;
      } else if (path === 'delay_ms') {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidDelayMs;
      } else if (path === 'valid_before_unix_seconds') {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidValidBeforeUnixSeconds;
      } else if (path === 'facilitator_timeout_ms') {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidFacilitatorTimeoutMs;
      } else if (path === 'poll_interval_ms') {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidPollIntervalMs;
      } else if (path === 'max_poll_window_ms') {
        code = GATEWAY_EXPORT_ERROR_CODES.invalidMaxPollWindowMs;
      } else if (
        path === 'asset' ||
        path === 'network' ||
        path === 'final_state' ||
        path === 'last_known_state'
      ) {
        code = GATEWAY_EXPORT_ERROR_CODES.fieldTooLarge;
      } else if (path.endsWith('_ref')) {
        code = GATEWAY_EXPORT_ERROR_CODES.opaqueRefGrammarViolation;
      } else {
        code = GATEWAY_EXPORT_ERROR_CODES.missingRequiredField;
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
 * Validate a gateway-export payload AND assert that its `event_kind`
 * agrees with the caller-supplied type URI.
 *
 * The type URI and `event_kind` have a 1:1 relationship: the
 * `event_kind` value is always `org.peacprotocol/<event_kind>` stripped
 * of its prefix, i.e. `typeUri.slice('org.peacprotocol/'.length)`. If
 * they disagree, `gateway.export.type_event_kind_mismatch` is returned
 * in addition to (or instead of) any schema-level errors.
 *
 * Use this helper when the type URI comes from the wire-record envelope
 * and needs to be verified against the extension payload.
 */
export function validateGatewayExportForType(
  typeUri: string,
  data: unknown
): GatewayExportValidationResult {
  // Runtime guard: TypeScript types can be bypassed by JavaScript callers.
  if (!(GATEWAY_EXPORT_TYPE_URIS as readonly string[]).includes(typeUri)) {
    return {
      ok: false,
      errors: [
        {
          code: GATEWAY_EXPORT_ERROR_CODES.typeUriUnknown,
          path: 'type',
          message: `gateway.export.type_uri_unknown: '${typeUri}' is not a recognized gateway export type URI`,
        },
      ],
    };
  }

  const base = validateGatewayExport(data);

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
    const mismatch: GatewayExportValidationError = {
      code: GATEWAY_EXPORT_ERROR_CODES.typeEventKindMismatch,
      path: 'event_kind',
      message: `gateway.export.type_event_kind_mismatch: event_kind '${(data as Record<string, unknown>).event_kind}' does not match expected '${expectedEventKind}' for type URI '${typeUri}'`,
    };
    if (base.ok) {
      return { ok: false, errors: [mismatch] };
    }
    return { ok: false, errors: [...base.errors, mismatch] };
  }

  return base;
}
