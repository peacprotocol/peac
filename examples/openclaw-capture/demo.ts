/**
 * OpenClaw Interaction Evidence Demo
 *
 * Capture OpenClaw tool calls and emit signed PEAC receipts.
 * Run with: pnpm demo
 */

import { Buffer } from 'node:buffer';
import { createCaptureSession, createHasher, GENESIS_DIGEST } from '@peac/capture-core';
import type { SpoolStore, SpoolEntry, DedupeIndex, DedupeEntry } from '@peac/capture-core';
import {
  createHookHandler,
  createReceiptEmitter,
  createBackgroundService,
} from '@peac/adapter-openclaw';

// ---------------------------------------------------------------------------
// In-memory store implementations (for demo only).
// In production, use a durable store (filesystem, database, etc).
// ---------------------------------------------------------------------------

class MemorySpoolStore implements SpoolStore {
  private entries: SpoolEntry[] = [];
  private headDigest = GENESIS_DIGEST;
  private seq = 0;

  async append(entry: SpoolEntry): Promise<number> {
    this.entries.push(entry);
    this.headDigest = entry.entry_digest;
    this.seq = entry.sequence;
    return entry.sequence;
  }
  async commit(): Promise<void> {}
  async read(from: number, limit?: number): Promise<SpoolEntry[]> {
    const start = from > 0 ? from - 1 : 0;
    return limit ? this.entries.slice(start, start + limit) : this.entries.slice(start);
  }
  async getHeadDigest(): Promise<string> {
    return this.headDigest;
  }
  async getSequence(): Promise<number> {
    return this.seq;
  }
  async close(): Promise<void> {}

  /** Get all entries for inspection (not part of SpoolStore interface). */
  getAllEntries(): SpoolEntry[] {
    return [...this.entries];
  }
}

class MemoryDedupeIndex implements DedupeIndex {
  private map = new Map<string, DedupeEntry>();

  async get(id: string) {
    return this.map.get(id);
  }
  async set(id: string, entry: DedupeEntry) {
    this.map.set(id, entry);
  }
  async has(id: string) {
    return this.map.has(id);
  }
  async markEmitted(id: string) {
    const e = this.map.get(id);
    if (!e) return false;
    e.emitted = true;
    return true;
  }
  async delete(id: string) {
    return this.map.delete(id);
  }
  async size() {
    return this.map.size;
  }
  async clear() {
    this.map.clear();
  }
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

async function main() {
  console.log('OpenClaw Interaction Evidence Demo\n');

  // 1. Create a capture session
  console.log('1. Creating capture session...');
  const store = new MemorySpoolStore();

  const session = createCaptureSession({
    store,
    dedupe: new MemoryDedupeIndex(),
    hasher: createHasher(),
  });

  const handler = createHookHandler({ session });
  console.log('   Session ready.\n');

  // 2. Simulate OpenClaw tool call events
  console.log('2. Capturing tool calls...');

  const events = [
    {
      tool_call_id: 'call_001',
      run_id: 'run_demo',
      tool_name: 'web_search',
      started_at: '2026-02-10T10:00:00Z',
      completed_at: '2026-02-10T10:00:01Z',
      status: 'ok' as const,
      input: { query: 'PEAC protocol receipts' },
      output: { results: ['peacprotocol.org', 'github.com/peacprotocol/peac'] },
    },
    {
      tool_call_id: 'call_002',
      run_id: 'run_demo',
      tool_name: 'file_read',
      started_at: '2026-02-10T10:00:02Z',
      completed_at: '2026-02-10T10:00:02Z',
      status: 'ok' as const,
      input: { path: '/docs/README.md' },
      output: { content: 'PEAC Protocol documentation...' },
    },
    {
      tool_call_id: 'call_003',
      run_id: 'run_demo',
      tool_name: 'code_execute',
      started_at: '2026-02-10T10:00:03Z',
      completed_at: '2026-02-10T10:00:04Z',
      status: 'ok' as const,
      input: { code: 'console.log("hello")' },
      output: { stdout: 'hello' },
    },
  ];

  for (const event of events) {
    const result = await handler.afterToolCall(event);
    if (result.success) {
      console.log(
        `   Captured: ${event.tool_name} -> digest ${result.entry.entry_digest.slice(0, 16)}...`
      );
    } else {
      console.error(`   Failed: ${event.tool_name} -> ${result.code}`);
    }
  }
  console.log();

  // 3. Verify tamper-evident chain
  console.log('3. Verifying chain integrity...');
  const entries = store.getAllEntries();

  if (entries.length === 0) throw new Error('No entries captured');
  let prev = GENESIS_DIGEST;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].prev_entry_digest !== prev) {
      throw new Error(`Chain break at index ${i}`);
    }
    prev = entries[i].entry_digest;
  }
  console.log(`   Chain OK: ${entries.length} entries, all linked`);
  console.log();

  // 4. Emit signed receipts via background service
  console.log('4. Emitting signed receipts...');

  const emittedDigests: string[] = [];
  const writtenReceipts: Array<{ rid: string; interaction_id: string; jws: string }> = [];

  // NOTE: This demo signer produces a structurally valid but cryptographically
  // meaningless JWS. It is NOT a real signature. For production use:
  //   - Generate an Ed25519 key (see docs/integrations/openclaw.md)
  //   - Use @peac/crypto or a standard JOSE library for signing
  //   - Never sign unredacted secrets
  const emitter = createReceiptEmitter({
    signer: {
      async sign(payload: unknown): Promise<string> {
        const json = JSON.stringify(payload);
        return `eyJhbGciOiJFZERTQSJ9.${Buffer.from(json).toString('base64url')}.demo_signature`;
      },
      getKeyId: () => 'demo-key-2026',
      getIssuer: () => 'https://demo.example.com',
      getAudience: () => 'https://api.example.com',
    },
    writer: {
      async write(receipt) {
        writtenReceipts.push(receipt);
        return `/receipts/${receipt.rid}.peac.json`;
      },
      async close() {},
    },
  });

  const service = createBackgroundService({
    emitter,
    getPendingEntries: async () => {
      return entries.filter((e) => !emittedDigests.includes(e.entry_digest));
    },
    markEmitted: async (digest) => {
      emittedDigests.push(digest);
    },
  });

  await service.drain();

  console.log(`   Emitted ${writtenReceipts.length} receipts\n`);

  // 5. Inspect the receipts
  console.log('5. Receipt summary:');
  for (const receipt of writtenReceipts) {
    console.log(`   - ${receipt.rid}`);
    console.log(`     interaction_id: ${receipt.interaction_id}`);
    console.log(`     jws: ${receipt.jws.slice(0, 50)}...`);
    console.log();
  }

  // 6. Cleanup
  await session.close();
  await emitter.close();

  console.log('Done. All tool calls captured as verifiable interaction evidence.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
