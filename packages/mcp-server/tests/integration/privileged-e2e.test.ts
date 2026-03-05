/**
 * Privileged tools E2E test -- spawns peac-mcp-server CLI as a child process
 * with --issuer-key / --issuer-id / --bundle-dir arguments, then exercises
 * the privileged tools (peac_issue, peac_create_bundle) via stdio JSON-RPC.
 *
 * This validates:
 * - tools/list returns 5 tools when key + bundleDir are configured
 * - tools/list returns 3 tools when no key is configured
 * - tools/list returns 4 tools when key but no bundleDir is configured
 * - Tool annotations match expected values for all 5 tools
 * - issue -> verify round-trip succeeds via stdio
 * - _meta audit block is present on privileged tool responses
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { generateKeypair, base64urlEncode } from '@peac/crypto';
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
  const queue: Record<string, unknown>[] = [];
  const pending: Array<{
    resolve: (msg: Record<string, unknown>) => void;
    reject: (err: Error) => void;
  }> = [];
  const stderrChunks: string[] = [];
  let buffer = '';
  let fatalError: Error | undefined;

  const child = spawn('node', [CLI_PATH, ...args], {
    cwd: PKG_ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  function setFatal(err: Error): void {
    if (fatalError) return;
    fatalError = err;
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
    send(msg) {
      if (fatalError) throw fatalError;
      child.stdin!.write(JSON.stringify(msg) + '\n');
    },
    receive() {
      if (fatalError) return Promise.reject(fatalError);
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
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

async function initClient(client: StdioClient): Promise<void> {
  client.send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'priv-e2e', version: '1.0' },
    },
  });
  await client.receive(); // init response
  client.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
}

let keyDir: string;
let keyPath: string;
let bundleDir: string;
let publicKeyB64: string;

beforeAll(async () => {
  keyDir = mkdtempSync(join(tmpdir(), 'peac-priv-e2e-key-'));
  bundleDir = mkdtempSync(join(tmpdir(), 'peac-priv-e2e-bundle-'));
  keyPath = join(keyDir, 'issuer.jwk.json');

  const { privateKey, publicKey } = await generateKeypair();
  publicKeyB64 = base64urlEncode(publicKey);
  const jwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    d: base64urlEncode(privateKey),
    x: publicKeyB64,
  };
  writeFileSync(keyPath, JSON.stringify(jwk));
});

afterAll(() => {
  rmSync(keyDir, { recursive: true, force: true });
  rmSync(bundleDir, { recursive: true, force: true });
});

// In CI, dist must exist (turbo builds before tests). Locally, skip gracefully.
describe.skipIf(!CLI_EXISTS && !IS_CI)('integration/privileged-e2e', () => {
  if (IS_CI && !CLI_EXISTS) {
    throw new Error(`dist/cli.cjs not found at ${CLI_PATH} -- CI must build before tests`);
  }

  it('tools/list shows 5 tools with key and bundleDir configured', async () => {
    const client = createStdioClient([
      '--issuer-key',
      `file:${keyPath}`,
      '--issuer-id',
      'https://test.example.com',
      '--bundle-dir',
      bundleDir,
    ]);

    try {
      await initClient(client);

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
      expect(toolNames).toEqual([
        'peac_create_bundle',
        'peac_decode',
        'peac_inspect',
        'peac_issue',
        'peac_verify',
      ]);
    } catch (err) {
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
    }
  }, 15_000);

  it('tools/list shows 3 tools without key', async () => {
    const client = createStdioClient([]);

    try {
      await initClient(client);

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
    } catch (err) {
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
    }
  }, 15_000);

  it('tools/list shows 4 tools with key but no bundleDir', async () => {
    const client = createStdioClient([
      '--issuer-key',
      `file:${keyPath}`,
      '--issuer-id',
      'https://test.example.com',
    ]);

    try {
      await initClient(client);

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
      expect(toolNames).toEqual(['peac_decode', 'peac_inspect', 'peac_issue', 'peac_verify']);
    } catch (err) {
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
    }
  }, 15_000);

  it('all tools include outputSchema in tools/list response', async () => {
    const client = createStdioClient([
      '--issuer-key',
      `file:${keyPath}`,
      '--issuer-id',
      'https://test.example.com',
      '--bundle-dir',
      bundleDir,
    ]);

    try {
      await initClient(client);

      client.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      });

      const listResponse = await client.receive();
      const listResult = listResponse.result as Record<string, unknown>;
      const tools = listResult.tools as Array<Record<string, unknown>>;

      for (const tool of tools) {
        expect(tool.outputSchema).toBeDefined();
        expect(typeof tool.outputSchema).toBe('object');
        // outputSchema should have JSON Schema structure
        const schema = tool.outputSchema as Record<string, unknown>;
        expect(schema.type).toBe('object');
        // All output schemas include _meta
        const properties = schema.properties as Record<string, unknown>;
        expect(properties._meta).toBeDefined();
      }
    } catch (err) {
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
    }
  }, 15_000);

  it('annotations snapshot: all tools have expected annotations', async () => {
    const client = createStdioClient([
      '--issuer-key',
      `file:${keyPath}`,
      '--issuer-id',
      'https://test.example.com',
      '--bundle-dir',
      bundleDir,
    ]);

    try {
      await initClient(client);

      client.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      });

      const listResponse = await client.receive();
      const listResult = listResponse.result as Record<string, unknown>;
      const tools = listResult.tools as Array<Record<string, unknown>>;

      const byName = Object.fromEntries(tools.map((t) => [t.name as string, t]));

      const pureAnnotations = {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      };

      expect(byName['peac_verify']?.annotations).toEqual(pureAnnotations);
      expect(byName['peac_inspect']?.annotations).toEqual(pureAnnotations);
      expect(byName['peac_decode']?.annotations).toEqual(pureAnnotations);

      expect(byName['peac_issue']?.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      });

      expect(byName['peac_create_bundle']?.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      });
    } catch (err) {
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
    }
  }, 15_000);

  it('issue then verify round-trip via stdio', async () => {
    const client = createStdioClient([
      '--issuer-key',
      `file:${keyPath}`,
      '--issuer-id',
      'https://test.example.com',
      '--bundle-dir',
      bundleDir,
    ]);

    try {
      await initClient(client);

      // Call peac_issue
      client.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'peac_issue',
          arguments: {
            kind: 'evidence',
            type: 'org.peacprotocol/payment',
            pillars: ['commerce'],
          },
        },
      });

      const issueResponse = await client.receive();
      expect(issueResponse.jsonrpc).toBe('2.0');
      expect(issueResponse.id).toBe(2);

      const issueResult = issueResponse.result as Record<string, unknown>;
      const issueStructured = issueResult.structuredContent as Record<string, unknown>;
      expect(issueStructured.ok).toBe(true);

      const jws = issueStructured.jws as string;
      expect(typeof jws).toBe('string');
      expect(jws.length).toBeGreaterThan(0);

      // Call peac_verify with the issued JWS
      client.send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'peac_verify',
          arguments: {
            jws,
            public_key_base64url: publicKeyB64,
          },
        },
      });

      const verifyResponse = await client.receive();
      expect(verifyResponse.jsonrpc).toBe('2.0');
      expect(verifyResponse.id).toBe(3);

      const verifyResult = verifyResponse.result as Record<string, unknown>;
      const verifyStructured = verifyResult.structuredContent as Record<string, unknown>;
      expect(verifyStructured.ok).toBe(true);
    } catch (err) {
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
    }
  }, 15_000);

  it('_meta present on privileged tool responses', async () => {
    const client = createStdioClient([
      '--issuer-key',
      `file:${keyPath}`,
      '--issuer-id',
      'https://test.example.com',
      '--bundle-dir',
      bundleDir,
    ]);

    try {
      await initClient(client);

      client.send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'peac_issue',
          arguments: {
            kind: 'evidence',
            type: 'org.peacprotocol/payment',
          },
        },
      });

      const issueResponse = await client.receive();
      expect(issueResponse.jsonrpc).toBe('2.0');
      expect(issueResponse.id).toBe(2);

      const issueResult = issueResponse.result as Record<string, unknown>;
      const structured = issueResult.structuredContent as Record<string, unknown>;
      expect(structured._meta).toBeDefined();

      const meta = structured._meta as Record<string, unknown>;
      expect(meta.serverName).toBe('peac-mcp-server');
      expect(meta.serverVersion).toBe(SERVER_VERSION);
      expect(meta.policyHash).toBeDefined();
      expect(meta.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
      expect(meta.registeredTools).toEqual([
        'peac_verify',
        'peac_inspect',
        'peac_decode',
        'peac_issue',
        'peac_create_bundle',
      ]);
    } catch (err) {
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
    }
  }, 15_000);
});
