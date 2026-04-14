#!/usr/bin/env node
// Claude Code plugin-pack smoke harness (self-controlled, offline).
//
// Validates the tracked Claude Code pack at
// surfaces/plugin-pack/claude-code/ without requiring Claude Code, the
// Anthropic API, or any network call. The same MCP config shape is
// compatible with Claude Desktop, so this smoke also covers that
// surface.
//
// Checks:
//   1. .mcp.json is valid JSON with a pinned @peac/mcp-server server
//      entry; @latest is forbidden.
//   2. peac/SKILL.md (primary skill) is present and non-empty.
//   3. peac/explain-receipt.md and peac/verify-receipt.md skills are
//      present.
//   4. A sample receipt in peac/samples/sample-receipt.jws parses as
//      a 3-segment compact JWS with typ=interaction-record+jwt.
//
// Exit 0 on success; exit 1 on any failure.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const packDir = join(repoRoot, 'surfaces/plugin-pack/claude-code');

let failures = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function fail(msg) {
  failures += 1;
  console.error(`FAIL: ${msg}`);
}

// 1. .mcp.json
const mcpPath = join(packDir, '.mcp.json');
if (!existsSync(mcpPath)) {
  fail('.mcp.json missing');
} else {
  try {
    const cfg = JSON.parse(readFileSync(mcpPath, 'utf8'));
    const server = cfg?.mcpServers?.peac;
    if (!server) {
      fail('mcpServers.peac missing in .mcp.json');
    } else {
      const args = server.args ?? [];
      const pinned = args[args.length - 1];
      if (!/^@peac\/mcp-server@\d+\.\d+\.\d+$/.test(pinned)) {
        fail(`.mcp.json must pin an exact version (got ${pinned})`);
      } else if (pinned.includes('@latest')) {
        fail(`@latest forbidden in .mcp.json (got ${pinned})`);
      } else {
        pass(`.mcp.json pins ${pinned}`);
      }
    }
  } catch (err) {
    fail(`.mcp.json is not valid JSON: ${err.message}`);
  }
}

// 2 + 3. Skills
for (const rel of ['peac/SKILL.md', 'peac/explain-receipt.md', 'peac/verify-receipt.md']) {
  const p = join(packDir, rel);
  if (!existsSync(p)) {
    fail(`${rel} missing`);
  } else {
    const body = readFileSync(p, 'utf8');
    if (body.length < 50) {
      fail(`${rel} too short (${body.length} bytes)`);
    } else {
      pass(`${rel} present (${body.length} bytes)`);
    }
  }
}

// 4. Sample receipt shape
const samplePath = join(packDir, 'peac/samples/sample-receipt.jws');
if (!existsSync(samplePath)) {
  fail('peac/samples/sample-receipt.jws missing');
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
  console.error(`\n${failures} claude-code-pack smoke failure(s).`);
  process.exit(1);
}
console.log('\nAll claude-code-pack smoke checks passed.');
process.exit(0);
