/**
 * Tests for Ed25519 JWS signing and verification
 */

import { describe, it, expect } from "vitest";
import { sign, verify, decode, generateKeypair } from "../src/jws";
import { PEAC_WIRE_TYP, PEAC_ALG } from "@peac/schema";

describe("Ed25519 JWS", () => {
  const testPayload = {
    iss: "https://api.example.com",
    aud: "https://app.example.com",
    iat: 1736934600,
    rid: "0193c4d0-0000-7000-8000-000000000000",
    amt: 9999,
    cur: "USD",
    payment: {
      scheme: "stripe",
      reference: "cs_123456",
      amount: 9999,
      currency: "USD",
    },
  };

  const testKid = "2025-01-15T10:30:00Z";

  it("should generate a valid keypair", async () => {
    const { privateKey, publicKey } = await generateKeypair();

    expect(privateKey).toBeInstanceOf(Uint8Array);
    expect(publicKey).toBeInstanceOf(Uint8Array);
    expect(privateKey.length).toBe(32);
    expect(publicKey.length).toBe(32);
  });

  it("should sign and verify a payload", async () => {
    const { privateKey, publicKey } = await generateKeypair();

    const jws = await sign(testPayload, privateKey, testKid);

    // JWS should have three parts
    expect(jws.split(".")).toHaveLength(3);

    // Verify the signature
    const result = await verify(jws, publicKey);

    expect(result.valid).toBe(true);
    expect(result.header.typ).toBe(PEAC_WIRE_TYP);
    expect(result.header.alg).toBe(PEAC_ALG);
    expect(result.header.kid).toBe(testKid);
    expect(result.payload).toEqual(testPayload);
  });

  it("should fail verification with wrong public key", async () => {
    const { privateKey } = await generateKeypair();
    const { publicKey: wrongPublicKey } = await generateKeypair();

    const jws = await sign(testPayload, privateKey, testKid);

    const result = await verify(jws, wrongPublicKey);

    expect(result.valid).toBe(false);
  });

  it("should fail verification with tampered payload", async () => {
    const { privateKey, publicKey } = await generateKeypair();

    const jws = await sign(testPayload, privateKey, testKid);

    // Tamper with the payload
    const parts = jws.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...testPayload, amt: 1 })
    ).toString("base64url");
    const tamperedJws = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const result = await verify(tamperedJws, publicKey);

    expect(result.valid).toBe(false);
  });

  it("should fail verification with tampered signature", async () => {
    const { privateKey, publicKey } = await generateKeypair();

    const jws = await sign(testPayload, privateKey, testKid);

    // Tamper with the signature (flip one bit)
    const parts = jws.split(".");
    const sigBytes = Buffer.from(parts[2], "base64url");
    sigBytes[0] ^= 0x01; // Flip one bit
    const tamperedJws = `${parts[0]}.${parts[1]}.${sigBytes.toString("base64url")}`;

    const result = await verify(tamperedJws, publicKey);

    expect(result.valid).toBe(false);
  });

  it("should decode JWS without verification", () => {
    const jws =
      "eyJ0eXAiOiJwZWFjLnJlY2VpcHQvMC45IiwiYWxnIjoiRWREU0EiLCJraWQiOiIyMDI1LTAxLTE1VDEwOjMwOjAwWiJ9.eyJpc3MiOiJodHRwczovL2FwaS5leGFtcGxlLmNvbSIsImF1ZCI6Imh0dHBzOi8vYXBwLmV4YW1wbGUuY29tIiwiaWF0IjoxNzM2OTM0NjAwLCJyaWQiOiIwMTkzYzRkMC0wMDAwLTcwMDAtODAwMC0wMDAwMDAwMDAwMDAiLCJhbXQiOjk5OTksImN1ciI6IlVTRCIsInBheW1lbnQiOnsic2NoZW1lIjoic3RyaXBlIiwicmVmZXJlbmNlIjoiY3NfMTIzNDU2IiwiYW1vdW50Ijo5OTk5LCJjdXJyZW5jeSI6IlVTRCJ9fQ.dGVzdC1zaWduYXR1cmU";

    const decoded = decode(jws);

    expect(decoded.header.typ).toBe(PEAC_WIRE_TYP);
    expect(decoded.header.alg).toBe(PEAC_ALG);
    expect(decoded.header.kid).toBe(testKid);
    expect(decoded.payload).toEqual(testPayload);
  });

  it("should reject invalid JWS format", async () => {
    const { publicKey } = await generateKeypair();

    await expect(verify("invalid", publicKey)).rejects.toThrow(
      "Invalid JWS: must have three dot-separated parts"
    );
  });

  it("should reject invalid private key length", async () => {
    const invalidKey = new Uint8Array(16); // Wrong length

    await expect(sign(testPayload, invalidKey, testKid)).rejects.toThrow(
      "Ed25519 private key must be 32 bytes"
    );
  });

  it("should reject invalid public key length", async () => {
    const invalidKey = new Uint8Array(16); // Wrong length
    const jws = "a.b.c";

    await expect(verify(jws, invalidKey)).rejects.toThrow(
      "Ed25519 public key must be 32 bytes"
    );
  });

  it("should reject wrong typ in header", async () => {
    const { publicKey } = await generateKeypair();

    // Manually create JWS with wrong typ
    const wrongHeader = {
      typ: "peac.receipt/1.0",
      alg: PEAC_ALG,
      kid: testKid,
    };
    const headerB64 = Buffer.from(JSON.stringify(wrongHeader)).toString("base64url");
    const payloadB64 = Buffer.from(JSON.stringify(testPayload)).toString("base64url");
    const jws = `${headerB64}.${payloadB64}.fake-signature`;

    await expect(verify(jws, publicKey)).rejects.toThrow(
      "Invalid typ: expected peac.receipt/0.9"
    );
  });

  it("should reject wrong alg in header", async () => {
    const { publicKey } = await generateKeypair();

    // Manually create JWS with wrong alg
    const wrongHeader = {
      typ: PEAC_WIRE_TYP,
      alg: "RS256",
      kid: testKid,
    };
    const headerB64 = Buffer.from(JSON.stringify(wrongHeader)).toString("base64url");
    const payloadB64 = Buffer.from(JSON.stringify(testPayload)).toString("base64url");
    const jws = `${headerB64}.${payloadB64}.fake-signature`;

    await expect(verify(jws, publicKey)).rejects.toThrow(
      "Invalid alg: expected EdDSA"
    );
  });
});
