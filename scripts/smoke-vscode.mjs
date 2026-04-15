#!/usr/bin/env node
// VS Code plugin-pack smoke harness (self-controlled, offline).
//
// Validates the tracked VS Code pack at surfaces/plugin-pack/vscode/
// without requiring VS Code, GitHub Copilot, or any network call.
// Exit 0 on success; exit 1 on any failure.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const packDir = join(repoRoot, 'surfaces/plugin-pack/vscode');

let failures = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function fail(msg) {
  failures += 1;
  console.error(`FAIL: ${msg}`);
}

const mcpPath = join(packDir, 'mcp.json');
if (!existsSync(mcpPath)) {
  fail('mcp.json missing');
} else {
  try {
    const cfg = JSON.parse(readFileSync(mcpPath, 'utf8'));
    const server = cfg?.servers?.peac;
    if (!server) {
      fail('servers.peac missing in mcp.json (VS Code uses top-level `servers`, not `mcpServers`)');
    } else {
      const args = server.args ?? [];
      const pinned = args[args.length - 1];
      if (!/^@peac\/mcp-server@\d+\.\d+\.\d+$/.test(pinned)) {
        fail(`mcp.json must pin an exact version (got ${pinned})`);
      } else if (pinned.includes('@latest')) {
        fail(`@latest pin forbidden (got ${pinned})`);
      } else {
        pass(`mcp.json pins ${pinned}`);
      }
    }
  } catch (err) {
    fail(`mcp.json is not valid JSON: ${err.message}`);
  }
}

const samplePath = join(packDir, 'samples/sample-receipt.jws');
if (!existsSync(samplePath)) {
  fail('samples/sample-receipt.jws missing');
} else {
  const raw = readFileSync(samplePath, 'utf8').trim();
  const parts = raw.split('.');
  if (parts.length !== 3) {
    fail(`sample receipt must have 3 base64url segments, got ${parts.length}`);
  } else {
    try {
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      if (header.typ !== 'interaction-record+jwt') {
        fail(
          `sample receipt typ must be interaction-record+jwt, got ${JSON.stringify(header.typ)}`
        );
      } else {
        pass(`sample receipt compact JWS shape + typ OK (alg=${header.alg}, kid=${header.kid})`);
      }
    } catch (err) {
      fail(`sample receipt header did not decode as JSON: ${err.message}`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} vscode-pack smoke failure(s).`);
  process.exit(1);
}
console.log('\nAll vscode-pack smoke checks passed.');
process.exit(0);
