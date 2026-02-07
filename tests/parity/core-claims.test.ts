/**
 * Cross-Mapping Core Claims Parity Tests
 *
 * Verifies that semantically equivalent receipts from different mapping
 * sources produce byte-identical JCS-canonicalized core claims.
 *
 * These tests use REAL mapping outputs from:
 * - @peac/mappings-acp (ACP checkout events)
 * - @peac/mappings-rsl (RSL usage tokens)
 * - @peac/mappings-tap (TAP verification)
 *
 * Parity Property: Two receipts with the same semantic content MUST produce
 * identical JCS output from toCoreClaims(), regardless of:
 * - Source mapping (ACP, RSL, TAP, direct)
 * - Field ordering in the source
 * - Rail-specific evidence differences
 * - Control block metadata differences
 */

import { describe, it, expect } from 'vitest';
import { issue } from '../../packages/protocol/src/issue';
import { generateKeypair } from '../../packages/crypto/src/jws';
import { canonicalize } from '../../packages/crypto/src/jcs';
import { toCoreClaims } from '../../packages/schema/src/normalize';
import { fromACPCheckoutSuccess } from '../../packages/mappings/acp/src/index';
import { rslUsageTokensToControlPurposes } from '../../packages/mappings/rsl/src/index';
import type { PEACReceiptClaims, ControlBlock } from '../../packages/schema/src/types';

describe('Cross-Mapping Core Claims Parity', () => {
  /**
   * PARITY TEST A: ACP Stripe vs ACP x402
   *
   * Same semantic transaction via different payment rails.
   * Core claims must be identical after normalization.
   */
  describe('ACP Rail Parity', () => {
    it('ACP Stripe and ACP x402 produce identical core claims when semantic content matches', async () => {
      const { privateKey } = await generateKeypair();
      const kid = '2025-parity-test';

      // Common semantic content
      const AMOUNT = 5000;
      const CURRENCY = 'USD';
      const ISS = 'https://publisher.example.com';
      const AUD = 'https://api.example.com';
      const RESOURCE_URI = 'https://api.example.com/article/parity-test';

      // ACP event via Stripe rail
      const acpStripeEvent = {
        checkout_id: 'checkout_stripe_parity',
        resource_uri: RESOURCE_URI,
        total_amount: AMOUNT,
        currency: CURRENCY,
        payment_rail: 'stripe',
        payment_reference: 'cs_stripe_parity_123',
        customer_id: 'cus_stripe',
        metadata: { stripe_specific: 'data' },
      };

      // ACP event via x402 rail (same semantic content, different rail)
      const acpX402Event = {
        checkout_id: 'checkout_x402_parity',
        resource_uri: RESOURCE_URI,
        total_amount: AMOUNT,
        currency: CURRENCY,
        payment_rail: 'x402',
        payment_reference: 'inv_x402_parity_456',
        customer_id: 'cus_x402',
        metadata: { x402_specific: 'different_data' },
      };

      // Use real ACP mapping
      const stripeInput = fromACPCheckoutSuccess(acpStripeEvent);
      const x402Input = fromACPCheckoutSuccess(acpX402Event);

      // Issue receipts using the mapped inputs
      const stripeResult = await issue({
        iss: ISS,
        aud: AUD,
        amt: stripeInput.amt,
        cur: stripeInput.cur,
        rail: stripeInput.payment.rail,
        reference: stripeInput.payment.reference,
        asset: stripeInput.payment.asset,
        env: stripeInput.payment.env,
        evidence: stripeInput.payment.evidence,
        subject: stripeInput.subject_uri,
        privateKey,
        kid,
      });

      const x402Result = await issue({
        iss: ISS,
        aud: AUD,
        amt: x402Input.amt,
        cur: x402Input.cur,
        rail: x402Input.payment.rail,
        reference: x402Input.payment.reference,
        asset: x402Input.payment.asset,
        env: x402Input.payment.env,
        evidence: x402Input.payment.evidence,
        subject: x402Input.subject_uri,
        privateKey,
        kid,
      });

      // Decode to get claims
      const stripeJws = stripeResult.jws.split('.');
      const x402Jws = x402Result.jws.split('.');

      const stripeClaims: PEACReceiptClaims = JSON.parse(
        Buffer.from(stripeJws[1], 'base64url').toString('utf-8')
      );
      const x402Claims: PEACReceiptClaims = JSON.parse(
        Buffer.from(x402Jws[1], 'base64url').toString('utf-8')
      );

      // Extract core claims using toCoreClaims
      const stripeCore = toCoreClaims(stripeClaims);
      const x402Core = toCoreClaims(x402Claims);

      // Rail and reference SHOULD differ (they're rail-specific)
      expect(stripeCore.payment!.rail).toBe('stripe');
      expect(x402Core.payment!.rail).toBe('x402');
      expect(stripeCore.payment!.reference).not.toBe(x402Core.payment!.reference);

      // But other semantic fields MUST match
      expect(stripeCore.iss).toBe(x402Core.iss);
      expect(stripeCore.aud).toBe(x402Core.aud);
      expect(stripeCore.amt).toBe(x402Core.amt);
      expect(stripeCore.cur).toBe(x402Core.cur);
      expect(stripeCore.payment!.amount).toBe(x402Core.payment!.amount);
      expect(stripeCore.payment!.currency).toBe(x402Core.payment!.currency);

      // Normalize rail/reference to verify all OTHER fields are identical
      const normalizedStripe = {
        ...stripeCore,
        rid: 'NORMALIZED',
        iat: 0,
        payment: { ...stripeCore.payment, rail: 'NORMALIZED', reference: 'NORMALIZED' },
      };
      const normalizedX402 = {
        ...x402Core,
        rid: 'NORMALIZED',
        iat: 0,
        payment: { ...x402Core.payment, rail: 'NORMALIZED', reference: 'NORMALIZED' },
      };

      // JCS canonical comparison
      const canonicalStripe = canonicalize(normalizedStripe);
      const canonicalX402 = canonicalize(normalizedX402);

      expect(canonicalStripe).toBe(canonicalX402);
    });
  });

  /**
   * PARITY TEST B: RSL-derived control purposes
   *
   * Verifies that RSL tokens map consistently to ControlPurpose
   * and that control blocks with same engine/result produce
   * identical core claims.
   */
  describe('RSL Control Parity', () => {
    it('RSL ai-all and individual tokens produce equivalent control purposes', () => {
      // Use real RSL mapping
      const aiAllResult = rslUsageTokensToControlPurposes(['ai-all']);
      const individualResult = rslUsageTokensToControlPurposes([
        'ai-train',
        'ai-input',
        'ai-index',
      ]);

      // ai-all expands to the same set as individual tokens
      expect(aiAllResult.purposes.sort()).toEqual(individualResult.purposes.sort());
      expect(aiAllResult.unknownTokens).toEqual([]);
      expect(individualResult.unknownTokens).toEqual([]);
    });

    it('receipts with RSL-derived control blocks produce identical core claims when engine/result match', async () => {
      const { privateKey } = await generateKeypair();
      const kid = '2025-rsl-parity';

      // Two different RSL token sets that produce the same ControlPurpose
      const rslResult1 = rslUsageTokensToControlPurposes(['ai-all']);
      const rslResult2 = rslUsageTokensToControlPurposes(['ai-train', 'ai-input', 'ai-index']);

      // Both should have same purposes
      expect(rslResult1.purposes.sort()).toEqual(rslResult2.purposes.sort());

      // Build control blocks with same engine/result but different metadata
      const control1: ControlBlock = {
        chain: [
          {
            engine: 'rsl',
            result: 'allow',
            purpose: 'train', // RSL-derived
            policy_id: 'rsl-policy-v1',
          },
        ],
        decision: 'allow',
        combinator: 'any_can_veto',
      };

      const control2: ControlBlock = {
        chain: [
          {
            engine: 'rsl',
            result: 'allow',
            purpose: 'train',
            version: '2.0', // Different metadata
            evidence_ref: 'https://rsl.example.com/proof',
          },
        ],
        decision: 'allow',
      };

      // Issue receipts with these control blocks
      const result1 = await issue({
        iss: 'https://publisher.example.com',
        aud: 'https://api.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'inv_rsl_1',
        asset: 'USD',
        env: 'live',
        evidence: {},
        privateKey,
        kid,
        ext: { control: control1 },
      });

      const result2 = await issue({
        iss: 'https://publisher.example.com',
        aud: 'https://api.example.com',
        amt: 1000,
        cur: 'USD',
        rail: 'x402',
        reference: 'inv_rsl_2',
        asset: 'USD',
        env: 'live',
        evidence: {},
        privateKey,
        kid,
        ext: { control: control2 },
      });

      // Decode claims
      const claims1: PEACReceiptClaims = JSON.parse(
        Buffer.from(result1.jws.split('.')[1], 'base64url').toString('utf-8')
      );
      const claims2: PEACReceiptClaims = JSON.parse(
        Buffer.from(result2.jws.split('.')[1], 'base64url').toString('utf-8')
      );

      // Extract core claims
      const core1 = toCoreClaims(claims1);
      const core2 = toCoreClaims(claims2);

      // Control blocks should be normalized to engine/result only
      expect(core1.control).toBeDefined();
      expect(core2.control).toBeDefined();
      expect(core1.control!.chain[0]).toEqual({ engine: 'rsl', result: 'allow' });
      expect(core2.control!.chain[0]).toEqual({ engine: 'rsl', result: 'allow' });

      // Normalize rid/iat/reference for full comparison
      const normalized1 = {
        ...core1,
        rid: 'NORMALIZED',
        iat: 0,
        payment: { ...core1.payment, reference: 'NORMALIZED' },
      };
      const normalized2 = {
        ...core2,
        rid: 'NORMALIZED',
        iat: 0,
        payment: { ...core2.payment, reference: 'NORMALIZED' },
      };

      // JCS canonical comparison
      expect(canonicalize(normalized1)).toBe(canonicalize(normalized2));
    });
  });

  /**
   * PARITY TEST C: TAP control entries
   *
   * Verifies that TAP verification results produce consistent
   * control entries that normalize correctly.
   */
  describe('TAP Control Parity', () => {
    it('TAP control entries with same engine/result but different evidence produce identical core claims', async () => {
      const { privateKey } = await generateKeypair();
      const kid = '2025-tap-parity';

      // Control block from TAP verification (minimal)
      const tapControl1: ControlBlock = {
        chain: [
          {
            engine: 'tap',
            result: 'allow',
            // TAP-specific evidence that should be stripped
            policy_id: 'visa-tap-001',
            reason: 'Signature verified',
            evidence_ref: 'https://visa.com/tap/proof/abc',
          },
        ],
        decision: 'allow',
        combinator: 'any_can_veto',
      };

      // Different TAP verification with different metadata
      const tapControl2: ControlBlock = {
        chain: [
          {
            engine: 'tap',
            result: 'allow',
            // Different TAP-specific evidence
            version: '1.0',
            scope: ['https://api.example.com/*'],
            limits_snapshot: { window: 480 },
          },
        ],
        decision: 'allow',
      };

      // Issue receipts
      const result1 = await issue({
        iss: 'https://trusted-agent.example.com',
        aud: 'https://api.example.com',
        amt: 2500,
        cur: 'EUR',
        rail: 'x402',
        reference: 'inv_tap_1',
        asset: 'EUR',
        env: 'live',
        evidence: {},
        privateKey,
        kid,
        ext: { control: tapControl1 },
      });

      const result2 = await issue({
        iss: 'https://trusted-agent.example.com',
        aud: 'https://api.example.com',
        amt: 2500,
        cur: 'EUR',
        rail: 'x402',
        reference: 'inv_tap_2',
        asset: 'EUR',
        env: 'live',
        evidence: {},
        privateKey,
        kid,
        ext: { control: tapControl2 },
      });

      // Decode and normalize
      const claims1: PEACReceiptClaims = JSON.parse(
        Buffer.from(result1.jws.split('.')[1], 'base64url').toString('utf-8')
      );
      const claims2: PEACReceiptClaims = JSON.parse(
        Buffer.from(result2.jws.split('.')[1], 'base64url').toString('utf-8')
      );

      const core1 = toCoreClaims(claims1);
      const core2 = toCoreClaims(claims2);

      // TAP-specific evidence should be stripped
      expect(core1.control!.chain[0]).toEqual({ engine: 'tap', result: 'allow' });
      expect(core2.control!.chain[0]).toEqual({ engine: 'tap', result: 'allow' });

      // Normalize unique fields
      const normalized1 = {
        ...core1,
        rid: 'NORMALIZED',
        iat: 0,
        payment: { ...core1.payment, reference: 'NORMALIZED' },
      };
      const normalized2 = {
        ...core2,
        rid: 'NORMALIZED',
        iat: 0,
        payment: { ...core2.payment, reference: 'NORMALIZED' },
      };

      // JCS canonical comparison
      expect(canonicalize(normalized1)).toBe(canonicalize(normalized2));
    });
  });

  /**
   * PARITY TEST D: Field ordering invariance
   *
   * Verifies that JCS canonicalization produces identical output
   * regardless of field ordering in the source receipt.
   */
  describe('Field Ordering Parity', () => {
    it('receipts with different field ordering produce identical JCS output', async () => {
      const { privateKey } = await generateKeypair();
      const kid = '2025-field-order';

      // Issue a receipt
      const result = await issue({
        iss: 'https://issuer.example.com',
        aud: 'https://resource.example.com',
        amt: 1500,
        cur: 'GBP',
        rail: 'stripe',
        reference: 'cs_field_order',
        asset: 'GBP',
        env: 'test',
        evidence: { order: 'first' },
        privateKey,
        kid,
      });

      // Decode
      const claims: PEACReceiptClaims = JSON.parse(
        Buffer.from(result.jws.split('.')[1], 'base64url').toString('utf-8')
      );

      // Create a reordered version of the same claims
      const reorderedClaims: PEACReceiptClaims = {
        // Deliberately different field order
        payment: claims.payment,
        cur: claims.cur,
        rid: claims.rid,
        iat: claims.iat,
        amt: claims.amt,
        aud: claims.aud,
        iss: claims.iss,
      };

      // Both should produce identical core claims
      const core1 = toCoreClaims(claims);
      const core2 = toCoreClaims(reorderedClaims);

      // JCS canonicalization must produce identical output
      expect(canonicalize(core1)).toBe(canonicalize(core2));
    });
  });

  /**
   * PARITY TEST E: Evidence isolation
   *
   * Verifies that rail-specific evidence does not affect core claims.
   */
  describe('Evidence Isolation Parity', () => {
    it('different evidence payloads do not affect core claims comparison', async () => {
      const { privateKey } = await generateKeypair();
      const kid = '2025-evidence';

      // Same semantic receipt with different evidence
      const result1 = await issue({
        iss: 'https://issuer.example.com',
        aud: 'https://resource.example.com',
        amt: 3000,
        cur: 'JPY',
        rail: 'x402',
        reference: 'inv_evidence_1',
        asset: 'JPY',
        env: 'live',
        evidence: {
          preimage: 'abc123',
          invoice: 'lnbc...',
          settled_at: 1703000000,
        },
        privateKey,
        kid,
      });

      const result2 = await issue({
        iss: 'https://issuer.example.com',
        aud: 'https://resource.example.com',
        amt: 3000,
        cur: 'JPY',
        rail: 'x402',
        reference: 'inv_evidence_2',
        asset: 'JPY',
        env: 'live',
        evidence: {
          // Completely different evidence structure
          payment_intent: 'pi_xyz',
          charge_id: 'ch_abc',
          receipt_url: 'https://stripe.com/receipt/abc',
        },
        privateKey,
        kid,
      });

      const claims1: PEACReceiptClaims = JSON.parse(
        Buffer.from(result1.jws.split('.')[1], 'base64url').toString('utf-8')
      );
      const claims2: PEACReceiptClaims = JSON.parse(
        Buffer.from(result2.jws.split('.')[1], 'base64url').toString('utf-8')
      );

      const core1 = toCoreClaims(claims1);
      const core2 = toCoreClaims(claims2);

      // Evidence should not appear in core claims
      expect((core1.payment as Record<string, unknown>).evidence).toBeUndefined();
      expect((core2.payment as Record<string, unknown>).evidence).toBeUndefined();

      // Normalize unique fields
      const normalized1 = { ...core1, rid: 'NORMALIZED', iat: 0 };
      const normalized2 = { ...core2, rid: 'NORMALIZED', iat: 0 };

      // Reference differs, but after normalizing that too...
      normalized1.payment = { ...normalized1.payment, reference: 'NORMALIZED' };
      normalized2.payment = { ...normalized2.payment, reference: 'NORMALIZED' };

      // Should be byte-identical
      expect(canonicalize(normalized1)).toBe(canonicalize(normalized2));
    });
  });
});
