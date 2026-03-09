#!/usr/bin/env node
/**
 * Backfill existing Wire 0.2 fixtures with requirement traceability metadata.
 * Adds primary_requirement_id, requirement_ids[], and status fields.
 *
 * Usage: node scripts/conformance/backfill-existing-fixtures.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const FIXTURES = join(ROOT, 'specs/conformance/fixtures/wire-02');

// Mapping rules: error_code -> primary requirement
const ERROR_TO_REQ = {
  E_JWS_EMBEDDED_KEY: 'WIRE02-JOSE-003',
  E_JWS_CRIT_REJECTED: 'WIRE02-JOSE-004',
  E_JWS_MISSING_KID: 'WIRE02-JOSE-007',
  E_JWS_B64_REJECTED: 'WIRE02-JOSE-005',
  E_JWS_ZIP_REJECTED: 'WIRE02-JOSE-006',
  E_PEAC_VERSION_UNSUPPORTED: 'WIRE02-IDENT-004',
  E_KIND_UNSUPPORTED: 'WIRE02-KIND-001',
  E_ISS_NOT_CANONICAL: 'WIRE02-ISS-007',
  E_MISSING_REQUIRED_CLAIM: 'WIRE02-ENV-023',
  E_INVALID_EXTENSION_FORMAT: 'WIRE02-EXT-009',
  E_WIRE_VERSION_MISMATCH: 'WIRE02-MEDIA-005',
  E_PILLARS_NOT_SORTED: 'WIRE02-PILLAR-003',
  E_UNSUPPORTED_WIRE_VERSION: 'WIRE02-VALID-001',
  E_OCCURRED_AT_ON_CHALLENGE: 'WIRE02-KIND-001',
  E_INVALID_FORMAT: 'WIRE02-VALID-001',
  E_INVALID_EXTENSION_KEY: 'WIRE02-EXT-001',
};

// Infer requirement IDs from fixture content
function inferRequirements(fixture) {
  const ids = new Set();
  const claims = fixture.input?.claims || fixture.input;

  // Always exercises envelope structure
  ids.add('WIRE02-ENV-023');

  if (claims?.peac_version === '0.2') ids.add('WIRE02-MEDIA-005');
  if (claims?.kind === 'evidence') ids.add('WIRE02-KIND-001');
  if (claims?.kind === 'challenge') ids.add('WIRE02-KIND-001');
  if (claims?.iss?.startsWith('https://')) ids.add('WIRE02-ISS-001');
  if (claims?.iss?.startsWith('did:')) ids.add('WIRE02-ISS-005');
  if (claims?.pillars) ids.add('WIRE02-PILLAR-003');
  if (claims?.policy) ids.add('WIRE02-POLICY-001');
  if (claims?.occurred_at) ids.add('WIRE02-OCC-001');

  const ext = claims?.extensions;
  if (ext?.['org.peacprotocol/commerce']) {
    ids.add('WIRE02-EXT-006');
    ids.add('WIRE02-EXT-007');
    ids.add('WIRE02-EXT-008');
  }
  if (ext?.['org.peacprotocol/access']) {
    ids.add('WIRE02-EXT-011');
    ids.add('WIRE02-EXT-012');
    ids.add('WIRE02-EXT-013');
  }
  if (ext?.['org.peacprotocol/identity']) ids.add('WIRE02-EXT-001');
  if (ext?.['org.peacprotocol/correlation']) {
    ids.add('WIRE02-EXT-014');
    ids.add('WIRE02-EXT-015');
  }
  if (ext?.['org.peacprotocol/challenge']) ids.add('WIRE02-CHAL-001');

  // JWS header checks
  if (fixture.input?.header_overrides) {
    const ho = fixture.input.header_overrides;
    if (ho.jwk || ho.x5c || ho.x5u || ho.jku) ids.add('WIRE02-JOSE-003');
    if (ho.crit) ids.add('WIRE02-JOSE-004');
    if (ho.b64 === false) ids.add('WIRE02-JOSE-005');
    if (ho.zip) ids.add('WIRE02-JOSE-006');
    if (ho.kid === '' || ho.kid === null) ids.add('WIRE02-JOSE-007');
  }

  return [...ids].sort();
}

function inferPrimary(fixture) {
  const errCode = fixture.expected?.error_code;
  if (errCode && ERROR_TO_REQ[errCode]) return ERROR_TO_REQ[errCode];

  // For valid fixtures, primary based on content
  const claims = fixture.input?.claims || fixture.input;
  const ext = claims?.extensions;
  if (ext?.['org.peacprotocol/commerce']) return 'WIRE02-EXT-006';
  if (ext?.['org.peacprotocol/access']) return 'WIRE02-EXT-011';
  if (ext?.['org.peacprotocol/challenge']) return 'WIRE02-CHAL-001';
  if (ext?.['org.peacprotocol/identity']) return 'WIRE02-EXT-001';
  if (ext?.['org.peacprotocol/correlation']) return 'WIRE02-EXT-014';
  if (claims?.pillars?.length >= 2) return 'WIRE02-PILLAR-003';
  if (claims?.policy) return 'WIRE02-POLICY-001';
  if (claims?.actor) return 'WIRE02-ENV-017';
  if (claims?.representation) return 'WIRE02-ENV-019';
  if (claims?.iss?.startsWith('did:')) return 'WIRE02-ISS-005';

  return 'WIRE02-ENV-023';
}

function inferStatus(fixture) {
  if (fixture.expected?.valid === false) return 'negative';
  if (fixture.expected?.warnings?.length > 0 || fixture.expected?.warns_type_unregistered) return 'positive';
  return 'positive';
}

function backfillFile(filename) {
  const path = join(FIXTURES, filename);
  const data = JSON.parse(readFileSync(path, 'utf-8'));
  let modified = 0;

  if (data.fixtures) {
    for (const fixture of data.fixtures) {
      if (!fixture.primary_requirement_id) {
        fixture.primary_requirement_id = inferPrimary(fixture);
        fixture.requirement_ids = inferRequirements(fixture);
        if (!fixture.requirement_ids.includes(fixture.primary_requirement_id)) {
          fixture.requirement_ids.push(fixture.primary_requirement_id);
          fixture.requirement_ids.sort();
        }
        fixture.status = inferStatus(fixture);
        fixture._audit_note = 'Backfilled by scripts/conformance/backfill-existing-fixtures.mjs';
        modified++;
      }
    }
  }

  if (data.test_cases) {
    for (const tc of data.test_cases) {
      if (!tc.primary_requirement_id) {
        tc.primary_requirement_id = inferPrimary(tc);
        tc.requirement_ids = inferRequirements(tc);
        if (!tc.requirement_ids.includes(tc.primary_requirement_id)) {
          tc.requirement_ids.push(tc.primary_requirement_id);
          tc.requirement_ids.sort();
        }
        tc.status = inferStatus(tc);
        tc._audit_note = 'Backfilled by scripts/conformance/backfill-existing-fixtures.mjs';
        modified++;
      }
    }
  }

  if (modified > 0) {
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
    console.log(`  ${filename}: backfilled ${modified} fixtures`);
  } else {
    console.log(`  ${filename}: no changes needed`);
  }
  return modified;
}

console.log('Backfilling Wire 0.2 fixtures with requirement mappings...');

const files = ['valid.json', 'invalid.json', 'warnings.json', 'replay-prevention/boundary-jti-length.json'];
let total = 0;
for (const f of files) {
  try {
    total += backfillFile(f);
  } catch (err) {
    console.error(`  ERROR: ${f}: ${err.message}`);
  }
}

console.log(`\nTotal backfilled: ${total} fixture entries`);
