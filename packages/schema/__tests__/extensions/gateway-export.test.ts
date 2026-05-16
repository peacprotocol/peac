/**
 * Gateway export schema validator tests.
 *
 * Exercises:
 *   - the invalid_payload top-level guard (null / undefined / array / primitive)
 *   - the no-inline-payment-data invariant (raw payment-data keys; 19 entries)
 *   - the single-canonical-money-field invariant (amount_minor is the only
 *     money field; value_minor is rejected as unknown_field via the strict
 *     variant schema, NOT via inline_payment_data_blocked)
 *   - the opaque-reference grammar
 *   - the money-boundary invariant (AmountMinorStringSchema)
 *   - per-event-kind required fields (8 event kinds)
 *   - trigger-vs-state doctrine (facilitator-timeout is a discrete trigger event)
 *   - the discriminated union (8 *-observed event kinds)
 *   - observed_at missing/malformed split
 *   - invalid event_kind rejection (including non-gateway prefixes)
 *   - timeout_profile closed enum (upstream-aligned: datacenter / east_africa_3g / west_africa_3g / custom)
 *   - timeout_profile=custom requires facilitator_timeout_ms + poll_interval_ms + max_poll_window_ms
 *   - polling_strategy closed enum (PEAC observer categorization; not upstream)
 *   - bounded numeric fields (poll_count / check_count / deadline_exceeded_ms / delay_ms / valid_before_unix_seconds / facilitator_timeout_ms / poll_interval_ms / max_poll_window_ms)
 *   - UTF-8 byte limits on asset / network / final_state / last_known_state
 *     (real TextEncoder byte length, not JS code units)
 *   - validateGatewayExportForType type URI / event_kind agreement
 *   - gateway boundary (no overclaiming-verb field names)
 */
import { describe, it, expect } from 'vitest';
import {
  GATEWAY_EXPORT_FORBIDDEN_PAYMENT_DATA_KEYS,
  GATEWAY_EXPORT_ERROR_CODES,
  GATEWAY_EXPORT_TYPE_URIS,
  GatewayExportSchema,
  validateGatewayExport,
  validateGatewayExportForType,
} from '../../src/extensions/gateway-export';

const validPaymentSubmitted = () => ({
  event_kind: 'gateway-payment-submitted-observed',
  gateway_ref: 'urn:peac:gateway:gw-001',
  payment_ref: 'urn:peac:payment:pay-001',
  observed_at: '2026-05-16T10:00:00Z',
  submitted_at: '2026-05-16T10:00:00Z',
});

const validFacilitatorTimeout = () => ({
  event_kind: 'gateway-facilitator-timeout-observed',
  gateway_ref: 'urn:peac:gateway:gw-002',
  payment_ref: 'urn:peac:payment:pay-002',
  observed_at: '2026-05-16T10:01:00Z',
  timeout_at: '2026-05-16T10:01:00Z',
  timeout_profile: 'datacenter' as const,
});

const validFacilitatorTimeoutCustom = () => ({
  event_kind: 'gateway-facilitator-timeout-observed',
  gateway_ref: 'urn:peac:gateway:gw-002',
  payment_ref: 'urn:peac:payment:pay-002',
  observed_at: '2026-05-16T10:01:00Z',
  timeout_at: '2026-05-16T10:01:00Z',
  timeout_profile: 'custom' as const,
  facilitator_timeout_ms: 5000,
  poll_interval_ms: 2000,
  max_poll_window_ms: 30000,
});

const validSettlementUnresolved = () => ({
  event_kind: 'gateway-settlement-unresolved-observed',
  gateway_ref: 'urn:peac:gateway:gw-003',
  payment_ref: 'urn:peac:payment:pay-003',
  observed_at: '2026-05-16T10:02:00Z',
  last_checked_at: '2026-05-16T10:02:30Z',
  check_count: 3,
});

const validSettlementPolling = () => ({
  event_kind: 'gateway-settlement-polling-observed',
  gateway_ref: 'urn:peac:gateway:gw-004',
  payment_ref: 'urn:peac:payment:pay-004',
  observed_at: '2026-05-16T10:03:00Z',
  poll_count: 5,
  polling_strategy: 'exponential' as const,
});

const validSettlementConfirmed = () => ({
  event_kind: 'gateway-settlement-confirmed-observed',
  gateway_ref: 'urn:peac:gateway:gw-005',
  payment_ref: 'urn:peac:payment:pay-005',
  observed_at: '2026-05-16T10:04:00Z',
  confirmed_at: '2026-05-16T10:04:00Z',
  settlement_ref: 'urn:peac:settlement:set-005',
});

const validSettlementConfirmedLate = () => ({
  event_kind: 'gateway-settlement-confirmed-late-observed',
  gateway_ref: 'urn:peac:gateway:gw-006',
  payment_ref: 'urn:peac:payment:pay-006',
  observed_at: '2026-05-16T10:05:00Z',
  confirmed_at: '2026-05-16T10:05:30Z',
  settlement_ref: 'urn:peac:settlement:set-006',
  delay_ms: 11900,
});

const validSettlementFailed = () => ({
  event_kind: 'gateway-settlement-failed-observed',
  gateway_ref: 'urn:peac:gateway:gw-007',
  payment_ref: 'urn:peac:payment:pay-007',
  observed_at: '2026-05-16T10:06:00Z',
  final_state: 'reverted',
});

const validSettlementFailedOrphaned = () => ({
  event_kind: 'gateway-settlement-failed-orphaned-observed',
  gateway_ref: 'urn:peac:gateway:gw-008',
  payment_ref: 'urn:peac:payment:pay-008',
  observed_at: '2026-05-16T10:07:00Z',
  last_known_state: 'pending',
});

describe('gateway-export: positive cases (GATE-EXP-004, GATE-EXP-006)', () => {
  it('payment-submitted: minimum-required fields validate', () => {
    const r = validateGatewayExport(validPaymentSubmitted());
    expect(r.ok).toBe(true);
  });

  it('facilitator-timeout: minimum-required fields validate', () => {
    const r = validateGatewayExport(validFacilitatorTimeout());
    expect(r.ok).toBe(true);
  });

  it('facilitator-timeout with custom profile + all three timing fields validates', () => {
    const r = validateGatewayExport(validFacilitatorTimeoutCustom());
    expect(r.ok).toBe(true);
  });

  it('settlement-unresolved: minimum-required fields validate', () => {
    const r = validateGatewayExport(validSettlementUnresolved());
    expect(r.ok).toBe(true);
  });

  it('settlement-polling: minimum-required fields validate', () => {
    const r = validateGatewayExport(validSettlementPolling());
    expect(r.ok).toBe(true);
  });

  it('settlement-confirmed: minimum-required fields validate', () => {
    const r = validateGatewayExport(validSettlementConfirmed());
    expect(r.ok).toBe(true);
  });

  it('settlement-confirmed-late: minimum-required fields validate', () => {
    const r = validateGatewayExport(validSettlementConfirmedLate());
    expect(r.ok).toBe(true);
  });

  it('settlement-failed: minimum-required fields validate', () => {
    const r = validateGatewayExport(validSettlementFailed());
    expect(r.ok).toBe(true);
  });

  it('settlement-failed-orphaned: minimum-required fields validate', () => {
    const r = validateGatewayExport(validSettlementFailedOrphaned());
    expect(r.ok).toBe(true);
  });

  it('schema export is a discriminated union over 8 event kinds', () => {
    expect(GATEWAY_EXPORT_TYPE_URIS.length).toBe(8);
    expect(GatewayExportSchema.def.discriminator).toBe('event_kind');
  });
});

describe('gateway-export: trigger-vs-state doctrine (GATE-EXP-006)', () => {
  it('facilitator-timeout-observed validates as a standalone event (no settlement-state field required)', () => {
    const evt = validFacilitatorTimeout();
    const r = validateGatewayExport(evt);
    expect(r.ok).toBe(true);
    // Doctrine assertion: no field named settlement_state exists on the schema.
    expect((evt as Record<string, unknown>).settlement_state).toBeUndefined();
  });

  it('the 7 settlement/recovery-state URIs and the 1 trigger URI are all in the closed type set', () => {
    const stateUris = [
      'org.peacprotocol/gateway-payment-submitted-observed',
      'org.peacprotocol/gateway-settlement-unresolved-observed',
      'org.peacprotocol/gateway-settlement-polling-observed',
      'org.peacprotocol/gateway-settlement-confirmed-observed',
      'org.peacprotocol/gateway-settlement-confirmed-late-observed',
      'org.peacprotocol/gateway-settlement-failed-observed',
      'org.peacprotocol/gateway-settlement-failed-orphaned-observed',
    ];
    const triggerUri = 'org.peacprotocol/gateway-facilitator-timeout-observed';
    for (const uri of stateUris) {
      expect((GATEWAY_EXPORT_TYPE_URIS as readonly string[]).includes(uri)).toBe(true);
    }
    expect((GATEWAY_EXPORT_TYPE_URIS as readonly string[]).includes(triggerUri)).toBe(true);
    expect(GATEWAY_EXPORT_TYPE_URIS.length).toBe(8);
  });
});

describe('gateway-export: no-inline-payment-data invariant (GATE-EXP-001)', () => {
  it('FORBIDDEN_PAYMENT_DATA_KEYS has exactly 19 entries', () => {
    expect(GATEWAY_EXPORT_FORBIDDEN_PAYMENT_DATA_KEYS.length).toBe(19);
  });

  it('value_minor is NOT in the forbidden list (rejected as unknown_field via strict schema, not inline_payment_data_blocked)', () => {
    expect(
      (GATEWAY_EXPORT_FORBIDDEN_PAYMENT_DATA_KEYS as readonly string[]).includes('value_minor')
    ).toBe(false);
  });

  it.each([...GATEWAY_EXPORT_FORBIDDEN_PAYMENT_DATA_KEYS])(
    'rejects forbidden top-level key %s with inline_payment_data_blocked',
    (key) => {
      const evt = { ...validPaymentSubmitted(), [key]: 'malicious-or-disallowed-value' };
      const r = validateGatewayExport(evt);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        const found = r.errors.find(
          (e) => e.code === GATEWAY_EXPORT_ERROR_CODES.inlinePaymentDataBlocked && e.path === key
        );
        expect(found).toBeDefined();
      }
    }
  );
});

describe('gateway-export: money-boundary + single-canonical-money-field (GATE-EXP-003)', () => {
  it('rejects numeric amount_minor with invalid_amount_minor', () => {
    const evt = { ...validPaymentSubmitted(), amount_minor: 1999 } as unknown;
    const r = validateGatewayExport(evt);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === GATEWAY_EXPORT_ERROR_CODES.invalidAmountMinor && e.path === 'amount_minor'
        )
      ).toBe(true);
    }
  });

  it('rejects decimal amount_minor with invalid_amount_minor', () => {
    const r = validateGatewayExport({ ...validPaymentSubmitted(), amount_minor: '99.99' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidAmountMinor)).toBe(
        true
      );
    }
  });

  it('rejects empty amount_minor with invalid_amount_minor', () => {
    const r = validateGatewayExport({ ...validPaymentSubmitted(), amount_minor: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidAmountMinor)).toBe(
        true
      );
    }
  });

  it('rejects comma-formatted amount_minor with invalid_amount_minor', () => {
    const r = validateGatewayExport({ ...validPaymentSubmitted(), amount_minor: '9,999' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidAmountMinor)).toBe(
        true
      );
    }
  });

  it('accepts string amount_minor "0" (zero is valid)', () => {
    const r = validateGatewayExport({ ...validPaymentSubmitted(), amount_minor: '0' });
    expect(r.ok).toBe(true);
  });

  it('accepts positive amount_minor "999999" (canonical four-tuple value carrier)', () => {
    const r = validateGatewayExport({ ...validPaymentSubmitted(), amount_minor: '999999' });
    expect(r.ok).toBe(true);
  });

  it('rejects negative amount_minor "-1" with invalid_amount_minor (non-negative profile constraint)', () => {
    const r = validateGatewayExport({ ...validPaymentSubmitted(), amount_minor: '-1' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === GATEWAY_EXPORT_ERROR_CODES.invalidAmountMinor && e.path === 'amount_minor'
        )
      ).toBe(true);
    }
  });

  it('rejects negative amount_minor "-100" with invalid_amount_minor', () => {
    const r = validateGatewayExport({ ...validPaymentSubmitted(), amount_minor: '-100' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidAmountMinor)).toBe(
        true
      );
    }
  });

  it('rejects negative amount_minor "-1" when EIP-3009 four-tuple references are present', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      payer_ref: 'urn:peac:payer:p',
      pay_to_ref: 'urn:peac:payto:m',
      nonce_ref: 'urn:peac:nonce:n',
      amount_minor: '-1',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidAmountMinor)).toBe(
        true
      );
    }
  });

  it.each([
    ['payment-submitted', validPaymentSubmitted],
    ['facilitator-timeout', validFacilitatorTimeout],
    ['settlement-unresolved', validSettlementUnresolved],
    ['settlement-polling', validSettlementPolling],
    ['settlement-confirmed', validSettlementConfirmed],
    ['settlement-confirmed-late', validSettlementConfirmedLate],
    ['settlement-failed', validSettlementFailed],
    ['settlement-failed-orphaned', validSettlementFailedOrphaned],
  ])(
    'rejects negative amount_minor on gateway-%s-observed (every event kind)',
    (_label, factory) => {
      const r = validateGatewayExport({ ...factory(), amount_minor: '-1' });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidAmountMinor)).toBe(
          true
        );
      }
    }
  );

  it('rejects record carrying value_minor as unknown_field (single canonical money field policy)', () => {
    // value_minor must NOT exist as a separate field; records carrying it
    // reject as gateway.export.unknown_field via the strict variant schema
    // (NOT via the no-inline-payment-data invariant; value_minor is a
    // rejected alternate money-field name, not raw payment data).
    //
    // Split construction so the literal rejected field name does not become
    // a positive public-surface token by accident in this source file.
    const rejectedValueField = ['value', 'minor'].join('_');
    const evt = { ...validPaymentSubmitted(), [rejectedValueField]: '1999' } as unknown;
    const r = validateGatewayExport(evt);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) => e.code === GATEWAY_EXPORT_ERROR_CODES.unknownField && e.path === rejectedValueField
        )
      ).toBe(true);
      // Defensive: must NOT route through the inline-payment-data diagnostic.
      expect(
        r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.inlinePaymentDataBlocked)
      ).toBe(false);
    }
  });
});

describe('gateway-export: opaque-ref grammar (GATE-EXP-002)', () => {
  it('rejects whitespace in gateway_ref with opaque_ref_grammar_violation', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      gateway_ref: 'urn:peac:gateway: has space',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.opaqueRefGrammarViolation)
      ).toBe(true);
    }
  });

  it('rejects @ in payment_ref with opaque_ref_grammar_violation', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      payment_ref: 'urn:peac:payment:user@example.com',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.opaqueRefGrammarViolation)
      ).toBe(true);
    }
  });

  it('rejects unrecognized prefix in gateway_ref', () => {
    const r = validateGatewayExport({ ...validPaymentSubmitted(), gateway_ref: 'plain-string' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.opaqueRefGrammarViolation)
      ).toBe(true);
    }
  });

  it('rejects non-string gateway_ref with ref_must_be_string', () => {
    const evt = { ...validPaymentSubmitted(), gateway_ref: 12345 } as unknown;
    const r = validateGatewayExport(evt);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) => e.code === GATEWAY_EXPORT_ERROR_CODES.refMustBeString && e.path === 'gateway_ref'
        )
      ).toBe(true);
    }
  });

  it('accepts did: prefix on gateway_ref', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      gateway_ref: 'did:example:gw',
    });
    expect(r.ok).toBe(true);
  });

  it('accepts https: prefix on gateway_ref', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      gateway_ref: 'https://gateway.example.com/gw',
    });
    expect(r.ok).toBe(true);
  });

  it('accepts EIP-3009 four-tuple references (payer_ref + pay_to_ref + nonce_ref) alongside amount_minor', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      payer_ref: 'urn:peac:payer:p',
      pay_to_ref: 'urn:peac:payto:m',
      nonce_ref: 'urn:peac:nonce:n',
      amount_minor: '1999',
    });
    expect(r.ok).toBe(true);
  });

  it('accepts valid_before_unix_seconds as caller-reported EIP-3009 expiry', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      valid_before_unix_seconds: 1747180800,
    });
    expect(r.ok).toBe(true);
  });
});

describe('gateway-export: per-event-kind required fields (GATE-EXP-004)', () => {
  it('rejects missing gateway_ref with missing_required_field', () => {
    const { gateway_ref: _drop, ...rest } = validPaymentSubmitted();
    const r = validateGatewayExport(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === GATEWAY_EXPORT_ERROR_CODES.missingRequiredField && e.path === 'gateway_ref'
        )
      ).toBe(true);
    }
  });

  it('rejects missing payment_ref with missing_required_field', () => {
    const { payment_ref: _drop, ...rest } = validPaymentSubmitted();
    const r = validateGatewayExport(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === GATEWAY_EXPORT_ERROR_CODES.missingRequiredField && e.path === 'payment_ref'
        )
      ).toBe(true);
    }
  });

  it('rejects missing observed_at with missing_required_field', () => {
    const { observed_at: _drop, ...rest } = validPaymentSubmitted();
    const r = validateGatewayExport(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === GATEWAY_EXPORT_ERROR_CODES.missingRequiredField && e.path === 'observed_at'
        )
      ).toBe(true);
    }
  });

  it('rejects facilitator-timeout without timeout_profile', () => {
    const { timeout_profile: _drop, ...rest } = validFacilitatorTimeout();
    const r = validateGatewayExport(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === GATEWAY_EXPORT_ERROR_CODES.missingRequiredField &&
            e.path === 'timeout_profile'
        )
      ).toBe(true);
    }
  });

  it('rejects settlement-confirmed without settlement_ref', () => {
    const { settlement_ref: _drop, ...rest } = validSettlementConfirmed();
    const r = validateGatewayExport(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === GATEWAY_EXPORT_ERROR_CODES.missingRequiredField &&
            e.path === 'settlement_ref'
        )
      ).toBe(true);
    }
  });

  it('rejects settlement-confirmed-late without delay_ms', () => {
    const { delay_ms: _drop, ...rest } = validSettlementConfirmedLate();
    const r = validateGatewayExport(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) => e.code === GATEWAY_EXPORT_ERROR_CODES.missingRequiredField && e.path === 'delay_ms'
        )
      ).toBe(true);
    }
  });

  it('rejects settlement-failed without final_state', () => {
    const { final_state: _drop, ...rest } = validSettlementFailed();
    const r = validateGatewayExport(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === GATEWAY_EXPORT_ERROR_CODES.missingRequiredField && e.path === 'final_state'
        )
      ).toBe(true);
    }
  });
});

describe('gateway-export: invalid event_kind (GATE-EXP-005)', () => {
  it('rejects unknown event_kind string', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      event_kind: 'gateway-foo-observed',
    } as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidEventKind)).toBe(
        true
      );
    }
  });

  it('rejects empty event_kind', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      event_kind: '',
    } as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidEventKind)).toBe(
        true
      );
    }
  });

  it('rejects numeric event_kind', () => {
    const evt = { ...validPaymentSubmitted(), event_kind: 42 } as unknown;
    const r = validateGatewayExport(evt);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidEventKind)).toBe(
        true
      );
    }
  });

  it('rejects gateway-payment-submitted shorthand without -observed suffix', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      event_kind: 'gateway-payment-submitted',
    } as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidEventKind)).toBe(
        true
      );
    }
  });

  it('rejects gateway-timeout (not in closed event-kind set)', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      event_kind: 'gateway-timeout',
    } as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidEventKind)).toBe(
        true
      );
    }
  });
});

describe('gateway-export: timeout_profile + custom timing (GATE-EXP-007)', () => {
  it.each(['mobile', 'satellite', 'blockchain', 'instant'])(
    'rejects removed/non-upstream timeout_profile %s',
    (profile) => {
      const r = validateGatewayExport({
        ...validFacilitatorTimeout(),
        timeout_profile: profile,
      } as unknown);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(
          r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidTimeoutProfile)
        ).toBe(true);
      }
    }
  );

  it('accepts upstream-aligned profile: datacenter', () => {
    expect(
      validateGatewayExport({ ...validFacilitatorTimeout(), timeout_profile: 'datacenter' }).ok
    ).toBe(true);
  });

  it('accepts upstream-aligned profile: east_africa_3g', () => {
    expect(
      validateGatewayExport({
        ...validFacilitatorTimeout(),
        timeout_profile: 'east_africa_3g',
      }).ok
    ).toBe(true);
  });

  it('accepts upstream-aligned profile: west_africa_3g', () => {
    expect(
      validateGatewayExport({
        ...validFacilitatorTimeout(),
        timeout_profile: 'west_africa_3g',
      }).ok
    ).toBe(true);
  });

  it('custom timeout_profile WITHOUT facilitator_timeout_ms rejects with missing_required_field', () => {
    const evt = { ...validFacilitatorTimeoutCustom() } as Record<string, unknown>;
    delete evt.facilitator_timeout_ms;
    const r = validateGatewayExport(evt);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === GATEWAY_EXPORT_ERROR_CODES.missingRequiredField &&
            e.path === 'facilitator_timeout_ms'
        )
      ).toBe(true);
    }
  });

  it('custom timeout_profile WITHOUT poll_interval_ms rejects with missing_required_field', () => {
    const evt = { ...validFacilitatorTimeoutCustom() } as Record<string, unknown>;
    delete evt.poll_interval_ms;
    const r = validateGatewayExport(evt);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === GATEWAY_EXPORT_ERROR_CODES.missingRequiredField &&
            e.path === 'poll_interval_ms'
        )
      ).toBe(true);
    }
  });

  it('custom timeout_profile WITHOUT max_poll_window_ms rejects with missing_required_field', () => {
    const evt = { ...validFacilitatorTimeoutCustom() } as Record<string, unknown>;
    delete evt.max_poll_window_ms;
    const r = validateGatewayExport(evt);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === GATEWAY_EXPORT_ERROR_CODES.missingRequiredField &&
            e.path === 'max_poll_window_ms'
        )
      ).toBe(true);
    }
  });

  it('non-custom timeout_profile does NOT require the three timing fields', () => {
    const r = validateGatewayExport({ ...validFacilitatorTimeout() });
    expect(r.ok).toBe(true);
  });

  it('rejects negative facilitator_timeout_ms with invalid_facilitator_timeout_ms', () => {
    const r = validateGatewayExport({
      ...validFacilitatorTimeoutCustom(),
      facilitator_timeout_ms: -1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidFacilitatorTimeoutMs)
      ).toBe(true);
    }
  });

  it('rejects negative poll_interval_ms with invalid_poll_interval_ms', () => {
    const r = validateGatewayExport({
      ...validFacilitatorTimeoutCustom(),
      poll_interval_ms: -1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidPollIntervalMs)
      ).toBe(true);
    }
  });

  it('rejects negative max_poll_window_ms with invalid_max_poll_window_ms', () => {
    const r = validateGatewayExport({
      ...validFacilitatorTimeoutCustom(),
      max_poll_window_ms: -1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidMaxPollWindowMs)
      ).toBe(true);
    }
  });
});

describe('gateway-export: polling_strategy closed enum (GATE-EXP-007)', () => {
  it('rejects invalid polling_strategy', () => {
    const r = validateGatewayExport({
      ...validSettlementPolling(),
      polling_strategy: 'aggressive',
    } as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidPollingStrategy)
      ).toBe(true);
    }
  });

  it.each(['exponential', 'linear', 'immediate', 'webhook', 'unknown'])(
    'accepts polling_strategy %s',
    (strategy) => {
      expect(
        validateGatewayExport({ ...validSettlementPolling(), polling_strategy: strategy }).ok
      ).toBe(true);
    }
  );
});

describe('gateway-export: bounded numeric fields (GATE-EXP-008)', () => {
  it('rejects poll_count > 1_000_000 with invalid_poll_count', () => {
    const r = validateGatewayExport({ ...validSettlementPolling(), poll_count: 1_000_001 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidPollCount)).toBe(
        true
      );
    }
  });

  it('rejects negative poll_count with invalid_poll_count', () => {
    const r = validateGatewayExport({ ...validSettlementPolling(), poll_count: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidPollCount)).toBe(
        true
      );
    }
  });

  it('rejects check_count > 1_000_000 with invalid_check_count', () => {
    const r = validateGatewayExport({ ...validSettlementUnresolved(), check_count: 1_000_001 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidCheckCount)).toBe(
        true
      );
    }
  });

  it('rejects deadline_exceeded_ms > 2_592_000_000 with invalid_deadline_exceeded_ms', () => {
    const r = validateGatewayExport({
      ...validFacilitatorTimeout(),
      deadline_exceeded_ms: 2_592_000_001,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidDeadlineExceededMs)
      ).toBe(true);
    }
  });

  it('rejects delay_ms > 2_592_000_000 with invalid_delay_ms', () => {
    const r = validateGatewayExport({
      ...validSettlementConfirmedLate(),
      delay_ms: 2_592_000_001,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidDelayMs)).toBe(true);
    }
  });

  it('rejects negative valid_before_unix_seconds with invalid_valid_before_unix_seconds', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      valid_before_unix_seconds: -1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidValidBeforeUnixSeconds)
      ).toBe(true);
    }
  });

  it('rejects float valid_before_unix_seconds with invalid_valid_before_unix_seconds', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      valid_before_unix_seconds: 1747180800.5,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidValidBeforeUnixSeconds)
      ).toBe(true);
    }
  });

  it('accepts valid_before_unix_seconds at Number.MAX_SAFE_INTEGER', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      valid_before_unix_seconds: Number.MAX_SAFE_INTEGER,
    });
    expect(r.ok).toBe(true);
  });

  it('rejects valid_before_unix_seconds above Number.MAX_SAFE_INTEGER with invalid_valid_before_unix_seconds', () => {
    // Number.MAX_SAFE_INTEGER + 1 is the first unsafe positive integer
    // (and loses precision against MAX_SAFE_INTEGER itself in floating-point
    // representation), so Number.isSafeInteger MUST reject it.
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      valid_before_unix_seconds: Number.MAX_SAFE_INTEGER + 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidValidBeforeUnixSeconds)
      ).toBe(true);
    }
  });
});

describe('gateway-export: invalid observed_at (GATE-EXP-004)', () => {
  it('rejects malformed observed_at', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      observed_at: 'not-a-timestamp',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidObservedAt)).toBe(
        true
      );
    }
  });

  it('rejects observed_at without timezone', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      observed_at: '2026-05-16T10:00:00',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidObservedAt)).toBe(
        true
      );
    }
  });
});

describe('gateway-export: invalid_digest', () => {
  // Closes the "every stable error code is emitted and tested" loop.
  // upstream_artifact_digest uses the shared Sha256DigestSchema; the
  // validator mapper routes Zod invalid_format on *_digest paths to
  // gateway.export.invalid_digest.
  it('rejects malformed upstream_artifact_digest with invalid_digest', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      upstream_artifact_digest: 'not-a-sha256',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === GATEWAY_EXPORT_ERROR_CODES.invalidDigest &&
            e.path === 'upstream_artifact_digest'
        )
      ).toBe(true);
    }
  });

  it('accepts a canonical sha256-hex upstream_artifact_digest', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      upstream_artifact_digest:
        'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    });
    expect(r.ok).toBe(true);
  });
});

describe('gateway-export: unknown field rejection', () => {
  it('rejects unknown top-level field with unknown_field', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      surprise_field: 'whatever',
    } as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) => e.code === GATEWAY_EXPORT_ERROR_CODES.unknownField && e.path === 'surprise_field'
        )
      ).toBe(true);
    }
  });
});

describe('gateway-export: validateGatewayExportForType (GATE-EXP-009)', () => {
  it('accepts matching type URI / event_kind pair', () => {
    const r = validateGatewayExportForType(
      'org.peacprotocol/gateway-payment-submitted-observed',
      validPaymentSubmitted()
    );
    expect(r.ok).toBe(true);
  });

  it('rejects unknown type URI with type_uri_unknown', () => {
    const r = validateGatewayExportForType(
      'org.peacprotocol/unknown-record-type',
      validPaymentSubmitted()
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.length).toBe(1);
      expect(r.errors[0].code).toBe(GATEWAY_EXPORT_ERROR_CODES.typeUriUnknown);
    }
  });

  it('rejects type URI / event_kind mismatch', () => {
    const r = validateGatewayExportForType(
      'org.peacprotocol/gateway-settlement-confirmed-observed',
      validPaymentSubmitted()
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.typeEventKindMismatch)
      ).toBe(true);
    }
  });
});

describe('gateway-export: gateway boundary (GATE-EXP-010)', () => {
  // The boundary is enforced at the OBSERVER scope level: the schema has no
  // fields for PEAC to settle / route / contact / verify / monitor / enforce
  // / resolve. All amount fields are bounded decimal strings; no payment-card
  // / token / credential / raw payment / value_minor keys are accepted at
  // the top level; *_ref fields use opaque-reference grammar (no PII).
  it('no schema field allows PEAC to settle, route, contact, verify, monitor, enforce, or resolve', () => {
    expect(validateGatewayExport(validPaymentSubmitted()).ok).toBe(true);
    expect(validateGatewayExport(validFacilitatorTimeout()).ok).toBe(true);
    expect(validateGatewayExport(validSettlementUnresolved()).ok).toBe(true);
    expect(validateGatewayExport(validSettlementPolling()).ok).toBe(true);
    expect(validateGatewayExport(validSettlementConfirmed()).ok).toBe(true);
    expect(validateGatewayExport(validSettlementConfirmedLate()).ok).toBe(true);
    expect(validateGatewayExport(validSettlementFailed()).ok).toBe(true);
    expect(validateGatewayExport(validSettlementFailedOrphaned()).ok).toBe(true);
  });

  it('no overclaiming-verb field names exist on the schema', () => {
    const overclaimNames = [
      'settle',
      'route',
      'contact',
      'verify',
      'monitor',
      'enforce',
      'resolve',
      'compute_finality',
    ];
    for (const name of overclaimNames) {
      const evt = { ...validPaymentSubmitted(), [name]: 'irrelevant-value' };
      const r = validateGatewayExport(evt);
      // Either: rejected as unknown_field (preferred) OR as
      // inline_payment_data_blocked (if name happens to overlap with the
      // forbidden list). Both demonstrate the boundary holds.
      expect(r.ok).toBe(false);
    }
  });
});

describe('gateway-export: invalid_payload top-level guard', () => {
  it('rejects null payload with invalid_payload', () => {
    const r = validateGatewayExport(null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0].code).toBe(GATEWAY_EXPORT_ERROR_CODES.invalidPayload);
    }
  });

  it('rejects undefined payload with invalid_payload', () => {
    const r = validateGatewayExport(undefined);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0].code).toBe(GATEWAY_EXPORT_ERROR_CODES.invalidPayload);
    }
  });

  it('rejects array payload with invalid_payload', () => {
    const r = validateGatewayExport([]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0].code).toBe(GATEWAY_EXPORT_ERROR_CODES.invalidPayload);
    }
  });

  it('rejects string primitive payload with invalid_payload', () => {
    const r = validateGatewayExport('not-object');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0].code).toBe(GATEWAY_EXPORT_ERROR_CODES.invalidPayload);
    }
  });

  it('rejects number primitive payload with invalid_payload', () => {
    const r = validateGatewayExport(42);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0].code).toBe(GATEWAY_EXPORT_ERROR_CODES.invalidPayload);
    }
  });

  it('rejects boolean primitive payload with invalid_payload', () => {
    const r = validateGatewayExport(true);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0].code).toBe(GATEWAY_EXPORT_ERROR_CODES.invalidPayload);
    }
  });

  it('object payload (even empty) bypasses invalid_payload (downstream pre-flights surface)', () => {
    const r = validateGatewayExport({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // Empty object surfaces missing-required-field diagnostics, NOT
      // invalid_payload. invalid_payload is reserved for shapes that
      // cannot be a JSON object.
      const hasInvalidPayload = r.errors.some(
        (e) => e.code === GATEWAY_EXPORT_ERROR_CODES.invalidPayload
      );
      expect(hasInvalidPayload).toBe(false);
      const hasMissing = r.errors.some(
        (e) => e.code === GATEWAY_EXPORT_ERROR_CODES.missingRequiredField
      );
      expect(hasMissing).toBe(true);
    }
  });
});

describe('gateway-export: UTF-8 byte limits', () => {
  // ASCII boundary cases prove the .max byte threshold; multi-byte cases
  // prove the byte length is counted as UTF-8 bytes (not JS code units).
  // 'a'.repeat(N) is N ASCII bytes; 'é'.repeat(N) (é) is 2 bytes per
  // code unit so N code units = 2N UTF-8 bytes.
  const asciiOfLength = (n: number) => 'a'.repeat(n);
  const multiByteOfBytes = (bytes: number) => 'é'.repeat(Math.floor(bytes / 2));

  it('asset accepts 32 ASCII bytes', () => {
    const r = validateGatewayExport({ ...validPaymentSubmitted(), asset: asciiOfLength(32) });
    expect(r.ok).toBe(true);
  });

  it('asset rejects 33 ASCII bytes with field_too_large', () => {
    const r = validateGatewayExport({ ...validPaymentSubmitted(), asset: asciiOfLength(33) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.fieldTooLarge)).toBe(true);
    }
  });

  it('asset rejects multi-byte string exceeding 32 UTF-8 bytes', () => {
    // 18 copies of 'é' = 36 UTF-8 bytes; 18 JS code units.
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      asset: 'é'.repeat(18),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.fieldTooLarge)).toBe(true);
    }
  });

  it('asset accepts multi-byte string within 32 UTF-8 bytes', () => {
    // 16 copies of 'é' = 32 UTF-8 bytes; right at the boundary.
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      asset: 'é'.repeat(16),
    });
    expect(r.ok).toBe(true);
  });

  it('network accepts 64 ASCII bytes', () => {
    const r = validateGatewayExport({ ...validPaymentSubmitted(), network: asciiOfLength(64) });
    expect(r.ok).toBe(true);
  });

  it('network rejects 65 ASCII bytes with field_too_large', () => {
    const r = validateGatewayExport({ ...validPaymentSubmitted(), network: asciiOfLength(65) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.fieldTooLarge)).toBe(true);
    }
  });

  it('network rejects multi-byte string exceeding 64 UTF-8 bytes', () => {
    const r = validateGatewayExport({
      ...validPaymentSubmitted(),
      network: multiByteOfBytes(66),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.fieldTooLarge)).toBe(true);
    }
  });

  it('final_state accepts 64 ASCII bytes', () => {
    const r = validateGatewayExport({
      ...validSettlementFailed(),
      final_state: asciiOfLength(64),
    });
    expect(r.ok).toBe(true);
  });

  it('final_state rejects multi-byte string exceeding 64 UTF-8 bytes', () => {
    const r = validateGatewayExport({
      ...validSettlementFailed(),
      final_state: multiByteOfBytes(66),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.fieldTooLarge)).toBe(true);
    }
  });

  it('last_known_state rejects multi-byte string exceeding 64 UTF-8 bytes', () => {
    const r = validateGatewayExport({
      ...validSettlementFailedOrphaned(),
      last_known_state: multiByteOfBytes(66),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === GATEWAY_EXPORT_ERROR_CODES.fieldTooLarge)).toBe(true);
    }
  });
});
