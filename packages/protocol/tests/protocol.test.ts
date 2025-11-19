/**
 * Tests for PEAC protocol issue and verify
 */

import { describe, it, expect } from "vitest";
import { generateKeypair } from "@peac/crypto";
import { issue } from "../src/issue";
import { decode } from "@peac/crypto";
import { PEACReceiptClaims } from "@peac/schema";

describe("PEAC Protocol", () => {
  describe("issue()", () => {
    it("should issue a valid receipt with UUIDv7 rid", async () => {
      const { privateKey } = await generateKeypair();

      const jws = await issue({
        iss: "https://api.example.com",
        aud: "https://app.example.com",
        amt: 9999,
        cur: "USD",
        scheme: "stripe",
        reference: "cs_123456",
        privateKey,
        kid: "2025-01-15T10:30:00Z",
      });

      // JWS should have three parts
      expect(jws.split(".")).toHaveLength(3);

      // Decode and validate
      const decoded = decode<PEACReceiptClaims>(jws);

      expect(decoded.header.typ).toBe("peac.receipt/0.9");
      expect(decoded.header.alg).toBe("EdDSA");
      expect(decoded.header.kid).toBe("2025-01-15T10:30:00Z");

      expect(decoded.payload.iss).toBe("https://api.example.com");
      expect(decoded.payload.aud).toBe("https://app.example.com");
      expect(decoded.payload.amt).toBe(9999);
      expect(decoded.payload.cur).toBe("USD");

      // Receipt ID should be UUIDv7
      expect(decoded.payload.rid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );

      // Payment should match
      expect(decoded.payload.payment.scheme).toBe("stripe");
      expect(decoded.payload.payment.reference).toBe("cs_123456");
      expect(decoded.payload.payment.amount).toBe(9999);
      expect(decoded.payload.payment.currency).toBe("USD");
    });

    it("should include subject if provided", async () => {
      const { privateKey } = await generateKeypair();

      const jws = await issue({
        iss: "https://api.example.com",
        aud: "https://app.example.com",
        amt: 9999,
        cur: "USD",
        scheme: "stripe",
        reference: "cs_123456",
        subject: "https://app.example.com/api/resource/123",
        privateKey,
        kid: "2025-01-15T10:30:00Z",
      });

      const decoded = decode<PEACReceiptClaims>(jws);

      expect(decoded.payload.subject).toEqual({
        uri: "https://app.example.com/api/resource/123",
      });
    });

    it("should include exp if provided", async () => {
      const { privateKey } = await generateKeypair();
      const exp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      const jws = await issue({
        iss: "https://api.example.com",
        aud: "https://app.example.com",
        amt: 9999,
        cur: "USD",
        scheme: "stripe",
        reference: "cs_123456",
        exp,
        privateKey,
        kid: "2025-01-15T10:30:00Z",
      });

      const decoded = decode<PEACReceiptClaims>(jws);

      expect(decoded.payload.exp).toBe(exp);
    });

    it("should reject non-https issuer URL", async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          iss: "http://api.example.com", // HTTP not allowed
          aud: "https://app.example.com",
          amt: 9999,
          cur: "USD",
          scheme: "stripe",
          reference: "cs_123456",
          privateKey,
          kid: "2025-01-15T10:30:00Z",
        })
      ).rejects.toThrow("Issuer URL must start with https://");
    });

    it("should reject non-https audience URL", async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          iss: "https://api.example.com",
          aud: "http://app.example.com", // HTTP not allowed
          amt: 9999,
          cur: "USD",
          scheme: "stripe",
          reference: "cs_123456",
          privateKey,
          kid: "2025-01-15T10:30:00Z",
        })
      ).rejects.toThrow("Audience URL must start with https://");
    });

    it("should reject invalid currency code", async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          iss: "https://api.example.com",
          aud: "https://app.example.com",
          amt: 9999,
          cur: "usd", // Must be uppercase
          scheme: "stripe",
          reference: "cs_123456",
          privateKey,
          kid: "2025-01-15T10:30:00Z",
        })
      ).rejects.toThrow("Currency must be ISO 4217 uppercase");
    });

    it("should reject negative amount", async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          iss: "https://api.example.com",
          aud: "https://app.example.com",
          amt: -100, // Negative not allowed
          cur: "USD",
          scheme: "stripe",
          reference: "cs_123456",
          privateKey,
          kid: "2025-01-15T10:30:00Z",
        })
      ).rejects.toThrow("Amount must be a non-negative integer");
    });

    it("should reject non-integer amount", async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          iss: "https://api.example.com",
          aud: "https://app.example.com",
          amt: 99.99, // Must be integer
          cur: "USD",
          scheme: "stripe",
          reference: "cs_123456",
          privateKey,
          kid: "2025-01-15T10:30:00Z",
        })
      ).rejects.toThrow("Amount must be a non-negative integer");
    });

    it("should generate unique UUIDv7 for each receipt", async () => {
      const { privateKey } = await generateKeypair();

      const jws1 = await issue({
        iss: "https://api.example.com",
        aud: "https://app.example.com",
        amt: 9999,
        cur: "USD",
        scheme: "stripe",
        reference: "cs_123456",
        privateKey,
        kid: "2025-01-15T10:30:00Z",
      });

      const jws2 = await issue({
        iss: "https://api.example.com",
        aud: "https://app.example.com",
        amt: 9999,
        cur: "USD",
        scheme: "stripe",
        reference: "cs_123456",
        privateKey,
        kid: "2025-01-15T10:30:00Z",
      });

      const decoded1 = decode<PEACReceiptClaims>(jws1);
      const decoded2 = decode<PEACReceiptClaims>(jws2);

      // RIDs should be different
      expect(decoded1.payload.rid).not.toBe(decoded2.payload.rid);
    });
  });
});
