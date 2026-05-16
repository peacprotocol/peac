#!/usr/bin/env node
/**
 * Issue signed PEAC records for each commerce-mandate fixture.
 *
 * Reads every JSON file under ./fixtures/, validates the extension
 * payload through validateCommerceMandate, signs an interaction record
 * with a freshly generated Ed25519 key, and writes the signed records
 * and the public key to ./out/ so verify-fixtures.mjs can verify them
 * offline.
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeypair, base64urlEncode } from '@peac/crypto';
import { issue } from '@peac/protocol';
import {
  COMMERCE_MANDATE_EXTENSION_KEY,
  COMMERCE_MANDATE_TYPE_URIS,
  validateCommerceMandate,
} from '@peac/schema';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(here, 'fixtures');
const OUT_DIR = join(here, 'out');
const OUT_RECORDS = join(OUT_DIR, 'records.json');
const OUT_PUBKEY = join(OUT_DIR, 'pubkey.json');

const TYPE_BY_EVENT_KIND = Object.fromEntries(
  COMMERCE_MANDATE_TYPE_URIS.map((u) => [u.replace('org.peacprotocol/', ''), u])
);

const ISSUER = 'https://commerce.example.com';
const KID = 'commerce-mandate-records-demo';

async function main() {
  console.log('=== Commerce mandate records: issue ===\n');

  const { privateKey, publicKey } = await generateKeypair();

  const fixtureFiles = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const records = [];
  for (const file of fixtureFiles) {
    const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf8'));

    const validation = validateCommerceMandate(fixture);
    if (!validation.ok) {
      console.error(`[FAIL] ${file}: extension validation failed`);
      for (const err of validation.errors) {
        const where = err.path ? ` (${err.path})` : '';
        console.error(`  - ${err.code}${where}: ${err.message}`);
      }
      process.exitCode = 1;
      continue;
    }

    const type = TYPE_BY_EVENT_KIND[fixture.event_kind];
    if (!type) {
      console.error(`[FAIL] ${file}: no type URI registered for event_kind ${fixture.event_kind}`);
      process.exitCode = 1;
      continue;
    }

    // The record's occurred_at is the issuance time. The extension's
    // observed_at carries the reported event time and stays
    // independent of issuance.
    const nowSeconds = Math.floor(Date.now() / 1000);
    const occurredAt = new Date(nowSeconds * 1000).toISOString();

    const result = await issue({
      iss: ISSUER,
      kind: 'evidence',
      type,
      pillars: ['commerce'],
      occurred_at: occurredAt,
      privateKey,
      kid: KID,
      extensions: {
        [COMMERCE_MANDATE_EXTENSION_KEY]: fixture,
      },
    });

    records.push({
      fixture: file,
      type,
      event_kind: fixture.event_kind,
      jws: result.jws,
    });
    console.log(`[OK]   ${file} -> ${type} (${result.jws.length} bytes)`);
  }

  if (records.length === 0) {
    console.error('\nNo records issued.');
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_RECORDS, JSON.stringify({ records }, null, 2) + '\n');
  writeFileSync(
    OUT_PUBKEY,
    JSON.stringify(
      { iss: ISSUER, kid: KID, public_key_b64u: base64urlEncode(publicKey) },
      null,
      2
    ) + '\n'
  );

  console.log(`\nIssued ${records.length} records -> ${OUT_RECORDS}`);
  console.log(`Public key -> ${OUT_PUBKEY}`);
  console.log('\nNext: run `node verify-fixtures.mjs` (or `pnpm verify`).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
