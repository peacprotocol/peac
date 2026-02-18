#!/usr/bin/env node
/**
 * Portable tsup build wrapper that fails on warnings.
 *
 * Spawns tsup, mirrors all output to the parent's stdout/stderr,
 * and fails (exit 1) if any output line matches /\bWARN(ING)?\b/i.
 *
 * Uses readline for proper line semantics (no chunk-boundary splits).
 * Uses createRequire to resolve the tsup CLI entry point directly
 * (not the shell wrapper), making this portable across platforms.
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tsupCli = require.resolve('tsup/dist/cli-default.js');

const WARNING_RE = /\bWARN(ING)?\b/i;
const warnings = new Set();

const child = spawn(process.execPath, [tsupCli], {
  cwd: process.cwd(),
  stdio: ['inherit', 'pipe', 'pipe'],
  env: process.env,
});

const rlOut = createInterface({ input: child.stdout });
rlOut.on('line', (line) => {
  process.stdout.write(line + '\n');
  if (WARNING_RE.test(line)) warnings.add(line);
});

const rlErr = createInterface({ input: child.stderr });
rlErr.on('line', (line) => {
  process.stderr.write(line + '\n');
  if (WARNING_RE.test(line)) warnings.add(line);
});

child.on('error', (err) => {
  process.stderr.write(`\nFailed to spawn tsup: ${err.message}\n`);
  rlOut.close();
  rlErr.close();
  process.exit(1);
});

child.on('close', (code) => {
  rlOut.close();
  rlErr.close();
  if (code !== 0) {
    process.stderr.write(`\ntsup exited with code ${code}\n`);
    process.exit(code ?? 1);
  }
  if (warnings.size > 0) {
    process.stderr.write(`\ntsup build produced ${warnings.size} warning(s):\n`);
    for (const w of warnings) {
      process.stderr.write(`  ${w}\n`);
    }
    process.exit(1);
  }
});
