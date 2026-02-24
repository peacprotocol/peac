import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeypair, base64urlDecodeString, verify, sha256Hex } from '@peac/crypto';
import { issue } from '@peac/protocol';
import { handleCreateBundle } from '../../src/handlers/bundle.js';
import type { HandlerParams } from '../../src/handlers/types.js';
import type { BundleInput } from '../../src/schemas/bundle.js';
import { getDefaultPolicy } from '../../src/infra/policy.js';

let testDir: string;
beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'bundle-test-'));
});
afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

async function makeIssuerContext(bundleDirPath: string) {
  const { privateKey, publicKey } = await generateKeypair();
  const kid = 'test-kid-' + Date.now();
  return {
    version: '0.11.2',
    policyHash: 'testhash',
    protocolVersion: '2025-11-25',
    issuerKey: { privateKey, publicKey, kid },
    issuerId: 'https://api.example.com',
    bundleDir: bundleDirPath,
  };
}

async function createTestReceipts(count: number): Promise<string[]> {
  const { privateKey } = await generateKeypair();
  const receipts: string[] = [];
  for (let i = 0; i < count; i++) {
    const { jws } = await issue({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 100 + i,
      cur: 'USD',
      rail: 'stripe',
      reference: `tx_bundle_${i}_${Date.now()}`,
      privateKey,
      kid: 'bundle-test-kid',
    });
    receipts.push(jws);
  }
  return receipts;
}

describe('handlers/bundle', () => {
  it('valid bundle with 3 receipts creates expected files on disk', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(3);
    const policy = getDefaultPolicy();
    const input: BundleInput = { receipts };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.isError).toBeUndefined();
    expect(result.structured.ok).toBe(true);

    const bundleName = result.structured.bundleName as string;
    const bundlePath = join(testDir, bundleName);

    // Top-level files
    const manifestJson = await readFile(join(bundlePath, 'manifest.json'), 'utf-8');
    expect(manifestJson).toBeTruthy();

    const manifestJws = await readFile(join(bundlePath, 'manifest.jws'), 'utf-8');
    expect(manifestJws).toBeTruthy();

    // Receipt files are named by sha256 hash
    const manifest = JSON.parse(manifestJson) as {
      receipts: Array<{ sha256: string; file: string }>;
    };
    expect(manifest.receipts).toHaveLength(3);
    for (const entry of manifest.receipts) {
      const receiptContent = await readFile(join(bundlePath, entry.file), 'utf-8');
      expect(receiptContent).toBeTruthy();
      expect(entry.file).toMatch(/^receipts\/[a-f0-9]{64}\.jws$/);
    }

    // fileCount: 3 receipts + manifest.json + manifest.jws = 5
    expect(result.structured.fileCount).toBe(5);
  });

  it('manifest.json keys are canonically sorted at all levels', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(2);
    const policy = getDefaultPolicy();
    const input: BundleInput = { receipts, metadata: { z_last: 1, a_first: 2 } };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.structured.ok).toBe(true);

    const bundlePath = join(testDir, result.structured.bundleName as string);
    const raw = await readFile(join(bundlePath, 'manifest.json'), 'utf-8');

    // Parse and verify top-level keys are sorted
    const manifest = JSON.parse(raw) as Record<string, unknown>;
    const keys = Object.keys(manifest);
    const sortedKeys = [...keys].sort();
    expect(keys).toEqual(sortedKeys);

    // Verify metadata sub-keys are sorted
    const metadata = manifest.metadata as Record<string, unknown>;
    const metaKeys = Object.keys(metadata);
    expect(metaKeys).toEqual([...metaKeys].sort());

    // Verify file ends with newline
    expect(raw.endsWith('\n')).toBe(true);
  });

  it('manifest receipts are sorted by sha256', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(3);
    const policy = getDefaultPolicy();
    const input: BundleInput = { receipts };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.structured.ok).toBe(true);

    const bundlePath = join(testDir, result.structured.bundleName as string);
    const manifestJson = await readFile(join(bundlePath, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(manifestJson) as {
      receipts: Array<{ sha256: string; index: number; file: string; length: number }>;
    };

    const sha256Values = manifest.receipts.map((r) => r.sha256);
    const sorted = [...sha256Values].sort((a, b) => a.localeCompare(b));
    expect(sha256Values).toEqual(sorted);
  });

  it('manifest includes tool_version and policy_hash', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(2);
    const policy = getDefaultPolicy();
    const input: BundleInput = { receipts };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.structured.ok).toBe(true);

    const bundlePath = join(testDir, result.structured.bundleName as string);
    const manifestJson = await readFile(join(bundlePath, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(manifestJson) as Record<string, unknown>;

    expect(manifest.tool_version).toBeDefined();
    expect(typeof manifest.tool_version).toBe('string');
    expect(manifest.policy_hash).toBeDefined();
    expect(typeof manifest.policy_hash).toBe('string');
  });

  it('manifest.jws is verifiable with the issuer public key', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(2);
    const policy = getDefaultPolicy();
    const input: BundleInput = { receipts };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.structured.ok).toBe(true);

    const bundlePath = join(testDir, result.structured.bundleName as string);
    const manifestJwsContent = await readFile(join(bundlePath, 'manifest.jws'), 'utf-8');

    // Verify the manifest JWS signature using the issuer public key
    const verifyResult = await verify(manifestJwsContent, context.issuerKey.publicKey);
    expect(verifyResult.valid).toBe(true);

    // Check that the payload matches the manifest.json content
    const manifestJson = await readFile(join(bundlePath, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(manifestJson);
    expect(verifyResult.payload).toEqual(manifest);
  });

  it('path traversal with ../evil is rejected with E_MCP_PATH_TRAVERSAL', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(1);
    const policy = getDefaultPolicy();
    const input: BundleInput = { receipts, output_path: '../evil' };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.isError).toBe(true);
    expect(result.structured.ok).toBe(false);
    expect(result.structured.code).toBe('E_MCP_PATH_TRAVERSAL');
  });

  it('absolute path is rejected with E_MCP_PATH_TRAVERSAL', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(1);
    const policy = getDefaultPolicy();
    const input: BundleInput = { receipts, output_path: '/tmp/evil' };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.isError).toBe(true);
    expect(result.structured.ok).toBe(false);
    expect(result.structured.code).toBe('E_MCP_PATH_TRAVERSAL');
  });

  it('multi-segment path is rejected with E_MCP_PATH_TRAVERSAL', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(1);
    const policy = getDefaultPolicy();
    const input: BundleInput = { receipts, output_path: 'a/b/c' };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.isError).toBe(true);
    expect(result.structured.ok).toBe(false);
    expect(result.structured.code).toBe('E_MCP_PATH_TRAVERSAL');
  });

  it('no bundleDir returns E_MCP_BUNDLE_DIR_REQUIRED', async () => {
    const { privateKey, publicKey } = await generateKeypair();
    const kid = 'test-kid-' + Date.now();
    const context = {
      version: '0.11.2',
      policyHash: 'testhash',
      protocolVersion: '2025-11-25',
      issuerKey: { privateKey, publicKey, kid },
      issuerId: 'https://api.example.com',
      // bundleDir intentionally omitted
    };
    const receipts = await createTestReceipts(1);
    const policy = getDefaultPolicy();
    const input: BundleInput = { receipts };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.isError).toBe(true);
    expect(result.structured.ok).toBe(false);
    expect(result.structured.code).toBe('E_MCP_BUNDLE_DIR_REQUIRED');
  });

  it('no issuerKey returns E_MCP_KEY_REQUIRED', async () => {
    const context = {
      version: '0.11.2',
      policyHash: 'testhash',
      protocolVersion: '2025-11-25',
      issuerId: 'https://api.example.com',
      bundleDir: testDir,
      // issuerKey intentionally omitted
    };
    const receipts = await createTestReceipts(1);
    const policy = getDefaultPolicy();
    const input: BundleInput = { receipts };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.isError).toBe(true);
    expect(result.structured.ok).toBe(false);
    expect(result.structured.code).toBe('E_MCP_KEY_REQUIRED');
  });

  it('too many receipts rejected with E_MCP_INPUT_TOO_LARGE', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(3);
    const policy = getDefaultPolicy();
    policy.limits.max_bundle_receipts = 2;
    const input: BundleInput = { receipts };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.isError).toBe(true);
    expect(result.structured.ok).toBe(false);
    expect(result.structured.code).toBe('E_MCP_INPUT_TOO_LARGE');
  });

  it('tool disabled returns E_MCP_TOOL_DISABLED', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(1);
    const policy = getDefaultPolicy();
    policy.tools.peac_create_bundle = { enabled: false };
    const input: BundleInput = { receipts };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.isError).toBe(true);
    expect(result.structured.ok).toBe(false);
    expect(result.structured.code).toBe('E_MCP_TOOL_DISABLED');
  });

  it('custom metadata appears in manifest on disk', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(2);
    const policy = getDefaultPolicy();
    const input: BundleInput = { receipts, metadata: { source: 'test' } };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.structured.ok).toBe(true);

    const bundlePath = join(testDir, result.structured.bundleName as string);
    const manifestJson = await readFile(join(bundlePath, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(manifestJson) as Record<string, unknown>;

    expect(manifest.metadata).toEqual({ source: 'test' });
  });

  it('structured output returns metadata only (no full manifest)', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(2);
    const policy = getDefaultPolicy();
    const input: BundleInput = { receipts };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.structured.ok).toBe(true);

    // Metadata fields present
    expect(typeof result.structured.bundleId).toBe('string');
    expect(result.structured.bundleId).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof result.structured.bundleName).toBe('string');
    expect(result.structured.receiptCount).toBe(2);
    expect(result.structured.fileCount).toBe(4); // 2 receipts + manifest.json + manifest.jws
    expect(typeof result.structured.totalBytes).toBe('number');
    expect(typeof result.structured.createdAt).toBe('string');
    expect(result.structured.manifestSha256).toMatch(/^[a-f0-9]{64}$/);

    // Full manifest and manifestJws NOT in structured output
    expect(result.structured.manifest).toBeUndefined();
    expect(result.structured.manifestJws).toBeUndefined();
  });

  it('default output_path includes bundle- prefix', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(1);
    const policy = getDefaultPolicy();
    const input: BundleInput = { receipts };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.structured.ok).toBe(true);

    const bundleName = result.structured.bundleName as string;
    expect(bundleName).toMatch(/^bundle-/);
  });

  it('bundle_id is deterministic for same receipts and policy', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(2);
    const policy = getDefaultPolicy();

    // Create two bundles with the same receipts (different output names)
    const result1 = await handleCreateBundle({
      input: { receipts, output_path: 'bundle-a' },
      policy,
      context,
    });
    const result2 = await handleCreateBundle({
      input: { receipts, output_path: 'bundle-b' },
      policy,
      context,
    });

    expect(result1.structured.ok).toBe(true);
    expect(result2.structured.ok).toBe(true);

    // Same receipts + same policy_hash = same bundle_id
    expect(result1.structured.bundleId).toBe(result2.structured.bundleId);
  });

  it('bundle_id differs for different receipts', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(3);
    const policy = getDefaultPolicy();

    const result1 = await handleCreateBundle({
      input: { receipts: receipts.slice(0, 2), output_path: 'bundle-c' },
      policy,
      context,
    });
    const result2 = await handleCreateBundle({
      input: { receipts: receipts.slice(1, 3), output_path: 'bundle-d' },
      policy,
      context,
    });

    expect(result1.structured.ok).toBe(true);
    expect(result2.structured.ok).toBe(true);
    expect(result1.structured.bundleId).not.toBe(result2.structured.bundleId);
  });

  it('bundle_id appears in manifest on disk', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(1);
    const policy = getDefaultPolicy();
    const input: BundleInput = { receipts };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.structured.ok).toBe(true);

    const bundlePath = join(testDir, result.structured.bundleName as string);
    const manifestJson = await readFile(join(bundlePath, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(manifestJson) as Record<string, unknown>;

    expect(manifest.bundle_id).toBe(result.structured.bundleId);
  });

  it('manifest.jws payload matches manifest.json semantic content', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(2);
    const policy = getDefaultPolicy();
    const input: BundleInput = { receipts };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.structured.ok).toBe(true);

    const bundlePath = join(testDir, result.structured.bundleName as string);

    // Read manifest.json from disk
    const manifestJsonOnDisk = await readFile(join(bundlePath, 'manifest.json'), 'utf-8');
    const manifestFromDisk = JSON.parse(manifestJsonOnDisk);

    // Decode manifest.jws payload without verification
    const manifestJwsContent = await readFile(join(bundlePath, 'manifest.jws'), 'utf-8');
    const parts = manifestJwsContent.split('.');
    const payloadJson = base64urlDecodeString(parts[1]);
    const manifestFromJws = JSON.parse(payloadJson);

    // Semantic equivalence: JWS payload matches file content
    expect(manifestFromJws).toEqual(manifestFromDisk);
  });

  it('generated bundle names are unique across multiple calls', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(1);
    const policy = getDefaultPolicy();

    const names = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const result = await handleCreateBundle({
        input: { receipts },
        policy,
        context,
      });
      expect(result.structured.ok).toBe(true);
      names.add(result.structured.bundleName as string);
    }

    // All 5 names should be unique (randomUUID-based suffix)
    expect(names.size).toBe(5);
  });

  it('bundle_id and manifest entry order are invariant under receipt permutation', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(3);
    const policy = getDefaultPolicy();

    // Forward order
    const result1 = await handleCreateBundle({
      input: { receipts, output_path: 'bundle-fwd' },
      policy,
      context,
    });
    // Reversed order
    const result2 = await handleCreateBundle({
      input: { receipts: [...receipts].reverse(), output_path: 'bundle-rev' },
      policy,
      context,
    });

    expect(result1.structured.ok).toBe(true);
    expect(result2.structured.ok).toBe(true);

    // Same bundle_id regardless of input order
    expect(result1.structured.bundleId).toBe(result2.structured.bundleId);

    // Same manifest entry order (sorted by sha256, not input order)
    const manifest1 = JSON.parse(
      await readFile(join(testDir, 'bundle-fwd', 'manifest.json'), 'utf-8')
    ) as { receipts: Array<{ sha256: string; file: string }> };
    const manifest2 = JSON.parse(
      await readFile(join(testDir, 'bundle-rev', 'manifest.json'), 'utf-8')
    ) as { receipts: Array<{ sha256: string; file: string }> };

    const hashes1 = manifest1.receipts.map((r) => r.sha256);
    const hashes2 = manifest2.receipts.map((r) => r.sha256);
    expect(hashes1).toEqual(hashes2);

    // Same file names
    const files1 = manifest1.receipts.map((r) => r.file);
    const files2 = manifest2.receipts.map((r) => r.file);
    expect(files1).toEqual(files2);
  });

  it('cancellation via pre-aborted signal returns E_MCP_CANCELLED and cleans up', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(3);
    const policy = getDefaultPolicy();
    const input: BundleInput = { receipts };

    // Create a pre-aborted signal
    const controller = new AbortController();
    controller.abort();

    const params: HandlerParams<BundleInput> = {
      input,
      policy,
      context,
      signal: controller.signal,
    };
    const result = await handleCreateBundle(params);

    expect(result.isError).toBe(true);
    expect(result.structured.ok).toBe(false);
    expect(result.structured.code).toBe('E_MCP_CANCELLED');

    // No bundle directories should have been created (only temp dirs, cleaned up)
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(testDir);
    // Only temp dirs might remain (should be cleaned up), but no bundle dirs
    const bundleDirs = entries.filter((e) => e.startsWith('bundle-'));
    expect(bundleDirs).toHaveLength(0);
  });

  it('duplicate receipts are deduped by sha256', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(2);
    const policy = getDefaultPolicy();

    // Pass 4 receipts: [A, B, A, B] -- should dedup to 2 unique
    const duplicated = [receipts[0], receipts[1], receipts[0], receipts[1]];
    const input: BundleInput = { receipts: duplicated };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.structured.ok).toBe(true);

    // receiptCount reflects unique receipts, not input length
    expect(result.structured.receiptCount).toBe(2);
    // fileCount: 2 unique receipts + manifest.json + manifest.jws = 4
    expect(result.structured.fileCount).toBe(4);

    // Manifest on disk has 2 entries, not 4
    const bundlePath = join(testDir, result.structured.bundleName as string);
    const manifestJson = await readFile(join(bundlePath, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(manifestJson) as {
      receipt_count: number;
      receipts: Array<{ sha256: string }>;
    };
    expect(manifest.receipt_count).toBe(2);
    expect(manifest.receipts).toHaveLength(2);

    // Only 2 receipt files on disk
    const receiptFiles = await readdir(join(bundlePath, 'receipts'));
    expect(receiptFiles).toHaveLength(2);
  });

  it('receipt files are named by sha256 hash', async () => {
    const context = await makeIssuerContext(testDir);
    const receipts = await createTestReceipts(2);
    const policy = getDefaultPolicy();
    const input: BundleInput = { receipts };

    const params: HandlerParams<BundleInput> = { input, policy, context };
    const result = await handleCreateBundle(params);

    expect(result.structured.ok).toBe(true);

    const bundlePath = join(testDir, result.structured.bundleName as string);
    const receiptFiles = await readdir(join(bundlePath, 'receipts'));

    // All files named <sha256>.jws
    for (const file of receiptFiles) {
      expect(file).toMatch(/^[a-f0-9]{64}\.jws$/);
    }

    // Verify filenames match content hashes
    for (const file of receiptFiles) {
      const content = await readFile(join(bundlePath, 'receipts', file), 'utf-8');
      const hash = await sha256Hex(new TextEncoder().encode(content));
      expect(file).toBe(`${hash}.jws`);
    }
  });
});
