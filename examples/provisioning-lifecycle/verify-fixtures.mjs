#!/usr/bin/env node
/**
 * Verify the records produced by issue-fixtures.mjs.
 *
 * Reads ./out/records.json and ./out/pubkey.json, then verifies each
 * record offline against the published public key. Prints a per-record
 * verdict and a final summary. The private key is not required.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { base64urlDecode } from '@peac/crypto';
import { verifyLocal } from '@peac/protocol';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, 'out');
const OUT_RECORDS = join(OUT_DIR, 'records.json');
const OUT_PUBKEY = join(OUT_DIR, 'pubkey.json');

function readJsonRequired(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
      throw new Error(
        `Missing ${label}. Run \`node issue-fixtures.mjs\` (or \`pnpm issue\`) first.`
      );
    }
    throw err;
  }
}

async function main() {
  console.log('=== Provisioning lifecycle: verify ===\n');

  const { records } = readJsonRequired(OUT_RECORDS, './out/records.json');
  const pub = readJsonRequired(OUT_PUBKEY, './out/pubkey.json');
  const publicKey = base64urlDecode(pub.public_key_b64u);

  let pass = 0;
  let fail = 0;
  for (const r of records) {
    const result = await verifyLocal(r.jws, publicKey);
    if (result.valid) {
      pass += 1;
      console.log(`[OK]   ${r.fixture} (${r.type})`);
    } else {
      fail += 1;
      const reason = 'message' in result ? result.message : 'invalid';
      console.log(`[FAIL] ${r.fixture} (${r.type}): ${reason}`);
    }
  }

  console.log(`\nVerified ${pass}/${records.length} records (issuer=${pub.iss})`);
  if (fail > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
