/**
 * @peac/adapter-openclaw - Plugin Tests
 *
 * Tests for plugin entry point utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createJwkSigner,
  resolveSigner,
  generateKeyId,
  createFileReceiptWriter,
  createPluginInstance,
  type JWK,
  type CreatePluginOptions,
} from '../src/plugin.js';
import type { Signer, ReceiptWriter, SignedReceipt } from '../src/emitter.js';
import type {
  SpoolStore,
  DedupeIndex,
  SpoolEntry,
  DedupeEntry,
  CapturedAction,
} from '@peac/capture-core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// =============================================================================
// Test Fixtures
// =============================================================================

// Valid Ed25519 test key (NOT for production use)
const TEST_JWK: JWK = {
  kty: 'OKP',
  crv: 'Ed25519',
  // These are test values, NOT real key material
  x: 'test_public_key_base64url_encoded_value_x',
  d: 'test_private_key_base64url_encoded_value_d',
  kid: 'test-key-id',
  alg: 'EdDSA',
  use: 'sig',
};

const TEST_ISSUER = 'https://test-issuer.example.com';
const TEST_AUDIENCE = 'https://test-audience.example.com';

function createMockSpoolStore(): SpoolStore {
  const entries: SpoolEntry[] = [];
  let headDigest = '0'.repeat(64);
  let sequence = 0;

  return {
    async append(entry: Omit<SpoolEntry, 'sequence' | 'prev_entry_digest' | 'entry_digest'>) {
      sequence++;
      const spoolEntry: SpoolEntry = {
        ...entry,
        sequence,
        prev_entry_digest: headDigest,
        entry_digest: `entry_${sequence}_digest`,
      };
      entries.push(spoolEntry);
      headDigest = spoolEntry.entry_digest;
      return spoolEntry;
    },
    async commit(): Promise<void> {
      // No-op for in-memory
    },
    async read(offset: number, limit: number): Promise<SpoolEntry[]> {
      return entries.slice(offset, offset + limit);
    },
    async getHeadDigest(): Promise<string> {
      return headDigest;
    },
    async getSequence(): Promise<number> {
      return sequence;
    },
    async close(): Promise<void> {
      // No-op for in-memory
    },
    // Test helper
    getAllEntries(): SpoolEntry[] {
      return [...entries];
    },
  } as SpoolStore & { getAllEntries(): SpoolEntry[] };
}

function createMockDedupeIndex(): DedupeIndex {
  const index = new Map<string, DedupeEntry>();

  return {
    async get(id: string): Promise<DedupeEntry | undefined> {
      return index.get(id);
    },
    async set(id: string, entry: DedupeEntry): Promise<void> {
      index.set(id, entry);
    },
    async has(id: string): Promise<boolean> {
      return index.has(id);
    },
    async markEmitted(id: string, receiptPath: string): Promise<void> {
      const existing = index.get(id);
      if (existing) {
        index.set(id, { ...existing, receipt_path: receiptPath });
      }
    },
    async delete(id: string): Promise<boolean> {
      return index.delete(id);
    },
    async size(): Promise<number> {
      return index.size;
    },
    async clear(): Promise<void> {
      index.clear();
    },
  };
}

function createMockSigner(): Signer {
  return {
    async sign(payload: unknown): Promise<string> {
      return `signed_${JSON.stringify(payload).slice(0, 20)}`;
    },
    getKeyId(): string {
      return 'test-key-id';
    },
    getIssuer(): string {
      return TEST_ISSUER;
    },
    getAudience(): string | undefined {
      return TEST_AUDIENCE;
    },
  };
}

function createMockWriter(): ReceiptWriter & { receipts: SignedReceipt[] } {
  const receipts: SignedReceipt[] = [];
  return {
    receipts,
    async write(receipt: SignedReceipt): Promise<string> {
      receipts.push(receipt);
      return `/receipts/${receipt.rid}.json`;
    },
    async close(): Promise<void> {
      // No-op
    },
  };
}

// =============================================================================
// JWK Signer Tests
// =============================================================================

describe('createJwkSigner', () => {
  it('creates a signer with provided key ID', () => {
    const signer = createJwkSigner(TEST_JWK, TEST_ISSUER, TEST_AUDIENCE);

    expect(signer.getKeyId()).toBe('test-key-id');
    expect(signer.getIssuer()).toBe(TEST_ISSUER);
    expect(signer.getAudience()).toBe(TEST_AUDIENCE);
  });

  it('generates key ID if not provided', () => {
    const jwkWithoutKid: JWK = {
      ...TEST_JWK,
      kid: undefined,
    };

    const signer = createJwkSigner(jwkWithoutKid, TEST_ISSUER);

    expect(signer.getKeyId()).toMatch(/^k_[0-9a-f]{8}$/);
  });

  it('throws if private key (d parameter) is missing', () => {
    const jwkWithoutD: JWK = {
      ...TEST_JWK,
      d: undefined,
    };

    expect(() => createJwkSigner(jwkWithoutD, TEST_ISSUER)).toThrow(
      'JWK must include private key (d parameter)'
    );
  });

  it('audience is optional', () => {
    const signer = createJwkSigner(TEST_JWK, TEST_ISSUER);

    expect(signer.getAudience()).toBeUndefined();
  });
});

// =============================================================================
// resolveSigner Tests
// =============================================================================

describe('resolveSigner', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('resolves signer from env: scheme', async () => {
    process.env.TEST_KEY = JSON.stringify(TEST_JWK);

    const signer = await resolveSigner('env:TEST_KEY', TEST_ISSUER, TEST_AUDIENCE);

    expect(signer.getKeyId()).toBe('test-key-id');
    expect(signer.getIssuer()).toBe(TEST_ISSUER);
  });

  it('throws if env var not set', async () => {
    await expect(resolveSigner('env:NONEXISTENT_KEY', TEST_ISSUER)).rejects.toThrow(
      'Environment variable NONEXISTENT_KEY not set for signing key'
    );
  });

  it('throws for keychain: scheme (not yet implemented)', async () => {
    await expect(resolveSigner('keychain:my-key', TEST_ISSUER)).rejects.toThrow(
      'Keychain signing not yet implemented'
    );
  });

  it('throws for sidecar: scheme (not yet implemented)', async () => {
    await expect(resolveSigner('sidecar:unix:///tmp/socket', TEST_ISSUER)).rejects.toThrow(
      'Sidecar signing not yet implemented'
    );
  });

  it('throws for unknown scheme', async () => {
    await expect(resolveSigner('unknown:value', TEST_ISSUER)).rejects.toThrow(
      'Unknown key reference scheme: unknown'
    );
  });

  it('throws for invalid format (no colon)', async () => {
    await expect(resolveSigner('invalid', TEST_ISSUER)).rejects.toThrow(
      'Invalid key reference format: invalid'
    );
  });
});

// =============================================================================
// generateKeyId Tests
// =============================================================================

describe('generateKeyId', () => {
  it('generates deterministic key ID from public key', () => {
    const kid1 = generateKeyId(TEST_JWK);
    const kid2 = generateKeyId(TEST_JWK);

    expect(kid1).toBe(kid2);
    expect(kid1).toMatch(/^k_[0-9a-f]{8}$/);
  });

  it('generates different IDs for different keys', () => {
    const jwk1: JWK = { ...TEST_JWK, x: 'public_key_one' };
    const jwk2: JWK = { ...TEST_JWK, x: 'public_key_two' };

    const kid1 = generateKeyId(jwk1);
    const kid2 = generateKeyId(jwk2);

    expect(kid1).not.toBe(kid2);
  });

  it('handles missing x parameter', () => {
    const jwkWithoutX: JWK = { ...TEST_JWK, x: undefined };

    const kid = generateKeyId(jwkWithoutX);

    expect(kid).toMatch(/^k_[0-9a-f]{8}$/);
  });
});

// =============================================================================
// createFileReceiptWriter Tests
// =============================================================================

describe('createFileReceiptWriter', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'peac-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates output directory if it does not exist', async () => {
    const outputDir = path.join(tempDir, 'receipts', 'nested');

    await createFileReceiptWriter(outputDir);

    expect(fs.existsSync(outputDir)).toBe(true);
  });

  it('writes receipt to file', async () => {
    const outputDir = path.join(tempDir, 'receipts');
    const writer = await createFileReceiptWriter(outputDir);

    // Build a mock JWS with a valid base64url-encoded payload
    const mockPayload = {
      rid: 'r_test123',
      iss: 'https://test.example.com',
      iat: 1234567890,
      evidence: {
        extensions: {
          'org.peacprotocol/interaction@0.1': {
            interaction_id: 'test_interaction',
          },
        },
      },
    };
    const payloadB64 = Buffer.from(JSON.stringify(mockPayload)).toString('base64url');
    const mockJws = `eyJhbGciOiJFZERTQSJ9.${payloadB64}.dGVzdC1zaWduYXR1cmU`;

    const receipt: SignedReceipt = {
      rid: 'r_test123',
      interaction_id: 'test_interaction',
      entry_digest: 'abc123',
      jws: mockJws,
    };

    const filePath = await writer.write(receipt);

    expect(filePath).toContain('r_test123.peac.json');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(content.auth.rid).toBe('r_test123');
    expect(content.auth.iss).toBe('https://test.example.com');
    expect(content.evidence.extensions['org.peacprotocol/interaction@0.1'].interaction_id).toBe(
      'test_interaction'
    );
    expect(content._jws).toBe(mockJws);
  });

  it('close is a no-op', async () => {
    const outputDir = path.join(tempDir, 'receipts');
    const writer = await createFileReceiptWriter(outputDir);

    await expect(writer.close()).resolves.not.toThrow();
  });
});

// =============================================================================
// createPluginInstance Tests
// =============================================================================

describe('createPluginInstance', () => {
  it('creates a plugin instance with required options', async () => {
    const store = createMockSpoolStore();
    const dedupe = createMockDedupeIndex();
    const writer = createMockWriter();
    const signer = createMockSigner();

    const options: CreatePluginOptions = {
      signer,
      writer,
      store,
      dedupe,
    };

    const plugin = await createPluginInstance(options);

    expect(plugin.session).toBeDefined();
    expect(plugin.hookHandler).toBeDefined();
    expect(plugin.backgroundService).toBeDefined();
    expect(plugin.start).toBeInstanceOf(Function);
    expect(plugin.stop).toBeInstanceOf(Function);
    expect(plugin.getStats).toBeInstanceOf(Function);
  });

  it('starts and stops the background service', async () => {
    const store = createMockSpoolStore();
    const dedupe = createMockDedupeIndex();
    const writer = createMockWriter();
    const signer = createMockSigner();

    const plugin = await createPluginInstance({
      signer,
      writer,
      store,
      dedupe,
    });

    const statsBefore = plugin.getStats();
    expect(statsBefore.isRunning).toBe(false);

    plugin.start();
    const statsRunning = plugin.getStats();
    expect(statsRunning.isRunning).toBe(true);

    await plugin.stop();
    const statsAfter = plugin.getStats();
    expect(statsAfter.isRunning).toBe(false);
  });

  it('tracks stats through plugin lifecycle', async () => {
    const store = createMockSpoolStore();
    const dedupe = createMockDedupeIndex();
    const writer = createMockWriter();
    const signer = createMockSigner();

    const plugin = await createPluginInstance({
      signer,
      writer,
      store,
      dedupe,
    });

    const stats = plugin.getStats();

    expect(stats.totalCaptured).toBe(0);
    expect(stats.duplicatesSkipped).toBe(0);
    expect(stats.pendingCount).toBe(0);
    expect(stats.totalEmitted).toBe(0);
    expect(stats.totalErrors).toBe(0);
    expect(stats.keyId).toBe('test-key-id');
  });

  it('accepts custom drain interval and batch size', async () => {
    const store = createMockSpoolStore();
    const dedupe = createMockDedupeIndex();
    const writer = createMockWriter();
    const signer = createMockSigner();

    const plugin = await createPluginInstance({
      signer,
      writer,
      store,
      dedupe,
      drainIntervalMs: 500,
      batchSize: 50,
    });

    // Should not throw
    expect(plugin).toBeDefined();
  });

  it('invokes onError callback on errors', async () => {
    const store = createMockSpoolStore();
    const dedupe = createMockDedupeIndex();
    const writer = createMockWriter();
    const signer = createMockSigner();

    const onError = vi.fn();
    const plugin = await createPluginInstance({
      signer,
      writer,
      store,
      dedupe,
      onError,
    });

    // onError should be set up but not called yet
    expect(onError).not.toHaveBeenCalled();
    expect(plugin).toBeDefined();
  });
});
