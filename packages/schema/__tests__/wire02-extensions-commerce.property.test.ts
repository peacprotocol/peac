/**
 * Property-based tests for Commerce extension
 *
 * Uses fast-check to verify invariants across generated inputs:
 * 1. Valid extensions always parse successfully (roundtrip)
 * 2. Invalid enum values never parse (closed enum rejection)
 * 3. Bounds enforcement: maxLength+1 always rejected, maxLength always accepted
 * 4. .strict() enforcement: extra properties always rejected
 * 5. Event field: 6-value closed enum, optional
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { CommerceExtensionSchema, EXTENSION_LIMITS } from '../src/index.js';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Payment rail identifiers */
const paymentRail = fc.constantFrom('stripe', 'x402', 'lightning', 'paypal', 'wire', 'crypto');

/** Valid base-10 integer strings (amount_minor) */
const amountMinor = fc.constantFrom('0', '1', '1000', '-500', '99999999999999999999', '-1');

/** ISO 4217 currency codes */
const currency = fc.constantFrom('USD', 'EUR', 'GBP', 'JPY', 'BTC', 'ETH');

/** Environment discriminant */
const envValue = fc.constantFrom('live', 'test');

/** Commerce event values */
const COMMERCE_EVENTS = [
  'authorization',
  'capture',
  'settlement',
  'refund',
  'void',
  'chargeback',
] as const;

const eventValue = fc.constantFrom(...COMMERCE_EVENTS);

/**
 * Generic bounded identifier for open vocabulary fields.
 */
const openVocab = (min: number, max: number) =>
  fc.stringMatching(new RegExp(`^[a-zA-Z0-9_-]{${min},${max}}$`));

// ---------------------------------------------------------------------------
// Composite arbitraries
// ---------------------------------------------------------------------------

/** Generate a valid commerce extension with optional fields */
const validCommerce = fc
  .record({
    payment_rail: paymentRail,
    amount_minor: amountMinor,
    currency: currency,
    reference: fc.option(openVocab(1, 20), { nil: undefined }),
    asset: fc.option(openVocab(1, 20), { nil: undefined }),
    env: fc.option(envValue, { nil: undefined }),
    event: fc.option(eventValue, { nil: undefined }),
  })
  .map(({ reference, asset, env, event, ...rest }) => ({
    ...rest,
    ...(reference !== undefined ? { reference } : {}),
    ...(asset !== undefined ? { asset } : {}),
    ...(env !== undefined ? { env } : {}),
    ...(event !== undefined ? { event } : {}),
  }));

// ---------------------------------------------------------------------------
// Commerce property tests
// ---------------------------------------------------------------------------

describe('CommerceExtensionSchema: property tests', () => {
  it('valid commerce always parses', () => {
    fc.assert(
      fc.property(validCommerce, (commerce) => {
        expect(CommerceExtensionSchema.safeParse(commerce).success).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('event is always optional: absent event never causes rejection', () => {
    fc.assert(
      fc.property(paymentRail, amountMinor, currency, (rail, amount, cur) => {
        expect(
          CommerceExtensionSchema.safeParse({
            payment_rail: rail,
            amount_minor: amount,
            currency: cur,
          }).success
        ).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('all 6 event values always parse', () => {
    fc.assert(
      fc.property(eventValue, (event) => {
        expect(
          CommerceExtensionSchema.safeParse({
            payment_rail: 'stripe',
            amount_minor: '1000',
            currency: 'USD',
            event,
          }).success
        ).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  it('invalid event values are always rejected', () => {
    fc.assert(
      fc.property(
        openVocab(1, 20).filter(
          (s) => !COMMERCE_EVENTS.includes(s as (typeof COMMERCE_EVENTS)[number])
        ),
        (badEvent) => {
          expect(
            CommerceExtensionSchema.safeParse({
              payment_rail: 'stripe',
              amount_minor: '1000',
              currency: 'USD',
              event: badEvent,
            }).success
          ).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('invalid env values are always rejected', () => {
    fc.assert(
      fc.property(
        openVocab(1, 20).filter((s) => s !== 'live' && s !== 'test'),
        (badEnv) => {
          expect(
            CommerceExtensionSchema.safeParse({
              payment_rail: 'stripe',
              amount_minor: '1000',
              currency: 'USD',
              env: badEnv,
            }).success
          ).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('payment_rail at maxLength passes, at maxLength+1 fails', () => {
    const max = EXTENSION_LIMITS.maxPaymentRailLength;
    expect(
      CommerceExtensionSchema.safeParse({
        payment_rail: 'a'.repeat(max),
        amount_minor: '1000',
        currency: 'USD',
      }).success
    ).toBe(true);
    expect(
      CommerceExtensionSchema.safeParse({
        payment_rail: 'a'.repeat(max + 1),
        amount_minor: '1000',
        currency: 'USD',
      }).success
    ).toBe(false);
  });

  it('amount_minor at maxLength passes, at maxLength+1 fails', () => {
    const max = EXTENSION_LIMITS.maxAmountMinorLength;
    // Build a valid integer string at max length
    const atMax = '9'.repeat(max);
    const overMax = '9'.repeat(max + 1);
    expect(
      CommerceExtensionSchema.safeParse({
        payment_rail: 'stripe',
        amount_minor: atMax,
        currency: 'USD',
      }).success
    ).toBe(true);
    expect(
      CommerceExtensionSchema.safeParse({
        payment_rail: 'stripe',
        amount_minor: overMax,
        currency: 'USD',
      }).success
    ).toBe(false);
  });

  it('extra properties are always rejected (.strict())', () => {
    fc.assert(
      fc.property(
        validCommerce,
        openVocab(1, 20).filter(
          (k) =>
            ![
              'payment_rail',
              'amount_minor',
              'currency',
              'reference',
              'asset',
              'env',
              'event',
            ].includes(k)
        ),
        fc.string(),
        (commerce, extraKey, extraValue) => {
          expect(
            CommerceExtensionSchema.safeParse({
              ...commerce,
              [extraKey]: extraValue,
            }).success
          ).toBe(false);
        }
      ),
      { numRuns: 50 }
    );
  });
});
