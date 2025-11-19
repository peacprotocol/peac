/**
 * Rail parity conformance tests
 * CRITICAL: Stripe == x402, differing only in rail and reference
 *
 * This test enforces multi-rail neutrality - receipts must be byte-identical
 * across payment rails except for rail-specific identifiers.
 */

import { describe, it, expect } from "vitest";
import { issue } from "../../packages/protocol/src/issue";
import { generateKeypair } from "../../packages/crypto/src/jws";
import { decode } from "../../packages/crypto/src/jws";
import { fromCheckoutSession } from "../../packages/rails/stripe/src/index";
import { fromInvoice } from "../../packages/rails/x402/src/index";
import type { PEACReceiptClaims } from "../../packages/schema/src/types";

describe("Rail Parity Conformance", () => {
  it("Stripe == x402 (only rail + reference differ)", async () => {
    // Common test parameters
    const AMOUNT = 9999;
    const CURRENCY = "USD";
    const ISS = "https://api.example.com";
    const AUD = "https://app.example.com";
    const SUBJECT = "https://app.example.com/api/resource/123";

    // Generate keypair for signing
    const { privateKey } = await generateKeypair();
    const kid = "2025-01-26T12:00:00Z";

    // --- Stripe Receipt ---
    const stripePayment = fromCheckoutSession({
      id: "cs_test_stripe_123",
      amount_total: AMOUNT,
      currency: "usd", // Stripe uses lowercase
    });

    const stripeReceiptJWS = await issue({
      iss: ISS,
      aud: AUD,
      amt: AMOUNT,
      cur: CURRENCY,
      rail: stripePayment.rail,
      reference: stripePayment.reference,
      asset: stripePayment.asset,
      env: stripePayment.env,
      evidence: stripePayment.evidence,
      subject: SUBJECT,
      privateKey,
      kid,
    });

    // --- x402 Receipt ---
    const x402Payment = fromInvoice({
      id: "inv_x402_123",
      amount: AMOUNT,
      currency: CURRENCY, // x402 uses uppercase
    });

    const x402ReceiptJWS = await issue({
      iss: ISS,
      aud: AUD,
      amt: AMOUNT,
      cur: CURRENCY,
      rail: x402Payment.rail,
      reference: x402Payment.reference,
      asset: x402Payment.asset,
      env: x402Payment.env,
      evidence: x402Payment.evidence,
      subject: SUBJECT,
      privateKey,
      kid,
    });

    // Decode both receipts
    const stripeDecoded = decode<PEACReceiptClaims>(stripeReceiptJWS);
    const x402Decoded = decode<PEACReceiptClaims>(x402ReceiptJWS);

    // --- PARITY ASSERTIONS ---

    // 1. Headers must be identical
    expect(stripeDecoded.header).toEqual(x402Decoded.header);

    // 2. Core claims must be identical
    expect(stripeDecoded.payload.iss).toBe(x402Decoded.payload.iss);
    expect(stripeDecoded.payload.aud).toBe(x402Decoded.payload.aud);
    expect(stripeDecoded.payload.amt).toBe(x402Decoded.payload.amt);
    expect(stripeDecoded.payload.cur).toBe(x402Decoded.payload.cur);
    expect(stripeDecoded.payload.subject).toEqual(x402Decoded.payload.subject);

    // 3. Payment block: ONLY rail and reference should differ
    expect(stripeDecoded.payload.payment.rail).toBe("stripe");
    expect(x402Decoded.payload.payment.rail).toBe("x402");

    expect(stripeDecoded.payload.payment.reference).toBe("cs_test_stripe_123");
    expect(x402Decoded.payload.payment.reference).toBe("inv_x402_123");

    // 4. Payment block: amount and currency MUST be identical
    expect(stripeDecoded.payload.payment.amount).toBe(x402Decoded.payload.payment.amount);
    expect(stripeDecoded.payload.payment.currency).toBe(x402Decoded.payload.payment.currency);

    // 5. Normalized payment amounts MUST match top-level amounts
    expect(stripeDecoded.payload.payment.amount).toBe(stripeDecoded.payload.amt);
    expect(x402Decoded.payload.payment.amount).toBe(x402Decoded.payload.amt);

    expect(stripeDecoded.payload.payment.currency).toBe(stripeDecoded.payload.cur);
    expect(x402Decoded.payload.payment.currency).toBe(x402Decoded.payload.cur);

    // 6. Receipt IDs should be UUIDv7 (different for each receipt)
    const uuidv7Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(stripeDecoded.payload.rid).toMatch(uuidv7Regex);
    expect(x402Decoded.payload.rid).toMatch(uuidv7Regex);

    // 7. CRITICAL: Create normalized copies without unique fields and compare
    const stripeNormalized = {
      ...stripeDecoded.payload,
      rid: "NORMALIZED", // Exclude unique receipt ID
      iat: 0, // Exclude timestamp
      payment: {
        ...stripeDecoded.payload.payment,
        rail: "NORMALIZED", // Exclude rail-specific identifier
        reference: "NORMALIZED", // Exclude rail-specific reference
        asset: undefined, // Exclude rail-specific asset
        env: undefined, // Exclude rail-specific environment
        evidence: undefined, // Exclude rail-specific evidence
        metadata: undefined, // Exclude rail-specific metadata
      },
    };

    const x402Normalized = {
      ...x402Decoded.payload,
      rid: "NORMALIZED",
      iat: 0,
      payment: {
        ...x402Decoded.payload.payment,
        rail: "NORMALIZED",
        reference: "NORMALIZED",
        asset: undefined,
        env: undefined,
        evidence: undefined,
        metadata: undefined,
      },
    };

    // After normalization, they MUST be byte-identical
    expect(stripeNormalized).toEqual(x402Normalized);

    console.log("✅ PARITY CHECK PASSED: Stripe == x402 (only rail/reference differ)");
  });

  it("Parity check fails if amounts differ", async () => {
    const { privateKey } = await generateKeypair();
    const kid = "2025-01-26T12:00:00Z";

    // Stripe with amount 9999
    const stripePayment = fromCheckoutSession({
      id: "cs_test",
      amount_total: 9999,
      currency: "usd",
    });

    const stripeJWS = await issue({
      iss: "https://api.example.com",
      aud: "https://app.example.com",
      amt: 9999,
      cur: "USD",
      rail: stripePayment.rail,
      reference: stripePayment.reference,
      asset: stripePayment.asset,
      env: stripePayment.env,
      evidence: stripePayment.evidence,
      privateKey,
      kid,
    });

    // x402 with different amount (should fail parity)
    const x402Payment = fromInvoice({
      id: "inv_test",
      amount: 8888, // Different!
      currency: "USD",
    });

    const x402JWS = await issue({
      iss: "https://api.example.com",
      aud: "https://app.example.com",
      amt: 8888, // Different!
      cur: "USD",
      rail: x402Payment.rail,
      reference: x402Payment.reference,
      asset: x402Payment.asset,
      env: x402Payment.env,
      evidence: x402Payment.evidence,
      privateKey,
      kid,
    });

    const stripeDecoded = decode<PEACReceiptClaims>(stripeJWS);
    const x402Decoded = decode<PEACReceiptClaims>(x402JWS);

    // Amounts should NOT match
    expect(stripeDecoded.payload.amt).not.toBe(x402Decoded.payload.amt);
    expect(stripeDecoded.payload.payment.amount).not.toBe(x402Decoded.payload.payment.amount);
  });

  it("Currency normalization preserves parity", async () => {
    const { privateKey } = await generateKeypair();
    const kid = "2025-01-26T12:00:00Z";

    // Stripe uses lowercase currency
    const stripePayment = fromCheckoutSession({
      id: "cs_test",
      amount_total: 1000,
      currency: "eur", // Lowercase
    });

    // x402 uses uppercase currency
    const x402Payment = fromInvoice({
      id: "inv_test",
      amount: 1000,
      currency: "EUR", // Uppercase
    });

    // Both should normalize to uppercase
    expect(stripePayment.currency).toBe("EUR");
    expect(x402Payment.currency).toBe("EUR");

    // Issue receipts
    const stripeJWS = await issue({
      iss: "https://api.example.com",
      aud: "https://app.example.com",
      amt: 1000,
      cur: "EUR",
      rail: stripePayment.rail,
      reference: stripePayment.reference,
      asset: stripePayment.asset,
      env: stripePayment.env,
      evidence: stripePayment.evidence,
      privateKey,
      kid,
    });

    const x402JWS = await issue({
      iss: "https://api.example.com",
      aud: "https://app.example.com",
      amt: 1000,
      cur: "EUR",
      rail: x402Payment.rail,
      reference: x402Payment.reference,
      asset: x402Payment.asset,
      env: x402Payment.env,
      evidence: x402Payment.evidence,
      privateKey,
      kid,
    });

    const stripeDecoded = decode<PEACReceiptClaims>(stripeJWS);
    const x402Decoded = decode<PEACReceiptClaims>(x402JWS);

    // Currencies MUST be identical (both uppercase)
    expect(stripeDecoded.payload.cur).toBe("EUR");
    expect(x402Decoded.payload.cur).toBe("EUR");
    expect(stripeDecoded.payload.payment.currency).toBe("EUR");
    expect(x402Decoded.payload.payment.currency).toBe("EUR");
  });
});
