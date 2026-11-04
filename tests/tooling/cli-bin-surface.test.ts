/**
 * Built `peac` bin surface test.
 *
 * Runs the built @peac/cli bin (the file its package.json `bin.peac` entry
 * points to) from a working directory outside the repository, and checks
 * that:
 *
 *   1. `--version` prints the @peac/cli package version, so the result does
 *      not depend on where the bin is invoked from;
 *   2. `--help` lists every documented top-level command, and each command
 *      with documented subcommands lists them (scripts/lib/cli-documented-commands.mjs);
 *   3. `bundle create` and `bundle verify` run end to end offline on the
 *      committed sample records.
 *
 * The packed-tarball counterpart (installed bin from `pnpm pack`) runs in
 * scripts/release/pack-install-smoke.mjs.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLI_DOCUMENTED_COMMANDS,
  findMissingDocumentedCommands,
  parseHelpCommands,
} from '../../scripts/lib/cli-documented-commands.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const CLI_DIR = join(REPO_ROOT, 'packages', 'cli');
const CLI_PKG = JSON.parse(readFileSync(join(CLI_DIR, 'package.json'), 'utf8')) as {
  version: string;
  bin: { peac: string };
};
const CLI_BIN = join(CLI_DIR, CLI_PKG.bin.peac);

const SPAWN_TIMEOUT_MS = 30_000;

let workDir: string;

function runCli(args: string[]): { status: number; stdout: string; output: string } {
  try {
    const stdout = execFileSync(process.execPath, [CLI_BIN, ...args], {
      cwd: workDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: SPAWN_TIMEOUT_MS,
    });
    return { status: 0, stdout, output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    const stdout = e.stdout ?? '';
    return { status: e.status ?? -1, stdout, output: `${stdout}${e.stderr ?? ''}` };
  }
}

function helpFor(path: string[]): string {
  const result = runCli([...path, '--help']);
  expect(result.status, result.output).toBe(0);
  return result.stdout;
}

beforeAll(() => {
  if (!existsSync(CLI_BIN)) {
    throw new Error('CLI not built. Run "pnpm --filter @peac/cli build" first.');
  }
  // Outside the repository, so no lookup relative to the working directory
  // can find packages/cli/package.json.
  workDir = mkdtempSync(join(tmpdir(), 'peac-cli-bin-surface-'));
});

afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe('help output parser', () => {
  const sample = [
    'Usage: peac [options] [command]',
    '',
    'Options:',
    '  -V, --version          output the version number',
    '',
    'Commands:',
    '  verify [options] <jws> Verify a record',
    '  emit                   Issue signed records over events emitted by',
    '                         external systems',
    '  list|ls                List entries',
    '  help [command]         display help for command',
    '',
  ].join('\n');

  it('reads command names and aliases, skipping wrapped description lines', () => {
    expect(parseHelpCommands(sample)).toEqual(['verify', 'emit', 'list', 'ls', 'help']);
  });

  it('returns no commands when there is no Commands section', () => {
    expect(parseHelpCommands('Usage: peac [options]\n')).toEqual([]);
  });

  it('reports documented commands that the help output does not list', () => {
    const missing = findMissingDocumentedCommands((path) =>
      path.length === 0 ? sample : 'Commands:\n'
    );
    expect(missing).toContain('bundle');
    expect(missing).toContain('policy');
    expect(missing).not.toContain('verify');
  });
});

describe('built peac bin', () => {
  it('--version prints the @peac/cli package version', () => {
    const result = runCli(['--version']);
    expect(result.status, result.output).toBe(0);
    expect(result.stdout.trim()).toBe(CLI_PKG.version);
  });

  it('--help lists every documented top-level command', () => {
    const listed = parseHelpCommands(helpFor([]));
    for (const command of Object.keys(CLI_DOCUMENTED_COMMANDS)) {
      expect(listed, `peac ${command}`).toContain(command);
    }
  });

  it('lists every documented subcommand', () => {
    expect(findMissingDocumentedCommands(helpFor)).toEqual([]);
  });
});

describe('peac bundle (built bin, offline)', () => {
  let samplesDir: string;

  beforeAll(() => {
    samplesDir = join(workDir, 'samples');
    const generated = runCli(['samples', 'generate', '-o', samplesDir]);
    expect(generated.status, generated.output).toBe(0);
  });

  it('creates a bundle from sample records and verifies it', () => {
    const receiptsDir = join(samplesDir, 'valid');
    const keysPath = join(samplesDir, 'bundles', 'sandbox-jwks.json');
    expect(readdirSync(receiptsDir).some((f) => f.endsWith('.jws'))).toBe(true);
    expect(existsSync(keysPath)).toBe(true);

    const bundlePath = join(workDir, 'evidence.peacbundle');
    const created = runCli([
      'bundle',
      'create',
      '--dispute',
      '01JD0000000000000000000000',
      '--receipts',
      receiptsDir,
      '--keys',
      keysPath,
      '--output',
      bundlePath,
    ]);
    expect(created.status, created.output).toBe(0);
    expect(existsSync(bundlePath)).toBe(true);

    const info = runCli(['bundle', 'info', bundlePath]);
    expect(info.status, info.output).toBe(0);

    const verified = runCli(['bundle', 'verify', bundlePath, '--format', 'json']);
    expect(verified.status, verified.output).toBe(0);
    const report = JSON.parse(verified.stdout) as {
      auditor_summary?: { recommendation?: string };
    };
    expect(report.auditor_summary?.recommendation).toBe('valid');
  });
});
