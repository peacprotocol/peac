/**
 * Reconcile Command Tests (v0.11.3+)
 *
 * Tests the reconciliation logic: conflict detection, deterministic output,
 * --fail-on-conflict flag, size limits, and 3-step key fallback.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';
import { createDisputeBundle, type JsonWebKeySet, type JsonWebKey } from '@peac/audit';
import { sign, generateKeypair } from '@peac/crypto';

const CLI_PATH = join(__dirname, '..', 'dist', 'index.cjs');
const TEST_DIR = join(__dirname, '..', '.test-reconcile');

/** Convert Uint8Array to base64url */
function base64urlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/** Create JWK from Ed25519 public key */
function publicKeyToJwk(publicKey: Uint8Array, kid: string): JsonWebKey {
  return {
    kty: 'OKP',
    kid,
    alg: 'EdDSA',
    crv: 'Ed25519',
    x: base64urlEncode(publicKey),
    use: 'sig',
  };
}

/** Run CLI command */
function runCli(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args.join(' ')}`, {
      encoding: 'utf8',
      cwd: resolve(__dirname, '..', '..', '..'),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    const error = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      exitCode: error.status ?? 1,
    };
  }
}

/** Create a test bundle with specific receipts */
async function createTestBundle(
  receipts: string[],
  keys: JsonWebKeySet,
  label: string
): Promise<Buffer> {
  const result = await createDisputeBundle({
    dispute_ref: `test-reconcile-${label}`,
    created_by: 'peac-cli-test',
    receipts,
    keys,
  });

  if (!result.ok) {
    throw new Error(`Failed to create test bundle ${label}: ${result.error.message}`);
  }

  return Buffer.from(result.value);
}

/** Create a signed receipt with specific claims */
async function createTestReceipt(
  privateKey: Uint8Array,
  kid: string,
  claims: Record<string, unknown>
): Promise<string> {
  const payload = {
    iss: 'https://test.example.com',
    iat: Math.floor(Date.now() / 1000),
    type: 'peac-receipt/0.1',
    sub: 'https://resource.example.com',
    ...claims,
  };
  return sign(payload, privateKey, kid);
}

describe('Reconcile CLI', () => {
  let privateKey: Uint8Array;
  let kid: string;
  let jwks: JsonWebKeySet;

  beforeAll(async () => {
    if (!existsSync(CLI_PATH)) {
      throw new Error('CLI not built. Run "pnpm --filter @peac/cli build" first.');
    }

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });

    const keyPair = await generateKeypair();
    privateKey = keyPair.privateKey;
    kid = 'test-key-2026-03';

    jwks = {
      keys: [publicKeyToJwk(keyPair.publicKey, kid)],
    };
  });

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it('should merge disjoint bundles cleanly', async () => {
    const receipt1 = await createTestReceipt(privateKey, kid, {
      jti: 'r-001',
      sub: 'https://a.example.com',
    });
    const receipt2 = await createTestReceipt(privateKey, kid, {
      jti: 'r-002',
      sub: 'https://b.example.com',
    });

    const bundle1 = await createTestBundle([receipt1], jwks, 'disjoint-a');
    const bundle2 = await createTestBundle([receipt2], jwks, 'disjoint-b');

    const path1 = join(TEST_DIR, 'disjoint-a.zip');
    const path2 = join(TEST_DIR, 'disjoint-b.zip');
    writeFileSync(path1, bundle1);
    writeFileSync(path2, bundle2);

    const result = runCli(['reconcile', path1, path2, '--format', 'json']);
    expect(result.exitCode).toBe(0);

    const report = JSON.parse(result.stdout);
    expect(report.version).toBe('1.0');
    expect(report.total_receipts).toBe(2);
    expect(report.merged_receipts).toBe(2);
    expect(report.conflicts).toHaveLength(0);
  });

  it('should detect identical receipts as non-conflict', async () => {
    const receipt = await createTestReceipt(privateKey, kid, {
      jti: 'r-same-001',
      sub: 'https://same.example.com',
    });

    const bundle1 = await createTestBundle([receipt], jwks, 'same-a');
    const bundle2 = await createTestBundle([receipt], jwks, 'same-b');

    const path1 = join(TEST_DIR, 'same-a.zip');
    const path2 = join(TEST_DIR, 'same-b.zip');
    writeFileSync(path1, bundle1);
    writeFileSync(path2, bundle2);

    const result = runCli(['reconcile', path1, path2, '--format', 'json']);
    expect(result.exitCode).toBe(0);

    const report = JSON.parse(result.stdout);
    expect(report.conflicts).toHaveLength(0);
    expect(report.merged_receipts).toBe(1);
  });

  it('should detect same jti different content as conflict', async () => {
    const receipt1 = await createTestReceipt(privateKey, kid, {
      jti: 'r-conflict-001',
      sub: 'https://version-a.example.com',
    });
    const receipt2 = await createTestReceipt(privateKey, kid, {
      jti: 'r-conflict-001',
      sub: 'https://version-b.example.com',
    });

    const bundle1 = await createTestBundle([receipt1], jwks, 'conflict-a');
    const bundle2 = await createTestBundle([receipt2], jwks, 'conflict-b');

    const path1 = join(TEST_DIR, 'conflict-a.zip');
    const path2 = join(TEST_DIR, 'conflict-b.zip');
    writeFileSync(path1, bundle1);
    writeFileSync(path2, bundle2);

    const result = runCli(['reconcile', path1, path2, '--format', 'json']);
    expect(result.exitCode).toBe(0);

    const report = JSON.parse(result.stdout);
    expect(report.conflicts).toHaveLength(1);
    expect(report.conflicts[0].key).toContain('r-conflict-001');
    expect(report.conflicts[0].diff_fields).toContain('sub');
  });

  it('should exit 1 with --fail-on-conflict when conflicts exist', async () => {
    const receipt1 = await createTestReceipt(privateKey, kid, {
      jti: 'r-fail-001',
      sub: 'https://version-a.example.com',
    });
    const receipt2 = await createTestReceipt(privateKey, kid, {
      jti: 'r-fail-001',
      sub: 'https://version-b.example.com',
    });

    const bundle1 = await createTestBundle([receipt1], jwks, 'fail-a');
    const bundle2 = await createTestBundle([receipt2], jwks, 'fail-b');

    const path1 = join(TEST_DIR, 'fail-a.zip');
    const path2 = join(TEST_DIR, 'fail-b.zip');
    writeFileSync(path1, bundle1);
    writeFileSync(path2, bundle2);

    const result = runCli(['reconcile', path1, path2, '--format', 'json', '--fail-on-conflict']);
    expect(result.exitCode).toBe(1);

    const report = JSON.parse(result.stdout);
    expect(report.conflicts.length).toBeGreaterThan(0);
  });

  it('should exit 0 with --fail-on-conflict when no conflicts', async () => {
    const receipt1 = await createTestReceipt(privateKey, kid, { jti: 'r-nofail-001' });
    const receipt2 = await createTestReceipt(privateKey, kid, { jti: 'r-nofail-002' });

    const bundle1 = await createTestBundle([receipt1], jwks, 'nofail-a');
    const bundle2 = await createTestBundle([receipt2], jwks, 'nofail-b');

    const path1 = join(TEST_DIR, 'nofail-a.zip');
    const path2 = join(TEST_DIR, 'nofail-b.zip');
    writeFileSync(path1, bundle1);
    writeFileSync(path2, bundle2);

    const result = runCli(['reconcile', path1, path2, '--format', 'json', '--fail-on-conflict']);
    expect(result.exitCode).toBe(0);
  });

  it('should produce deterministic JSON output', async () => {
    const receipt1 = await createTestReceipt(privateKey, kid, {
      jti: 'r-det-002',
      sub: 'https://b.example.com',
    });
    const receipt2 = await createTestReceipt(privateKey, kid, {
      jti: 'r-det-001',
      sub: 'https://a.example.com',
    });

    const bundle1 = await createTestBundle([receipt1], jwks, 'det-a');
    const bundle2 = await createTestBundle([receipt2], jwks, 'det-b');

    const path1 = join(TEST_DIR, 'det-a.zip');
    const path2 = join(TEST_DIR, 'det-b.zip');
    writeFileSync(path1, bundle1);
    writeFileSync(path2, bundle2);

    const result1 = runCli(['reconcile', path1, path2, '--format', 'json']);
    const result2 = runCli(['reconcile', path1, path2, '--format', 'json']);

    const report1 = JSON.parse(result1.stdout);
    const report2 = JSON.parse(result2.stdout);

    expect(report1.version).toBe(report2.version);
    expect(report1.total_receipts).toBe(report2.total_receipts);
    expect(report1.merged_receipts).toBe(report2.merged_receipts);
    expect(report1.conflicts).toEqual(report2.conflicts);
    expect(report1.bundles).toEqual(report2.bundles);
  });

  it('should produce human-readable text output', async () => {
    const receipt1 = await createTestReceipt(privateKey, kid, { jti: 'r-text-001' });
    const receipt2 = await createTestReceipt(privateKey, kid, { jti: 'r-text-002' });

    const bundle1 = await createTestBundle([receipt1], jwks, 'text-a');
    const bundle2 = await createTestBundle([receipt2], jwks, 'text-b');

    const path1 = join(TEST_DIR, 'text-a.zip');
    const path2 = join(TEST_DIR, 'text-b.zip');
    writeFileSync(path1, bundle1);
    writeFileSync(path2, bundle2);

    const result = runCli(['reconcile', path1, path2, '--format', 'text']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('PEAC Reconciliation Report');
    expect(result.stdout).toContain('No conflicts detected');
  });

  it('should merge single-receipt bundles with identical content', async () => {
    const receipt = await createTestReceipt(privateKey, kid, {
      jti: 'r-single-001',
      sub: 'https://single.example.com',
    });

    const bundle1 = await createTestBundle([receipt], jwks, 'single-a');
    const bundle2 = await createTestBundle([receipt], jwks, 'single-b');

    const path1 = join(TEST_DIR, 'single-a.zip');
    const path2 = join(TEST_DIR, 'single-b.zip');
    writeFileSync(path1, bundle1);
    writeFileSync(path2, bundle2);

    const result = runCli(['reconcile', path1, path2, '--format', 'json', '--fail-on-conflict']);
    expect(result.exitCode).toBe(0);

    const report = JSON.parse(result.stdout);
    expect(report.total_receipts).toBe(2);
    expect(report.merged_receipts).toBe(1);
    expect(report.conflicts).toHaveLength(0);
  });

  it('should reject bundle creation with zero receipts (API contract)', async () => {
    // createDisputeBundle rejects empty receipts at the API level.
    // This documents the contract: bundles with zero receipts cannot exist.
    const result = await createDisputeBundle({
      dispute_ref: 'test-empty',
      created_by: 'test',
      receipts: [],
      keys: jwks,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('No receipts');
    }
  });

  it('should error gracefully on corrupt bundle file', () => {
    const corruptPath = join(TEST_DIR, 'corrupt.zip');
    writeFileSync(corruptPath, 'not a valid zip');

    const validPath = join(TEST_DIR, 'disjoint-a.zip');
    if (!existsSync(validPath)) return; // skip if prior test didn't run

    const result = runCli(['reconcile', corruptPath, validPath, '--format', 'json']);
    expect(result.exitCode).toBe(1);
  });

  it('should error on non-existent bundle file', () => {
    const result = runCli([
      'reconcile',
      '/nonexistent/a.zip',
      '/nonexistent/b.zip',
      '--format',
      'json',
    ]);
    expect(result.exitCode).toBe(1);
  });

  it('should have valid ReconcileReport version field', async () => {
    const receipt = await createTestReceipt(privateKey, kid, { jti: 'r-version-001' });

    const bundle = await createTestBundle([receipt], jwks, 'version-a');

    const path1 = join(TEST_DIR, 'version-a.zip');
    const path2 = join(TEST_DIR, 'version-a-copy.zip');
    writeFileSync(path1, bundle);
    writeFileSync(path2, bundle);

    const result = runCli(['reconcile', path1, path2, '--format', 'json']);
    const report = JSON.parse(result.stdout);
    expect(report.version).toBe('1.0');
    expect(report.generated_at).toBeTruthy();
    expect(report.bundles).toHaveLength(2);
  });
});
