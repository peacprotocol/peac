#!/usr/bin/env node
// Codex plugin-pack smoke harness (self-controlled, offline).
//
// Validates the tracked Codex pack at surfaces/plugin-pack/codex/
// without requiring a Codex install or network call.
//
// Checks:
//   1. codex-config.pinned.json is valid JSON, pins an exact
//      @peac/mcp-server version, and forbids @latest.
//   2. codex-config.json (the historical unpinned variant) is still a
//      valid JSON object (compat shape).
//   3. Sample receipt in samples/sample-receipt.jws parses as a
//      3-segment compact JWS with typ=interaction-record+jwt.
//
// Does NOT invoke Codex, does NOT verify signatures, does NOT make any
// network call. Exit 0 on success; exit 1 on any failure.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const packDir = join(repoRoot, 'surfaces/plugin-pack/codex');

let failures = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function fail(msg) {
  failures += 1;
  console.error(`FAIL: ${msg}`);
}

// 1. Pinned config
const pinnedPath = join(packDir, 'codex-config.pinned.json');
if (!existsSync(pinnedPath)) {
  fail(`codex-config.pinned.json missing at ${pinnedPath}`);
} else {
  try {
    const cfg = JSON.parse(readFileSync(pinnedPath, 'utf8'));
    const server = cfg?.mcpServers?.peac;
    if (!server) {
      fail('mcpServers.peac missing in codex-config.pinned.json');
    } else {
      const args = server.args ?? [];
      const pinned = args[args.length - 1];
      if (!/^@peac\/mcp-server@\d+\.\d+\.\d+$/.test(pinned)) {
        fail(`pinned config must pin an exact version (got ${pinned})`);
      } else if (pinned.includes('@latest')) {
        fail(`@latest forbidden in pinned config (got ${pinned})`);
      } else {
        pass(`codex-config.pinned.json pins ${pinned}`);
      }
    }
  } catch (err) {
    fail(`codex-config.pinned.json is not valid JSON: ${err.message}`);
  }
}

// 2. Historical unpinned variant still parses
const legacyPath = join(packDir, 'codex-config.json');
if (!existsSync(legacyPath)) {
  fail(`codex-config.json missing at ${legacyPath}`);
} else {
  try {
    JSON.parse(readFileSync(legacyPath, 'utf8'));
    pass('codex-config.json (historical variant) is valid JSON');
  } catch (err) {
    fail(`codex-config.json is not valid JSON: ${err.message}`);
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
  console.error(`\n${failures} codex-pack smoke failure(s).`);
  process.exit(1);
}
console.log('\nAll codex-pack smoke checks passed.');
process.exit(0);
