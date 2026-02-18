#!/usr/bin/env node
/**
 * peac-mcp-server CLI entry point
 *
 * Startup: parse args -> load policy -> load key -> load JWKS ->
 *          install stdout fence -> create server -> connect transport
 */

import { Command } from 'commander';
import { SERVER_NAME, SERVER_VERSION, MCP_PROTOCOL_VERSION } from './infra/constants.js';
import { loadPolicy, getDefaultPolicy, computePolicyHash } from './infra/policy.js';
import { loadIssuerKey } from './infra/key-loader.js';
import { loadJwksFile } from './infra/jwks-loader.js';
import type { JwksKeyEntry } from './infra/jwks-loader.js';
import type { PolicyConfig } from './infra/policy.js';
import type { LoadedKey } from './infra/key-loader.js';
import type { ServerContext } from './handlers/types.js';
import { installStdoutFence } from './stdout-fence.js';
import { createPeacMcpServer } from './server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const program = new Command();

program
  .name(SERVER_NAME)
  .version(SERVER_VERSION)
  .description('PEAC receipt operations as MCP tools')
  .option('--issuer-key <ref>', 'Issuer key reference (env:VAR or file:/path)')
  .option('--issuer-id <uri>', 'Issuer identifier URI')
  .option('--policy <path>', 'Policy configuration file path')
  .option('--jwks-file <path>', 'JWKS file for verifier key resolution')
  .action(async (opts) => {
    // Validate key flag pairing
    if (opts.issuerKey && !opts.issuerId) {
      process.stderr.write('ERROR: --issuer-key requires --issuer-id\n');
      process.exit(1);
    }
    if (opts.issuerId && !opts.issuerKey) {
      process.stderr.write('ERROR: --issuer-id requires --issuer-key\n');
      process.exit(1);
    }

    // Load policy
    let policy: PolicyConfig;
    let policyHash: string;
    if (opts.policy) {
      const loaded = await loadPolicy(opts.policy);
      policy = loaded.policy;
      policyHash = loaded.hash;
    } else {
      policy = getDefaultPolicy();
      policyHash = await computePolicyHash(JSON.stringify(policy));
    }

    // Load issuer key (optional, for PR2 issue tool)
    let issuerKey: LoadedKey | undefined;
    if (opts.issuerKey) {
      issuerKey = await loadIssuerKey(opts.issuerKey);
    }

    // Load JWKS (optional, for verifier key resolution)
    let jwksKeys: JwksKeyEntry[] | undefined;
    if (opts.jwksFile) {
      jwksKeys = await loadJwksFile(opts.jwksFile);
    }

    // Build server context
    const context: ServerContext = {
      version: SERVER_VERSION,
      policyHash,
      protocolVersion: MCP_PROTOCOL_VERSION,
      issuerKey,
      jwksKeys,
    };

    // Install stdout fence BEFORE connecting transport (DD-58)
    const teardownFence = installStdoutFence();

    // Create and connect server
    const server = createPeacMcpServer({
      version: SERVER_VERSION,
      policy,
      policyHash,
      protocolVersion: MCP_PROTOCOL_VERSION,
      context,
    });

    const transport = new StdioServerTransport();

    // Banner to stderr (never stdout)
    const tools = ['peac_verify', 'peac_inspect', 'peac_decode'];
    process.stderr.write(
      `[${SERVER_NAME}] v${SERVER_VERSION} | protocol ${MCP_PROTOCOL_VERSION}\n`
    );
    process.stderr.write(`  Tools: ${tools.join(', ')}\n`);
    process.stderr.write(`  Key: ${issuerKey ? 'loaded' : 'none'}\n`);
    process.stderr.write(`  JWKS: ${jwksKeys ? `${jwksKeys.length} key(s)` : 'none'}\n`);
    process.stderr.write(`  Policy hash: ${policyHash.slice(0, 16)}...\n`);

    // Graceful shutdown
    const shutdown = async () => {
      process.stderr.write(`[${SERVER_NAME}] Shutting down...\n`);
      await server.close();
      teardownFence();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    await server.connect(transport);
  });

void program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(
    `[${SERVER_NAME}] Fatal: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
