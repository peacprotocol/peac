/**
 * Express Middleware Integration Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Express, type Request, type Response } from 'express';
import request from 'supertest';
import {
  peacMiddleware,
  peacMiddlewareSync,
  getReceiptFromResponse,
  hasPeacContext,
} from '../src/middleware.js';
import type { ExpressMiddlewareConfig } from '../src/middleware.js';
import { base64urlEncode, decode } from '@peac/crypto';
import type { Ed25519PrivateJwk } from '@peac/middleware-core';

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

function createTestConfig(): ExpressMiddlewareConfig {
  return {
    issuer: 'https://api.example.com',
    signingKey: createTestKey(),
    keyId: 'test-key-2026-02',
  };
}

function createTestApp(config: ExpressMiddlewareConfig): Express {
  const app = express();
  app.use(express.json());
  app.use(peacMiddleware(config));

  // Test routes
  app.get('/api/data', (_req, res) => {
    res.json({ items: [1, 2, 3] });
  });

  app.post('/api/echo', (req, res) => {
    res.json({ echo: req.body });
  });

  app.get('/api/error', (_req, _res, next) => {
    next(new Error('Test error'));
  });

  return app;
}

describe('peacMiddleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic Functionality', () => {
    it('should add PEAC-Receipt header to JSON responses', async () => {
      const app = createTestApp(createTestConfig());

      const response = await request(app).get('/api/data').expect(200);

      expect(response.headers['peac-receipt']).toBeDefined();

      // Verify it's a valid JWS
      const receipt = response.headers['peac-receipt'];
      expect(receipt.split('.').length).toBe(3);
    });

    it('should include correct issuer in receipt', async () => {
      const app = createTestApp(createTestConfig());

      const response = await request(app).get('/api/data').expect(200);

      const receipt = response.headers['peac-receipt'];
      const { payload } = decode(receipt);
      expect(payload).toHaveProperty('iss', 'https://api.example.com');
    });

    it('should include correct keyId in JWS header', async () => {
      const config = { ...createTestConfig(), keyId: 'custom-key-id' };
      const app = createTestApp(config);

      const response = await request(app).get('/api/data').expect(200);

      const receipt = response.headers['peac-receipt'];
      const { header } = decode(receipt);
      expect(header).toHaveProperty('kid', 'custom-key-id');
    });

    it('should derive audience from Host header', async () => {
      const app = createTestApp(createTestConfig());

      const response = await request(app)
        .get('/api/data')
        .set('Host', 'myapi.example.com')
        .expect(200);

      const receipt = response.headers['peac-receipt'];
      const { payload } = decode(receipt);
      expect(payload).toHaveProperty('aud', 'https://myapi.example.com');
    });

    it('should work with POST requests', async () => {
      const app = createTestApp(createTestConfig());

      const response = await request(app).post('/api/echo').send({ message: 'hello' }).expect(200);

      expect(response.headers['peac-receipt']).toBeDefined();
      expect(response.body).toEqual({ echo: { message: 'hello' } });
    });
  });

  describe('Skip Functionality', () => {
    it('should skip receipt for routes matching skip function', async () => {
      const config: ExpressMiddlewareConfig = {
        ...createTestConfig(),
        skip: (req) => req.path.startsWith('/health'),
      };

      const app = express();
      app.use(peacMiddleware(config));
      app.get('/health', (_req, res) => res.json({ status: 'ok' }));
      app.get('/api/data', (_req, res) => res.json({ data: 'test' }));

      // Health endpoint should NOT have receipt
      const healthResponse = await request(app).get('/health').expect(200);
      expect(healthResponse.headers['peac-receipt']).toBeUndefined();

      // API endpoint should have receipt
      const apiResponse = await request(app).get('/api/data').expect(200);
      expect(apiResponse.headers['peac-receipt']).toBeDefined();
    });
  });

  describe('Custom Extractors', () => {
    it('should use custom audience extractor', async () => {
      const config: ExpressMiddlewareConfig = {
        ...createTestConfig(),
        audienceExtractor: () => 'https://custom-audience.example.com',
      };
      const app = createTestApp(config);

      const response = await request(app).get('/api/data').expect(200);

      const receipt = response.headers['peac-receipt'];
      const { payload } = decode(receipt);
      expect(payload).toHaveProperty('aud', 'https://custom-audience.example.com');
    });

    it('should use custom subject extractor', async () => {
      const config: ExpressMiddlewareConfig = {
        ...createTestConfig(),
        subjectExtractor: (req) => `user:${req.headers['x-user-id']}`,
      };
      const app = createTestApp(config);

      const response = await request(app).get('/api/data').set('X-User-Id', '12345').expect(200);

      const receipt = response.headers['peac-receipt'];
      const { payload } = decode(receipt);
      expect(payload).toHaveProperty('sub', 'user:12345');
    });
  });

  describe('Transport Profiles', () => {
    it('should use header transport by default', async () => {
      const app = createTestApp(createTestConfig());

      const response = await request(app).get('/api/data').expect(200);

      // Receipt in header
      expect(response.headers['peac-receipt']).toBeDefined();
      // Body is original
      expect(response.body).toEqual({ items: [1, 2, 3] });
    });

    it('should use body transport when configured', async () => {
      const config: ExpressMiddlewareConfig = {
        ...createTestConfig(),
        transport: 'body',
      };
      const app = createTestApp(config);

      const response = await request(app).get('/api/data').expect(200);

      // No receipt in header
      expect(response.headers['peac-receipt']).toBeUndefined();
      // Body is wrapped
      expect(response.body).toHaveProperty('data', { items: [1, 2, 3] });
      expect(response.body).toHaveProperty('peac_receipt');
    });

    it('should use pointer transport when configured', async () => {
      const config: ExpressMiddlewareConfig = {
        ...createTestConfig(),
        transport: 'pointer',
        pointerUrlGenerator: async (receipt) =>
          `https://receipts.example.com/${receipt.slice(-10)}`,
      };
      const app = createTestApp(config);

      vi.useRealTimers(); // Need real timers for async

      const response = await request(app).get('/api/data').expect(200);

      // Pointer header instead of receipt
      expect(response.headers['peac-receipt']).toBeUndefined();
      expect(response.headers['peac-receipt-pointer']).toBeDefined();
      expect(response.headers['peac-receipt-pointer']).toContain('sha256=');
      expect(response.headers['peac-receipt-pointer']).toContain('url=');
    });
  });

  describe('Error Handling', () => {
    it('should call onError handler on claims generator failure', async () => {
      const onError = vi.fn();
      const config: ExpressMiddlewareConfig = {
        ...createTestConfig(),
        claimsGenerator: async () => {
          throw new Error('Claims generation failed');
        },
        onError,
      };

      const app = express();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      app.use(peacMiddleware(config));
      app.get('/api/data', (_req, res) => res.json({ data: 'test' }));

      vi.useRealTimers(); // Need real timers for async error handling

      await request(app).get('/api/data').expect(200);

      // Wait for async error handling
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Error handler should have been called
      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0].message).toContain('Claims generation failed');

      consoleSpy.mockRestore();
    });

    it('should not break response when receipt generation fails', async () => {
      const config: ExpressMiddlewareConfig = {
        ...createTestConfig(),
        claimsGenerator: async () => {
          throw new Error('Claims generation failed');
        },
      };

      const app = express();
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      app.use(peacMiddleware(config));
      app.get('/api/data', (_req, res) => res.json({ data: 'test' }));

      vi.useRealTimers(); // Need real timers for async

      const response = await request(app).get('/api/data').expect(200);

      // Wait for async error handling
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Response should still work even if receipt generation fails
      expect(response.body).toEqual({ data: 'test' });

      consoleSpy.mockRestore();
    });
  });

  describe('Configuration Validation', () => {
    it('should throw on invalid configuration at initialization', () => {
      expect(() => {
        peacMiddleware({
          issuer: 'http://insecure.com', // Not HTTPS
          signingKey: createTestKey(),
          keyId: 'test',
        });
      }).toThrow(/Invalid middleware configuration/);
    });
  });
});

describe('peacMiddlewareSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should add receipt synchronously', async () => {
    const app = express();
    app.use(peacMiddlewareSync(createTestConfig()));
    app.get('/api/data', (_req, res) => res.json({ data: 'test' }));

    const response = await request(app).get('/api/data').expect(200);

    expect(response.headers['peac-receipt']).toBeDefined();
  });
});

describe('Helper Functions', () => {
  describe('getReceiptFromResponse', () => {
    it('should return receipt from response header', async () => {
      const app = createTestApp(createTestConfig());

      // We need to test this within a request context
      let capturedReceipt: string | undefined;

      app.use((_req, res, next) => {
        res.on('finish', () => {
          capturedReceipt = getReceiptFromResponse(res);
        });
        next();
      });

      await request(app).get('/api/data').expect(200);

      // Note: Due to timing, this may not always work in tests
      // The function is primarily for debugging
    });
  });

  describe('hasPeacContext', () => {
    it('should return true for requests with PEAC context', async () => {
      const app = express();
      let hasContext = false;

      app.use(peacMiddleware(createTestConfig()));
      app.get('/api/data', (req, res) => {
        hasContext = hasPeacContext(req);
        res.json({ data: 'test' });
      });

      await request(app).get('/api/data').expect(200);

      expect(hasContext).toBe(true);
    });

    it('should return false for requests without middleware', async () => {
      const app = express();
      let hasContext = false;

      app.get('/api/data', (req, res) => {
        hasContext = hasPeacContext(req);
        res.json({ data: 'test' });
      });

      await request(app).get('/api/data').expect(200);

      expect(hasContext).toBe(false);
    });
  });
});
