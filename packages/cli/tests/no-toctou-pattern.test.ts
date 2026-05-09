/**
 * Regression test: assert the check-then-use file-system race patterns
 * removed from the CLI command handlers stay removed.
 *
 * The test reads each source file as text and asserts the absence of the
 * specific paired patterns previously present (existsSync / accessSync /
 * statSync followed by readFileSync / writeFileSync / openSync on the same
 * path). It does not enforce a blanket ban on every `existsSync` call:
 * directory-existence guards used to drive `mkdirSync` remain acceptable
 * (`peac policy generate` uses two of those). What it forbids is the
 * specific check-then-read or check-then-write pair that produces the
 * race window.
 *
 * If a future change reintroduces any of the patterns asserted below,
 * this test fails before the static analyzer reports them on the next scan.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const COMMANDS = join(SRC, 'commands');

function readSource(rel: string): string {
  return readFileSync(join(COMMANDS, rel), 'utf8');
}

describe('TOCTOU pattern regression for CLI command handlers', () => {
  it('policy.ts: init action does not check-then-write outputPath', () => {
    const src = readSource('policy.ts');
    // The pre-fix pattern guarded a writeFileSync(outputPath, ...) with
    // existsSync(outputPath); the atomic 'wx' flag now discriminates at
    // write time.
    expect(src).not.toMatch(/fs\.existsSync\(outputPath\)/);
  });

  it('reconcile.ts: readBundle does not check-then-read bundlePath', () => {
    const src = readSource('reconcile.ts');
    expect(src).not.toMatch(/fs\.existsSync\(bundlePath\)/);
    expect(src).not.toMatch(/fs\.statSync\(bundlePath\)/);
    // The dropped inner branch was `if (!fs.existsSync(resolved))`.
    expect(src).not.toMatch(/fs\.existsSync\(resolved\)/);
  });

  it('bundle.ts: command actions do not pre-check options.{receipts,keys,policy}', () => {
    const src = readSource('bundle.ts');
    expect(src).not.toMatch(/fs\.existsSync\(options\.receipts\)/);
    expect(src).not.toMatch(/fs\.existsSync\(options\.keys\)/);
    expect(src).not.toMatch(/fs\.existsSync\(options\.policy\)/);
    // `bundle verify` and `bundle info` argument was named `bundlePath`.
    expect(src).not.toMatch(/fs\.existsSync\(bundlePath\)/);
    // readReceipts no longer relies on a separate statSync to discriminate type.
    expect(src).not.toMatch(/fs\.statSync\(receiptsPath\)/);
  });

  it('bridge/start.ts: log file is opened ONCE, not twice on the same path', () => {
    const src = readSource(join('bridge', 'start.ts'));
    // The pre-fix pattern was two consecutive openSync(logFile, 'a')
    // calls. After the fix there is at most one openSync call binding
    // logFile, and it uses explicit POSIX flags.
    const matches = src.match(/openSync\(\s*logFile\b/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(1);
    // The bare `'a'` flag form is replaced with explicit O_WRONLY|O_APPEND|O_CREAT.
    expect(src).not.toMatch(/openSync\(\s*logFile,\s*['"]a['"]/);
  });

  it('bridge/stop.ts: pidFile and configFile are not pre-checked before read/write', () => {
    const src = readSource(join('bridge', 'stop.ts'));
    expect(src).not.toMatch(/existsSync\(pidFile\)/);
    expect(src).not.toMatch(/existsSync\(configFile\)/);
  });
});
