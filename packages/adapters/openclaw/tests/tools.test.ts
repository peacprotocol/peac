/**
 * @peac/adapter-openclaw - Tools Tests
 *
 * Tests for plugin tools.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createStatusTool,
  createExportBundleTool,
  createVerifyTool,
  createQueryTool,
} from '../src/tools.js';
import type { PluginLogger } from '../src/plugin.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockLogger(): PluginLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createMockStats() {
  return {
    totalCaptured: 10,
    duplicatesSkipped: 2,
    pendingCount: 3,
    totalEmitted: 7,
    totalErrors: 1,
    keyId: 'test-key-id',
    isRunning: true,
  };
}

function createValidReceipt(id: string, overrides?: Record<string, unknown>) {
  return {
    auth: {
      rid: `r_${id}`,
      iss: 'https://issuer.example.com',
      extensions: {
        'org.peacprotocol/workflow': {
          workflow_id: 'wf_test',
        },
      },
    },
    evidence: {
      extensions: {
        'org.peacprotocol/interaction@0.1': {
          interaction_id: `int_${id}`,
          kind: 'tool.call',
          executor: {
            platform: 'openclaw',
          },
          tool: {
            name: 'web_search',
          },
          started_at: '2024-02-01T10:00:00Z',
          completed_at: '2024-02-01T10:00:01Z',
          result: {
            status: 'ok',
          },
          ...overrides,
        },
      },
    },
    _jws: 'test.jws.signature',
  };
}

// =============================================================================
// Status Tool Tests
// =============================================================================

describe('createStatusTool', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'peac-test-status-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a tool with correct name and description', () => {
    const stats = createMockStats();
    const tool = createStatusTool(stats, tempDir);

    expect(tool.name).toBe('peac_receipts.status');
    expect(tool.description).toContain('PEAC receipts status');
  });

  it('returns status with empty output directory', async () => {
    const stats = createMockStats();
    const tool = createStatusTool(stats, tempDir);

    const result = await tool.execute({}) as { status: string; spool: unknown; receipts: { count: number }; emitter: unknown };

    expect(result.status).toBe('ok');
    expect(result.spool).toBeDefined();
    expect(result.receipts.count).toBe(0);
    expect(result.emitter).toBeDefined();
  });

  it('returns status with receipts', async () => {
    // Create some test receipts
    fs.writeFileSync(
      path.join(tempDir, 'r_001.peac.json'),
      JSON.stringify(createValidReceipt('001'))
    );
    fs.writeFileSync(
      path.join(tempDir, 'r_002.peac.json'),
      JSON.stringify(createValidReceipt('002'))
    );

    const stats = createMockStats();
    const tool = createStatusTool(stats, tempDir);

    const result = await tool.execute({}) as {
      status: string;
      spool: { pending_entries: number; total_captured: number; duplicates_skipped: number };
      receipts: { count: number; output_dir: string; last_receipt_time: string | null };
      emitter: { total_emitted: number; total_errors: number; is_running: boolean; key_id: string };
    };

    expect(result.status).toBe('ok');
    expect(result.spool.pending_entries).toBe(3);
    expect(result.spool.total_captured).toBe(10);
    expect(result.spool.duplicates_skipped).toBe(2);
    expect(result.receipts.count).toBe(2);
    expect(result.receipts.output_dir).toBe(tempDir);
    expect(result.receipts.last_receipt_time).toBeDefined();
    expect(result.emitter.total_emitted).toBe(7);
    expect(result.emitter.total_errors).toBe(1);
    expect(result.emitter.is_running).toBe(true);
    expect(result.emitter.key_id).toBe('test-key-id');
  });

  it('handles non-existent directory gracefully', async () => {
    const stats = createMockStats();
    const tool = createStatusTool(stats, '/nonexistent/path');

    const result = await tool.execute({}) as { status: string; receipts: { count: number } };

    expect(result.status).toBe('ok');
    expect(result.receipts.count).toBe(0);
  });
});

// =============================================================================
// Export Bundle Tool Tests
// =============================================================================

describe('createExportBundleTool', () => {
  let tempDir: string;
  let mockLogger: PluginLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'peac-test-export-'));
    mockLogger = createMockLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a tool with correct name', () => {
    const tool = createExportBundleTool(tempDir, mockLogger);

    expect(tool.name).toBe('peac_receipts.export_bundle');
  });

  it('returns message when no receipts exist', async () => {
    const tool = createExportBundleTool(tempDir, mockLogger);

    const result = await tool.execute({}) as { status: string; message: string; receipt_count: number };

    expect(result.status).toBe('ok');
    expect(result.message).toContain('No receipts');
    expect(result.receipt_count).toBe(0);
  });

  it('exports all receipts when no filter provided', async () => {
    // Create test receipts
    fs.writeFileSync(
      path.join(tempDir, 'r_001.peac.json'),
      JSON.stringify(createValidReceipt('001'))
    );
    fs.writeFileSync(
      path.join(tempDir, 'r_002.peac.json'),
      JSON.stringify(createValidReceipt('002'))
    );

    const tool = createExportBundleTool(tempDir, mockLogger);
    const result = await tool.execute({}) as { status: string; receipt_count: number; bundle_path?: string };

    expect(result.status).toBe('ok');
    expect(result.receipt_count).toBe(2);
    expect(result.bundle_path).toBeDefined();

    // Verify bundle structure
    const manifestPath = path.join(result.bundle_path!, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.receipt_count).toBe(2);
  });

  it('filters by workflow_id', async () => {
    // Create receipts with different workflow IDs
    const receipt1 = createValidReceipt('001');
    receipt1.auth.extensions['org.peacprotocol/workflow'] = { workflow_id: 'wf_alpha' };
    fs.writeFileSync(path.join(tempDir, 'r_001.peac.json'), JSON.stringify(receipt1));

    const receipt2 = createValidReceipt('002');
    receipt2.auth.extensions['org.peacprotocol/workflow'] = { workflow_id: 'wf_beta' };
    fs.writeFileSync(path.join(tempDir, 'r_002.peac.json'), JSON.stringify(receipt2));

    const tool = createExportBundleTool(tempDir, mockLogger);
    const result = await tool.execute({ workflow_id: 'wf_alpha' }) as { status: string; receipt_count: number };

    expect(result.status).toBe('ok');
    expect(result.receipt_count).toBe(1);
  });
});

// =============================================================================
// Verify Tool Tests
// =============================================================================

describe('createVerifyTool', () => {
  let tempDir: string;
  let mockLogger: PluginLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'peac-test-verify-'));
    mockLogger = createMockLogger();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a tool with correct name', () => {
    const tool = createVerifyTool(mockLogger);

    expect(tool.name).toBe('peac_receipts.verify');
  });

  it('verifies a valid single receipt', async () => {
    const receiptPath = path.join(tempDir, 'r_001.peac.json');
    fs.writeFileSync(receiptPath, JSON.stringify(createValidReceipt('001')));

    const tool = createVerifyTool(mockLogger);
    const result = await tool.execute({ path: receiptPath }) as {
      status: string;
      valid: boolean;
      receipt_id?: string;
      interaction_id?: string;
      warnings?: string[];
    };

    expect(result.status).toBe('ok');
    expect(result.valid).toBe(true);
    expect(result.receipt_id).toBe('r_001');
    expect(result.interaction_id).toBe('int_001');
    // Should warn about no JWKS provided
    expect(result.warnings).toContain('No JWKS provided - signature not verified');
  });

  it('detects missing auth block', async () => {
    const invalidReceipt = { evidence: {} };
    const receiptPath = path.join(tempDir, 'invalid.peac.json');
    fs.writeFileSync(receiptPath, JSON.stringify(invalidReceipt));

    const tool = createVerifyTool(mockLogger);
    const result = await tool.execute({ path: receiptPath }) as { status: string; valid: boolean; errors?: string[] };

    expect(result.status).toBe('error');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing auth block');
  });

  it('detects missing evidence block', async () => {
    const invalidReceipt = { auth: {} };
    const receiptPath = path.join(tempDir, 'invalid.peac.json');
    fs.writeFileSync(receiptPath, JSON.stringify(invalidReceipt));

    const tool = createVerifyTool(mockLogger);
    const result = await tool.execute({ path: receiptPath }) as { status: string; valid: boolean; errors?: string[] };

    expect(result.status).toBe('error');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing evidence block');
  });

  it('detects invalid timing (completed_at before started_at)', async () => {
    const invalidReceipt = createValidReceipt('001', {
      started_at: '2024-02-01T10:00:01Z',
      completed_at: '2024-02-01T10:00:00Z', // Before started_at
    });
    const receiptPath = path.join(tempDir, 'invalid.peac.json');
    fs.writeFileSync(receiptPath, JSON.stringify(invalidReceipt));

    const tool = createVerifyTool(mockLogger);
    const result = await tool.execute({ path: receiptPath }) as { status: string; valid: boolean; errors?: string[] };

    expect(result.status).toBe('error');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('completed_at is before started_at');
  });

  it('detects output without result status', async () => {
    const invalidReceipt = createValidReceipt('001', {
      output: { digest: { alg: 'sha-256', value: 'a'.repeat(64), bytes: 100 } },
      result: undefined, // No result
    });
    const receiptPath = path.join(tempDir, 'invalid.peac.json');
    fs.writeFileSync(receiptPath, JSON.stringify(invalidReceipt));

    const tool = createVerifyTool(mockLogger);
    const result = await tool.execute({ path: receiptPath }) as { status: string; valid: boolean; errors?: string[] };

    expect(result.status).toBe('error');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('output present but result.status missing');
  });

  it('verifies a bundle directory', async () => {
    // Create bundle structure
    const bundleDir = path.join(tempDir, 'test-bundle');
    const receiptsDir = path.join(bundleDir, 'receipts');
    fs.mkdirSync(receiptsDir, { recursive: true });

    // Create manifest
    fs.writeFileSync(
      path.join(bundleDir, 'manifest.json'),
      JSON.stringify({ version: '1.0', receipt_count: 2 })
    );

    // Create receipts
    fs.writeFileSync(
      path.join(receiptsDir, 'r_001.peac.json'),
      JSON.stringify(createValidReceipt('001'))
    );
    fs.writeFileSync(
      path.join(receiptsDir, 'r_002.peac.json'),
      JSON.stringify(createValidReceipt('002'))
    );

    const tool = createVerifyTool(mockLogger);
    const result = await tool.execute({ path: bundleDir }) as {
      status: string;
      valid: boolean;
      bundle_stats?: { total: number; valid: number; invalid: number };
    };

    expect(result.status).toBe('ok');
    expect(result.valid).toBe(true);
    expect(result.bundle_stats?.total).toBe(2);
    expect(result.bundle_stats?.valid).toBe(2);
    expect(result.bundle_stats?.invalid).toBe(0);
  });

  it('handles file not found gracefully', async () => {
    const tool = createVerifyTool(mockLogger);
    const result = await tool.execute({ path: '/nonexistent/file.json' }) as { status: string; valid: boolean };

    expect(result.status).toBe('error');
    expect(result.valid).toBe(false);
  });
});

// =============================================================================
// Query Tool Tests
// =============================================================================

describe('createQueryTool', () => {
  let tempDir: string;
  let mockLogger: PluginLogger;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'peac-test-query-'));
    mockLogger = createMockLogger();

    // Create test receipts with varying properties
    const receipt1 = createValidReceipt('001');
    receipt1.auth.extensions['org.peacprotocol/workflow'] = { workflow_id: 'wf_alpha' };
    receipt1.evidence.extensions['org.peacprotocol/interaction@0.1'].tool = { name: 'web_search' };
    receipt1.evidence.extensions['org.peacprotocol/interaction@0.1'].result = { status: 'ok' };
    fs.writeFileSync(path.join(tempDir, 'r_001.peac.json'), JSON.stringify(receipt1));

    const receipt2 = createValidReceipt('002');
    receipt2.auth.extensions['org.peacprotocol/workflow'] = { workflow_id: 'wf_beta' };
    receipt2.evidence.extensions['org.peacprotocol/interaction@0.1'].tool = { name: 'file_read' };
    receipt2.evidence.extensions['org.peacprotocol/interaction@0.1'].result = { status: 'error' };
    fs.writeFileSync(path.join(tempDir, 'r_002.peac.json'), JSON.stringify(receipt2));

    const receipt3 = createValidReceipt('003');
    receipt3.auth.extensions['org.peacprotocol/workflow'] = { workflow_id: 'wf_alpha' };
    receipt3.evidence.extensions['org.peacprotocol/interaction@0.1'].tool = { name: 'web_search' };
    receipt3.evidence.extensions['org.peacprotocol/interaction@0.1'].result = { status: 'ok' };
    fs.writeFileSync(path.join(tempDir, 'r_003.peac.json'), JSON.stringify(receipt3));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a tool with correct name', () => {
    const tool = createQueryTool(tempDir, mockLogger);

    expect(tool.name).toBe('peac_receipts.query');
  });

  it('returns all receipts with no filter', async () => {
    const tool = createQueryTool(tempDir, mockLogger);
    const result = await tool.execute({}) as { status: string; total: number; results: unknown[] };

    expect(result.status).toBe('ok');
    expect(result.total).toBe(3);
    expect(result.results).toHaveLength(3);
  });

  it('filters by workflow_id', async () => {
    const tool = createQueryTool(tempDir, mockLogger);
    const result = await tool.execute({ workflow_id: 'wf_alpha' }) as { status: string; total: number; results: Array<{ workflow_id?: string }> };

    expect(result.status).toBe('ok');
    expect(result.total).toBe(2);
    expect(result.results.every((r) => r.workflow_id === 'wf_alpha')).toBe(true);
  });

  it('filters by tool_name', async () => {
    const tool = createQueryTool(tempDir, mockLogger);
    const result = await tool.execute({ tool_name: 'web_search' }) as { status: string; total: number; results: Array<{ tool_name?: string }> };

    expect(result.status).toBe('ok');
    expect(result.total).toBe(2);
    expect(result.results.every((r) => r.tool_name === 'web_search')).toBe(true);
  });

  it('filters by status', async () => {
    const tool = createQueryTool(tempDir, mockLogger);
    const result = await tool.execute({ status: 'error' }) as { status: string; total: number; results: Array<{ status?: string }> };

    expect(result.status).toBe('ok');
    expect(result.total).toBe(1);
    expect(result.results[0].status).toBe('error');
  });

  it('combines multiple filters', async () => {
    const tool = createQueryTool(tempDir, mockLogger);
    const result = await tool.execute({
      workflow_id: 'wf_alpha',
      tool_name: 'web_search',
    }) as { status: string; total: number };

    expect(result.status).toBe('ok');
    expect(result.total).toBe(2);
  });

  it('applies limit', async () => {
    const tool = createQueryTool(tempDir, mockLogger);
    const result = await tool.execute({ limit: 2 }) as { status: string; total: number; results: unknown[]; limit: number };

    expect(result.status).toBe('ok');
    expect(result.total).toBe(3); // Total matches
    expect(result.results).toHaveLength(2); // Limited results
    expect(result.limit).toBe(2);
  });

  it('applies offset for pagination', async () => {
    const tool = createQueryTool(tempDir, mockLogger);
    const result = await tool.execute({ limit: 2, offset: 1 }) as { status: string; total: number; results: unknown[]; offset: number };

    expect(result.status).toBe('ok');
    expect(result.total).toBe(3);
    expect(result.results).toHaveLength(2);
    expect(result.offset).toBe(1);
  });

  it('handles empty results gracefully', async () => {
    const tool = createQueryTool(tempDir, mockLogger);
    const result = await tool.execute({ workflow_id: 'nonexistent' }) as { status: string; total: number; results: unknown[] };

    expect(result.status).toBe('ok');
    expect(result.total).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  it('handles non-existent directory gracefully', async () => {
    const tool = createQueryTool('/nonexistent/path', mockLogger);
    const result = await tool.execute({}) as { status: string; error?: string };

    expect(result.status).toBe('error');
    expect(result.error).toBeDefined();
  });
});
