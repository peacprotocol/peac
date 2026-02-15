/**
 * @peac/adapter-openclaw - Activation Tests
 *
 * Tests for the activate() entry point that wires plugin components.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { activate, type ActivateConfig } from '../src/activate.js';
import { generateSigningKey } from '../src/keygen.js';
import type { PluginLogger } from '../src/plugin.js';

// =============================================================================
// Test Helpers
// =============================================================================

let tmpDir: string;
let keyPath: string;
let kid: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'peac-activate-'));
  // Generate a real signing key for tests
  const keyResult = await generateSigningKey({
    outputDir: tmpDir,
    filename: 'test-key.jwk',
  });
  keyPath = keyResult.keyPath;
  kid = keyResult.kid;
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function createTestConfig(overrides?: Partial<ActivateConfig>): ActivateConfig {
  return {
    signing: {
      key_ref: `file:${keyPath}`,
      issuer: 'https://test-issuer.example.com',
      audience: 'https://test-audience.example.com',
    },
    ...overrides,
  };
}

function createCollectingLogger(): PluginLogger & { messages: { level: string; msg: string }[] } {
  const messages: { level: string; msg: string }[] = [];
  return {
    messages,
    debug: (msg: string) => messages.push({ level: 'debug', msg }),
    info: (msg: string) => messages.push({ level: 'info', msg }),
    warn: (msg: string) => messages.push({ level: 'warn', msg }),
    error: (msg: string) => messages.push({ level: 'error', msg }),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('activate', () => {
  it('activates with file: key reference', async () => {
    const dataDir = path.join(tmpDir, 'data');
    const logger = createCollectingLogger();

    const result = await activate({
      config: createTestConfig(),
      logger,
      dataDir,
    });

    try {
      expect(result.instance).toBeDefined();
      expect(result.tools).toHaveLength(4);
      expect(result.hookHandler).toBeDefined();
      expect(result.dataDir).toBe(dataDir);
      expect(typeof result.shutdown).toBe('function');

      // Check tool names
      const toolNames = result.tools.map((t) => t.name);
      expect(toolNames).toContain('peac_receipts.status');
      expect(toolNames).toContain('peac_receipts.export_bundle');
      expect(toolNames).toContain('peac_receipts.verify');
      expect(toolNames).toContain('peac_receipts.query');

      // Check logger received startup messages
      const infoMessages = logger.messages.filter((m) => m.level === 'info');
      expect(infoMessages.some((m) => m.msg.includes('Resolving signing key'))).toBe(true);
      expect(infoMessages.some((m) => m.msg.includes('Signing key resolved'))).toBe(true);
      expect(infoMessages.some((m) => m.msg.includes('PEAC evidence export active'))).toBe(true);
    } finally {
      await result.shutdown();
    }
  });

  it('activates with env: key reference', async () => {
    const dataDir = path.join(tmpDir, 'data-env');

    // Read the key and set it as an env var
    const keyContent = await fs.readFile(keyPath, 'utf-8');
    const envVar = 'PEAC_TEST_SIGNING_KEY_' + Date.now();
    process.env[envVar] = keyContent;

    try {
      const result = await activate({
        config: createTestConfig({
          signing: {
            key_ref: `env:${envVar}`,
            issuer: 'https://test-issuer.example.com',
          },
        }),
        dataDir,
      });

      try {
        expect(result.instance).toBeDefined();
        expect(result.tools).toHaveLength(4);
      } finally {
        await result.shutdown();
      }
    } finally {
      delete process.env[envVar];
    }
  });

  it('creates data directory if it does not exist', async () => {
    const dataDir = path.join(tmpDir, 'nested', 'deep', 'data');

    const result = await activate({
      config: createTestConfig(),
      dataDir,
    });

    try {
      const stat = await fs.stat(dataDir);
      expect(stat.isDirectory()).toBe(true);
    } finally {
      await result.shutdown();
    }
  });

  it('creates spool and dedupe files in data directory', async () => {
    const dataDir = path.join(tmpDir, 'data-files');

    const result = await activate({
      config: createTestConfig(),
      dataDir,
    });

    try {
      // Spool and dedupe files should exist after activation
      const files = await fs.readdir(dataDir);
      expect(files.some((f) => f.includes('spool'))).toBe(true);
      expect(files.some((f) => f.includes('dedupe'))).toBe(true);
    } finally {
      await result.shutdown();
    }
  });

  it('creates receipts directory', async () => {
    const dataDir = path.join(tmpDir, 'data-receipts');

    const result = await activate({
      config: createTestConfig(),
      dataDir,
    });

    try {
      const receiptsDir = path.join(dataDir, 'receipts');
      const stat = await fs.stat(receiptsDir);
      expect(stat.isDirectory()).toBe(true);
    } finally {
      await result.shutdown();
    }
  });

  it('uses custom output_dir for receipts', async () => {
    const dataDir = path.join(tmpDir, 'data-custom');
    const customOutputDir = path.join(tmpDir, 'custom-receipts');

    const result = await activate({
      config: createTestConfig({ output_dir: customOutputDir }),
      dataDir,
    });

    try {
      const stat = await fs.stat(customOutputDir);
      expect(stat.isDirectory()).toBe(true);
    } finally {
      await result.shutdown();
    }
  });

  it('shutdown cleans up resources', async () => {
    const dataDir = path.join(tmpDir, 'data-shutdown');

    const result = await activate({
      config: createTestConfig(),
      dataDir,
    });

    // Should not throw
    await result.shutdown();

    // Calling shutdown again should be safe
    // (stores are already closed, so this may warn but not throw)
  });

  it('throws for invalid key reference', async () => {
    const dataDir = path.join(tmpDir, 'data-bad-key');

    await expect(
      activate({
        config: createTestConfig({
          signing: {
            key_ref: 'file:/nonexistent/path/key.jwk',
            issuer: 'https://test.example.com',
          },
        }),
        dataDir,
      })
    ).rejects.toThrow();
  });

  it('throws for non-writable data directory', async () => {
    // Use /dev/null or similar non-writable path
    // On macOS/Linux, /proc or a read-only path
    const dataDir = '/dev/null/peac-test';

    await expect(
      activate({
        config: createTestConfig(),
        dataDir,
      })
    ).rejects.toThrow();
  });

  it('passes spool options through', async () => {
    const dataDir = path.join(tmpDir, 'data-spool-opts');

    const result = await activate({
      config: createTestConfig(),
      dataDir,
      spoolOptions: {
        maxEntries: 50,
        autoCommitIntervalMs: 0,
      },
    });

    try {
      expect(result.instance).toBeDefined();
    } finally {
      await result.shutdown();
    }
  });

  it('works with default noop logger', async () => {
    const dataDir = path.join(tmpDir, 'data-noop-logger');

    // No logger passed -- should use noop logger
    const result = await activate({
      config: createTestConfig(),
      dataDir,
    });

    try {
      expect(result.instance).toBeDefined();
    } finally {
      await result.shutdown();
    }
  });

  it('hook handler captures events after activation', async () => {
    const dataDir = path.join(tmpDir, 'data-capture');

    const result = await activate({
      config: createTestConfig(),
      dataDir,
      spoolOptions: {
        autoCommitIntervalMs: 0,
      },
    });

    try {
      // Use the hook handler to capture a tool call event
      const captureResult = await result.hookHandler.afterToolCall({
        tool_call_id: `call_${Date.now()}`,
        run_id: 'run_test',
        tool_name: 'web_search',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        status: 'ok',
        input: { query: 'test' },
        output: { results: [] },
      });

      expect(captureResult.success).toBe(true);
    } finally {
      await result.shutdown();
    }
  });
});
