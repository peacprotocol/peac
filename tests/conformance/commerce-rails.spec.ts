/**
 * Execution-backed commerce rail conformance tests.
 *
 * Loads fixture manifests from specs/conformance/fixtures/{paymentauth,acp,stripe,ucp}/
 * and validates both structural integrity AND real protocol behavior by calling
 * the actual public APIs of each commerce mapping/rail package.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// paymentauth
import {
  parsePaymentauthChallenges,
  parsePaymentauthCredential,
  parsePaymentauthReceipt,
  normalizeChallenge,
  normalizeReceipt,
  normalizeCredential,
  PaymentauthError,
} from '@peac/mappings-paymentauth';

// ACP
import { fromACPSessionLifecycleEvent, fromACPPaymentObservation } from '@peac/mappings-acp';

// Stripe
import { fromSPTGrant, fromSPTUse, fromStripePaymentIntentObservation } from '@peac/rails-stripe';

// UCP
import { mapUcpOrderToReceipt, UcpError } from '@peac/mappings-ucp';

const FIXTURES_ROOT = join(__dirname, '..', '..', 'specs', 'conformance', 'fixtures');

interface Manifest {
  name: string;
  version: string;
  commerce_rail?: string;
  spec_revision?: string;
  intent_spec_revision?: string;
  categories: Record<string, { description: string; vectors: string[] }>;
  invariants?: string[];
}

function loadManifest(rail: string): Manifest | null {
  const p = join(FIXTURES_ROOT, rail, 'manifest.json');
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf-8'));
}

function loadFixture(rail: string, file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES_ROOT, rail, file), 'utf-8'));
}

// ---------------------------------------------------------------------------
// 1. Structural validation (manifest integrity, file existence, uniqueness)
// ---------------------------------------------------------------------------

describe('commerce rail fixture structural validation', () => {
  const COMMERCE_RAILS = ['paymentauth', 'acp', 'stripe', 'ucp', 'x402'] as const;
  const allIds = new Map<string, string>();

  for (const rail of COMMERCE_RAILS) {
    const manifest = loadManifest(rail);
    if (!manifest) continue;

    describe(`${rail}: manifest integrity`, () => {
      it('has required metadata', () => {
        expect(manifest.name).toBeTruthy();
        expect(manifest.version).toBeTruthy();
      });

      if (rail !== 'x402') {
        it('declares commerce_rail', () => {
          expect(manifest.commerce_rail).toBe(rail);
        });

        it('has documented invariants', () => {
          expect(manifest.invariants).toBeDefined();
          expect(manifest.invariants!.length).toBeGreaterThan(0);
        });
      }

      for (const [cat, catDef] of Object.entries(manifest.categories)) {
        for (const vecFile of catDef.vectors) {
          it(`${cat}/${vecFile} exists`, () => {
            expect(existsSync(join(FIXTURES_ROOT, rail, vecFile))).toBe(true);
          });

          it(`${cat}/${vecFile} has unique id`, () => {
            const vec = loadFixture(rail, vecFile);
            if (vec.id) {
              const existing = allIds.get(vec.id as string);
              expect(existing, `duplicate id "${vec.id}": ${existing}`).toBeUndefined();
              allIds.set(vec.id as string, `${rail}/${vecFile}`);
            }
          });
        }
      }
    });
  }

  describe('coverage floor (structural)', () => {
    const FLOOR = { valid: 3, invalid: 4, edge: 2, security: 1 };
    for (const rail of ['paymentauth', 'acp', 'stripe', 'ucp'] as const) {
      it(`${rail}: meets minimum coverage floor`, () => {
        const m = loadManifest(rail)!;
        for (const [cat, min] of Object.entries(FLOOR)) {
          const vecs = m.categories[cat]?.vectors || [];
          expect(vecs.length, `${rail}/${cat}: ${vecs.length} < ${min}`).toBeGreaterThanOrEqual(
            min
          );
        }
      });
    }
  });

  describe('spec_revision pinning', () => {
    it('paymentauth: pins spec_revision to active Internet-Draft', () => {
      const m = loadManifest('paymentauth')!;
      expect(m.spec_revision).toBe('draft-ryan-httpauth-payment-01');
    });

    it('paymentauth: pins intent_spec_revision (provisional)', () => {
      const m = loadManifest('paymentauth')!;
      // Provisional: draft-ryan-payment-intents-charge-00 is not publicly listed
      // on datatracker.ietf.org as of 2026-03-27. Pin is source-local.
      expect(m.intent_spec_revision).toContain('draft-ryan-payment-intents-charge-00');
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Execution-backed behavioral conformance: paymentauth
// ---------------------------------------------------------------------------

describe('paymentauth: execution-backed conformance', () => {
  it('valid-challenge-parse: parses and normalizes challenge header', () => {
    const fix = loadFixture('paymentauth', 'valid-challenge-parse.json');
    const input = fix.input as { header: string };
    const expected = fix.expected as Record<string, unknown>;

    const challenges = parsePaymentauthChallenges(input.header);
    expect(challenges.length).toBe(1);

    const normalized = normalizeChallenge(challenges[0]);
    expect(normalized.id).toBe(expected.id);
    expect(normalized.realm).toBe(expected.realm);
    expect(normalized.method).toBe(expected.method);
    expect(normalized.intent).toBe(expected.intent);
  });

  it('valid-credential-parse: parses credential and normalizes envelope', () => {
    const fix = loadFixture('paymentauth', 'valid-credential-parse.json');
    const input = fix.input as { header: string };
    const expected = fix.expected as Record<string, unknown>;

    const raw = parsePaymentauthCredential(input.header);
    expect(raw.parsedJson).toBeTruthy();

    const normalized = normalizeCredential(raw);
    expect(normalized.challengeId).toBe(expected.challengeId);
    expect(normalized.method).toBe(expected.method);
    expect(normalized.intent).toBe(expected.intent);
  });

  it('invalid-missing-scheme: rejects credential without Payment scheme', () => {
    const fix = loadFixture('paymentauth', 'invalid-missing-scheme.json');
    const input = fix.input as { header: string };

    expect(() => parsePaymentauthCredential(input.header)).toThrow(PaymentauthError);
    try {
      parsePaymentauthCredential(input.header);
    } catch (e) {
      expect((e as PaymentauthError).code).toBe('PARSE_MISSING_SCHEME');
    }
  });

  it('invalid-missing-challenge-id: normalizeChallenge rejects missing id', () => {
    const fix = loadFixture('paymentauth', 'invalid-missing-challenge-id.json');
    const input = fix.input as { header: string };

    const challenges = parsePaymentauthChallenges(input.header);
    expect(challenges.length).toBe(1);
    expect(() => normalizeChallenge(challenges[0])).toThrow(PaymentauthError);
    try {
      normalizeChallenge(challenges[0]);
    } catch (e) {
      expect((e as PaymentauthError).code).toBe('NORMALIZE_MISSING_FIELD');
    }
  });

  it('invalid-truncated-base64: rejects corrupted base64url', () => {
    const fix = loadFixture('paymentauth', 'invalid-truncated-base64.json');
    const input = fix.input as { header: string };

    expect(() => parsePaymentauthCredential(input.header)).toThrow(PaymentauthError);
    try {
      parsePaymentauthCredential(input.header);
    } catch (e) {
      expect((e as PaymentauthError).code).toBe('PARSE_INVALID_BASE64URL');
    }
  });

  it('invalid-receipt-not-json: normalizeReceipt rejects non-object payload', () => {
    const fix = loadFixture('paymentauth', 'invalid-receipt-not-json.json');
    const input = fix.input as { header: string };

    const raw = parsePaymentauthReceipt(input.header);
    expect(() => normalizeReceipt(raw)).toThrow(PaymentauthError);
    try {
      normalizeReceipt(raw);
    } catch (e) {
      expect((e as PaymentauthError).code).toBe('NORMALIZE_MISSING_FIELD');
    }
  });

  it('edge-unknown-method: normalizes challenge with unrecognized method', () => {
    const fix = loadFixture('paymentauth', 'edge-unknown-method.json');
    const input = fix.input as { header: string };
    const expected = fix.expected as Record<string, unknown>;

    const challenges = parsePaymentauthChallenges(input.header);
    expect(challenges.length).toBe(1);
    const normalized = normalizeChallenge(challenges[0]);
    expect(normalized.method).toBe(expected.method);
    expect(normalized.intent).toBe(expected.intent);
  });

  it('edge-receipt-extra-fields: extra fields collected in extras map', () => {
    const fix = loadFixture('paymentauth', 'edge-receipt-extra-fields.json');
    const input = fix.input as { header: string };
    const expected = fix.expected as { extra_keys: string[] };

    const raw = parsePaymentauthReceipt(input.header);
    const normalized = normalizeReceipt(raw);
    expect(normalized.status).toBe('success');
    expect(normalized.method).toBe('example');
    for (const key of expected.extra_keys) {
      expect(normalized.extras).toHaveProperty(key);
    }
  });

  it('security-oversized-header: rejects header exceeding 8192 bytes', () => {
    // Construct oversized header per fixture instruction
    const header = 'Payment id="oversized", realm="' + 'a'.repeat(9000) + '"';
    expect(() => parsePaymentauthChallenges(header)).toThrow(PaymentauthError);
    try {
      parsePaymentauthChallenges(header);
    } catch (e) {
      expect((e as PaymentauthError).code).toBe('PARSE_HEADER_TOO_LARGE');
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Execution-backed behavioral conformance: ACP
// ---------------------------------------------------------------------------

describe('ACP: execution-backed conformance', () => {
  it('valid-session-completed: lifecycle event produces access evidence', () => {
    const fix = loadFixture('acp', 'valid-session-completed.json');
    const input = fix.input as { event: Record<string, unknown> };

    const result = fromACPSessionLifecycleEvent(input.event as never);
    expect(result.payment.rail).toBe('acp');
    expect(result.amt).toBe(0);
    expect(result.cur).toBe('NONE');
    const ev = result.payment.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBeUndefined();
  });

  it('valid-payment-settled: payment observation produces commerce evidence', () => {
    const fix = loadFixture('acp', 'valid-payment-settled.json');
    const input = fix.input as {
      event: Record<string, unknown>;
      payment_artifact: Record<string, unknown>;
    };

    const result = fromACPPaymentObservation(input.event as never, input.payment_artifact as never);
    expect(result.payment.rail).toBe('stripe');
    expect(result.amt).toBe(2500);
    const ev = result.payment.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBe('settlement');
    expect(ev.observed_payment_state).toBe('settled');
  });

  it('valid-session-created: lifecycle creation event produces access evidence', () => {
    const fix = loadFixture('acp', 'valid-session-created.json');
    const input = fix.input as { event: Record<string, unknown> };

    const result = fromACPSessionLifecycleEvent(input.event as never);
    expect(result.payment.rail).toBe('acp');
    expect(result.amt).toBe(0);
  });

  it('invalid-missing-session-id: throws on missing session_id', () => {
    const fix = loadFixture('acp', 'invalid-missing-session-id.json');
    const input = fix.input as { event: Record<string, unknown> };
    expect(() => fromACPSessionLifecycleEvent(input.event as never)).toThrow();
  });

  it('invalid-payment-missing-rail: throws on missing rail', () => {
    const fix = loadFixture('acp', 'invalid-payment-missing-rail.json');
    const input = fix.input as {
      event: Record<string, unknown>;
      payment_artifact: Record<string, unknown>;
    };
    expect(() =>
      fromACPPaymentObservation(input.event as never, input.payment_artifact as never)
    ).toThrow();
  });

  it('invalid-payment-missing-reference: throws on missing reference', () => {
    const fix = loadFixture('acp', 'invalid-payment-missing-reference.json');
    const input = fix.input as {
      event: Record<string, unknown>;
      payment_artifact: Record<string, unknown>;
    };
    expect(() =>
      fromACPPaymentObservation(input.event as never, input.payment_artifact as never)
    ).toThrow();
  });

  it('invalid-missing-resource-uri: throws on missing resource_uri', () => {
    const fix = loadFixture('acp', 'invalid-missing-resource-uri.json');
    const input = fix.input as { event: Record<string, unknown> };
    expect(() => fromACPSessionLifecycleEvent(input.event as never)).toThrow();
  });

  it('edge-completed-no-payment: completed session has no commerce event', () => {
    const fix = loadFixture('acp', 'edge-completed-no-payment.json');
    const input = fix.input as { event: Record<string, unknown> };

    const result = fromACPSessionLifecycleEvent(input.event as never);
    expect(result.payment.rail).toBe('acp');
    expect(result.amt).toBe(0);
    const ev = result.payment.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBeUndefined();
    expect(ev.observed_payment_state).toBeUndefined();
  });

  it('edge-payment-authorized: authorized state produces authorization event', () => {
    const fix = loadFixture('acp', 'edge-payment-authorized.json');
    const input = fix.input as {
      event: Record<string, unknown>;
      payment_artifact: Record<string, unknown>;
    };

    const result = fromACPPaymentObservation(input.event as never, input.payment_artifact as never);
    const ev = result.payment.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBe('authorization');
    expect(ev.observed_payment_state).toBe('authorized');
  });

  it('security-xss-resource-uri: URI with script injection is preserved as-is', () => {
    const fix = loadFixture('acp', 'security-xss-resource-uri.json');
    const input = fix.input as { event: Record<string, unknown> };

    const result = fromACPSessionLifecycleEvent(input.event as never);
    expect(result.subject_uri).toContain('<script>');
  });
});

// ---------------------------------------------------------------------------
// 4. Execution-backed behavioral conformance: Stripe SPT
// ---------------------------------------------------------------------------

describe('Stripe: execution-backed conformance', () => {
  it('valid-spt-grant: produces delegation evidence, no commerce event', () => {
    const fix = loadFixture('stripe', 'valid-spt-grant.json');
    const input = fix.input as { data: Record<string, unknown> };

    const result = fromSPTGrant(input.data as never);
    const ev = result.evidence as Record<string, unknown>;
    expect(ev.spt_action).toBe('delegated_payment_granted');
    expect(ev.commerce_event).toBeUndefined();
  });

  it('valid-pi-succeeded: produces settlement commerce event', () => {
    const fix = loadFixture('stripe', 'valid-pi-succeeded.json');
    const input = fix.input as { data: Record<string, unknown> };

    const result = fromStripePaymentIntentObservation(input.data as never);
    const ev = result.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBe('settlement');
  });

  it('valid-pi-requires-capture: produces authorization commerce event', () => {
    const fix = loadFixture('stripe', 'valid-pi-requires-capture.json');
    const input = fix.input as { data: Record<string, unknown> };

    const result = fromStripePaymentIntentObservation(input.data as never);
    const ev = result.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBe('authorization');
  });

  // Current adapter behavior: Stripe SPT/PI functions do not throw on missing
  // or malformed fields. They produce degraded output (undefined reference,
  // fallback amounts). These tests capture current lenient handling, not
  // normative protocol invariants.

  it('invalid-spt-missing-token: (current adapter behavior) undefined reference', () => {
    const fix = loadFixture('stripe', 'invalid-spt-missing-token.json');
    const input = fix.input as { data: Record<string, unknown> };

    const result = fromSPTGrant(input.data as never);
    expect(result.reference).toBeUndefined();
  });

  it('invalid-pi-missing-id: (current adapter behavior) undefined reference', () => {
    const fix = loadFixture('stripe', 'invalid-pi-missing-id.json');
    const input = fix.input as { data: Record<string, unknown> };

    const result = fromStripePaymentIntentObservation(input.data as never);
    expect(result.reference).toBeUndefined();
    const ev = result.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBe('settlement');
  });

  it('invalid-spt-negative-amount: (current adapter behavior) falls back to zero', () => {
    const fix = loadFixture('stripe', 'invalid-spt-negative-amount.json');
    const input = fix.input as { data: Record<string, unknown> };

    const result = fromSPTUse(input.data as never);
    expect(result.amount).toBe(0);
  });

  it('invalid-pi-unknown-status: (current adapter behavior) no commerce event', () => {
    const fix = loadFixture('stripe', 'invalid-pi-unknown-status.json');
    const input = fix.input as { data: Record<string, unknown> };

    const result = fromStripePaymentIntentObservation(input.data as never);
    const ev = result.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBeUndefined();
  });

  it('edge-spt-use-with-pi: SPT use with PI ref has no commerce event', () => {
    const fix = loadFixture('stripe', 'edge-spt-use-with-pi.json');
    const input = fix.input as { data: Record<string, unknown> };

    const result = fromSPTUse(input.data as never);
    const ev = result.evidence as Record<string, unknown>;
    expect(ev.spt_action).toBe('delegated_payment_presented');
    expect(ev.commerce_event).toBeUndefined();
  });

  it('edge-pi-processing: processing status has no commerce event', () => {
    const fix = loadFixture('stripe', 'edge-pi-processing.json');
    const input = fix.input as { data: Record<string, unknown> };

    const result = fromStripePaymentIntentObservation(input.data as never);
    const ev = result.evidence as Record<string, unknown>;
    expect(ev.commerce_event).toBeUndefined();
  });

  it('security-metadata-sanitization: allowlist policy filters keys', () => {
    const fix = loadFixture('stripe', 'security-metadata-sanitization.json');
    const input = fix.input as {
      data: Record<string, unknown>;
      options: Record<string, unknown>;
    };

    const result = fromStripePaymentIntentObservation(input.data as never, input.options as never);
    const ev = result.evidence as Record<string, unknown>;
    const metadata = ev.metadata as Record<string, unknown> | undefined;
    if (metadata) {
      expect(metadata).toHaveProperty('order_id');
      expect(metadata).not.toHaveProperty('customer_email');
      expect(metadata).not.toHaveProperty('internal_ref');
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Execution-backed behavioral conformance: UCP
// ---------------------------------------------------------------------------

describe('UCP: execution-backed conformance', () => {
  it('valid-order-completed: completed order maps with derived_order_fallback', () => {
    const fix = loadFixture('ucp', 'valid-order-completed.json');
    const input = fix.input as { order: Record<string, unknown>; options: Record<string, unknown> };

    const result = mapUcpOrderToReceipt({
      order: input.order as never,
      ...input.options,
    } as never);
    expect(result.payment.evidence.payment_state_source).toBe('derived_order_fallback');
    expect(result.payment.evidence.order_state).toBe('completed');
  });

  it('valid-explicit-payment-state: explicit payment_state overrides derived', () => {
    const fix = loadFixture('ucp', 'valid-explicit-payment-state.json');
    const input = fix.input as { order: Record<string, unknown>; options: Record<string, unknown> };

    const result = mapUcpOrderToReceipt({
      order: input.order as never,
      ...input.options,
    } as never);
    expect(result.payment.evidence.payment_state_source).toBe('explicit');
    expect(result.payment.evidence.payment_state).toBe('settled');
    expect(result.payment.status).toBe('completed');
  });

  it('valid-partial-fulfillment: partially fulfilled order maps correctly', () => {
    const fix = loadFixture('ucp', 'valid-partial-fulfillment.json');
    const input = fix.input as { order: Record<string, unknown>; options: Record<string, unknown> };

    const result = mapUcpOrderToReceipt({
      order: input.order as never,
      ...input.options,
    } as never);
    expect(result.payment.evidence.order_state).toBe('partial');
  });

  it('invalid-missing-line-items: throws UcpError', () => {
    const fix = loadFixture('ucp', 'invalid-missing-line-items.json');
    const input = fix.input as { order: Record<string, unknown>; options: Record<string, unknown> };

    expect(() =>
      mapUcpOrderToReceipt({ order: input.order as never, ...input.options } as never)
    ).toThrow(UcpError);
  });

  it('invalid-empty-id: throws UcpError', () => {
    const fix = loadFixture('ucp', 'invalid-empty-id.json');
    const input = fix.input as { order: Record<string, unknown>; options: Record<string, unknown> };

    expect(() =>
      mapUcpOrderToReceipt({ order: input.order as never, ...input.options } as never)
    ).toThrow(UcpError);
  });

  it('invalid-missing-totals: throws UcpError', () => {
    const fix = loadFixture('ucp', 'invalid-missing-totals.json');
    const input = fix.input as { order: Record<string, unknown>; options: Record<string, unknown> };

    expect(() =>
      mapUcpOrderToReceipt({ order: input.order as never, ...input.options } as never)
    ).toThrow(UcpError);
  });

  it('invalid-missing-total-entry: throws UcpError', () => {
    const fix = loadFixture('ucp', 'invalid-missing-total-entry.json');
    const input = fix.input as { order: Record<string, unknown>; options: Record<string, unknown> };

    expect(() =>
      mapUcpOrderToReceipt({ order: input.order as never, ...input.options } as never)
    ).toThrow(UcpError);
  });

  it('edge-derived-fallback: completed without payment_state uses fallback', () => {
    const fix = loadFixture('ucp', 'edge-derived-fallback.json');
    const input = fix.input as { order: Record<string, unknown>; options: Record<string, unknown> };

    const result = mapUcpOrderToReceipt({
      order: input.order as never,
      ...input.options,
    } as never);
    expect(result.payment.evidence.payment_state_source).toBe('derived_order_fallback');
    expect(result.payment.evidence.payment_state).toBeUndefined();
  });

  it('edge-zero-amount: zero-amount order is valid', () => {
    const fix = loadFixture('ucp', 'edge-zero-amount.json');
    const input = fix.input as { order: Record<string, unknown>; options: Record<string, unknown> };

    const result = mapUcpOrderToReceipt({
      order: input.order as never,
      ...input.options,
    } as never);
    expect(result.payment.evidence.order_state).toBe('completed');
  });

  it('security-oversized-line-items: evidence uses count not full objects', () => {
    // Construct order with many line items per fixture instruction
    const items = Array.from({ length: 500 }, (_, i) => ({
      id: `li_${i}`,
      item: { id: `p${i}`, title: `Item ${i}`, price: 100 },
      quantity: { total: 1, fulfilled: 1 },
      status: 'fulfilled' as const,
    }));

    const result = mapUcpOrderToReceipt({
      order: {
        id: 'order_sec_01',
        line_items: items,
        totals: [
          { type: 'subtotal', amount: 50000 },
          { type: 'total', amount: 50000 },
        ],
      },
      issuer: 'https://merchant.example.com',
      subject: 'agent:sec_01',
      currency: 'USD',
    } as never);

    // Evidence stores line_items as a count, proving bounded projection
    expect(typeof result.payment.evidence.line_items).toBe('number');
    expect(result.payment.evidence.line_items).toBe(500);
  });
});
