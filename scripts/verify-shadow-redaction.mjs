#!/usr/bin/env node
/**
 * verify-shadow-redaction.mjs
 *
 * Scan any shadow-log JSON artifacts emitted during the nightly shadow
 * lane and assert that every entry is redaction-clean. Acts as a
 * second line of defense behind the in-process `redactNote` patterns:
 * even if a future change accidentally widens what gets logged, this
 * script catches it before the artifact leaves CI.
 *
 * Usage:
 *
 *   node scripts/verify-shadow-redaction.mjs [--dir <path>]
 *
 * Default scan directory: `shadow-log-artifacts/` at the repo root.
 * If the directory is missing OR contains no `*.json` files, the
 * script exits 0 with a notice. v0.13.1 does not require the in-process
 * shadow log to be persisted; the script exists so that ANY future
 * persisted log is automatically gated. When the nightly lane wires up
 * a persistence path, drop the artifacts under `shadow-log-artifacts/`
 * and this script will gate them.
 *
 * Per-entry assertions (every entry MUST satisfy):
 *
 *   - `recordRefHash` is a 64-character lowercase hex string.
 *   - `notes` is a string and its UTF-8 byte length is <= 128.
 *   - `realErrorCode` / `shadowErrorCode`, when present, match the
 *     registered grammar `/^[A-Z_][A-Z0-9_]*$/`.
 *   - `realResult` / `shadowResult` raw fields are ABSENT (only
 *     hashes and byte lengths may appear).
 *   - The serialized entry MUST NOT contain any of the secret patterns
 *     covered by `packages/protocol/src/_internal/shadow-redact.ts`
 *     (JWS / PEM / Bearer / Cookie / Set-Cookie / Authorization /
 *     X-Auth-Token / URL query token / API key / email / phone /
 *     long base64).
 *
 * Exit codes:
 *
 *   0  every scanned entry passed (or no entries to scan).
 *   1  at least one entry failed; the per-entry failure reasons are
 *      printed to stderr.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const dirIdx = args.indexOf('--dir');
const SCAN_DIR = dirIdx >= 0 ? args[dirIdx + 1] : 'shadow-log-artifacts';

const HEX64 = /^[0-9a-f]{64}$/;
const ERROR_CODE = /^[A-Z_][A-Z0-9_]*$/;
const MAX_NOTES_BYTES = 128;

const SECRET_PATTERNS = [
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /-----BEGIN [A-Z0-9 ]+-----[\s\S]+?-----END [A-Z0-9 ]+-----/,
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/,
  /Bearer\s+[A-Za-z0-9._\-/+=]+/i,
  /^authorization:\s*[^\r\n]+/im,
  /^x-(?:auth-token|api-key):\s*[^\r\n]+/im,
  /^cookie:\s*[^\r\n]+/im,
  /^set-cookie:\s*[^\r\n]+/im,
  /[?&](?:token|key|secret|access_token|api_key|apikey)=[^&\s#]+/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /\+\d[\d\s().-]{6,}\d/,
  /\(\d{3}\)\s*\d{3}[\s.-]?\d{4}/,
  /\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b/,
];

function utf8ByteLength(s) {
  return new TextEncoder().encode(s).length;
}

function checkEntry(entry, source) {
  const errors = [];

  if (typeof entry !== 'object' || entry === null) {
    return [`${source}: entry is not an object`];
  }

  const recordRefHash = entry.recordRefHash;
  if (typeof recordRefHash !== 'string' || !HEX64.test(recordRefHash)) {
    errors.push(`${source}: recordRefHash is not a 64-character lowercase hex string`);
  }

  const notes = entry.notes;
  if (typeof notes !== 'string') {
    errors.push(`${source}: notes is missing or not a string`);
  } else if (utf8ByteLength(notes) > MAX_NOTES_BYTES) {
    errors.push(`${source}: notes exceeds ${MAX_NOTES_BYTES} UTF-8 bytes`);
  }

  for (const codeKey of ['realErrorCode', 'shadowErrorCode']) {
    const v = entry[codeKey];
    if (v === undefined) continue;
    if (typeof v !== 'string' || !ERROR_CODE.test(v)) {
      errors.push(`${source}: ${codeKey} does not match registered error-code grammar`);
    }
  }

  for (const rawKey of ['realResult', 'shadowResult']) {
    if (Object.prototype.hasOwnProperty.call(entry, rawKey)) {
      errors.push(`${source}: forbidden raw field present: ${rawKey}`);
    }
  }

  // Pattern scan over the serialized entry.
  const serialized = JSON.stringify(entry);
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(serialized)) {
      errors.push(`${source}: serialized entry matches secret pattern ${pattern}`);
    }
  }

  return errors;
}

function loadFile(path) {
  const raw = readFileSync(path, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { error: `${path}: invalid JSON (${err.message})` };
  }
  return { entries: Array.isArray(parsed) ? parsed : [parsed] };
}

function main() {
  let scanned = 0;
  const errors = [];

  let dirStat;
  try {
    dirStat = statSync(SCAN_DIR);
  } catch {
    console.log(
      `[verify-shadow-redaction] scan dir ${SCAN_DIR} not present; nothing to scan. OK`
    );
    process.exit(0);
  }
  if (!dirStat.isDirectory()) {
    console.error(`[verify-shadow-redaction] ${SCAN_DIR} is not a directory`);
    process.exit(1);
  }

  const files = readdirSync(SCAN_DIR).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    console.log(`[verify-shadow-redaction] ${SCAN_DIR} contains no JSON; nothing to scan. OK`);
    process.exit(0);
  }

  for (const f of files) {
    const path = join(SCAN_DIR, f);
    const loaded = loadFile(path);
    if (loaded.error) {
      errors.push(loaded.error);
      continue;
    }
    for (let i = 0; i < loaded.entries.length; i += 1) {
      scanned += 1;
      const failures = checkEntry(loaded.entries[i], `${path}#${i}`);
      errors.push(...failures);
    }
  }

  if (errors.length > 0) {
    console.error('[verify-shadow-redaction] FAIL');
    for (const e of errors) console.error(`  - ${e}`);
    console.error(`[verify-shadow-redaction] ${errors.length} failure(s) across ${scanned} entries`);
    process.exit(1);
  }

  console.log(
    `[verify-shadow-redaction] OK; ${scanned} entries clean across ${files.length} file(s)`
  );
}

main();
