import { describe, it, expect } from 'vitest';
import { createPeacMcpServer } from '../../src/server.js';
import { getDefaultPolicy, computePolicyHash } from '../../src/infra/policy.js';
import { SERVER_VERSION, MCP_PROTOCOL_VERSION } from '../../src/infra/constants.js';

describe('integration/lifecycle', () => {
  async function makeServer() {
    const policy = getDefaultPolicy();
    const policyHash = await computePolicyHash(policy);
    return createPeacMcpServer({
      version: SERVER_VERSION,
      policy,
      policyHash,
      protocolVersion: MCP_PROTOCOL_VERSION,
      context: {
        version: SERVER_VERSION,
        policyHash,
        protocolVersion: MCP_PROTOCOL_VERSION,
      },
    });
  }

  it('creates a server instance', async () => {
    const server = await makeServer();
    expect(server).toBeDefined();
    expect(server.server).toBeDefined();
  });

  it('can close without connecting', async () => {
    const server = await makeServer();
    await expect(server.close()).resolves.not.toThrow();
  });

  it('exports public API types', async () => {
    // Verify the main exports are accessible
    const mod = await import('../../src/index.js');
    expect(mod.createPeacMcpServer).toBeDefined();
    expect(mod.handleVerify).toBeDefined();
    expect(mod.handleInspect).toBeDefined();
    expect(mod.handleDecode).toBeDefined();
    expect(mod.handleIssue).toBeDefined();
    expect(mod.handleCreateBundle).toBeDefined();
    expect(mod.checkJwsSize).toBeDefined();
    expect(mod.checkToolEnabled).toBeDefined();
    expect(mod.checkInputSizes).toBeDefined();
    expect(mod.checkObjectDepth).toBeDefined();
    expect(mod.measureEnvelopeBytes).toBeDefined();
    expect(mod.truncateResponse).toBeDefined();
    expect(mod.getDefaultPolicy).toBeDefined();
    expect(mod.installStdoutFence).toBeDefined();
    expect(mod.SERVER_NAME).toBe('peac-mcp-server');
    // PR2 exports
    expect(mod.IssueToolError).toBeDefined();
    expect(mod.BundleToolError).toBeDefined();
    expect(mod.PathTraversalError).toBeDefined();
    expect(mod.assertRelativePath).toBeDefined();
    expect(mod.resolveOutputPath).toBeDefined();
    expect(mod.safeMkdir).toBeDefined();
    expect(mod.atomicWriteDir).toBeDefined();
    expect(mod.createTempDir).toBeDefined();
    expect(mod.DEFAULT_MAX_CLAIMS_BYTES).toBe(262_144);
    expect(mod.DEFAULT_MAX_BUNDLE_RECEIPTS).toBe(256);
    expect(mod.DEFAULT_MAX_BUNDLE_BYTES).toBe(16_777_216);
    expect(mod.DEFAULT_MAX_TTL_SECONDS).toBe(86_400);
  });

  it('package.json files field limits published contents', async () => {
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(new URL('../../package.json', import.meta.url), 'utf-8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    expect(pkg.files).toEqual(['dist', 'README.md']);
  });

  it('handler result matches expected shape', async () => {
    const { handleDecode } = await import('../../src/handlers/decode.js');
    const { generateKeypair } = await import('@peac/crypto');
    const { issue } = await import('@peac/protocol');

    const { privateKey } = await generateKeypair();
    const { jws } = await issue({
      iss: 'https://api.example.com',
      aud: 'https://client.example.com',
      amt: 100,
      cur: 'USD',
      rail: 'stripe',
      reference: 'tx_test123',
      privateKey,
      kid: 'test-kid',
    });

    const result = await handleDecode({
      input: { jws },
      policy: getDefaultPolicy(),
      context: {
        version: SERVER_VERSION,
        policyHash: 'testhash',
        protocolVersion: MCP_PROTOCOL_VERSION,
      },
    });

    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('structured');
    expect(typeof result.text).toBe('string');
    expect(typeof result.structured).toBe('object');
  });
});
