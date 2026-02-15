/**
 * OpenClaw Activity Records Demo
 *
 * Generates a signing key, activates the evidence export plugin with
 * durable file-based storage, captures tool call events, exports an
 * evidence bundle, and verifies it offline.
 *
 * Run: pnpm demo (from monorepo root: pnpm -C examples/openclaw-capture demo)
 */

import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { activate, generateSigningKey } from '@peac/adapter-openclaw';
import type { PluginTool } from '@peac/adapter-openclaw';

// =============================================================================
// Helpers
// =============================================================================

/** Look up a tool by name. Throws with available names on miss. */
function getTool(tools: PluginTool[], name: string): PluginTool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    const available = tools.map((t) => t.name).join(', ');
    throw new Error(`Tool "${name}" not found. Available: ${available}`);
  }
  return tool;
}

// =============================================================================
// Demo
// =============================================================================

async function main(): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'peac-demo-'));

  try {
    // Step 1: Generate a real Ed25519 signing key
    console.log('1. Generating signing key...');
    const key = await generateSigningKey({ outputDir: tmpDir });
    console.log(`   kid: ${key.kid}`);

    // Step 2: Activate the evidence export plugin
    console.log('\n2. Activating plugin...');
    const result = await activate({
      config: {
        signing: {
          key_ref: `file:${key.keyPath}`,
          issuer: 'https://demo.example.com',
        },
      },
      dataDir: tmpDir,
      spoolOptions: {
        autoCommitIntervalMs: 0, // disable timer so demo exits cleanly
      },
    });

    // Step 3: Start the background emitter
    result.instance.start();
    console.log('   Plugin active.');

    // Step 4: Capture 3 tool call events
    console.log('\n3. Capturing tool calls...');
    const events = [
      {
        tool_call_id: 'call_001',
        run_id: 'run_demo',
        tool_name: 'web_search',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        status: 'ok' as const,
        input: { query: 'PEAC protocol' },
        output: { results: ['result1', 'result2'] },
      },
      {
        tool_call_id: 'call_002',
        run_id: 'run_demo',
        tool_name: 'file_read',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        status: 'ok' as const,
        input: { path: '/tmp/example.txt' },
        output: { content: 'file contents here' },
      },
      {
        tool_call_id: 'call_003',
        run_id: 'run_demo',
        tool_name: 'code_execute',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        status: 'ok' as const,
        input: { code: 'console.log("hello")' },
        output: { stdout: 'hello' },
      },
    ];

    for (const event of events) {
      const captureResult = await result.hookHandler.afterToolCall(event);
      console.log(`   ${event.tool_name}: ${captureResult.success ? 'captured' : 'failed'}`);
    }

    // Step 5: Flush -- drain pending entries into signed receipts
    console.log('\n4. Flushing receipts...');
    await result.instance.backgroundService.drain();
    console.log('   Receipts signed and written.');

    // Step 6: Export an evidence bundle
    console.log('\n5. Exporting evidence bundle...');
    const exportTool = getTool(result.tools, 'peac_receipts.export_bundle');
    const bundlePath = path.join(tmpDir, 'demo-bundle');
    const exportResult = (await exportTool.execute({ output_path: bundlePath })) as {
      status: string;
      receipt_count: number;
      bundle_path?: string;
    };
    console.log(`   Exported ${exportResult.receipt_count} receipts.`);

    // Step 7: Verify the bundle offline
    console.log('\n6. Verifying bundle...');
    const verifyTool = getTool(result.tools, 'peac_receipts.verify');
    const verifyResult = (await verifyTool.execute({ path: bundlePath })) as {
      status: string;
      valid: boolean;
      bundle_stats?: { total: number; valid: number };
    };

    if (verifyResult.valid && verifyResult.bundle_stats) {
      console.log(
        `\nverification successful -- ${verifyResult.bundle_stats.total} receipts in evidence bundle`
      );
    } else {
      console.error('\nverification failed');
      process.exitCode = 1;
    }

    // Step 8: Shutdown
    await result.shutdown();
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
