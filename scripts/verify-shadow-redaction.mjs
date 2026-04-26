#!/usr/bin/env node
/**
 * verify-shadow-redaction.mjs
 *
 * Scan any shadow-log JSON artifacts emitted during the nightly shadow
 * lane and assert that every entry is redaction-clean. Acts as a
 * second line of defense behind the in-process `redactNote` patterns.
 *
 * Usage:
 *
 *   node scripts/verify-shadow-redaction.mjs [--dir <path>]
 *
 * Default scan directory: `shadow-log-artifacts/` at the repo root.
 * If the directory is missing OR contains no `*.json` files, the
 * script exits 0 with a notice. v0.13.1 does not require the
 * in-process shadow log to be persisted; this script exists so any
 * future persistence path is automatically gated.
 *
 * Per-entry validation falls into three classes:
 *
 *   STRUCTURAL (validated by shape; no pattern scan):
 *     - recordRefHash, realResultHash, shadowResultHash:
 *       must be 64 lowercase-hex strings.
 *     - realErrorCode, shadowErrorCode (if present):
 *       must match /^[A-Z_][A-Z0-9_]*$/.
 *     - realByteLen, shadowByteLen (if present): non-negative integers.
 *     - timestamp: ISO 8601 string.
 *     - kind, call: enums (loose checks).
 *
 *   SCANNED (run secret-pattern detection):
 *     - notes: must be a string with UTF-8 byte length <= 128 AND
 *       must not match any registered secret pattern.
 *     - any UNEXPECTED top-level field whose name is not in the known
 *       schema gets the same scan; unknown nested objects are
 *       stringified and scanned wholesale.
 *
 *   FORBIDDEN (presence alone fails):
 *     - realResult, shadowResult: raw payload fields MUST be absent
 *       regardless of content.
 *
 * The 64-hex hash fields would match the long-base64 secret pattern
 * if scanned naively, so they MUST be excluded from the scan-copy.
 * That exclusion is what makes the gate trustworthy: a valid log full
 * of canonical hashes passes; a notes field carrying a Bearer token
 * still fails.
 *
 * Exit codes:
 *
 *   0  every scanned entry passed (or no entries to scan).
 *   1  at least one entry failed; per-entry failure reasons are
 *      printed to stderr.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const dirIdx = args.indexOf('--dir');
const SCAN_DIR = dirIdx >= 0 ? args[dirIdx + 1] : 'shadow-log-artifacts';

const HEX64 = /^[0-9a-f]{64}$/;
const ERROR_CODE = /^[A-Z_][A-Z0-9_]*$/;
const TIMESTAMP_LOOSE = /^\d{4}-\d{2}-\d{2}T/;
const KIND_VALUES = new Set([
  'output-byte-diff',
  'error-code-diff',
  'timing-diff',
  'resource-limit-diff',
  'shadow-error',
]);
const CALL_VALUES = new Set(['issue', 'verifyLocal', 'verify']);
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

// Fields that SHIP recognized hashes / counts / timestamps / enums.
// Excluded from the secret-pattern scan because their content is
// structurally validated above and would otherwise collateral-match
// the long-base64 / phone patterns.
const STRUCTURAL_FIELDS = new Set([
  'kind',
  'call',
  'recordRefHash',
  'realResultHash',
  'shadowResultHash',
  'realErrorCode',
  'shadowErrorCode',
  'realByteLen',
  'shadowByteLen',
  'timestamp',
]);

// Fields that MUST NOT appear regardless of content.
const FORBIDDEN_FIELDS = new Set(['realResult', 'shadowResult']);

// Fields that are scanned for secret patterns. `notes` is always
// scanned; any unknown top-level field also gets scanned (unknown
// fields might carry structured leakage from a future-broken code
// path that this gate exists to catch).
const SCANNED_KNOWN_FIELDS = new Set(['notes']);

function utf8ByteLength(s) {
  return new TextEncoder().encode(s).length;
}

function checkStructuralFields(entry, source) {
  const errors = [];

  if (!KIND_VALUES.has(entry.kind)) {
    errors.push(`${source}: kind not in registered set: ${JSON.stringify(entry.kind)}`);
  }
  if (!CALL_VALUES.has(entry.call)) {
    errors.push(`${source}: call not in registered set: ${JSON.stringify(entry.call)}`);
  }

  for (const hashField of ['recordRefHash', 'realResultHash', 'shadowResultHash']) {
    const v = entry[hashField];
    if (v === undefined) {
      // recordRefHash is required; the others are conditional.
      if (hashField === 'recordRefHash') {
        errors.push(`${source}: recordRefHash is missing`);
      }
      continue;
    }
    if (typeof v !== 'string' || !HEX64.test(v)) {
      errors.push(`${source}: ${hashField} is not a 64-character lowercase hex string`);
    }
  }

  for (const codeField of ['realErrorCode', 'shadowErrorCode']) {
    const v = entry[codeField];
    if (v === undefined) continue;
    if (typeof v !== 'string' || !ERROR_CODE.test(v)) {
      errors.push(`${source}: ${codeField} does not match registered error-code grammar`);
    }
  }

  for (const lenField of ['realByteLen', 'shadowByteLen']) {
    const v = entry[lenField];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      errors.push(`${source}: ${lenField} is not a non-negative integer`);
    }
  }

  if (typeof entry.timestamp !== 'string' || !TIMESTAMP_LOOSE.test(entry.timestamp)) {
    errors.push(`${source}: timestamp is not an ISO 8601 string`);
  }

  return errors;
}

function checkScannedFields(entry, source) {
  const errors = [];

  // notes is required; bounded byte length AND no secret matches.
  if (typeof entry.notes !== 'string') {
    errors.push(`${source}: notes is missing or not a string`);
  } else {
    if (utf8ByteLength(entry.notes) > MAX_NOTES_BYTES) {
      errors.push(`${source}: notes exceeds ${MAX_NOTES_BYTES} UTF-8 bytes`);
    }
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(entry.notes)) {
        errors.push(`${source}: notes matches secret pattern ${pattern}`);
      }
    }
  }

  // Unknown top-level fields: scan their stringified form too, since
  // a future-broken code path might add an unexpected field carrying
  // raw content.
  for (const [key, value] of Object.entries(entry)) {
    if (STRUCTURAL_FIELDS.has(key)) continue;
    if (FORBIDDEN_FIELDS.has(key)) continue;
    if (SCANNED_KNOWN_FIELDS.has(key)) continue;
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(serialized)) {
        errors.push(`${source}: unexpected field ${key} matches secret pattern ${pattern}`);
      }
    }
  }

  return errors;
}

function checkForbiddenFields(entry, source) {
  const errors = [];
  for (const k of FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(entry, k)) {
      errors.push(`${source}: forbidden raw field present: ${k}`);
    }
  }
  return errors;
}

function checkEntry(entry, source) {
  if (typeof entry !== 'object' || entry === null) {
    return [`${source}: entry is not an object`];
  }
  return [
    ...checkStructuralFields(entry, source),
    ...checkForbiddenFields(entry, source),
    ...checkScannedFields(entry, source),
  ];
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
    console.error(
      `[verify-shadow-redaction] ${errors.length} failure(s) across ${scanned} entries`
    );
    process.exit(1);
  }

  console.log(
    `[verify-shadow-redaction] OK; ${scanned} entries clean across ${files.length} file(s)`
  );
}

main();
