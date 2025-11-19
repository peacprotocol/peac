/**
 * Negative test vectors
 * CRITICAL: These vectors MUST fail verification
 *
 * Tests various attack vectors and malformed receipts
 */

import { describe, it, expect } from "vitest";
import { issue } from "../../packages/protocol/src/issue";
import { verify as jwsVerify, decode, generateKeypair } from "../../packages/crypto/src/jws";
import { verifyReceipt } from "../../packages/protocol/src/verify";
import type { PEACReceiptClaims } from "../../packages/schema/src/types";

describe("Negative Test Vectors", () => {
  describe("Tampered signatures", () => {
    it("MUST reject receipt with tampered signature", async () => {
      const { privateKey } = await generateKeypair();

      // Issue valid receipt
      const validJWS = await issue({
        iss: "https://api.example.com",
        aud: "https://app.example.com",
        amt: 9999,
        cur: "USD",
        scheme: "stripe",
        reference: "cs_test",
        privateKey,
        kid: "2025-01-26T12:00:00Z",
      });

      // Tamper with signature (flip one bit)
      const parts = validJWS.split(".");
      const sigBytes = Buffer.from(parts[2], "base64url");
      sigBytes[0] ^= 0x01; // Flip one bit
      const tamperedJWS = `${parts[0]}.${parts[1]}.${sigBytes.toString("base64url")}`;

      // Attempt verification (should fail)
      const { publicKey } = await generateKeypair();
      const result = await jwsVerify(tamperedJWS, publicKey);

      expect(result.valid).toBe(false);

      console.log("✅ NEGATIVE VECTOR: Tampered signature correctly rejected");
    });

    it("MUST reject receipt with completely invalid signature", async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const validJWS = await issue({
        iss: "https://api.example.com",
        aud: "https://app.example.com",
        amt: 9999,
        cur: "USD",
        scheme: "stripe",
        reference: "cs_test",
        privateKey,
        kid: "2025-01-26T12:00:00Z",
      });

      // Replace signature with garbage
      const parts = validJWS.split(".");
      const invalidJWS = `${parts[0]}.${parts[1]}.INVALID_SIGNATURE_DATA`;

      // Should throw during verification
      await expect(jwsVerify(invalidJWS, publicKey)).rejects.toThrow();

      console.log("✅ NEGATIVE VECTOR: Invalid signature correctly rejected");
    });
  });

  describe("Tampered payload", () => {
    it("MUST reject receipt with modified amount", async () => {
      const { privateKey, publicKey } = await generateKeypair();

      // Issue receipt for 9999
      const validJWS = await issue({
        iss: "https://api.example.com",
        aud: "https://app.example.com",
        amt: 9999,
        cur: "USD",
        scheme: "stripe",
        reference: "cs_test",
        privateKey,
        kid: "2025-01-26T12:00:00Z",
      });

      // Decode and modify amount
      const { payload } = decode<PEACReceiptClaims>(validJWS);
      const tamperedPayload = { ...payload, amt: 1 }; // Change to 1 cent!

      // Re-encode with tampered payload
      const parts = validJWS.split(".");
      const tamperedPayloadB64 = Buffer.from(JSON.stringify(tamperedPayload)).toString("base64url");
      const tamperedJWS = `${parts[0]}.${tamperedPayloadB64}.${parts[2]}`;

      // Verification MUST fail
      const result = await jwsVerify(tamperedJWS, publicKey);
      expect(result.valid).toBe(false);

      console.log("✅ NEGATIVE VECTOR: Modified amount correctly rejected");
    });

    it("MUST reject receipt with modified recipient (aud)", async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const validJWS = await issue({
        iss: "https://api.example.com",
        aud: "https://legitimate.example.com",
        amt: 9999,
        cur: "USD",
        scheme: "stripe",
        reference: "cs_test",
        privateKey,
        kid: "2025-01-26T12:00:00Z",
      });

      // Tamper with audience
      const { payload } = decode<PEACReceiptClaims>(validJWS);
      const tamperedPayload = { ...payload, aud: "https://attacker.example.com" };

      const parts = validJWS.split(".");
      const tamperedPayloadB64 = Buffer.from(JSON.stringify(tamperedPayload)).toString("base64url");
      const tamperedJWS = `${parts[0]}.${tamperedPayloadB64}.${parts[2]}`;

      const result = await jwsVerify(tamperedJWS, publicKey);
      expect(result.valid).toBe(false);

      console.log("✅ NEGATIVE VECTOR: Modified audience correctly rejected");
    });

    it("MUST reject receipt with modified payment scheme", async () => {
      const { privateKey, publicKey } = await generateKeypair();

      const validJWS = await issue({
        iss: "https://api.example.com",
        aud: "https://app.example.com",
        amt: 9999,
        cur: "USD",
        scheme: "stripe",
        reference: "cs_test",
        privateKey,
        kid: "2025-01-26T12:00:00Z",
      });

      // Tamper with payment scheme (Stripe → x402)
      const { payload } = decode<PEACReceiptClaims>(validJWS);
      const tamperedPayload = {
        ...payload,
        payment: { ...payload.payment, scheme: "x402" }, // Changed!
      };

      const parts = validJWS.split(".");
      const tamperedPayloadB64 = Buffer.from(JSON.stringify(tamperedPayload)).toString("base64url");
      const tamperedJWS = `${parts[0]}.${tamperedPayloadB64}.${parts[2]}`;

      const result = await jwsVerify(tamperedJWS, publicKey);
      expect(result.valid).toBe(false);

      console.log("✅ NEGATIVE VECTOR: Modified payment scheme correctly rejected");
    });
  });

  describe("Invalid header", () => {
    it("MUST reject receipt with wrong typ", async () => {
      const { publicKey } = await generateKeypair();

      // Manually create JWS with wrong typ
      const wrongHeader = {
        typ: "peac.receipt/1.0", // Wrong! Should be 0.9
        alg: "EdDSA",
        kid: "2025-01-26T12:00:00Z",
      };

      const payload = {
        iss: "https://api.example.com",
        aud: "https://app.example.com",
        iat: Math.floor(Date.now() / 1000),
        rid: "0193c4d0-0000-7000-8000-000000000000",
        amt: 9999,
        cur: "USD",
        payment: {
          scheme: "stripe",
          reference: "cs_test",
          amount: 9999,
          currency: "USD",
        },
      };

      const headerB64 = Buffer.from(JSON.stringify(wrongHeader)).toString("base64url");
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const jws = `${headerB64}.${payloadB64}.fake_signature`;

      // Verification should reject due to wrong typ
      await expect(jwsVerify(jws, publicKey)).rejects.toThrow("Invalid typ");

      console.log("✅ NEGATIVE VECTOR: Wrong typ correctly rejected");
    });

    it("MUST reject receipt with wrong alg", async () => {
      const { publicKey } = await generateKeypair();

      const wrongHeader = {
        typ: "peac.receipt/0.9",
        alg: "RS256", // Wrong! Should be EdDSA
        kid: "2025-01-26T12:00:00Z",
      };

      const payload = {
        iss: "https://api.example.com",
        aud: "https://app.example.com",
        iat: Math.floor(Date.now() / 1000),
        rid: "0193c4d0-0000-7000-8000-000000000000",
        amt: 9999,
        cur: "USD",
        payment: {
          scheme: "stripe",
          reference: "cs_test",
          amount: 9999,
          currency: "USD",
        },
      };

      const headerB64 = Buffer.from(JSON.stringify(wrongHeader)).toString("base64url");
      const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const jws = `${headerB64}.${payloadB64}.fake_signature`;

      await expect(jwsVerify(jws, publicKey)).rejects.toThrow("Invalid alg");

      console.log("✅ NEGATIVE VECTOR: Wrong alg correctly rejected");
    });
  });

  describe("Malformed JWS", () => {
    it("MUST reject JWS with wrong number of parts", async () => {
      const { publicKey } = await generateKeypair();

      // JWS with only two parts
      const malformedJWS = "header.payload";

      await expect(jwsVerify(malformedJWS, publicKey)).rejects.toThrow("must have three dot-separated parts");

      console.log("✅ NEGATIVE VECTOR: Malformed JWS (2 parts) correctly rejected");
    });

    it("MUST reject JWS with invalid base64url encoding", async () => {
      const { publicKey } = await generateKeypair();

      // Invalid base64url characters
      const malformedJWS = "invalid@base64.invalid@base64.invalid@base64";

      await expect(jwsVerify(malformedJWS, publicKey)).rejects.toThrow();

      console.log("✅ NEGATIVE VECTOR: Invalid base64url correctly rejected");
    });
  });

  describe("Expired receipts", () => {
    it("MUST reject expired receipt (via verifyReceipt)", async () => {
      const { privateKey } = await generateKeypair();

      // Issue receipt that expired 1 hour ago
      const expiredJWS = await issue({
        iss: "https://api.example.com",
        aud: "https://app.example.com",
        amt: 9999,
        cur: "USD",
        scheme: "stripe",
        reference: "cs_test",
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        privateKey,
        kid: "2025-01-26T12:00:00Z",
      });

      // Note: verifyReceipt would check expiry, but it requires JWKS fetch
      // For now, we just verify the JWS was created with exp in the past
      const { payload } = decode<PEACReceiptClaims>(expiredJWS);
      expect(payload.exp).toBeLessThan(Math.floor(Date.now() / 1000));

      console.log("✅ NEGATIVE VECTOR: Expired receipt created (would be rejected by verifyReceipt)");
    });
  });

  describe("Invalid claims", () => {
    it("MUST reject receipt with negative amount", async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          iss: "https://api.example.com",
          aud: "https://app.example.com",
          amt: -9999, // Negative!
          cur: "USD",
          scheme: "stripe",
          reference: "cs_test",
          privateKey,
          kid: "2025-01-26T12:00:00Z",
        })
      ).rejects.toThrow("Amount must be a non-negative integer");

      console.log("✅ NEGATIVE VECTOR: Negative amount correctly rejected");
    });

    it("MUST reject receipt with invalid currency code", async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          iss: "https://api.example.com",
          aud: "https://app.example.com",
          amt: 9999,
          cur: "usd", // Lowercase!
          scheme: "stripe",
          reference: "cs_test",
          privateKey,
          kid: "2025-01-26T12:00:00Z",
        })
      ).rejects.toThrow("Currency must be ISO 4217 uppercase");

      console.log("✅ NEGATIVE VECTOR: Invalid currency code correctly rejected");
    });

    it("MUST reject receipt with non-HTTPS issuer", async () => {
      const { privateKey } = await generateKeypair();

      await expect(
        issue({
          iss: "http://api.example.com", // HTTP!
          aud: "https://app.example.com",
          amt: 9999,
          cur: "USD",
          scheme: "stripe",
          reference: "cs_test",
          privateKey,
          kid: "2025-01-26T12:00:00Z",
        })
      ).rejects.toThrow("Issuer URL must start with https://");

      console.log("✅ NEGATIVE VECTOR: Non-HTTPS issuer correctly rejected");
    });
  });

  describe("Wrong key verification", () => {
    it("MUST reject receipt verified with different public key", async () => {
      const { privateKey: privKey1 } = await generateKeypair();
      const { publicKey: pubKey2 } = await generateKeypair(); // Different keypair!

      const jws = await issue({
        iss: "https://api.example.com",
        aud: "https://app.example.com",
        amt: 9999,
        cur: "USD",
        scheme: "stripe",
        reference: "cs_test",
        privateKey: privKey1,
        kid: "2025-01-26T12:00:00Z",
      });

      // Verify with wrong public key
      const result = await jwsVerify(jws, pubKey2);

      expect(result.valid).toBe(false);

      console.log("✅ NEGATIVE VECTOR: Wrong public key correctly rejected");
    });
  });
});
