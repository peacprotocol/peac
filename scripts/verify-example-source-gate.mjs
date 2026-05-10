#!/usr/bin/env node
/**
 * verify-example-source-gate
 *
 * Repository check for the v0.14.2 provisioning-lifecycle PR 3 public
 * surface. Detects committed live-shaped secrets and retired public
 * vocabulary in the example, recipe, parity-corpus, and smoke/doc-truth
 * test files.
 *
 * This is NOT a substitute for the recursive credential-material walker
 * in `@peac/schema/src/extensions/provisioning-lifecycle.ts`. The walker
 * enforces the no-credential-leak invariant at the protocol layer; this
 * script enforces the doctrine that public examples, recipes, parity
 * corpora, and smoke tests must not carry live token shapes or vendor-
 * named identifiers.
 *
 * Scoped paths (provisioning-lifecycle PR 3 surface only):
 *   examples/provisioning-lifecycle/
 *   examples/agent-provisioning-demo/
 *   docs/SOLUTIONS/verify-agent-provisioning.md
 *   specs/conformance/parity-corpus/provisioning-lifecycle/
 *   tests/solutions/
 *   tests/tooling/provisioning-recipe-doc-truth.test.ts
 *
 * Exit code 0 = clean; 1 = one or more findings or a missing required
 * target.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

/** Each target declares whether it is a file or a directory. The walker
 * is operation-first: file targets are read directly and directory
 * targets are enumerated directly. It does not classify paths before
 * reading them. Missing required targets surface as findings; missing
 * optional targets are silently skipped. */
const SCAN_TARGETS = [
  { path: 'examples/provisioning-lifecycle', kind: 'dir', required: true },
  { path: 'examples/agent-provisioning-demo', kind: 'dir', required: true },
  { path: 'docs/SOLUTIONS/verify-agent-provisioning.md', kind: 'file', required: true },
  { path: 'specs/conformance/parity-corpus/provisioning-lifecycle', kind: 'dir', required: true },
  { path: 'tests/solutions', kind: 'dir', required: true },
  { path: 'tests/tooling/provisioning-recipe-doc-truth.test.ts', kind: 'file', required: true },
];

const SKIP_DIRS = new Set(['node_modules', '.turbo', 'out', 'dist']);

const SELF_PATH_FRAGMENT = 'scripts/verify-example-source-gate.mjs';

const FORBIDDEN_PATTERNS = [
  {
    name: 'aws-access-key',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
    severity: 'live-secret',
  },
  {
    name: 'stripe-secret-live',
    pattern: /\bsk_live_[A-Za-z0-9]{20,}\b/,
    severity: 'live-secret',
  },
  {
    name: 'stripe-public-live',
    pattern: /\bpk_live_[A-Za-z0-9]{20,}\b/,
    severity: 'live-secret',
  },
  {
    name: 'stripe-restricted-live',
    pattern: /\brk_live_[A-Za-z0-9]{20,}\b/,
    severity: 'live-secret',
  },
  {
    name: 'stripe-secret-test',
    pattern: /\bsk_test_[A-Za-z0-9]{20,}\b/,
    severity: 'live-secret',
  },
  {
    name: 'stripe-public-test',
    pattern: /\bpk_test_[A-Za-z0-9]{20,}\b/,
    severity: 'live-secret',
  },
  {
    name: 'webhook-secret',
    pattern: /\bwhsec_[A-Za-z0-9]{20,}\b/,
    severity: 'live-secret',
  },
  {
    name: 'pem-private-key',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    severity: 'live-secret',
  },
  {
    name: 'github-token-classic',
    pattern: /\bghp_[A-Za-z0-9]{36}\b/,
    severity: 'live-secret',
  },
  {
    name: 'github-token-fine-grained',
    pattern: /\bgithub_pat_[A-Za-z0-9_]{82}\b/,
    severity: 'live-secret',
  },
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
  {
    name: 'retired-vendor-secret',
    pattern: /\bstripe_secret\b/,
    severity: 'retired-vocabulary',
  },
  {
    name: 'retired-vendor-token',
    pattern: /\bcloudflare_token\b/,
    severity: 'retired-vocabulary',
  },
];

const findings = [];
const missingRequired = [];

/** Operation-first directory walker.
 *
 * `readdirSync(path, { withFileTypes: true })` returns Dirent objects
 * whose `.isFile()` / `.isDirectory()` come from the directory entry
 * itself, so the walker classifies and reads in one step rather than
 * checking the path first and reading it second.
 *
 * If the directory is missing (`ENOENT`) or is unexpectedly a file
 * (`ENOTDIR`), the caller decides whether to treat that as a finding
 * (required target) or a silent skip (optional target). */
function* walkDirOperationFirst(start) {
  let entries;
  try {
    entries = readdirSync(start, { withFileTypes: true });
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      throw err;
    }
    throw err;
  }
  for (const ent of entries) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const child = join(start, ent.name);
    if (ent.isDirectory()) {
      try {
        yield* walkDirOperationFirst(child);
      } catch (err) {
        if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
          continue;
        }
        throw err;
      }
    } else if (ent.isFile()) {
      yield child;
    }
  }
}

function scanFile(file) {
  if (file.endsWith(SELF_PATH_FRAGMENT)) return;
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return;
    }
    throw err;
  }
  const lines = content.split('\n');
  for (const { name, pattern, severity } of FORBIDDEN_PATTERNS) {
    for (let i = 0; i < lines.length; i += 1) {
      const m = lines[i].match(pattern);
      if (m) {
        findings.push({
          file: relative(REPO_ROOT, file),
          line: i + 1,
          pattern: name,
          severity,
          match: m[0],
        });
      }
    }
  }
}

for (const target of SCAN_TARGETS) {
  const full = join(REPO_ROOT, target.path);
  if (target.kind === 'file') {
    try {
      scanFile(full);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        if (target.required) {
          missingRequired.push(target.path);
        }
        continue;
      }
      throw err;
    }
  } else if (target.kind === 'dir') {
    try {
      for (const file of walkDirOperationFirst(full)) {
        scanFile(file);
      }
    } catch (err) {
      if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
        if (target.required) {
          missingRequired.push(target.path);
        }
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
  console.log('verify-example-source-gate: clean (0 findings across PR 3 surface)');
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
