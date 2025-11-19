/**
 * Tests for PEAC discovery parsing
 */

import { describe, it, expect } from "vitest";
import { parseDiscovery } from "../src/discovery";

describe("Discovery parsing", () => {
  it("should parse a valid discovery manifest", () => {
    const manifest = `
version: peac/0.9
issuer: https://api.example.com
verify: https://api.example.com/verify
jwks: https://keys.peacprotocol.org/jwks.json
payments:
  - scheme: stripe
    info: https://docs.example.com/payments/stripe
  - scheme: x402
    info: https://docs.example.com/payments/x402
aipref: https://api.example.com/.well-known/aipref.json
slos: https://api.example.com/slo
security: security@example.com
    `.trim();

    const discovery = parseDiscovery(manifest);

    expect(discovery.version).toBe("peac/0.9");
    expect(discovery.issuer).toBe("https://api.example.com");
    expect(discovery.verify).toBe("https://api.example.com/verify");
    expect(discovery.jwks).toBe("https://keys.peacprotocol.org/jwks.json");
    expect(discovery.payments).toHaveLength(2);
    expect(discovery.payments[0]).toEqual({
      scheme: "stripe",
      info: "https://docs.example.com/payments/stripe",
    });
    expect(discovery.payments[1]).toEqual({
      scheme: "x402",
      info: "https://docs.example.com/payments/x402",
    });
    expect(discovery.aipref).toBe("https://api.example.com/.well-known/aipref.json");
    expect(discovery.slos).toBe("https://api.example.com/slo");
    expect(discovery.security).toBe("security@example.com");
  });

  it("should parse minimal discovery manifest", () => {
    const manifest = `
version: peac/0.9
issuer: https://api.example.com
verify: https://api.example.com/verify
jwks: https://keys.peacprotocol.org/jwks.json
    `.trim();

    const discovery = parseDiscovery(manifest);

    expect(discovery.version).toBe("peac/0.9");
    expect(discovery.issuer).toBe("https://api.example.com");
    expect(discovery.verify).toBe("https://api.example.com/verify");
    expect(discovery.jwks).toBe("https://keys.peacprotocol.org/jwks.json");
    expect(discovery.payments).toEqual([]);
  });

  it("should skip comments and empty lines", () => {
    const manifest = `
# This is a comment
version: peac/0.9

# Issuer information
issuer: https://api.example.com

verify: https://api.example.com/verify
jwks: https://keys.peacprotocol.org/jwks.json
    `.trim();

    const discovery = parseDiscovery(manifest);

    expect(discovery.version).toBe("peac/0.9");
    expect(discovery.issuer).toBe("https://api.example.com");
  });

  it("should reject manifest exceeding 20 lines", () => {
    const lines = Array.from({ length: 25 }, (_, i) => `line${i}: value${i}`);
    const manifest = lines.join("\n");

    expect(() => parseDiscovery(manifest)).toThrow(
      "Discovery manifest exceeds 20 lines (got 25)"
    );
  });

  it("should reject manifest exceeding 2000 bytes", () => {
    const manifest = "a".repeat(2001);

    expect(() => parseDiscovery(manifest)).toThrow(
      "Discovery manifest exceeds 2000 bytes"
    );
  });

  it("should reject manifest missing version", () => {
    const manifest = `
issuer: https://api.example.com
verify: https://api.example.com/verify
jwks: https://keys.peacprotocol.org/jwks.json
    `.trim();

    expect(() => parseDiscovery(manifest)).toThrow("Missing required field: version");
  });

  it("should reject manifest missing issuer", () => {
    const manifest = `
version: peac/0.9
verify: https://api.example.com/verify
jwks: https://keys.peacprotocol.org/jwks.json
    `.trim();

    expect(() => parseDiscovery(manifest)).toThrow("Missing required field: issuer");
  });

  it("should reject manifest missing verify", () => {
    const manifest = `
version: peac/0.9
issuer: https://api.example.com
jwks: https://keys.peacprotocol.org/jwks.json
    `.trim();

    expect(() => parseDiscovery(manifest)).toThrow("Missing required field: verify");
  });

  it("should reject manifest missing jwks", () => {
    const manifest = `
version: peac/0.9
issuer: https://api.example.com
verify: https://api.example.com/verify
    `.trim();

    expect(() => parseDiscovery(manifest)).toThrow("Missing required field: jwks");
  });

  it("should handle payments without info", () => {
    const manifest = `
version: peac/0.9
issuer: https://api.example.com
verify: https://api.example.com/verify
jwks: https://keys.peacprotocol.org/jwks.json
payments:
  - scheme: stripe
  - scheme: x402
    `.trim();

    const discovery = parseDiscovery(manifest);

    expect(discovery.payments).toHaveLength(2);
    expect(discovery.payments[0]).toEqual({ scheme: "stripe" });
    expect(discovery.payments[1]).toEqual({ scheme: "x402" });
  });
});
