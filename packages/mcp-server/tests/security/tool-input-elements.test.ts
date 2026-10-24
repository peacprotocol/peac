/**
 * Tool input element bound: a tools/call whose arguments hold more array
 * elements and object members than the server allows is rejected before
 * schema validation, with a short error that does not echo the input.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { generateKeypair } from '@peac/crypto';
import { createPeacMcpServer } from '../../src/server.js';
import { getDefaultPolicy, computePolicyHash } from '../../src/infra/policy.js';
import { SERVER_VERSION, MCP_PROTOCOL_VERSION } from '../../src/infra/constants.js';

const MAX_ELEMENTS = 1024;
const ELEMENT_LIMIT_MESSAGE = `arguments contain more than the maximum of ${MAX_ELEMENTS} elements`;

interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

function flatRecord(members: number): Record<string, number> {
  const record: Record<string, number> = {};
  for (let i = 0; i < members; i++) {
    record[`k${i}`] = i;
  }
  return record;
}

function resultText(result: ToolResult): string {
  return result.content.map((c) => c.text ?? '').join('');
}

describe('security/tool-input-elements', () => {
  let client: Client;
  let bundleDir: string;

  beforeAll(async () => {
    bundleDir = mkdtempSync(join(tmpdir(), 'peac-mcp-elements-'));
    const policy = getDefaultPolicy();
    const policyHash = await computePolicyHash(policy);
    const { privateKey, publicKey } = await generateKeypair();
    const server = createPeacMcpServer({
      version: SERVER_VERSION,
      policy,
      policyHash,
      protocolVersion: MCP_PROTOCOL_VERSION,
      context: {
        version: SERVER_VERSION,
        policyHash,
        protocolVersion: MCP_PROTOCOL_VERSION,
        issuerKey: { privateKey, publicKey, kid: 'elements-test-kid' },
        issuerId: 'https://issuer.example.com',
        bundleDir,
      },
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'elements-test', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client?.close();
    rmSync(bundleDir, { recursive: true, force: true });
  });

  async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    return (await client.callTool({ name, arguments: args })) as ToolResult;
  }

  it('rejects an oversized extensions record before the tool handler runs', async () => {
    const result = await call('peac_issue', {
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: flatRecord(100_000),
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    const text = resultText(result);
    expect(text).toContain(ELEMENT_LIMIT_MESSAGE);
    expect(text.length).toBeLessThan(200);
    expect(text).not.toContain('k99999');
  });

  it('rejects an oversized bundle metadata record before the tool handler runs', async () => {
    const result = await call('peac_create_bundle', {
      receipts: ['a.b.c'],
      metadata: flatRecord(100_000),
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    const text = resultText(result);
    expect(text).toContain(ELEMENT_LIMIT_MESSAGE);
    expect(text.length).toBeLessThan(200);
  });

  it('counts nested members toward the bound', async () => {
    const nested: Record<string, Record<string, number>> = {};
    for (let i = 0; i < 64; i++) {
      nested[`org.example/group${i}`] = flatRecord(32);
    }
    const result = await call('peac_issue', {
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: nested,
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(resultText(result)).toContain(ELEMENT_LIMIT_MESSAGE);
  });

  it('admits arguments with exactly the maximum number of elements', async () => {
    // 3 top-level members plus 1021 extension members = 1024 elements
    const result = await call('peac_issue', {
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: flatRecord(MAX_ELEMENTS - 3),
    });

    expect(resultText(result)).not.toContain(ELEMENT_LIMIT_MESSAGE);
    expect(result.structuredContent).toBeDefined();
    expect(result.structuredContent?._meta).toBeDefined();
  });

  it('rejects arguments with one element over the maximum', async () => {
    const result = await call('peac_issue', {
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: flatRecord(MAX_ELEMENTS - 2),
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(resultText(result)).toContain(ELEMENT_LIMIT_MESSAGE);
  });

  it('admits a bundle call at the schema maximum of 256 receipts', async () => {
    const receipts = Array.from({ length: 256 }, () => 'a.b.c');
    const result = await call('peac_create_bundle', { receipts });

    expect(resultText(result)).not.toContain(ELEMENT_LIMIT_MESSAGE);
    expect(result.structuredContent?._meta).toBeDefined();
  });
});
