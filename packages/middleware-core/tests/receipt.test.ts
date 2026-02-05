/**
 * Receipt Generation Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createReceipt, createReceiptWithClaims } from '../src/receipt.js';
import { decode, verify, generateKeypair, base64urlEncode } from '@peac/crypto';
import type { MiddlewareConfig, RequestContext, ResponseContext, Ed25519PrivateJwk } from '../src/types.js';
import { HEADERS } from '@peac/kernel';
import { MIDDLEWARE_INTERACTION_KEY } from '@peac/schema';

// Test key (deterministic for testing)
function createTestKey(): Ed25519PrivateJwk {
  const publicKey = new Uint8Array(32).fill(1);
  const privateKey = new Uint8Array(32).fill(2);
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: base64urlEncode(publicKey),
    d: base64urlEncode(privateKey),
  };
}

function createTestConfig(): MiddlewareConfig {
  return {
    issuer: 'https://api.example.com',
    signingKey: createTestKey(),
    keyId: 'test-key-2026-02',
  };
}

function createTestRequest(): RequestContext {
  return {
    method: 'GET',
    path: '/api/data',
    headers: {
      host: 'api.example.com',
      'content-type': 'application/json',
    },
    timestamp: Date.now(),
  };
}

function createTestResponse(): ResponseContext {
  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json',
    },
    body: { items: [1, 2, 3] },
  };
}

describe('createReceipt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic Receipt Generation', () => {
    it('should create a valid JWS receipt', async () => {
      const config = createTestConfig();
      const request = createTestRequest();
      const response = createTestResponse();

      const result = await createReceipt(config, request, response);

      expect(result.receipt).toBeDefined();
      expect(result.receipt.split('.').length).toBe(3); // JWS has 3 parts
    });

    it('should include correct issuer in claims', async () => {
      const config = createTestConfig();
      const result = await createReceipt(config, createTestRequest(), createTestResponse());

      const { payload } = decode(result.receipt);
      expect(payload).toHaveProperty('iss', 'https://api.example.com');
    });

    it('should normalize issuer URL (remove trailing slash)', async () => {
      const config = { ...createTestConfig(), issuer: 'https://api.example.com/' };
      const result = await createReceipt(config, createTestRequest(), createTestResponse());

      const { payload } = decode(result.receipt);
      expect(payload).toHaveProperty('iss', 'https://api.example.com');
    });

    it('should include interaction binding in extensions', async () => {
      const config = createTestConfig();
      const request = { ...createTestRequest(), method: 'POST', path: '/api/users' };
      const response = { ...createTestResponse(), statusCode: 201 };
      const result = await createReceipt(config, request, response);

      const { payload } = decode(result.receipt);
      expect(payload.ext).toHaveProperty(MIDDLEWARE_INTERACTION_KEY);
      const interaction = (payload.ext as Record<string, unknown>)[MIDDLEWARE_INTERACTION_KEY] as {
        method: string;
        path: string;
        status: number;
      };
      expect(interaction.method).toBe('POST');
      expect(interaction.path).toBe('/api/users');
      expect(interaction.status).toBe(201);
    });

    it('should normalize HTTP method to uppercase', async () => {
      const config = createTestConfig();
      const request = { ...createTestRequest(), method: 'post' }; // lowercase
      const result = await createReceipt(config, request, createTestResponse());

      const { payload } = decode(result.receipt);
      const interaction = (payload.ext as Record<string, unknown>)[MIDDLEWARE_INTERACTION_KEY] as {
        method: string;
      };
      expect(interaction.method).toBe('POST'); // should be uppercase
    });

    it('should strip query string in minimal mode (default)', async () => {
      const config = createTestConfig();
      const request = {
        ...createTestRequest(),
        path: '/api/users?apiKey=secret&token=12345',
      };
      const result = await createReceipt(config, request, createTestResponse());

      const { payload } = decode(result.receipt);
      const interaction = (payload.ext as Record<string, unknown>)[MIDDLEWARE_INTERACTION_KEY] as {
        path: string;
      };
      expect(interaction.path).toBe('/api/users'); // Query string stripped
    });

    it('should include query string in full mode', async () => {
      const config: MiddlewareConfig = {
        ...createTestConfig(),
        interactionBinding: 'full',
      };
      const request = {
        ...createTestRequest(),
        path: '/api/users?page=1&limit=10',
      };
      const result = await createReceipt(config, request, createTestResponse());

      const { payload } = decode(result.receipt);
      const interaction = (payload.ext as Record<string, unknown>)[MIDDLEWARE_INTERACTION_KEY] as {
        path: string;
      };
      expect(interaction.path).toBe('/api/users?page=1&limit=10'); // Full path preserved
    });

    it('should omit interaction binding when mode is off', async () => {
      const config: MiddlewareConfig = {
        ...createTestConfig(),
        interactionBinding: 'off',
      };
      const result = await createReceipt(config, createTestRequest(), createTestResponse());

      const { payload } = decode(result.receipt);
      expect(payload.ext).toBeUndefined();
    });

    it('should derive audience from Host header', async () => {
      const config = createTestConfig();
      const request = {
        ...createTestRequest(),
        headers: { host: 'myapi.example.com' },
      };
      const result = await createReceipt(config, request, createTestResponse());

      const { payload } = decode(result.receipt);
      expect(payload).toHaveProperty('aud', 'https://myapi.example.com');
    });

    it('should handle case-insensitive headers (Host vs host)', async () => {
      const config = createTestConfig();

      // Test with uppercase Host header
      const requestUpper = {
        ...createTestRequest(),
        headers: { Host: 'upper.example.com' },
      };
      const resultUpper = await createReceipt(config, requestUpper, createTestResponse());
      const { payload: payloadUpper } = decode(resultUpper.receipt);
      expect(payloadUpper).toHaveProperty('aud', 'https://upper.example.com');

      // Test with mixed case
      const requestMixed = {
        ...createTestRequest(),
        headers: { HOST: 'mixed.example.com' },
      };
      const resultMixed = await createReceipt(config, requestMixed, createTestResponse());
      const { payload: payloadMixed } = decode(resultMixed.receipt);
      expect(payloadMixed).toHaveProperty('aud', 'https://mixed.example.com');
    });

    it('should derive audience from Origin header if Host not present', async () => {
      const config = createTestConfig();
      const request = {
        ...createTestRequest(),
        headers: { origin: 'https://client.example.com' },
      };
      const result = await createReceipt(config, request, createTestResponse());

      const { payload } = decode(result.receipt);
      expect(payload).toHaveProperty('aud', 'https://client.example.com');
    });

    it('should include iat timestamp', async () => {
      const config = createTestConfig();
      const result = await createReceipt(config, createTestRequest(), createTestResponse());

      const { payload } = decode(result.receipt);
      expect(payload).toHaveProperty('iat');
      // 2026-02-05T12:00:00Z in Unix seconds
      expect(payload.iat).toBe(Math.floor(new Date('2026-02-05T12:00:00Z').getTime() / 1000));
    });

    it('should include exp based on expiresIn', async () => {
      const config = { ...createTestConfig(), expiresIn: 600 };
      const result = await createReceipt(config, createTestRequest(), createTestResponse());

      const { payload } = decode(result.receipt);
      expect(payload).toHaveProperty('exp');
      expect(payload.exp).toBe(payload.iat + 600);
    });

    it('should use default expiresIn (300 seconds)', async () => {
      const config = createTestConfig();
      const result = await createReceipt(config, createTestRequest(), createTestResponse());

      const { payload } = decode(result.receipt);
      expect(payload.exp).toBe(payload.iat + 300);
    });

    it('should generate UUIDv7 receipt ID', async () => {
      const config = createTestConfig();
      const result = await createReceipt(config, createTestRequest(), createTestResponse());

      const { payload } = decode(result.receipt);
      expect(payload).toHaveProperty('rid');
      // UUIDv7 format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
      expect(payload.rid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should include keyId in JWS header', async () => {
      const config = { ...createTestConfig(), keyId: 'my-key-2026-02' };
      const result = await createReceipt(config, createTestRequest(), createTestResponse());

      const { header } = decode(result.receipt);
      expect(header).toHaveProperty('kid', 'my-key-2026-02');
    });
  });

  describe('Transport Selection', () => {
    it('should use header transport by default', async () => {
      const config = createTestConfig();
      const result = await createReceipt(config, createTestRequest(), createTestResponse());

      expect(result.transport).toBe('header');
      expect(result.headers[HEADERS.receipt]).toBe(result.receipt);
      expect(result.bodyWrapper).toBeUndefined();
    });

    it('should use body transport when configured', async () => {
      const config: MiddlewareConfig = { ...createTestConfig(), transport: 'body' };
      const response = createTestResponse();
      const result = await createReceipt(config, createTestRequest(), response);

      expect(result.transport).toBe('body');
      expect(result.headers).toEqual({});
      expect(result.bodyWrapper).toBeDefined();
      expect(result.bodyWrapper?.data).toEqual(response.body);
      expect(result.bodyWrapper?.peac_receipt).toBe(result.receipt);
    });

    it('should use pointer transport when configured', async () => {
      const config: MiddlewareConfig = {
        ...createTestConfig(),
        transport: 'pointer',
        pointerUrlGenerator: async (receipt) => `https://receipts.example.com/${receipt.slice(-10)}`,
      };
      const result = await createReceipt(config, createTestRequest(), createTestResponse());

      expect(result.transport).toBe('pointer');
      expect(result.headers[HEADERS.receiptPointer]).toBeDefined();
      expect(result.headers[HEADERS.receiptPointer]).toContain('sha256=');
      expect(result.headers[HEADERS.receiptPointer]).toContain('url=');
    });

    it('should fallback to body when receipt exceeds maxHeaderSize', async () => {
      const config: MiddlewareConfig = {
        ...createTestConfig(),
        transport: 'header',
        maxHeaderSize: 50, // Very small to force fallback
      };
      const result = await createReceipt(config, createTestRequest(), createTestResponse());

      expect(result.transport).toBe('body');
    });
  });

  describe('Custom Claims Generator', () => {
    it('should apply custom claims from generator', async () => {
      const config: MiddlewareConfig = {
        ...createTestConfig(),
        claimsGenerator: async () => ({
          sub: 'user:12345',
        }),
      };
      const result = await createReceipt(config, createTestRequest(), createTestResponse());

      const { payload } = decode(result.receipt);
      expect(payload).toHaveProperty('sub', 'user:12345');
    });

    it('should allow audience override from generator', async () => {
      const config: MiddlewareConfig = {
        ...createTestConfig(),
        claimsGenerator: async () => ({
          aud: 'https://custom-audience.example.com',
        }),
      };
      const result = await createReceipt(config, createTestRequest(), createTestResponse());

      const { payload } = decode(result.receipt);
      expect(payload).toHaveProperty('aud', 'https://custom-audience.example.com');
    });

    it('should merge extensions from generator', async () => {
      const config: MiddlewareConfig = {
        ...createTestConfig(),
        claimsGenerator: async () => ({
          ext: {
            'custom.namespace/data': { value: 123 },
          },
        }),
      };
      const result = await createReceipt(config, createTestRequest(), createTestResponse());

      const { payload } = decode(result.receipt);
      expect(payload).toHaveProperty('ext');
      expect(payload.ext).toHaveProperty('custom.namespace/data');
    });

    it('should pass request context to generator', async () => {
      let capturedContext: RequestContext | null = null;
      const config: MiddlewareConfig = {
        ...createTestConfig(),
        claimsGenerator: async (ctx) => {
          capturedContext = ctx;
          return {};
        },
      };
      const request = createTestRequest();
      await createReceipt(config, request, createTestResponse());

      expect(capturedContext).not.toBeNull();
      expect(capturedContext!.method).toBe(request.method);
      expect(capturedContext!.path).toBe(request.path);
    });
  });

  describe('Configuration Validation', () => {
    it('should throw ConfigError for invalid configuration', async () => {
      const config = {
        issuer: 'http://insecure.com', // Not HTTPS
        signingKey: createTestKey(),
        keyId: 'test',
      };

      await expect(createReceipt(config, createTestRequest(), createTestResponse())).rejects.toThrow(
        /Invalid middleware configuration/
      );
    });
  });
});

describe('createReceiptWithClaims', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create receipt with explicit claims', async () => {
    const config = createTestConfig();
    const result = await createReceiptWithClaims(config, {
      aud: 'https://explicit-audience.example.com',
      sub: 'explicit-subject',
    });

    const { payload } = decode(result.receipt);
    expect(payload).toHaveProperty('aud', 'https://explicit-audience.example.com');
    expect(payload).toHaveProperty('sub', 'explicit-subject');
    expect(payload).toHaveProperty('iss', 'https://api.example.com');
  });

  it('should include extensions in explicit claims', async () => {
    const config = createTestConfig();
    const result = await createReceiptWithClaims(config, {
      aud: 'https://audience.example.com',
      ext: { 'my.namespace/key': 'value' },
    });

    const { payload } = decode(result.receipt);
    expect(payload).toHaveProperty('ext');
    expect(payload.ext).toHaveProperty('my.namespace/key', 'value');
  });

  it('should wrap response body for body transport', async () => {
    const config: MiddlewareConfig = { ...createTestConfig(), transport: 'body' };
    const responseBody = { data: 'test' };
    const result = await createReceiptWithClaims(
      config,
      { aud: 'https://audience.example.com' },
      responseBody
    );

    expect(result.transport).toBe('body');
    expect(result.bodyWrapper).toBeDefined();
    expect(result.bodyWrapper?.data).toEqual(responseBody);
  });

  it('should validate configuration', async () => {
    const config = {
      issuer: 'invalid', // Not HTTPS URL
      signingKey: createTestKey(),
      keyId: 'test',
    };

    await expect(
      createReceiptWithClaims(config, { aud: 'https://audience.example.com' })
    ).rejects.toThrow(/Invalid middleware configuration/);
  });
});

describe('Edge Cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle array header values', async () => {
    const config = createTestConfig();
    const request = {
      ...createTestRequest(),
      headers: { host: ['api1.example.com', 'api2.example.com'] },
    };
    const result = await createReceipt(config, request, createTestResponse());

    const { payload } = decode(result.receipt);
    // Should use first value from array
    expect(payload).toHaveProperty('aud', 'https://api1.example.com');
  });

  it('should handle empty body response', async () => {
    const config: MiddlewareConfig = { ...createTestConfig(), transport: 'body' };
    const response = { ...createTestResponse(), body: undefined };
    const result = await createReceipt(config, createTestRequest(), response);

    expect(result.transport).toBe('body');
    // bodyWrapper should still be undefined since originalBody is undefined
    expect(result.bodyWrapper).toBeUndefined();
  });

  it('should handle async pointer URL generator', async () => {
    const config: MiddlewareConfig = {
      ...createTestConfig(),
      transport: 'pointer',
      pointerUrlGenerator: async (receipt) => {
        // Simulate async storage
        await new Promise((resolve) => setTimeout(resolve, 10));
        return `https://receipts.example.com/${receipt.slice(-8)}`;
      },
    };

    vi.useRealTimers(); // Need real timers for async
    const result = await createReceipt(config, createTestRequest(), createTestResponse());

    expect(result.transport).toBe('pointer');
    expect(result.headers['PEAC-Receipt-Pointer']).toContain('https://receipts.example.com/');
  });
});

describe('Signature Verification', () => {
  /**
   * Create a real keypair for signature verification tests
   * Unlike the deterministic test key, this produces valid Ed25519 keypairs
   */
  async function createRealTestKey(): Promise<{
    jwk: Ed25519PrivateJwk;
    publicKey: Uint8Array;
  }> {
    const { privateKey, publicKey } = await generateKeypair();
    return {
      jwk: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: base64urlEncode(publicKey),
        d: base64urlEncode(privateKey),
      },
      publicKey,
    };
  }

  it('should create receipts with valid signatures', async () => {
    const { jwk, publicKey } = await createRealTestKey();
    const config: MiddlewareConfig = {
      issuer: 'https://api.example.com',
      signingKey: jwk,
      keyId: 'test-key-2026-02',
    };
    const request = createTestRequest();
    const response = createTestResponse();

    const result = await createReceipt(config, request, response);

    // Verify the signature
    const verifyResult = await verify(result.receipt, publicKey);
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.payload).toHaveProperty('iss', 'https://api.example.com');
  });

  it('should fail verification with wrong public key', async () => {
    const { jwk } = await createRealTestKey();
    const { publicKey: wrongPublicKey } = await generateKeypair(); // Different keypair

    const config: MiddlewareConfig = {
      issuer: 'https://api.example.com',
      signingKey: jwk,
      keyId: 'test-key-2026-02',
    };
    const result = await createReceipt(config, createTestRequest(), createTestResponse());

    // Verification with wrong key should fail
    const verifyResult = await verify(result.receipt, wrongPublicKey);
    expect(verifyResult.valid).toBe(false);
  });

  it('should fail verification when payload is tampered', async () => {
    const { jwk, publicKey } = await createRealTestKey();
    const config: MiddlewareConfig = {
      issuer: 'https://api.example.com',
      signingKey: jwk,
      keyId: 'test-key-2026-02',
    };
    const result = await createReceipt(config, createTestRequest(), createTestResponse());

    // Tamper with the receipt - modify the payload
    const parts = result.receipt.split('.');
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    payload.iss = 'https://evil.example.com'; // Tamper
    const tamperedPayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const tamperedReceipt = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    // Verification of tampered receipt should fail
    const verifyResult = await verify(tamperedReceipt, publicKey);
    expect(verifyResult.valid).toBe(false);
  });

  it('should fail verification when signature is tampered', async () => {
    const { jwk, publicKey } = await createRealTestKey();
    const config: MiddlewareConfig = {
      issuer: 'https://api.example.com',
      signingKey: jwk,
      keyId: 'test-key-2026-02',
    };
    const result = await createReceipt(config, createTestRequest(), createTestResponse());

    // Tamper with the signature - flip some bits
    const parts = result.receipt.split('.');
    const signatureBytes = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    signatureBytes[0] ^= 0xff; // Flip bits
    const tamperedSig = btoa(String.fromCharCode(...signatureBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const tamperedReceipt = `${parts[0]}.${parts[1]}.${tamperedSig}`;

    // Verification of tampered receipt should fail
    const verifyResult = await verify(tamperedReceipt, publicKey);
    expect(verifyResult.valid).toBe(false);
  });
});
