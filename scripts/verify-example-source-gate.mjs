#!/usr/bin/env node
/**
 * verify-example-source-gate
 *
 * Repository check for the provisioning-lifecycle and commerce example
 * public surface. Detects committed live-shaped secrets, base64url-encoded
 * payment credentials, and retired public vocabulary in the example,
 * recipe, parity-corpus, and smoke/doc-truth test files.
 *
 * This is NOT a substitute for the recursive credential-material walker
 * in `@peac/schema/src/extensions/provisioning-lifecycle.ts`. The walker
 * enforces the no-credential-leak invariant at the protocol layer; this
 * script enforces the repository rule that public examples, recipes, parity
 * corpora, and smoke tests must not carry live token shapes, decoded
 * payment credentials, or vendor-named identifiers.
 *
 * Scanned surface:
 *   - provisioning-lifecycle PR 3 surface (examples/recipe/parity/tests)
 *   - the commerce example directories (x402 / paymentauth / ACP / Stripe /
 *     commerce-evidence-bundle / commerce-mandate-records)
 *
 * Import-safe: `scanContent(text, options?)` is a pure function (no
 * filesystem, console, or process access) so it can be unit-tested
 * directly. The CLI behavior lives in `main()`, run only when this file
 * is executed directly.
 *
 * Exit code 0 = clean; 1 = one or more findings or a missing required
 * target.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

/** Each target declares whether it is a file or a directory. File targets
 * are read directly; directory targets are enumerated directly. Missing
 * required targets surface as findings; missing optional targets are
 * silently skipped. */
export const SCAN_TARGETS = [
  // provisioning-lifecycle PR 3 surface
  { path: 'examples/provisioning-lifecycle', kind: 'dir', required: true },
  { path: 'examples/agent-provisioning-demo', kind: 'dir', required: true },
  { path: 'docs/SOLUTIONS/verify-agent-provisioning.md', kind: 'file', required: true },
  { path: 'specs/conformance/parity-corpus/provisioning-lifecycle', kind: 'dir', required: true },
  { path: 'tests/solutions', kind: 'dir', required: true },
  { path: 'tests/tooling/provisioning-recipe-doc-truth.test.ts', kind: 'file', required: true },
  // commerce example surface
  { path: 'examples/stripe-spt-evidence', kind: 'dir', required: true },
  { path: 'examples/stripe-x402-crypto', kind: 'dir', required: true },
  { path: 'examples/paymentauth-evidence', kind: 'dir', required: true },
  { path: 'examples/paymentauth-jsonrpc', kind: 'dir', required: true },
  { path: 'examples/mpp-payment-attempt', kind: 'dir', required: true },
  { path: 'examples/mpp-payment-record', kind: 'dir', required: true },
  { path: 'examples/x402-dual-header-read', kind: 'dir', required: true },
  { path: 'examples/x402-node-server', kind: 'dir', required: true },
  { path: 'examples/x402-upto-evidence', kind: 'dir', required: true },
  { path: 'examples/x402-weather-proof', kind: 'dir', required: true },
  { path: 'examples/acp-delegated-checkout', kind: 'dir', required: true },
  { path: 'examples/acp-session-lifecycle', kind: 'dir', required: true },
  { path: 'examples/cf-policy-x402-terms', kind: 'dir', required: true },
  { path: 'examples/commerce-evidence-bundle', kind: 'dir', required: true },
  { path: 'examples/commerce-mandate-records', kind: 'dir', required: true },
  { path: 'examples/x402-paid-resource-records', kind: 'dir', required: true },
  { path: 'examples/mcp-paid-tool-records', kind: 'dir', required: true },
];

/** Directory names that are never scanned (vendored or generated). */
export const SKIP_DIRS = new Set(['node_modules', '.turbo', 'out', 'dist']);

/** File suffixes that are never scanned (generated artifacts). */
export const SKIP_FILE_SUFFIXES = ['.map'];

const SELF_PATH_FRAGMENT = 'scripts/verify-example-source-gate.mjs';

/** Upper bound on the length of a base64url candidate token that the
 * decode-and-inspect tier will attempt to decode. A token longer than
 * this is treated as a non-secret blob and skipped, so a very long
 * base64url-looking string cannot drive pathological decode/parse cost. */
export const MAX_DECODE_CANDIDATE_LEN = 8192;

/** Bounds on the decoded-JSON key walk (defense against pathological
 * nesting or huge objects in the decode-and-inspect tier). */
const MAX_KEY_WALK_DEPTH = 12;
const MAX_KEY_WALK_NODES = 4096;

/** Tier 1 (literal shapes) + tier 3 (retired vocabulary). Each pattern is
 * matched per line; anchored where needed so demo values do not fire. */
export const FORBIDDEN_PATTERNS = [
  // --- tier 1: literal live-shaped secrets ---
  { name: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, severity: 'live-secret' },
  { name: 'stripe-secret-live', pattern: /\bsk_live_[A-Za-z0-9]{20,}\b/, severity: 'live-secret' },
  { name: 'stripe-public-live', pattern: /\bpk_live_[A-Za-z0-9]{20,}\b/, severity: 'live-secret' },
  {
    name: 'stripe-restricted-live',
    pattern: /\brk_live_[A-Za-z0-9]{20,}\b/,
    severity: 'live-secret',
  },
  { name: 'stripe-secret-test', pattern: /\bsk_test_[A-Za-z0-9]{20,}\b/, severity: 'live-secret' },
  { name: 'stripe-public-test', pattern: /\bpk_test_[A-Za-z0-9]{20,}\b/, severity: 'live-secret' },
  { name: 'webhook-secret', pattern: /\bwhsec_[A-Za-z0-9]{20,}\b/, severity: 'live-secret' },
  {
    name: 'pem-private-key',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    severity: 'live-secret',
  },
  { name: 'github-token-classic', pattern: /\bghp_[A-Za-z0-9]{36}\b/, severity: 'live-secret' },
  {
    name: 'github-token-fine-grained',
    pattern: /\bgithub_pat_[A-Za-z0-9_]{82}\b/,
    severity: 'live-secret',
  },
  // JWK private scalar: a "d" member carrying a base64url value of key length.
  // Ed25519/P-256 private scalars are ~43 base64url chars; require >= 40 so a
  // short "d" field (e.g. a day-of-month) does not fire.
  {
    name: 'jwk-private-scalar',
    pattern: /"d"\s*:\s*"[A-Za-z0-9_-]{40,}"/,
    severity: 'live-secret',
  },
  // Bearer JWT: three base64url segments starting eyJ. `Bearer realm="..."`
  // and other non-JWT Bearer challenges do not match (no eyJ header).
  {
    name: 'bearer-jwt',
    pattern: /\bBearer\s+eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/,
    severity: 'live-secret',
  },
  // Keyword-anchored private hex key: only fires when a secret keyword sits
  // right before a 0x<64 hex> value, so a bare demo tx hash (0xdeadbeef...)
  // with no keyword does NOT fire.
  {
    name: 'keyword-anchored-hex-key',
    pattern: /\b(?:private_key|secret_key|mnemonic|seed_phrase)\b[\s"':=]{0,8}0x[0-9a-fA-F]{64}\b/i,
    severity: 'live-secret',
  },
  // --- tier 3: retired public vocabulary ---
  {
    name: 'retired-old-dir-name',
    pattern: /\bstripe-projects-provisioning\b/,
    severity: 'retired-vocabulary',
  },
  {
    name: 'retired-pr2-name',
    pattern: /\bpayment_token_observation\b/,
    severity: 'retired-vocabulary',
  },
  { name: 'retired-vendor-secret', pattern: /\bstripe_secret\b/, severity: 'retired-vocabulary' },
  { name: 'retired-vendor-token', pattern: /\bcloudflare_token\b/, severity: 'retired-vocabulary' },
];

/** Decoded-JSON keys that indicate a raw (unredacted) payment credential.
 * PEAC records carry `sha256:` digests, never these raw fields, so a base64url
 * payload that decodes to an object holding any of these keys is a leak.
 * Compared case-insensitively. */
export const PAYMENT_CREDENTIAL_KEYS = new Set([
  'pan',
  'card_number',
  'cardnumber',
  'cvv',
  'cvc',
  'cvv2',
  'account_number',
  'accountnumber',
  'iban',
  'routing_number',
  'sort_code',
  'mnemonic',
  'seed_phrase',
  'private_key',
  'secret_key',
]);

/** Keys that indicate a raw (unredacted) Payment-Receipt embedded as a nested
 * object, e.g. `{ "payment_receipt": { ... } }`. A PEAC record binds a receipt
 * by digest or preserves it as a signed JWS string, so a decoded payload that
 * carries a Payment-Receipt-family key whose VALUE is an object is a raw-receipt
 * leak. Deliberately object-valued only: string reference fields such as
 * `payment_receipt_digest` / `payment_receipt_jws` / `payment_receipt_id` are
 * safe PEAC proof references and must NOT flag. Compared case-insensitively. */
export const PAYMENT_RECEIPT_SHAPE_KEYS = new Set([
  'payment_receipt',
  'payment-receipt',
  'paymentreceipt',
  'payment_receipts',
]);

/** Build a log-safe preview of a matched value. Live-secret matches are never
 * echoed in full (so a real committed secret cannot leak into CI logs); only a
 * short prefix plus the length is shown. Retired-vocabulary matches are not
 * secret material and are shown verbatim so the offending token is locatable. */
export function safeMatchPreview(patternName, raw) {
  if (!raw) return '<redacted>';
  if (patternName.startsWith('retired-')) return raw;
  return `${raw.slice(0, 8)}...<redacted:${raw.length}>`;
}

/** Candidate base64url run for the decode-and-inspect tier. */
const BASE64URL_TOKEN_RE = /[A-Za-z0-9_-]{40,}/g;
/** Pure-hex tokens (sha256 digests, 0x tx-hash bodies) are never base64url
 * JSON, so they are skipped before any decode attempt. */
const PURE_HEX_RE = /^[0-9a-fA-F]+$/;

/** Recursively collect (bounded) the offending keys from a decoded JSON value:
 * `credential` = lowercased keys intersecting PAYMENT_CREDENTIAL_KEYS;
 * `receipt` = Payment-Receipt-family keys whose value is a nested object (a raw
 * embedded receipt). A normal PEAC JWS payload (iss/type/pillars) and string
 * digest/jws references produce neither. */
function offendingDecodedKeys(value) {
  const credential = new Set();
  const receipt = new Set();
  let nodes = 0;
  const stack = [{ v: value, d: 0 }];
  while (stack.length > 0) {
    const { v, d } = stack.pop();
    nodes += 1;
    if (nodes > MAX_KEY_WALK_NODES || d > MAX_KEY_WALK_DEPTH) break;
    if (v === null || typeof v !== 'object') continue;
    if (Array.isArray(v)) {
      for (const item of v) stack.push({ v: item, d: d + 1 });
      continue;
    }
    for (const key of Object.keys(v)) {
      const lower = key.toLowerCase();
      if (PAYMENT_CREDENTIAL_KEYS.has(lower)) credential.add(lower);
      if (PAYMENT_RECEIPT_SHAPE_KEYS.has(lower) && v[key] !== null && typeof v[key] === 'object') {
        receipt.add(lower);
      }
      stack.push({ v: v[key], d: d + 1 });
    }
  }
  return { credential, receipt };
}

/**
 * Pure scanner. Takes file text and returns an array of findings; performs
 * no filesystem reads, no console writes, no process mutation.
 *
 * @param {string} text
 * @param {{ maxDecodeCandidateLen?: number }} [options]
 * @returns {Array<{ line: number, pattern: string, severity: string, match: string }>}
 */
export function scanContent(text, options = {}) {
  const maxDecodeLen = options.maxDecodeCandidateLen ?? MAX_DECODE_CANDIDATE_LEN;
  const findings = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNo = i + 1;

    // tier 1 + tier 3: literal / anchored shapes
    for (const { name, pattern, severity } of FORBIDDEN_PATTERNS) {
      const m = line.match(pattern);
      if (m) {
        findings.push({
          line: lineNo,
          pattern: name,
          severity,
          match: safeMatchPreview(name, m[0]),
        });
      }
    }

    // tier 2: decode-and-inspect base64url runs for raw payment credentials
    BASE64URL_TOKEN_RE.lastIndex = 0;
    let tok;
    while ((tok = BASE64URL_TOKEN_RE.exec(line)) !== null) {
      const raw = tok[0];
      if (raw.length > maxDecodeLen) continue; // bounded: skip pathological blobs
      if (PURE_HEX_RE.test(raw)) continue; // sha256 hex / 0x tx-hash body
      const before = line.slice(Math.max(0, tok.index - 7), tok.index);
      if (before.endsWith('sha256:')) continue; // explicit digest prefix guard
      let decoded;
      try {
        decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
      } catch {
        continue; // not base64url JSON (e.g. a JWS signature segment)
      }
      const { credential, receipt } = offendingDecodedKeys(decoded);
      const offending = [...new Set([...credential, ...receipt])];
      if (offending.length > 0) {
        // key NAMES only, never decoded values -> no credential material logged
        findings.push({
          line: lineNo,
          pattern: 'decoded-payment-credential',
          severity: 'live-secret',
          match: `base64url json keys: ${offending.sort().join(', ')}`,
        });
      }
    }
  }

  return findings;
}

/** Operation-first directory walker: classifies via Dirent and reads in one
 * step. Throws ENOENT/ENOTDIR up to the caller, which decides finding vs skip. */
function* walkDirOperationFirst(start) {
  const entries = readdirSync(start, { withFileTypes: true });
  for (const ent of entries) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const child = join(start, ent.name);
    if (ent.isDirectory()) {
      try {
        yield* walkDirOperationFirst(child);
      } catch (err) {
        if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) continue;
        throw err;
      }
    } else if (ent.isFile()) {
      yield child;
    }
  }
}

function shouldSkipFile(file) {
  if (file.endsWith(SELF_PATH_FRAGMENT)) return true;
  return SKIP_FILE_SUFFIXES.some((suffix) => file.endsWith(suffix));
}

/** Read one file and map pure findings onto repo-relative locations. */
function scanFileInto(file, findings) {
  if (shouldSkipFile(file)) return;
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw err;
  }
  for (const f of scanContent(content)) {
    findings.push({ file: relative(REPO_ROOT, file), ...f });
  }
}

/** CLI entrypoint. Owns all filesystem, console, and process interaction. */
export function main() {
  const findings = [];
  const missingRequired = [];

  for (const target of SCAN_TARGETS) {
    const full = join(REPO_ROOT, target.path);
    if (target.kind === 'file') {
      try {
        scanFileInto(full, findings);
      } catch (err) {
        if (err && err.code === 'ENOENT') {
          if (target.required) missingRequired.push(target.path);
          continue;
        }
        throw err;
      }
    } else if (target.kind === 'dir') {
      try {
        for (const file of walkDirOperationFirst(full)) {
          scanFileInto(file, findings);
        }
      } catch (err) {
        if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
          if (target.required) missingRequired.push(target.path);
          continue;
        }
        throw err;
      }
    }
  }

  if (missingRequired.length > 0) {
    console.error('verify-example-source-gate: FAIL (required targets missing)');
    console.error('');
    for (const p of missingRequired) {
      console.error(`  MISSING: ${p}`);
    }
    console.error('');
    process.exit(1);
  }

  if (findings.length === 0) {
    console.log(
      'verify-example-source-gate: clean (0 findings across provisioning + commerce surface)'
    );
    process.exit(0);
  }

  console.error('verify-example-source-gate: FAIL');
  console.error('');
  for (const f of findings) {
    console.error(
      `  ${f.severity.toUpperCase()}: ${f.file}:${f.line}: pattern=${f.pattern} match=${JSON.stringify(f.match)}`
    );
  }
  console.error('');
  console.error(`${findings.length} finding(s)`);
  process.exit(1);
}

const invokedDirectly =
  Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main();
}
