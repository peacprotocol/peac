#!/usr/bin/env node
/**
 * peac-mcp-server CLI entry point
 *
 * Startup: parse args -> load policy -> load key -> load JWKS ->
 *          select transport -> create server -> connect
 *
 * Transports:
 *   stdio (default): stdin/stdout JSON-RPC, stdout fence (DD-58)
 *   http: Streamable HTTP on configurable port, session-isolated (DD-119)
 */

import { stat as fsStat, realpath } from 'node:fs/promises';
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
import type { ServerOptions } from './server.js';

const program = new Command();

program
  .name(SERVER_NAME)
  .version(SERVER_VERSION)
  .description('PEAC receipt operations as MCP tools')
  .option('--issuer-key <ref>', 'Issuer key reference (env:VAR or file:/path)')
  .option('--issuer-id <uri>', 'Issuer identifier URI')
  .option('--policy <path>', 'Policy configuration file path')
  .option('--jwks-file <path>', 'JWKS file for verifier key resolution')
  .option('--bundle-dir <path>', 'Directory for evidence bundle output')
  .option('--transport <type>', 'Transport: stdio (default) or http', 'stdio')
  .option('--port <number>', 'HTTP port (default: 3000, http only)', '3000')
  .option('--host <address>', 'HTTP bind address (default: 127.0.0.1)', '127.0.0.1')
  .option('--cors-origins <list>', 'Allowed CORS origins (comma-separated)')
  .option(
    '--authorization-servers <list>',
    'OAuth authorization server URIs (enables PRM with --public-url)'
  )
  .option('--public-url <url>', 'Canonical public URL of this server (required for PRM)')
  .option('--trust-proxy', 'Trust X-Forwarded-For for rate limiting (off by default)')
  .action(async (opts) => {
    // Validate transport
    const transportType = opts.transport as string;
    if (transportType !== 'stdio' && transportType !== 'http') {
      process.stderr.write(
        `ERROR: --transport must be "stdio" or "http", got "${transportType}"\n`
      );
      process.exit(1);
    }

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

    // Load issuer key (optional, for issue tool)
    let issuerKey: LoadedKey | undefined;
    if (opts.issuerKey) {
      issuerKey = await loadIssuerKey(opts.issuerKey);
    }

    // Load JWKS (optional, for verifier key resolution)
    let jwksKeys: JwksKeyEntry[] | undefined;
    if (opts.jwksFile) {
      jwksKeys = await loadJwksFile(opts.jwksFile);
    }

    // Validate bundle-dir (optional, for bundle tool)
    let bundleDir: string | undefined;
    if (opts.bundleDir) {
      try {
        const s = await fsStat(opts.bundleDir);
        if (!s.isDirectory()) {
          process.stderr.write(`ERROR: --bundle-dir is not a directory: ${opts.bundleDir}\n`);
          process.exit(1);
        }
        bundleDir = await realpath(opts.bundleDir);
      } catch (err) {
        process.stderr.write(
          `ERROR: --bundle-dir not accessible: ${opts.bundleDir} -- ${err instanceof Error ? err.message : String(err)}\n`
        );
        process.exit(1);
      }
    }

    // Build server context
    const context: ServerContext = {
      version: SERVER_VERSION,
      policyHash,
      protocolVersion: MCP_PROTOCOL_VERSION,
      issuerKey,
      jwksKeys,
      issuerId: opts.issuerId,
      bundleDir,
    };

    // Compute tool list for banner
    const tools = ['peac_verify', 'peac_inspect', 'peac_decode'];
    if (issuerKey && opts.issuerId) {
      tools.push('peac_issue');
      if (bundleDir) {
        tools.push('peac_create_bundle');
      }
    }

    // Server options (shared between stdio and http)
    const serverOptions: ServerOptions = {
      version: SERVER_VERSION,
      policy,
      policyHash,
      protocolVersion: MCP_PROTOCOL_VERSION,
      context,
    };

    // Banner to stderr (never stdout)
    process.stderr.write(
      `[${SERVER_NAME}] v${SERVER_VERSION} | protocol ${MCP_PROTOCOL_VERSION}\n`
    );
    process.stderr.write(`  Transport: ${transportType}\n`);
    process.stderr.write(`  Tools: ${tools.join(', ')}\n`);
    process.stderr.write(`  Key: ${issuerKey ? 'loaded' : 'none'}\n`);
    process.stderr.write(`  JWKS: ${jwksKeys ? `${jwksKeys.length} key(s)` : 'none'}\n`);
    process.stderr.write(`  Bundle dir: ${bundleDir ?? 'none'}\n`);
    process.stderr.write(`  Policy hash: ${policyHash.slice(0, 16)}...\n`);

    if (transportType === 'http') {
      // --- HTTP transport (DD-119) ---
      const { createHttpTransport } = await import('./http-transport.js');

      const corsOrigins = opts.corsOrigins
        ? (opts.corsOrigins as string).split(',').map((s: string) => s.trim())
        : undefined;
      const authorizationServers = opts.authorizationServers
        ? (opts.authorizationServers as string).split(',').map((s: string) => s.trim())
        : undefined;

      const { cleanup } = await createHttpTransport({
        port: parseInt(opts.port as string, 10),
        host: opts.host as string,
        corsOrigins,
        authorizationServers,
        publicUrl: opts.publicUrl as string | undefined,
        trustProxy: !!opts.trustProxy,
        serverFactory: () => createPeacMcpServer(serverOptions),
      });

      // Graceful shutdown
      const shutdown = async () => {
        process.stderr.write(`[${SERVER_NAME}] Shutting down...\n`);
        await cleanup();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    } else {
      // --- stdio transport (default, unchanged) ---
      const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');

      // Install stdout fence BEFORE connecting transport (DD-58)
      const teardownFence = installStdoutFence();

      const server = createPeacMcpServer(serverOptions);
      const transport = new StdioServerTransport();

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
    }
  });

void program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(
    `[${SERVER_NAME}] Fatal: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
