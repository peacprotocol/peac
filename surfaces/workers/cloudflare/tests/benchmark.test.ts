/**
 * Benchmark tests for verification performance.
 *
 * Target: verify < 5ms (excludes cold fetch).
 */

import { describe, it, expect } from 'vitest';
import { parseConfig, matchesBypassPath } from '../src/config.js';
import { createErrorResponse, ErrorCodes } from '../src/errors.js';
import { NoOpReplayStore } from '../src/replay-store.js';
import type { ReplayContext } from '../src/types.js';

describe('benchmark: config parsing', () => {
  it('should parse config in under 1ms', () => {
    const env = {
      ISSUER_ALLOWLIST:
        'https://issuer1.example.com,https://issuer2.example.com,https://issuer3.example.com',
      BYPASS_PATHS: '/health,/metrics,/api/v1/public/*',
      UNSAFE_ALLOW_UNKNOWN_TAGS: 'false',
    };

    const iterations = 1000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      parseConfig(env as any);
    }

    const elapsed = performance.now() - start;
    const perIteration = elapsed / iterations;

    expect(perIteration).toBeLessThan(1);
    console.log(`Config parsing: ${perIteration.toFixed(4)}ms per iteration`);
  });
});

describe('benchmark: path matching', () => {
  it('should match paths in under 0.1ms', () => {
    const bypassPaths = ['/health', '/metrics', '/api/v1/public/*', '*.json', '/status'];

    const testPaths = [
      '/health',
      '/metrics',
      '/api/v1/public/data',
      '/data.json',
      '/api/v1/protected',
      '/not-a-bypass',
    ];

    const iterations = 10000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      for (const path of testPaths) {
        matchesBypassPath(path, bypassPaths);
      }
    }

    const elapsed = performance.now() - start;
    const perIteration = elapsed / iterations / testPaths.length;

    expect(perIteration).toBeLessThan(0.1);
    console.log(`Path matching: ${perIteration.toFixed(6)}ms per iteration`);
  });
});

describe('benchmark: error response creation', () => {
  it('should create error responses in under 1ms', () => {
    const iterations = 1000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      createErrorResponse(
        ErrorCodes.TAP_SIGNATURE_INVALID,
        'Signature verification failed',
        'https://api.example.com/resource'
      );
    }

    const elapsed = performance.now() - start;
    const perIteration = elapsed / iterations;

    expect(perIteration).toBeLessThan(1);
    console.log(`Error response creation: ${perIteration.toFixed(4)}ms per iteration`);
  });
});

describe('benchmark: replay store', () => {
  it('should check nonces in under 0.1ms (NoOp)', async () => {
    const store = new NoOpReplayStore();
    const iterations = 10000;

    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      const ctx: ReplayContext = {
        issuer: 'https://issuer.example.com',
        keyid: 'https://issuer.example.com/.well-known/jwks.json#key-1',
        nonce: `nonce-${i}`,
        ttlSeconds: 480,
      };
      await store.seen(ctx);
    }

    const elapsed = performance.now() - start;
    const perIteration = elapsed / iterations;

    expect(perIteration).toBeLessThan(0.1);
    console.log(`NoOp replay check: ${perIteration.toFixed(6)}ms per iteration`);
  });
});
