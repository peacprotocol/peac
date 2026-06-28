/**
 * `peac record command` Commander wiring smoke test.
 *
 * Drives the actual `recordCommand()` Commander instance with a
 * controlled `argv`, intercepting stdout/stderr/process.exitCode so
 * the test runner does not exit. Confirms the option parser,
 * `--`-separator, and signing-input flag wiring all work end-to-end.
 */

import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { recordCommand } from '../src/commands/record-command';
import { decode } from '@peac/crypto';
import { CLI_EXECUTION_EXTENSION_KEY } from '@peac/schema';
import { getVersion } from '../src/lib/version';

const NODE = process.execPath;

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runWiredRecordCommand(argvAfterPeac: string[]): Promise<RunResult> {
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

  const record = recordCommand();
  record.exitOverride();

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

  const origExitCode = process.exitCode;
  process.exitCode = 0;

  program.addCommand(record);

  const argv = ['node', 'peac', 'record', 'command', ...argvAfterPeac];
  let exitCode = 0;
  try {
    await program.parseAsync(argv);
    exitCode = typeof process.exitCode === 'number' ? process.exitCode : 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('outputHelp') || msg.includes('CommanderError')) {
      // Help / commander internal exits are non-fatal here.
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

describe('record command wiring: end-to-end smoke', () => {
  it('runs `peac record command --unsafe-ephemeral-key --issuer-id <url> -- node -e "..."` and emits a JWS', async () => {
    const result = await runWiredRecordCommand([
      '--unsafe-ephemeral-key',
      '--issuer-id',
      'https://issuer.example',
      '--',
      NODE,
      '-e',
      'process.stdout.write("ok")',
    ]);
    expect(result.exitCode).toBe(0);
    const jws = result.stdout.trim();
    expect(jws.split('.').length).toBe(3);
    const { header, payload } = decode(jws);
    expect(header.typ).toBe('interaction-record+jwt');
    expect((payload as Record<string, unknown>).iss).toBe('https://issuer.example');
    const extensions = (payload as Record<string, unknown>).extensions as Record<string, unknown>;
    const ext = extensions[CLI_EXECUTION_EXTENSION_KEY] as Record<string, unknown>;
    expect(ext.type).toBe('org.peacprotocol/cli-command-execution');
    // peac_cli_version comes from the canonical getVersion(), not a hardcoded fallback,
    // and matches the observe command path (same version source).
    const platform = ext.platform as Record<string, unknown>;
    expect(platform.peac_cli_version).toBe(getVersion());
    expect(platform.peac_cli_version).not.toBe('0.14.1');
  }, 20_000);

  it('keeps options before `--` as PEAC options and post-`--` tokens as child args', async () => {
    const result = await runWiredRecordCommand([
      '--unsafe-ephemeral-key',
      '--issuer-id',
      'https://issuer.example',
      '--capture-mode',
      'hashed',
      '--',
      NODE,
      '-e',
      'process.exit(0)',
    ]);
    expect(result.exitCode).toBe(0);
    const { payload } = decode(result.stdout.trim());
    const extensions = (payload as Record<string, unknown>).extensions as Record<string, unknown>;
    const ext = extensions[CLI_EXECUTION_EXTENSION_KEY] as Record<string, unknown>;
    expect((ext.command as { argv_mode: string }).argv_mode).toBe('hashed');
  }, 20_000);
});

describe('record command wiring: signing-input mutex via real flag parser', () => {
  it('missing both --issuer-key and --unsafe-ephemeral-key fails with cli.signing_input_required', async () => {
    const result = await runWiredRecordCommand([
      '--issuer-id',
      'https://issuer.example',
      '--',
      NODE,
      '-e',
      'process.exit(0)',
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('cli.signing_input_required');
    expect(result.stdout).toBe('');
  }, 20_000);
});
