#!/usr/bin/env node
// Cursor plugin-pack smoke harness (self-controlled, offline).
//
// Validates the tracked Cursor pack at surfaces/plugin-pack/cursor/
// without requiring a Cursor install, marketplace review, or any
// network call. Exercises every deterministic check the repo owns:
//
//   1. mcp.json is valid JSON with a pinned @peac/mcp-server server
//      entry. @latest is forbidden; the smoke fails on drift.
//   2. The Cursor project rule (peac.mdc) is present and non-empty.
//   3. A sample receipt in samples/sample-receipt.jws parses as a
//      3-segment compact JWS whose header JSON declares
//      typ=interaction-record+jwt.
//
// Does NOT:
//   - invoke Cursor
//   - verify the sample receipt's signature (it is a synthetic fixture
//     for offline smoke; verification requires issuer keys)
//   - make any network call
//
// Exit 0 on success; exit 1 on any check failure.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const packDir = join(repoRoot, 'surfaces/plugin-pack/cursor');

let failures = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function fail(msg) {
  failures += 1;
  console.error(`FAIL: ${msg}`);
}

// 1. mcp.json
const mcpJsonPath = join(packDir, 'mcp.json');
if (!existsSync(mcpJsonPath)) {
  fail(`mcp.json missing at ${mcpJsonPath}`);
} else {
  try {
    const cfg = JSON.parse(readFileSync(mcpJsonPath, 'utf8'));
    const server = cfg?.mcpServers?.peac;
    if (!server) {
      fail('mcpServers.peac missing in mcp.json');
    } else if (server.command !== 'npx') {
      fail(`expected command "npx", got ${JSON.stringify(server.command)}`);
    } else if (!Array.isArray(server.args) || server.args.length < 2) {
      fail('mcpServers.peac.args must be an array of at least 2 entries');
    } else {
      const pinned = server.args[server.args.length - 1];
      if (!/^@peac\/mcp-server@\d+\.\d+\.\d+$/.test(pinned)) {
        fail(`mcpServers.peac.args must pin an exact version (got ${pinned})`);
      } else if (pinned.includes('@latest')) {
        fail(`@latest pin forbidden in pack (got ${pinned})`);
      } else {
        pass(`mcp.json pins ${pinned}`);
      }
    }
  } catch (err) {
    fail(`mcp.json is not valid JSON: ${err.message}`);
  }
}

// 2. Cursor project rule present
const mdcPath = join(packDir, 'peac.mdc');
if (!existsSync(mdcPath)) {
  fail('peac.mdc (Cursor project rule) missing');
} else {
  const body = readFileSync(mdcPath, 'utf8');
  if (body.length < 50) {
    fail(`peac.mdc too short (${body.length} bytes)`);
  } else {
    pass(`peac.mdc present (${body.length} bytes)`);
  }
}

// 3. Sample receipt shape
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
  console.error(`\n${failures} cursor-pack smoke failure(s).`);
  process.exit(1);
}
console.log('\nAll cursor-pack smoke checks passed.');
process.exit(0);
