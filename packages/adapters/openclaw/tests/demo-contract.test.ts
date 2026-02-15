/**
 * @peac/adapter-openclaw - Demo Contract Test
 *
 * Anti-rot test that mirrors the demo flow: generate key, activate,
 * capture events, drain, export bundle, verify bundle, shutdown.
 *
 * Asserts on stable fields (counts, validity) not timestamps.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { activate } from '../src/activate.js';
import { generateSigningKey } from '../src/keygen.js';
import type { PluginTool } from '../src/plugin.js';

// =============================================================================
// Helpers
// =============================================================================

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'peac-demo-contract-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function getTool(tools: PluginTool[], name: string): PluginTool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    const available = tools.map((t) => t.name).join(', ');
    throw new Error(`Tool "${name}" not found. Available: ${available}`);
  }
  return tool;
}

function makeEvent(id: string, toolName: string) {
  return {
    tool_call_id: `call_${id}`,
    run_id: 'run_contract_test',
    tool_name: toolName,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    status: 'ok' as const,
    input: { key: `input_${id}` },
    output: { key: `output_${id}` },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('demo contract', () => {
  it('full flow: keygen -> activate -> capture -> drain -> export -> verify', async () => {
    // 1. Generate signing key
    const key = await generateSigningKey({ outputDir: tmpDir });
    expect(key.kid).toBeDefined();
    expect(key.keyPath).toContain(tmpDir);

    // 2. Activate plugin
    const result = await activate({
      config: {
        signing: {
          key_ref: `file:${key.keyPath}`,
          issuer: 'https://contract-test.example.com',
        },
      },
      dataDir: tmpDir,
      spoolOptions: {
        autoCommitIntervalMs: 0,
      },
    });

    try {
      // 3. Start background service
      result.instance.start();

      // 4. Capture 3 events
      const events = [
        makeEvent('001', 'web_search'),
        makeEvent('002', 'file_read'),
        makeEvent('003', 'code_execute'),
      ];

      for (const event of events) {
        const captureResult = await result.hookHandler.afterToolCall(event);
        expect(captureResult.success).toBe(true);
      }

      // 5. Flush barrier (stable API surface)
      await result.flush();

      // 6. Export bundle
      const exportTool = getTool(result.tools, 'peac_receipts.export_bundle');
      const bundlePath = path.join(tmpDir, 'test-bundle');
      const exportResult = (await exportTool.execute({ output_path: bundlePath })) as {
        status: string;
        receipt_count: number;
        bundle_path?: string;
      };

      expect(exportResult.status).toBe('ok');
      expect(exportResult.receipt_count).toBe(3);

      // 7. Verify bundle
      const verifyTool = getTool(result.tools, 'peac_receipts.verify');
      const verifyResult = (await verifyTool.execute({ path: bundlePath })) as {
        status: string;
        valid: boolean;
        bundle_stats?: { total: number; valid: number };
      };

      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.bundle_stats).toBeDefined();
      expect(verifyResult.bundle_stats!.total).toBe(3);
      expect(verifyResult.bundle_stats!.valid).toBe(3);

      // 8. Verify bundle directory structure
      const bundleFiles = await fs.readdir(bundlePath);
      expect(bundleFiles).toContain('manifest.json');
      expect(bundleFiles).toContain('receipts');

      const receiptFiles = await fs.readdir(path.join(bundlePath, 'receipts'));
      expect(receiptFiles).toHaveLength(3);
      expect(receiptFiles.every((f) => f.endsWith('.peac.json'))).toBe(true);
    } finally {
      await result.shutdown();
    }
  });

  it('getTool throws with available names on miss', async () => {
    const key = await generateSigningKey({ outputDir: tmpDir });
    const result = await activate({
      config: {
        signing: {
          key_ref: `file:${key.keyPath}`,
          issuer: 'https://contract-test.example.com',
        },
      },
      dataDir: tmpDir,
      spoolOptions: { autoCommitIntervalMs: 0 },
    });

    try {
      expect(() => getTool(result.tools, 'nonexistent_tool')).toThrow(/not found/);
      expect(() => getTool(result.tools, 'nonexistent_tool')).toThrow(/peac_receipts\.status/);
    } finally {
      await result.shutdown();
    }
  });
});
