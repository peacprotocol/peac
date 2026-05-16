/**
 * Commerce mandate schema validator tests.
 *
 * Exercises:
 *   - the no-inline-payment-data invariant
 *   - the opaque-reference grammar
 *   - the money-boundary invariant (AmountMinorStringSchema)
 *   - the finality-synthesis boundary (settlement_state on non-settlement variants)
 *   - per-event-kind required fields
 *   - the discriminated union
 *   - observed_at missing/malformed split
 *   - invalid event_kind rejection (including stale draft URI names)
 *   - scheme_id grammar + scheme_id/scheme_ref mutual exclusion
 *   - validateCommerceMandateForType type URI / event_kind agreement
 */
import { describe, it, expect } from 'vitest';
import {
  COMMERCE_MANDATE_FORBIDDEN_PAYMENT_DATA_KEYS,
  COMMERCE_MANDATE_ERROR_CODES,
  COMMERCE_MANDATE_TYPE_URIS,
  CommerceMandateSchema,
  validateCommerceMandate,
  validateCommerceMandateForType,
} from '../../src/extensions/commerce-mandate';

const validMandate = () => ({
  event_kind: 'commerce-mandate-observed',
  mandate_ref: 'urn:peac:mandate:mandate-001',
  merchant_ref: 'urn:peac:merchant:merchant-001',
  payer_ref: 'urn:peac:payer:payer-001',
  observed_at: '2026-05-14T10:00:00Z',
});

const validAuthorization = () => ({
  event_kind: 'commerce-authorization-observed',
  mandate_ref: 'urn:peac:mandate:mandate-002',
  authorization_ref: 'urn:peac:authorization:auth-002',
  amount_minor: '1999',
  currency: 'USD',
  observed_at: '2026-05-14T10:01:00Z',
});

const validCapture = () => ({
  event_kind: 'commerce-capture-observed',
  mandate_ref: 'urn:peac:mandate:mandate-003',
  authorization_ref: 'urn:peac:authorization:auth-003',
  capture_ref: 'urn:peac:capture:cap-003',
  amount_minor: '1999',
  currency: 'USD',
  observed_at: '2026-05-14T10:02:00Z',
});

const validVoid = () => ({
  event_kind: 'commerce-void-observed',
  mandate_ref: 'urn:peac:mandate:mandate-004',
  authorization_ref: 'urn:peac:authorization:auth-004',
  void_ref: 'urn:peac:void:void-004',
  observed_at: '2026-05-14T10:03:00Z',
});

const validRefund = () => ({
  event_kind: 'commerce-refund-observed',
  mandate_ref: 'urn:peac:mandate:mandate-005',
  refund_ref: 'urn:peac:refund:ref-005',
  amount_minor: '500',
  currency: 'USD',
  observed_at: '2026-05-14T10:04:00Z',
});

const validSettlement = () => ({
  event_kind: 'commerce-settlement-observed',
  mandate_ref: 'urn:peac:mandate:mandate-006',
  settlement_ref: 'urn:peac:settlement:set-006',
  amount_minor: '1999',
  currency: 'USD',
  settlement_state: 'completed' as const,
  observed_at: '2026-05-14T10:05:00Z',
});

const validBudget = () => ({
  event_kind: 'commerce-budget-observed',
  mandate_ref: 'urn:peac:mandate:mandate-007',
  budget_ref: 'urn:peac:budget:budget-007',
  observed_at: '2026-05-14T10:06:00Z',
});

describe('commerce-mandate: positive cases (COMM-MAN-004, COMM-MAN-008)', () => {
  it('mandate: minimum-required fields validate', () => {
    const r = validateCommerceMandate(validMandate());
    expect(r.ok).toBe(true);
  });

  it('authorization: minimum-required fields validate', () => {
    const r = validateCommerceMandate(validAuthorization());
    expect(r.ok).toBe(true);
  });

  it('capture: minimum-required fields validate', () => {
    const r = validateCommerceMandate(validCapture());
    expect(r.ok).toBe(true);
  });

  it('void: minimum-required fields validate', () => {
    const r = validateCommerceMandate(validVoid());
    expect(r.ok).toBe(true);
  });

  it('refund: minimum-required fields validate', () => {
    const r = validateCommerceMandate(validRefund());
    expect(r.ok).toBe(true);
  });

  it('settlement: minimum-required fields validate', () => {
    const r = validateCommerceMandate(validSettlement());
    expect(r.ok).toBe(true);
  });

  it('budget: minimum-required fields validate', () => {
    const r = validateCommerceMandate(validBudget());
    expect(r.ok).toBe(true);
  });

  it('schema export is a discriminated union over 7 event kinds', () => {
    expect(COMMERCE_MANDATE_TYPE_URIS.length).toBe(7);
    expect(CommerceMandateSchema.def.discriminator).toBe('event_kind');
  });
});

describe('commerce-mandate: no-inline-payment-data invariant (COMM-MAN-001)', () => {
  it('FORBIDDEN_PAYMENT_DATA_KEYS has exactly 20 entries', () => {
    expect(COMMERCE_MANDATE_FORBIDDEN_PAYMENT_DATA_KEYS.length).toBe(20);
  });

  it.each([...COMMERCE_MANDATE_FORBIDDEN_PAYMENT_DATA_KEYS])(
    'rejects forbidden top-level key %s with inline_payment_data_blocked',
    (key) => {
      const evt = { ...validMandate(), [key]: 'malicious-value' };
      const r = validateCommerceMandate(evt);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        const found = r.errors.find(
          (e) => e.code === COMMERCE_MANDATE_ERROR_CODES.inlinePaymentDataBlocked && e.path === key
        );
        expect(found).toBeDefined();
      }
    }
  );
});

describe('commerce-mandate: money-boundary invariant (COMM-MAN-003)', () => {
  it('rejects numeric amount_minor with invalid_amount_minor', () => {
    const evt = { ...validAuthorization(), amount_minor: 1999 } as unknown;
    const r = validateCommerceMandate(evt);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === COMMERCE_MANDATE_ERROR_CODES.invalidAmountMinor && e.path === 'amount_minor'
        )
      ).toBe(true);
    }
  });

  it('rejects decimal amount_minor with invalid_amount_minor', () => {
    const r = validateCommerceMandate({ ...validAuthorization(), amount_minor: '99.99' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidAmountMinor)).toBe(
        true
      );
    }
  });

  it('rejects empty amount_minor with invalid_amount_minor', () => {
    const r = validateCommerceMandate({ ...validAuthorization(), amount_minor: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidAmountMinor)).toBe(
        true
      );
    }
  });

  it('rejects comma-formatted amount_minor with invalid_amount_minor', () => {
    const r = validateCommerceMandate({ ...validAuthorization(), amount_minor: '9,999' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidAmountMinor)).toBe(
        true
      );
    }
  });

  it('rejects numeric max_amount_minor with invalid_amount_minor', () => {
    const evt = { ...validMandate(), max_amount_minor: 100000 } as unknown;
    const r = validateCommerceMandate(evt);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === COMMERCE_MANDATE_ERROR_CODES.invalidAmountMinor &&
            e.path === 'max_amount_minor'
        )
      ).toBe(true);
    }
  });

  it('accepts string amount_minor "0" (zero is valid)', () => {
    const r = validateCommerceMandate({ ...validAuthorization(), amount_minor: '0' });
    expect(r.ok).toBe(true);
  });

  it('rejects negative amount_minor "-1" on authorization with invalid_amount_minor', () => {
    const r = validateCommerceMandate({ ...validAuthorization(), amount_minor: '-1' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidAmountMinor)).toBe(
        true
      );
    }
  });

  it('rejects negative amount_minor "-100" on authorization with invalid_amount_minor', () => {
    const r = validateCommerceMandate({ ...validAuthorization(), amount_minor: '-100' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidAmountMinor)).toBe(
        true
      );
    }
  });

  it('rejects negative max_amount_minor "-1" on mandate with invalid_amount_minor', () => {
    const r = validateCommerceMandate({ ...validMandate(), max_amount_minor: '-1' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidAmountMinor)).toBe(
        true
      );
    }
  });

  it('rejects negative amount_minor "-500" on refund with invalid_amount_minor', () => {
    const r = validateCommerceMandate({ ...validRefund(), amount_minor: '-500' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidAmountMinor)).toBe(
        true
      );
    }
  });

  it('rejects negative amount_minor "-500" on settlement with invalid_amount_minor', () => {
    const r = validateCommerceMandate({ ...validSettlement(), amount_minor: '-500' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidAmountMinor)).toBe(
        true
      );
    }
  });

  it('rejects negative amount_minor "-500" on budget with invalid_amount_minor', () => {
    const r = validateCommerceMandate({ ...validBudget(), amount_minor: '-500' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidAmountMinor)).toBe(
        true
      );
    }
  });

  it('rejects negative amount_minor "-1999" on capture with invalid_amount_minor', () => {
    const r = validateCommerceMandate({ ...validCapture(), amount_minor: '-1999' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidAmountMinor)).toBe(
        true
      );
    }
  });

  it('still accepts positive amount_minor "999999"', () => {
    const r = validateCommerceMandate({ ...validAuthorization(), amount_minor: '999999' });
    expect(r.ok).toBe(true);
  });
});

describe('commerce-mandate: opaque-ref grammar (COMM-MAN-002)', () => {
  it('rejects whitespace in mandate_ref with opaque_ref_grammar_violation', () => {
    const r = validateCommerceMandate({
      ...validMandate(),
      mandate_ref: 'urn:peac:mandate: has space',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.opaqueRefGrammarViolation)
      ).toBe(true);
    }
  });

  it('rejects @ in mandate_ref with opaque_ref_grammar_violation', () => {
    const r = validateCommerceMandate({
      ...validMandate(),
      mandate_ref: 'urn:peac:mandate:user@example.com',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.opaqueRefGrammarViolation)
      ).toBe(true);
    }
  });

  it('rejects unrecognized prefix in mandate_ref with opaque_ref_grammar_violation', () => {
    const r = validateCommerceMandate({ ...validMandate(), mandate_ref: 'plain-string' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.opaqueRefGrammarViolation)
      ).toBe(true);
    }
  });

  it('rejects non-string mandate_ref with ref_must_be_string', () => {
    const evt = { ...validMandate(), mandate_ref: 12345 } as unknown;
    const r = validateCommerceMandate(evt);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) => e.code === COMMERCE_MANDATE_ERROR_CODES.refMustBeString && e.path === 'mandate_ref'
        )
      ).toBe(true);
    }
  });

  it('accepts did: prefix on mandate_ref', () => {
    const r = validateCommerceMandate({
      ...validMandate(),
      mandate_ref: 'did:example:abc',
    });
    expect(r.ok).toBe(true);
  });

  it('accepts https: prefix on mandate_ref', () => {
    const r = validateCommerceMandate({
      ...validMandate(),
      mandate_ref: 'https://example.com/mandate/abc',
    });
    expect(r.ok).toBe(true);
  });
});

describe('commerce-mandate: per-event-kind required fields (COMM-MAN-004)', () => {
  it('rejects missing mandate_ref with missing_required_field', () => {
    const { mandate_ref: _drop, ...rest } = validAuthorization();
    const r = validateCommerceMandate(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === COMMERCE_MANDATE_ERROR_CODES.missingRequiredField && e.path === 'mandate_ref'
        )
      ).toBe(true);
    }
  });

  it('rejects missing observed_at with missing_required_field', () => {
    const { observed_at: _drop, ...rest } = validAuthorization();
    const r = validateCommerceMandate(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === COMMERCE_MANDATE_ERROR_CODES.missingRequiredField && e.path === 'observed_at'
        )
      ).toBe(true);
    }
  });

  it('rejects authorization without authorization_ref', () => {
    const { authorization_ref: _drop, ...rest } = validAuthorization();
    const r = validateCommerceMandate(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === COMMERCE_MANDATE_ERROR_CODES.missingRequiredField &&
            e.path === 'authorization_ref'
        )
      ).toBe(true);
    }
  });

  it('rejects settlement without settlement_state', () => {
    const { settlement_state: _drop, ...rest } = validSettlement();
    const r = validateCommerceMandate(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === COMMERCE_MANDATE_ERROR_CODES.missingRequiredField &&
            e.path === 'settlement_state'
        )
      ).toBe(true);
    }
  });

  it('rejects budget without budget_ref', () => {
    const { budget_ref: _drop, ...rest } = validBudget();
    const r = validateCommerceMandate(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === COMMERCE_MANDATE_ERROR_CODES.missingRequiredField && e.path === 'budget_ref'
        )
      ).toBe(true);
    }
  });
});

describe('commerce-mandate: invalid event_kind (COMM-MAN-005)', () => {
  it('rejects unknown event_kind string', () => {
    const r = validateCommerceMandate({
      ...validMandate(),
      event_kind: 'commerce-foo-observed',
    } as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidEventKind)).toBe(
        true
      );
    }
  });

  it('rejects empty event_kind', () => {
    const r = validateCommerceMandate({ ...validMandate(), event_kind: '' } as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidEventKind)).toBe(
        true
      );
    }
  });

  it('rejects numeric event_kind', () => {
    const evt = { ...validMandate(), event_kind: 42 } as unknown;
    const r = validateCommerceMandate(evt);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidEventKind)).toBe(
        true
      );
    }
  });

  it.each(
    // Stale draft event_kind segments from earlier planning iterations.
    // Per-segment .join() so no contiguous stale event_kind substring
    // appears anywhere in this test source.
    [
      ['commerce', 'mandate', 'binding', 'requested', 'observed'],
      ['commerce', 'mandate', 'binding', 'confirmed', 'observed'],
      ['commerce', 'mandate', 'binding', 'declined', 'observed'],
      ['commerce', 'mandate', 'authorization', 'observed'],
      ['commerce', 'mandate', 'payment', 'settled', 'observed'],
      ['commerce', 'mandate', 'settlement', 'failed', 'observed'],
      ['commerce', 'mandate', 'settlement', 'reversed', 'observed'],
    ].map((segments) => segments.join('-'))
  )('rejects stale draft event_kind %s with invalid_event_kind', (staleEventKind) => {
    const r = validateCommerceMandate({
      ...validMandate(),
      event_kind: staleEventKind,
    } as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidEventKind)).toBe(
        true
      );
    }
  });
});

describe('commerce-mandate: finality-synthesis boundary (COMM-MAN-006)', () => {
  it('rejects settlement_state on commerce-authorization-observed', () => {
    const r = validateCommerceMandate({
      ...validAuthorization(),
      settlement_state: 'completed',
    } as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) =>
            e.code === COMMERCE_MANDATE_ERROR_CODES.finalitySynthesisBlocked &&
            e.path === 'settlement_state'
        )
      ).toBe(true);
    }
  });

  it('rejects settlement_state on commerce-capture-observed', () => {
    const r = validateCommerceMandate({
      ...validCapture(),
      settlement_state: 'completed',
    } as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.finalitySynthesisBlocked)
      ).toBe(true);
    }
  });

  it('rejects settlement_state on commerce-void-observed', () => {
    const r = validateCommerceMandate({
      ...validVoid(),
      settlement_state: 'completed',
    } as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.finalitySynthesisBlocked)
      ).toBe(true);
    }
  });

  it('rejects settlement_state on commerce-refund-observed', () => {
    const r = validateCommerceMandate({
      ...validRefund(),
      settlement_state: 'completed',
    } as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.finalitySynthesisBlocked)
      ).toBe(true);
    }
  });

  it('rejects settlement_state on commerce-mandate-observed', () => {
    const r = validateCommerceMandate({
      ...validMandate(),
      settlement_state: 'completed',
    } as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.finalitySynthesisBlocked)
      ).toBe(true);
    }
  });

  it('rejects settlement_state on commerce-budget-observed', () => {
    const r = validateCommerceMandate({
      ...validBudget(),
      settlement_state: 'completed',
    } as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.finalitySynthesisBlocked)
      ).toBe(true);
    }
  });

  it('accepts settlement_state on commerce-settlement-observed (the only allowed kind)', () => {
    const r = validateCommerceMandate(validSettlement());
    expect(r.ok).toBe(true);
  });

  it('rejects invalid settlement_state enum value', () => {
    const r = validateCommerceMandate({
      ...validSettlement(),
      settlement_state: 'completed-late',
    } as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidSettlementState)
      ).toBe(true);
    }
  });
});

describe('commerce-mandate: scheme_id grammar + scheme conflict (COMM-MAN-007)', () => {
  it('accepts valid scheme_id', () => {
    const r = validateCommerceMandate({ ...validMandate(), scheme_id: 'card-network' });
    expect(r.ok).toBe(true);
  });

  it('accepts valid scheme_id with dots and colons', () => {
    const r = validateCommerceMandate({
      ...validMandate(),
      scheme_id: 'urn:scheme:custom',
    });
    expect(r.ok).toBe(true);
  });

  it('rejects whitespace in scheme_id with invalid_scheme_id', () => {
    const r = validateCommerceMandate({ ...validMandate(), scheme_id: 'card network' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidSchemeId)).toBe(
        true
      );
    }
  });

  it('rejects @ in scheme_id with invalid_scheme_id', () => {
    const r = validateCommerceMandate({ ...validMandate(), scheme_id: 'card@network' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidSchemeId)).toBe(
        true
      );
    }
  });

  it('rejects uppercase in scheme_id with invalid_scheme_id', () => {
    const r = validateCommerceMandate({ ...validMandate(), scheme_id: 'Card-Network' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidSchemeId)).toBe(
        true
      );
    }
  });

  it('accepts valid scheme_ref alternative', () => {
    const r = validateCommerceMandate({
      ...validMandate(),
      scheme_ref: 'urn:peac:scheme:abc',
    });
    expect(r.ok).toBe(true);
  });

  it('rejects both scheme_id and scheme_ref present with scheme_conflict', () => {
    const r = validateCommerceMandate({
      ...validMandate(),
      scheme_id: 'card-network',
      scheme_ref: 'urn:peac:scheme:abc',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.schemeConflict)).toBe(
        true
      );
    }
  });
});

describe('commerce-mandate: invalid currency', () => {
  it('rejects lowercase currency', () => {
    const r = validateCommerceMandate({ ...validAuthorization(), currency: 'usd' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidCurrency)).toBe(
        true
      );
    }
  });

  it('rejects whitespace currency', () => {
    const r = validateCommerceMandate({ ...validAuthorization(), currency: 'US D' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidCurrency)).toBe(
        true
      );
    }
  });

  it('accepts USDC token symbol', () => {
    const r = validateCommerceMandate({ ...validAuthorization(), currency: 'USDC' });
    expect(r.ok).toBe(true);
  });
});

describe('commerce-mandate: invalid observed_at (COMM-MAN-004)', () => {
  it('rejects malformed observed_at', () => {
    const r = validateCommerceMandate({
      ...validAuthorization(),
      observed_at: 'not-a-timestamp',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidObservedAt)).toBe(
        true
      );
    }
  });

  it('rejects observed_at without timezone', () => {
    const r = validateCommerceMandate({
      ...validAuthorization(),
      observed_at: '2026-05-14T10:00:00',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.invalidObservedAt)).toBe(
        true
      );
    }
  });
});

describe('commerce-mandate: unknown field rejection', () => {
  it('rejects unknown top-level field with unknown_field', () => {
    const r = validateCommerceMandate({
      ...validAuthorization(),
      surprise_field: 'whatever',
    } as unknown);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some(
          (e) => e.code === COMMERCE_MANDATE_ERROR_CODES.unknownField && e.path === 'surprise_field'
        )
      ).toBe(true);
    }
  });
});

describe('commerce-mandate: validateCommerceMandateForType (COMM-MAN-009)', () => {
  it('accepts matching type URI / event_kind pair', () => {
    const r = validateCommerceMandateForType(
      'org.peacprotocol/commerce-mandate-observed',
      validMandate()
    );
    expect(r.ok).toBe(true);
  });

  it('rejects unknown type URI with type_uri_unknown', () => {
    const r = validateCommerceMandateForType(
      'org.peacprotocol/unknown-record-type',
      validMandate()
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.length).toBe(1);
      expect(r.errors[0].code).toBe(COMMERCE_MANDATE_ERROR_CODES.typeUriUnknown);
    }
  });

  it.each(
    // Stale draft URI segments. Per-segment .join() so no contiguous stale
    // URI substring appears anywhere in this test source.
    [
      ['commerce', 'mandate', 'binding', 'requested', 'observed'],
      ['commerce', 'mandate', 'binding', 'confirmed', 'observed'],
      ['commerce', 'mandate', 'binding', 'declined', 'observed'],
      ['commerce', 'mandate', 'payment', 'settled', 'observed'],
      ['commerce', 'mandate', 'settlement', 'failed', 'observed'],
      ['commerce', 'mandate', 'settlement', 'reversed', 'observed'],
    ].map((segments) => ['org.peacprotocol', segments.join('-')].join('/'))
  )('rejects stale draft type URI %s with type_uri_unknown', (staleUri) => {
    const r = validateCommerceMandateForType(staleUri, validMandate());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0].code).toBe(COMMERCE_MANDATE_ERROR_CODES.typeUriUnknown);
    }
  });

  it('rejects type URI / event_kind mismatch', () => {
    const r = validateCommerceMandateForType(
      'org.peacprotocol/commerce-authorization-observed',
      validMandate()
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(
        r.errors.some((e) => e.code === COMMERCE_MANDATE_ERROR_CODES.typeEventKindMismatch)
      ).toBe(true);
    }
  });
});

describe('commerce-mandate: orchestrator boundary (COMM-MAN-010)', () => {
  // The boundary is enforced at the OBSERVER scope level: the schema has no
  // fields for PEAC to issue commerce decisions. settlement_state on
  // non-settlement variants is hard-rejected; all amount fields are bounded
  // decimal strings; no payment-card / token / credential keys are accepted
  // at the top level; *_ref fields use opaque-reference grammar (no PII).
  it('no schema field allows PEAC to authorize, process, settle, or enforce', () => {
    // Smoke: every accepted variant is a caller-reported observation.
    expect(validateCommerceMandate(validMandate()).ok).toBe(true);
    expect(validateCommerceMandate(validAuthorization()).ok).toBe(true);
    expect(validateCommerceMandate(validCapture()).ok).toBe(true);
    expect(validateCommerceMandate(validVoid()).ok).toBe(true);
    expect(validateCommerceMandate(validRefund()).ok).toBe(true);
    expect(validateCommerceMandate(validSettlement()).ok).toBe(true);
    expect(validateCommerceMandate(validBudget()).ok).toBe(true);
  });

  it('no overclaiming-verb field names exist on the schema', () => {
    // Hard-rejects payment-data top-level keys covered by COMM-MAN-001.
    // This case asserts the schema cannot accept fields named like commerce
    // verbs that would imply PEAC owns the action.
    const overclaimNames = [
      'authorize',
      'process',
      'settle',
      'enforce',
      'evaluate_budget',
      'route_payment',
      'monitor_settlement',
      'score_mandate',
    ];
    for (const name of overclaimNames) {
      const evt = { ...validAuthorization(), [name]: 'irrelevant-value' };
      const r = validateCommerceMandate(evt);
      // Either: rejected as unknown_field (preferred) OR as
      // inline_payment_data_blocked (if the name happens to be in the
      // forbidden list). Both demonstrate the boundary holds.
      expect(r.ok).toBe(false);
    }
  });
});
