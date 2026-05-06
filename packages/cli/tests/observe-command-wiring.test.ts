/**
 * `peac observe command` Commander wiring + help-text test.
 *
 * Drives the actual `observeCommand()` Commander instance with a
 * controlled `argv`, instead of calling `runObserveCommand()` directly.
 * This exercises the option-parser / `--`-separator / NaN-safe parsing
 * paths that the pure handler does not cover.
 *
 * `program.exitOverride()` and `program.configureOutput()` are used so
 * Commander does not call `process.exit()` or write to the real
 * `process.stdout` / `process.stderr` during the test run.
 */

import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import {
  observeCommand,
  observeCommandSubcommand,
  parseIntegerFlag,
} from '../src/commands/observe-command';
import { CliExecutionSchema } from '@peac/schema';

const NODE = process.execPath;

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Build a `peac` Command instance with the observe-command attached,
 * route stdout/stderr to capture buffers, and run with a controlled
 * argv. Returns captured streams + child exit code.
 */
async function runWiredObserveCommand(argvAfterPeac: string[]): Promise<RunResult> {
  const program = new Command();
  program.name('peac').exitOverride();
  let stdout = '';
  let stderr = '';
  program.configureOutput({
    writeOut: (str) => {
      stdout += str;
    },
    writeErr: (str) => {
      stderr += str;
    },
  });

  const observe = observeCommand();
  observe.exitOverride();

  // Reroute the action handler's stdout/stderr by overriding
  // process.stdout.write / process.stderr.write for the duration of
  // the run. Commander's configureOutput only catches its own helps
  // and errors, not what runObserveCommand writes via writeStdout/Err.
  const origStdout = process.stdout.write.bind(process.stdout);
  const origStderr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stderr.write;

  // The action handler now sets process.exitCode rather than calling
  // process.exit(). Snapshot and restore the value so tests do not
  // pollute one another, and surface the value as the per-run exit
  // code captured by callers.
  const origExitCode = process.exitCode;
  process.exitCode = 0;

  program.addCommand(observe);

  const argv = ['node', 'peac', 'observe', 'command', ...argvAfterPeac];
  let exitCode = 0;
  try {
    await program.parseAsync(argv);
    exitCode = typeof process.exitCode === 'number' ? process.exitCode : 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('outputHelp') || msg.includes('CommanderError')) {
      // Help output / commander internal exits are non-fatal here.
    } else {
      throw err;
    }
  } finally {
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
    process.exitCode = origExitCode;
  }
  return { stdout, stderr, exitCode };
}

describe('observe command wiring: end-to-end smoke', () => {
  it('runs `peac observe command -- node -e "..."` and emits valid JSON', async () => {
    const result = await runWiredObserveCommand(['--', NODE, '-e', 'process.stdout.write("ok")']);
    expect(result.exitCode).toBe(0);
    const trimmed = result.stdout.trim();
    expect(trimmed.length).toBeGreaterThan(0);
    const parsed = CliExecutionSchema.safeParse(JSON.parse(trimmed));
    if (!parsed.success) {
      throw new Error(
        `wired observe command emitted record failed schema: ${JSON.stringify(parsed.error.issues)}`
      );
    }
  }, 20_000);

  it('keeps options before `--` as PEAC options and post-`--` tokens as child args', async () => {
    const result = await runWiredObserveCommand([
      '--capture-mode',
      'hashed',
      '--',
      NODE,
      '-e',
      'process.stdout.write("ok")',
    ]);
    expect(result.exitCode).toBe(0);
    const record = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    const command = record.command as { argv_mode: string };
    expect(command.argv_mode).toBe('hashed');
  }, 20_000);

  it('post-`--` `-c` argument is NOT consumed as a PEAC option', async () => {
    // /bin/sh -c "echo hi" with --shell-mode acknowledged by PEAC.
    const result = await runWiredObserveCommand(['--shell-mode', '--', '/bin/sh', '-c', 'echo hi']);
    expect(result.exitCode).toBe(0);
    const record = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    expect(record.shell_mode).toBe(true);
    expect((record.command as { program: string }).program).toBe('sh');
  }, 20_000);
});

describe('observe command wiring: NaN-safe numeric parsing', () => {
  it('parseIntegerFlag returns NaN for non-integer input', () => {
    expect(Number.isNaN(parseIntegerFlag('nope'))).toBe(true);
    expect(Number.isNaN(parseIntegerFlag('1.5'))).toBe(true);
    expect(Number.isNaN(parseIntegerFlag(''))).toBe(true);
    expect(parseIntegerFlag('600000')).toBe(600_000);
    expect(parseIntegerFlag('0')).toBe(0);
  });

  it('--timeout-ms nope hard-fails with cli.out_of_range and does not run the child', async () => {
    const result = await runWiredObserveCommand([
      '--timeout-ms',
      'nope',
      '--',
      NODE,
      '-e',
      'process.exit(0)',
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('cli.out_of_range');
    expect(result.stdout).toBe('');
  }, 20_000);

  it('--capture-stdout-bytes nope hard-fails with cli.out_of_range', async () => {
    const result = await runWiredObserveCommand([
      '--capture-stdout-bytes',
      'nope',
      '--',
      NODE,
      '-e',
      'process.exit(0)',
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('cli.out_of_range');
  }, 20_000);
});

describe('observe command wiring: process.exitCode discipline', () => {
  it('action sets process.exitCode rather than calling process.exit()', async () => {
    // After a non-zero failure, process.exitCode is captured by the
    // helper. The helper itself never sees an `__OBSERVE_TEST_EXIT__`
    // throw because the action no longer calls process.exit().
    const result = await runWiredObserveCommand([
      '--timeout-ms',
      'nope',
      '--',
      NODE,
      '-e',
      'process.exit(0)',
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('cli.out_of_range');
  }, 20_000);
});

describe('observe command wiring: help text', () => {
  it('subcommand --help mentions "unsigned", "not", and "shell: false"', () => {
    const sub = observeCommandSubcommand();
    const help = sub.helpInformation();
    expect(help.toLowerCase()).toContain('unsigned');
    // Keywords from the not-a-sandbox carve-out.
    expect(help).toMatch(/not a sandbox/i);
    expect(help).toMatch(/shell: false/i);
  });

  it('parent group --help lists the `command` subcommand', () => {
    const observe = observeCommand();
    const help = observe.helpInformation();
    expect(help).toMatch(/\bcommand\b/);
  });
});
