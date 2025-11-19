/**
 * Tests for x402 rail adapter
 */

import { describe, it, expect } from "vitest";
import {
  fromInvoice,
  fromSettlement,
  fromWebhookEvent,
  type X402Invoice,
  type X402Settlement,
  type X402WebhookEvent,
} from "../src/index";

describe("x402 rail adapter", () => {
  describe("fromInvoice", () => {
    it("should normalize x402 invoice", () => {
      const invoice: X402Invoice = {
        id: "inv_a1b2c3d4e5f6",
        amount: 9999,
        currency: "USD",
        session_id: "sess_123",
        invoice_url: "https://pay.x402.example/inv_a1b2c3d4e5f6",
        memo: "Payment for API usage",
        metadata: {
          order_id: "order_789",
        },
      };

      const normalized = fromInvoice(invoice);

      expect(normalized.rail).toBe("x402");
      expect(normalized.reference).toBe("inv_a1b2c3d4e5f6");
      expect(normalized.amount).toBe(9999);
      expect(normalized.currency).toBe("USD");
      expect(normalized.evidence).toMatchObject({
        invoice_id: "inv_a1b2c3d4e5f6",
        session_id: "sess_123",
        invoice_url: "https://pay.x402.example/inv_a1b2c3d4e5f6",
        memo: "Payment for API usage",
        metadata: {
          order_id: "order_789",
        },
      });
    });

    it("should handle minimal invoice", () => {
      const invoice: X402Invoice = {
        id: "inv_minimal",
        amount: 1000,
        currency: "EUR",
      };

      const normalized = fromInvoice(invoice);

      expect(normalized.rail).toBe("x402");
      expect(normalized.reference).toBe("inv_minimal");
      expect(normalized.amount).toBe(1000);
      expect(normalized.currency).toBe("EUR");
      expect(normalized.evidence).toMatchObject({
        invoice_id: "inv_minimal",
      });
    });

    it("should reject invoice without id", () => {
      const invoice = {
        amount: 9999,
        currency: "USD",
      } as X402Invoice;

      expect(() => fromInvoice(invoice)).toThrow("missing id");
    });

    it("should reject invoice with invalid amount", () => {
      const invoice = {
        id: "inv_test",
        amount: -100,
        currency: "USD",
      } as X402Invoice;

      expect(() => fromInvoice(invoice)).toThrow("invalid amount");
    });

    it("should reject invoice with invalid currency", () => {
      const invoice = {
        id: "inv_test",
        amount: 9999,
        currency: "invalid",
      } as X402Invoice;

      expect(() => fromInvoice(invoice)).toThrow("invalid currency");
    });
  });

  describe("fromSettlement", () => {
    it("should normalize x402 settlement", () => {
      const settlement: X402Settlement = {
        id: "settle_a1b2c3d4e5f6",
        invoice_id: "inv_xyz",
        amount: 9999,
        currency: "GBP",
        settled_at: "2025-01-26T10:00:00Z",
        metadata: {
          settlement_batch: "batch_123",
        },
      };

      const normalized = fromSettlement(settlement);

      expect(normalized.rail).toBe("x402");
      expect(normalized.reference).toBe("inv_xyz"); // Uses invoice_id
      expect(normalized.amount).toBe(9999);
      expect(normalized.currency).toBe("GBP");
      expect(normalized.evidence).toMatchObject({
        settlement_id: "settle_a1b2c3d4e5f6",
        invoice_id: "inv_xyz",
        settled_at: "2025-01-26T10:00:00Z",
        metadata: {
          settlement_batch: "batch_123",
        },
      });
    });

    it("should handle minimal settlement", () => {
      const settlement: X402Settlement = {
        id: "settle_minimal",
        invoice_id: "inv_123",
        amount: 500,
        currency: "JPY",
      };

      const normalized = fromSettlement(settlement);

      expect(normalized.rail).toBe("x402");
      expect(normalized.reference).toBe("inv_123");
      expect(normalized.amount).toBe(500);
      expect(normalized.currency).toBe("JPY");
      expect(normalized.evidence).toMatchObject({
        settlement_id: "settle_minimal",
        invoice_id: "inv_123",
      });
    });

    it("should reject settlement without invoice_id", () => {
      const settlement = {
        id: "settle_test",
        amount: 9999,
        currency: "USD",
      } as X402Settlement;

      expect(() => fromSettlement(settlement)).toThrow("missing invoice_id");
    });
  });

  describe("fromWebhookEvent", () => {
    it("should normalize invoice.paid event", () => {
      const event: X402WebhookEvent = {
        type: "invoice.paid",
        data: {
          object: {
            id: "inv_webhook",
            amount: 9999,
            currency: "USD",
            session_id: "sess_webhook",
          },
        },
      };

      const normalized = fromWebhookEvent(event);

      expect(normalized.rail).toBe("x402");
      expect(normalized.reference).toBe("inv_webhook");
      expect(normalized.amount).toBe(9999);
      expect(normalized.currency).toBe("USD");
    });

    it("should normalize settlement.completed event", () => {
      const event: X402WebhookEvent = {
        type: "settlement.completed",
        data: {
          object: {
            id: "settle_webhook",
            invoice_id: "inv_webhook",
            amount: 9999,
            currency: "USD",
            settled_at: "2025-01-26T10:00:00Z",
          },
        },
      };

      const normalized = fromWebhookEvent(event);

      expect(normalized.rail).toBe("x402");
      expect(normalized.reference).toBe("inv_webhook");
      expect(normalized.amount).toBe(9999);
      expect(normalized.currency).toBe("USD");
    });

    it("should reject unsupported event types", () => {
      const event: X402WebhookEvent = {
        type: "unsupported.event",
        data: {
          object: {} as X402Invoice,
        },
      };

      expect(() => fromWebhookEvent(event)).toThrow("Unsupported x402 webhook event type");
    });
  });

  describe("currency normalization", () => {
    it("should preserve uppercase currency", () => {
      const invoice: X402Invoice = {
        id: "inv_test",
        amount: 1000,
        currency: "INR", // Already uppercase
      };

      const normalized = fromInvoice(invoice);
      expect(normalized.currency).toBe("INR");
    });
  });
});
