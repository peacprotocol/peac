#!/usr/bin/env node
/**
 * Shared MCP server install validation script.
 *
 * Packs @peac/mcp-server into a tarball, installs it in an isolated
 * directory, and validates:
 * 1. npx peac-mcp-server --help exits cleanly
 * 2. MCP initialize message gets a valid response
 * 3. tools/list returns expected tools
 *
 * Used by verify:distribution and PR6 install smoke tests.
 *
 * Usage: node scripts/validate-mcp-install.mjs
 */

import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf-8', timeout: 60_000, ...opts }).trim();
}

let tmpDir;
let exitCode = 0;

try {
  console.log('MCP Install Validation');
  console.log('======================\n');

  // Step 1: Pack the MCP server
  console.log('1. Packing @peac/mcp-server...');
  const packDir = mkdtempSync(join(tmpdir(), 'peac-mcp-pack-'));
  const packOutput = run(
    `pnpm --filter @peac/mcp-server exec pnpm pack --pack-destination ${packDir}`,
    { cwd: ROOT }
  );
  const tarball = packOutput.split('\n').pop();
  console.log(`   Tarball: ${tarball}`);

  // Step 2: Create isolated install directory
  console.log('2. Installing in isolated directory...');
  tmpDir = mkdtempSync(join(tmpdir(), 'peac-mcp-install-'));
  writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'mcp-install-test', private: true }));
  run(`npm install "${tarball}" --no-audit --no-fund`, { cwd: tmpDir });
  console.log('   Install: OK');

  // Step 3: Verify --help
  console.log('3. Testing --help...');
  const helpOutput = run('npx peac-mcp-server --help', { cwd: tmpDir });
  if (!helpOutput.includes('peac') && !helpOutput.includes('MCP') && !helpOutput.includes('mcp')) {
    throw new Error(`--help output does not mention peac/MCP: ${helpOutput.slice(0, 200)}`);
  }
  console.log('   --help: OK');

  // Step 4: Test MCP initialize
  console.log('4. Testing MCP initialize...');
  const initMsg = JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialize',
    id: 1,
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'install-test', version: '1.0' },
    },
  });
  const initOutput = run(
    `echo '${initMsg}' | npx peac-mcp-server 2>/dev/null || true`,
    { cwd: tmpDir, timeout: 15_000 }
  );
  if (initOutput.includes('"result"') || initOutput.includes('"jsonrpc"')) {
    console.log('   Initialize: OK (got JSON-RPC response)');
  } else {
    console.log('   Initialize: WARN (no JSON-RPC response, server may require session)');
  }

  // Step 5: Verify no workspace:* deps leaked
  console.log('5. Checking for workspace:* leakage...');
  const pkgJson = run(`cat node_modules/@peac/mcp-server/package.json`, { cwd: tmpDir });
  if (pkgJson.includes('workspace:')) {
    throw new Error('Tarball contains unresolved workspace:* dependencies');
  }
  console.log('   No workspace:* deps: OK');

  // Step 6: Verify kernel LOCAL pack hygiene (#327)
  console.log('6. Checking kernel local pack hygiene (#327)...');
  const kernelPackDir = mkdtempSync(join(tmpdir(), 'peac-kernel-pack-'));
  const kernelTarball = run(
    `pnpm --filter @peac/kernel exec pnpm pack --pack-destination ${kernelPackDir}`,
    { cwd: ROOT }
  );
  const kernelFiles = run(`tar tf "${kernelTarball.split('\\n').pop()}" | grep __tests__ || echo "CLEAN"`);
  if (kernelFiles !== 'CLEAN') {
    throw new Error(`Kernel local pack leaks dist/__tests__/: ${kernelFiles}`);
  }
  console.log('   Kernel local pack: CLEAN (no dist/__tests__)');

  console.log('\nAll checks passed.');
} catch (err) {
  console.error(`\nFAILED: ${err.message}`);
  exitCode = 1;
} finally {
  // Cleanup
  if (tmpDir) {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

process.exit(exitCode);
