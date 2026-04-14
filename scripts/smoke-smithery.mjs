#!/usr/bin/env node
// Smithery smoke harness (self-controlled, local-only).
//
// Validates the canonical Smithery configuration at
// packages/mcp-server/smithery.yaml (the existing source of truth) and
// the tracked sample receipt under surfaces/plugin-pack/smithery/
// without contacting any live endpoint. Remote publish to the
// Smithery directory is an out-of-band manual step; this script
// guards the self-controlled artifacts the repo owns.
//
// Checks:
//   1. packages/mcp-server/smithery.yaml exists and contains the
//      required startCommand + configSchema keys.
//   2. smithery.yaml pins an exact @peac/mcp-server version (no
//      @latest). The smoke fails on drift.
//   3. The bundled sample receipt at
//      surfaces/plugin-pack/smithery/samples/sample-receipt.jws is a
//      3-segment compact JWS whose header declares
//      typ=interaction-record+jwt.
//
// Does NOT touch the network, does NOT open a tunnel, does NOT submit
// to the Smithery directory.
//
// Exit 0 on success; exit 1 on any check failure.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const canonicalYaml = join(repoRoot, 'packages/mcp-server/smithery.yaml');
const samplePath = join(repoRoot, 'surfaces/plugin-pack/smithery/samples/sample-receipt.jws');

let failures = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function fail(msg) {
  failures += 1;
  console.error(`FAIL: ${msg}`);
}

// 1 + 2. smithery.yaml shape + exact-version pin
if (!existsSync(canonicalYaml)) {
  fail(`canonical smithery.yaml missing at ${canonicalYaml}`);
} else {
  const text = readFileSync(canonicalYaml, 'utf8');
  if (!/^startCommand:/m.test(text)) {
    fail('smithery.yaml missing startCommand key');
  } else {
    pass('smithery.yaml has startCommand');
  }
  if (!/^\s*configSchema:/m.test(text)) {
    fail('smithery.yaml missing configSchema');
  } else {
    pass('smithery.yaml has configSchema');
  }
  const pinMatch = text.match(/@peac\/mcp-server@(\d+\.\d+\.\d+)/);
  if (!pinMatch) {
    fail('smithery.yaml does not pin an exact @peac/mcp-server version');
  } else if (text.includes('@peac/mcp-server@latest')) {
    fail('@latest pin forbidden in smithery.yaml');
  } else {
    pass(`smithery.yaml pins @peac/mcp-server@${pinMatch[1]}`);
  }
}

// 3. Sample receipt shape
if (!existsSync(samplePath)) {
  fail(`sample receipt missing at ${samplePath}`);
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
  console.error(`\n${failures} smithery smoke failure(s).`);
  process.exit(1);
}
console.log('\nAll smithery smoke checks passed (canonical smithery.yaml + sample receipt).');
process.exit(0);
