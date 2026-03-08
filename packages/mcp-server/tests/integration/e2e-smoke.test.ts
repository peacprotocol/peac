/**
 * E2E smoke test -- spawns peac-mcp-server CLI as a child process,
 * sends JSON-RPC initialize + tools/list + tools/call over stdio,
 * and validates responses.
 *
 * This validates:
 * - stdout is strictly JSON-RPC 2.0 (non-JSON lines FAIL the test)
 * - _meta audit block is present in tool responses
 * - Tools list contains all 3 pure tools
 * - stderr is captured and surfaced on failure
 * - early child exit rejects pending receive() promises
 *
 * Portability: uses relative paths, spawns dist/cli.cjs (built artifact),
 * no setTimeout hacks -- sends initialize immediately and waits for response.
 */

import { describe, it, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { generateKeypair } from '@peac/crypto';
import { issueWire01 } from '@peac/protocol';
import { SERVER_VERSION, MCP_PROTOCOL_VERSION } from '../../src/infra/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '../..');
const CLI_PATH = resolve(PKG_ROOT, 'dist/cli.cjs');
const CLI_EXISTS = existsSync(CLI_PATH);
const IS_CI = !!process.env.CI && process.env.CI !== 'false';

interface StdioClient {
  send: (msg: Record<string, unknown>) => void;
  receive: () => Promise<Record<string, unknown>>;
  close: () => void;
  getStderr: () => string;
}

function createStdioClient(args: string[] = []): StdioClient {
  // Message queue: messages that arrived before receive() was called
  const queue: Record<string, unknown>[] = [];
  // Waiters: receive() calls waiting for a message
  const pending: Array<{
    resolve: (msg: Record<string, unknown>) => void;
    reject: (err: Error) => void;
  }> = [];
  const stderrChunks: string[] = [];
  let buffer = '';
  let fatalError: Error | undefined;

  const child: ChildProcess = spawn('node', [CLI_PATH, ...args], {
    cwd: PKG_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  function setFatal(err: Error): void {
    if (fatalError) return; // first fatal wins
    fatalError = err;
    // Drain all pending waiters
    while (pending.length > 0) {
      pending.shift()!.reject(err);
    }
  }

  function deliver(msg: Record<string, unknown>): void {
    const waiter = pending.shift();
    if (waiter) {
      waiter.resolve(msg);
    } else {
      queue.push(msg);
    }
  }

  child.stdout!.on('data', (chunk: Buffer) => {
    if (fatalError) return;
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop()!;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Strict: every non-empty stdout line MUST be valid JSON-RPC 2.0
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        setFatal(new Error(`Non-JSON stdout line: ${trimmed.slice(0, 200)}`));
        return;
      }

      if (parsed.jsonrpc !== '2.0') {
        setFatal(new Error(`Non-JSON-RPC 2.0 object on stdout: ${trimmed.slice(0, 200)}`));
        return;
      }

      deliver(parsed);
    }
  });

  child.stderr!.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk.toString());
  });

  child.on('error', (err) => {
    setFatal(new Error(`Child process error: ${err.message}`));
  });

  child.on('exit', (code, signal) => {
    setFatal(
      new Error(`Child exited (code=${code}, signal=${signal}). stderr: ${stderrChunks.join('')}`)
    );
  });

  return {
    send(msg: Record<string, unknown>) {
      if (fatalError) throw fatalError;
      child.stdin!.write(JSON.stringify(msg) + '\n');
    },
    receive() {
      // Fatal error rejects all future receives
      if (fatalError) {
        return Promise.reject(fatalError);
      }
      // Drain from queue first (messages that arrived before receive() was called)
      const queued = queue.shift();
      if (queued) {
        return Promise.resolve(queued);
      }
      return new Promise<Record<string, unknown>>((res, rej) => {
        pending.push({ resolve: res, reject: rej });
      });
    },
    close() {
      child.stdin!.end();
      child.kill('SIGTERM');
    },
    getStderr() {
      return stderrChunks.join('');
    },
  };
}

// In CI, dist must exist (turbo builds before tests). Locally, skip gracefully.
describe.skipIf(!CLI_EXISTS && !IS_CI)('integration/e2e-smoke', () => {
  if (IS_CI && !CLI_EXISTS) {
    throw new Error(`dist/cli.cjs not found at ${CLI_PATH} -- CI must build before tests`);
  }

  it('completes initialize -> tools/list -> peac_decode round-trip', async () => {
    // Parent-process stdout guard: detect any pollution from the test
    // process itself. Child stdout is piped (not inherited), so any
    // stdout writes here indicate a bug in the test code.
    const parentStdoutWrites: string[] = [];
    const origStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
      parentStdoutWrites.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
      return (origStdoutWrite as Function)(chunk, ...rest);
    }) as typeof process.stdout.write;

    const client = createStdioClient();

    try {
      // 1. Initialize -- send immediately, the process is ready to accept input
      client.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'e2e-test', version: '1.0' },
        },
      });

      const initResponse = await client.receive();
      expect(initResponse.jsonrpc).toBe('2.0');
      expect(initResponse.id).toBe(1);
      expect(initResponse.result).toBeDefined();

      const initResult = initResponse.result as Record<string, unknown>;
      const serverInfo = initResult.serverInfo as Record<string, unknown>;
      expect(serverInfo.name).toBe('peac-mcp-server');
      expect(serverInfo.version).toBe(SERVER_VERSION);

      // Send initialized notification
      client.send({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      // 2. List tools
      client.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      });

      const listResponse = await client.receive();
      expect(listResponse.jsonrpc).toBe('2.0');
      expect(listResponse.id).toBe(2);

      const listResult = listResponse.result as Record<string, unknown>;
      const tools = listResult.tools as Array<Record<string, unknown>>;
      const toolNames = tools.map((t) => t.name).sort();
      expect(toolNames).toEqual(['peac_decode', 'peac_inspect', 'peac_verify']);

      // 3. Call peac_decode with a real receipt
      const { privateKey } = await generateKeypair();
      const { jws } = await issueWire01({
        iss: 'https://api.example.com',
        aud: 'https://client.example.com',
        amt: 100,
        cur: 'USD',
        rail: 'stripe',
        reference: 'tx_e2e',
        privateKey,
        kid: 'e2e-kid',
      });

      client.send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'peac_decode',
          arguments: { jws },
        },
      });

      const callResponse = await client.receive();
      expect(callResponse.jsonrpc).toBe('2.0');
      expect(callResponse.id).toBe(3);

      const callResult = callResponse.result as Record<string, unknown>;

      // Verify text content
      const content = callResult.content as Array<Record<string, unknown>>;
      expect(content.length).toBeGreaterThan(0);
      expect(content[0].type).toBe('text');
      expect(content[0].text as string).toContain('WARNING: Signature NOT verified');

      // Verify _meta in structuredContent
      const structured = callResult.structuredContent as Record<string, unknown>;
      expect(structured._meta).toBeDefined();
      const meta = structured._meta as Record<string, unknown>;
      expect(meta.serverName).toBe('peac-mcp-server');
      expect(meta.serverVersion).toBe(SERVER_VERSION);
      expect(meta.policyHash).toBeDefined();
      expect(meta.protocolVersion).toBe(MCP_PROTOCOL_VERSION);

      // Verify payload content
      expect(structured.verified).toBe(false);
      const header = structured.header as Record<string, unknown>;
      expect(header.typ).toBe('peac-receipt/0.1');
      expect(header.kid).toBe('e2e-kid');
    } catch (err) {
      // Surface stderr on assertion failures for debugging
      const stderr = client.getStderr();
      if (stderr) {
        const augmented =
          err instanceof Error
            ? new Error(`${err.message}\n\n--- stderr ---\n${stderr}`)
            : new Error(`${String(err)}\n\n--- stderr ---\n${stderr}`);
        if (err instanceof Error) augmented.stack = err.stack;
        throw augmented;
      }
      throw err;
    } finally {
      client.close();
      process.stdout.write = origStdoutWrite;

      // Assert no parent-process stdout pollution occurred.
      // Child stdout is piped and fully consumed by the stdio client,
      // so any writes here come from the test code itself (a bug).
      const jsonRpcLeaks = parentStdoutWrites.filter((w) => w.includes('"jsonrpc"'));
      if (jsonRpcLeaks.length > 0) {
        throw new Error(
          `Parent process wrote ${jsonRpcLeaks.length} JSON-RPC line(s) to stdout -- ` +
            `child stdout must be piped, not inherited:\n${jsonRpcLeaks[0]?.slice(0, 200)}`
        );
      }
    }
  }, 15_000);
});
