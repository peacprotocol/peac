#!/usr/bin/env node
/**
 * Self-test wrapper for scripts/verify-error-path-hygiene.mjs.
 *
 * Invokes the verifier in --self-test mode against the fixture
 * corpus under scripts/tests/fixtures/error-path/.
 *
 * Exit codes:
 *   0  all fixture cases passed
 *   1  one or more cases failed
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const VERIFIER = resolve(HERE, '..', 'verify-error-path-hygiene.mjs');

try {
  const out = execFileSync(process.execPath, [VERIFIER, '--self-test'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  process.stdout.write(out);
  process.exit(0);
} catch (err) {
  if (err && typeof err === 'object' && 'stdout' in err && err.stdout) {
    process.stdout.write(String(err.stdout));
  }
  const status = err && typeof err === 'object' && 'status' in err ? Number(err.status) : 1;
  process.exit(status === 0 ? 1 : status);
}
