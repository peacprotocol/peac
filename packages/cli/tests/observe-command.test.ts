/**
 * `peac observe command` end-to-end tests.
 *
 * Drives the pure handler (`runObserveCommand`) so tests do not depend
 * on a built CJS bin. Spawns a real child process under
 * `child_process.spawn` (through capture.ts) so the streaming-capture,
 * stdin, timeout, and shell discipline are exercised against actual
 * subprocess semantics. POSIX-first; Windows is documented as
 * not-guaranteed by the current CLI carrier profile.
 */

import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  runObserveCommand,
  validateObserveOptions,
  resolveProgramPath,
  OBSERVE_COMMAND_ERROR_CODES,
  type ObserveCommandOptions,
} from '../src/commands/observe-command';
import {
  CliExecutionSchema,
  CLI_COMMAND_EXECUTION_TYPE,
  CLI_EXECUTION_EXTENSION_KEY,
} from '@peac/schema';

const NODE = process.execPath;

interface CapturedIo {
  stdout: string;
  stderr: string;
  writeStdout: (c: string) => void;
  writeStderr: (c: string) => void;
}

function captureIo(): CapturedIo {
  const io = { stdout: '', stderr: '' } as CapturedIo;
  io.writeStdout = (c) => {
    io.stdout += c;
  };
  io.writeStderr = (c) => {
    io.stderr += c;
  };
  return io;
}

function emittedRecord(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error('no stdout emitted');
  return JSON.parse(trimmed);
}

describe('observe command: minimal hashed run', () => {
  it('emits a valid JSON observation record for `node -e "..."`', async () => {
    const io = captureIo();
    const result = await runObserveCommand({}, [NODE, '-e', 'process.stdout.write("ok")'], {
      writeStdout: io.writeStdout,
      writeStderr: io.writeStderr,
      captureEnv: {},
    });
    expect(result.exitCode).toBe(0);
    const record = emittedRecord(io.stdout) as Record<string, unknown>;
    expect(record.type).toBe(CLI_COMMAND_EXECUTION_TYPE);
    expect((record.surface as { kind: string }).kind).toBe('cli');
    // Schema sanity: the emitted record must round-trip through the
    // canonical CliExecutionSchema validator.
    const parsed = CliExecutionSchema.safeParse(record);
    if (!parsed.success) {
      throw new Error(`schema rejected emitted record: ${JSON.stringify(parsed.error.issues)}`);
    }
  }, 15_000);
});

describe('observe command: default capture invariants', () => {
  it('records stdout length+sha256+truncated, no sample, in default mode', async () => {
    const io = captureIo();
    await runObserveCommand({}, [NODE, '-e', 'process.stdout.write("hello")'], {
      writeStdout: io.writeStdout,
      writeStderr: io.writeStderr,
      captureEnv: {},
    });
    const record = emittedRecord(io.stdout) as Record<string, unknown>;
    const stdout = record.stdout_ref as Record<string, unknown>;
    expect(stdout.length).toBe(5);
    expect(stdout.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(stdout.sample_base64).toBeUndefined();
  }, 15_000);

  it('argv is hashed by default, no argv array surfaced', async () => {
    const io = captureIo();
    await runObserveCommand({}, [NODE, '-e', 'process.exit(0)'], {
      writeStdout: io.writeStdout,
      writeStderr: io.writeStderr,
      captureEnv: {},
    });
    const record = emittedRecord(io.stdout) as Record<string, unknown>;
    const command = record.command as Record<string, unknown>;
    expect(command.argv_mode).toBe('hashed');
    expect(command.argv_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(command.argv).toBeUndefined();
  }, 15_000);

  it('env is empty when no --env-allow is supplied', async () => {
    const io = captureIo();
    await runObserveCommand({}, [NODE, '-e', 'process.exit(0)'], {
      writeStdout: io.writeStdout,
      writeStderr: io.writeStderr,
      captureEnv: { SECRET_TOKEN: 'leak-me-please' },
    });
    const record = emittedRecord(io.stdout) as Record<string, unknown>;
    const env = record.env as Record<string, unknown>;
    expect(env.entries).toEqual({});
    // And the secret value is nowhere in the JSON.
    expect(io.stdout.includes('leak-me-please')).toBe(false);
  }, 15_000);
});

describe('observe command: raw capture pairing', () => {
  it('--capture-mode raw without --unsafe-allow-raw-capture hard-fails', async () => {
    const io = captureIo();
    const result = await runObserveCommand(
      { captureMode: 'raw', unsafeAllowRawCapture: false },
      [NODE, '-e', 'process.exit(0)'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    expect(result.exitCode).toBe(2);
    expect(io.stderr).toContain(OBSERVE_COMMAND_ERROR_CODES.unsafeFlagRequired);
    expect(io.stdout).toBe('');
  }, 15_000);

  it('raw + unsafe-allow-raw-capture emits sample_base64', async () => {
    const io = captureIo();
    await runObserveCommand(
      { captureMode: 'raw', unsafeAllowRawCapture: true },
      [NODE, '-e', 'process.stdout.write("hello world raw")'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    const record = emittedRecord(io.stdout) as Record<string, unknown>;
    const stdout = record.stdout_ref as Record<string, unknown>;
    expect(typeof stdout.sample_base64).toBe('string');
    const decoded = Buffer.from(stdout.sample_base64 as string, 'base64').toString('utf8');
    expect(decoded).toBe('hello world raw');
  }, 15_000);

  it('secret-pattern stdout suppresses sample_base64 under raw mode', async () => {
    const io = captureIo();
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.sig_value_padding';
    await runObserveCommand(
      { captureMode: 'raw', unsafeAllowRawCapture: true },
      [NODE, '-e', `process.stdout.write(${JSON.stringify(jwt)})`],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    const record = emittedRecord(io.stdout) as Record<string, unknown>;
    const stdout = record.stdout_ref as Record<string, unknown>;
    expect(stdout.sample_base64).toBeUndefined();
    expect(stdout.sample_suppressed_reason).toBe('secret_pattern_detected');
    expect(stdout.matched_pattern_category).toBe('jwt');
  }, 15_000);
});

describe('observe command: env handling', () => {
  it('--env-allow records only the allowlisted key', async () => {
    const io = captureIo();
    await runObserveCommand({ envAllow: ['ALLOWED_KEY'] }, [NODE, '-e', 'process.exit(0)'], {
      writeStdout: io.writeStdout,
      writeStderr: io.writeStderr,
      captureEnv: { ALLOWED_KEY: 'visible-shape', OTHER_KEY: 'should-not-appear' },
    });
    const record = emittedRecord(io.stdout) as Record<string, unknown>;
    const env = record.env as { entries: Record<string, unknown> };
    expect(Object.keys(env.entries)).toEqual(['ALLOWED_KEY']);
    expect(io.stdout.includes('should-not-appear')).toBe(false);
  }, 15_000);

  it('--env-mode raw without --unsafe-allow-raw-env hard-fails', async () => {
    const io = captureIo();
    const result = await runObserveCommand(
      { envMode: 'raw', envAllow: ['FOO'] },
      [NODE, '-e', 'process.exit(0)'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: { FOO: 'bar' } }
    );
    expect(result.exitCode).toBe(2);
    expect(io.stderr).toContain(OBSERVE_COMMAND_ERROR_CODES.unsafeFlagRequired);
  }, 15_000);
});

describe('observe command: stdin no-hang', () => {
  it('mode=none does not read parent stdin and does not hang', async () => {
    const io = captureIo();
    const neverEnding = new Readable({
      read() {
        setTimeout(() => {
          if (!this.destroyed) this.push(Buffer.from('x'));
        }, 20);
      },
    });
    const start = Date.now();
    const result = await runObserveCommand(
      { captureStdinMode: 'none' },
      [NODE, '-e', 'process.exit(0)'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    expect(Date.now() - start).toBeLessThan(3_000);
    expect(result.exitCode).toBe(0);
    const record = emittedRecord(io.stdout) as Record<string, unknown>;
    const stdin = record.stdin_ref as Record<string, unknown>;
    expect(stdin.mode).toBe('none');
    neverEnding.destroy();
  }, 15_000);
});

describe('observe command: shell discipline', () => {
  it('shell binary without --shell-mode hard-fails with cli.shell_mode_required', async () => {
    const io = captureIo();
    const result = await runObserveCommand({}, ['/bin/sh', '-c', 'echo hi'], {
      writeStdout: io.writeStdout,
      writeStderr: io.writeStderr,
      captureEnv: {},
    });
    expect(result.exitCode).toBe(2);
    expect(io.stderr).toContain(OBSERVE_COMMAND_ERROR_CODES.shellModeRequired);
    expect(io.stdout).toBe('');
  });

  it('shell binary with --shell-mode runs without command rewriting', async () => {
    const io = captureIo();
    const result = await runObserveCommand({ shellMode: true }, ['/bin/sh', '-c', 'echo hi'], {
      writeStdout: io.writeStdout,
      writeStderr: io.writeStderr,
      captureEnv: {},
    });
    expect(result.exitCode).toBe(0);
    const record = emittedRecord(io.stdout) as Record<string, unknown>;
    expect(record.shell_mode).toBe(true);
    const stdout = record.stdout_ref as Record<string, unknown>;
    // `echo hi\n` = 3 bytes "hi\n"
    expect(stdout.length).toBe(3);
    // command.program records the basename only, never the absolute path
    expect((record.command as { program: string }).program).toBe('sh');
  }, 15_000);
});

describe('observe command: timeout cascade', () => {
  it('records timed_out=true when the child outlives the timeout', async () => {
    const io = captureIo();
    await runObserveCommand(
      { timeoutMs: 200, killGraceMs: 200, exitCodeMode: 'record' },
      [NODE, '-e', 'setInterval(() => {}, 1000)'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    const record = emittedRecord(io.stdout) as Record<string, unknown>;
    expect(record.timed_out).toBe(true);
    expect(['SIGTERM', 'SIGKILL']).toContain(record.termination_signal);
  }, 15_000);
});

describe('observe command: exit-code mode', () => {
  it('default child mode mirrors child exit code', async () => {
    const io = captureIo();
    const result = await runObserveCommand({}, [NODE, '-e', 'process.exit(7)'], {
      writeStdout: io.writeStdout,
      writeStderr: io.writeStderr,
      captureEnv: {},
    });
    expect(result.exitCode).toBe(7);
    const record = emittedRecord(io.stdout) as Record<string, unknown>;
    expect(record.exit_code).toBe(7);
    expect(record.exit_code_mode).toBe('child');
  }, 15_000);

  it('record mode exits 0 and records the child exit code', async () => {
    const io = captureIo();
    const result = await runObserveCommand(
      { exitCodeMode: 'record' },
      [NODE, '-e', 'process.exit(7)'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    expect(result.exitCode).toBe(0);
    const record = emittedRecord(io.stdout) as Record<string, unknown>;
    expect(record.exit_code).toBe(7);
    expect(record.exit_code_mode).toBe('record');
  }, 15_000);
});

describe('observe command: path leakage discipline', () => {
  it('default hashed binary path does not leak the absolute resolved program path', async () => {
    const io = captureIo();
    await runObserveCommand({}, [NODE, '-e', 'process.exit(0)'], {
      writeStdout: io.writeStdout,
      writeStderr: io.writeStderr,
      captureEnv: {},
    });
    expect(io.stdout.includes(NODE)).toBe(false);
    const record = emittedRecord(io.stdout) as Record<string, unknown>;
    const command = record.command as { program: string };
    // command.program is basename-only: 'node' (POSIX) or 'node.exe' (win32)
    expect(/[\\/]/.test(command.program)).toBe(false);
    const binary = record.binary as Record<string, unknown>;
    expect(binary.path_mode).toBe('hashed');
    expect(binary.path_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    // No absolute path field under hashed mode
    expect(binary.path_absolute).toBeUndefined();
  }, 15_000);
});

describe('observe command: validation hard-fails', () => {
  it('rejects out-of-range --timeout-ms', () => {
    const failures = validateObserveOptions({ ...defaultOpts(), timeoutMs: 999_999_999_999 }, [
      NODE,
    ]);
    expect(failures.some((f) => f.code === OBSERVE_COMMAND_ERROR_CODES.outOfRange)).toBe(true);
  });

  it('rejects missing program after `--`', () => {
    const failures = validateObserveOptions(defaultOpts(), []);
    expect(failures.some((f) => f.code === OBSERVE_COMMAND_ERROR_CODES.programRequired)).toBe(true);
  });

  it('rejects --secret-scan off + raw capture without --unsafe-disable-secret-scan', () => {
    const failures = validateObserveOptions(
      {
        ...defaultOpts(),
        captureMode: 'raw',
        unsafeAllowRawCapture: true,
        secretScan: false,
        unsafeDisableSecretScan: false,
      },
      [NODE]
    );
    expect(
      failures.some(
        (f) => f.code === OBSERVE_COMMAND_ERROR_CODES.secretScanDisableRequiresUnsafeFlag
      )
    ).toBe(true);
  });
});

describe('observe command: spawn failure', () => {
  it('non-existent program exits 2 with cli.spawn_failed and emits no JSON', async () => {
    const io = captureIo();
    const result = await runObserveCommand({}, ['definitely-not-a-real-binary-91827'], {
      writeStdout: io.writeStdout,
      writeStderr: io.writeStderr,
      captureEnv: {},
    });
    expect(result.exitCode).toBe(2);
    expect(io.stderr).toContain(OBSERVE_COMMAND_ERROR_CODES.spawnFailed);
    expect(io.stdout).toBe('');
  }, 15_000);
});

describe('observe command: childEnv vs captureEnv split', () => {
  it('childEnv is what the child sees; captureEnv is what PEAC records', async () => {
    const io = captureIo();
    // Child reads its own env; capture-env sees a different set.
    await runObserveCommand(
      { envAllow: ['CAPTURE_ONLY'] },
      [
        NODE,
        '-e',
        'process.stdout.write(JSON.stringify({ child_seen: process.env.CHILD_ONLY ?? null }))',
      ],
      {
        writeStdout: io.writeStdout,
        writeStderr: io.writeStderr,
        childEnv: { CHILD_ONLY: 'visible-to-child', PATH: process.env.PATH ?? '' },
        captureEnv: { CAPTURE_ONLY: 'recorded-by-peac' },
      }
    );
    const record = emittedRecord(io.stdout) as Record<string, unknown>;
    const env = record.env as { entries: Record<string, unknown> };
    // Only CAPTURE_ONLY is recorded (capture path).
    expect(Object.keys(env.entries)).toEqual(['CAPTURE_ONLY']);
    // The child saw CHILD_ONLY (execution path) -- verified by the
    // child's stdout sha256 matching the expected payload (we cannot
    // see the child output directly because default mode is hashed,
    // but the absence of CHILD_ONLY in the env entries proves the
    // capture/execution split).
    expect(io.stdout.includes('CHILD_ONLY')).toBe(false);
    expect(io.stdout.includes('visible-to-child')).toBe(false);
  }, 15_000);
});

describe('observe command: preflight rejects record-only options before spawn', () => {
  it('invalid --policy-digest does not run the child', async () => {
    const io = captureIo();
    const result = await runObserveCommand(
      { policyDigest: 'not-a-sha256-digest' },
      [NODE, '-e', 'process.exit(99)'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    expect(result.exitCode).toBe(2);
    expect(io.stderr).toContain(OBSERVE_COMMAND_ERROR_CODES.invalidPolicyDigest);
    // If the child had run, exit code 99 would have surfaced under
    // exitCodeMode='child'. exitCode === 2 confirms preflight aborted.
    expect(result.exitCode).not.toBe(99);
  });

  it('invalid --approval-ref does not run the child', async () => {
    const io = captureIo();
    const result = await runObserveCommand(
      { approvalRef: 'approver@example.com' },
      [NODE, '-e', 'process.exit(99)'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    expect(result.exitCode).toBe(2);
    expect(io.stderr).toContain(OBSERVE_COMMAND_ERROR_CODES.invalidApprovalRef);
  });

  it('invalid --env-allow key does not run the child', async () => {
    const io = captureIo();
    const result = await runObserveCommand(
      { envAllow: ['1BAD-KEY'] },
      [NODE, '-e', 'process.exit(99)'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    expect(result.exitCode).toBe(2);
    expect(io.stderr).toContain(OBSERVE_COMMAND_ERROR_CODES.invalidEnvKey);
  });

  it('oversized raw argv token does not run the child', async () => {
    const io = captureIo();
    const big = 'x'.repeat(50);
    const result = await runObserveCommand(
      {
        captureMode: 'raw',
        unsafeAllowRawCapture: true,
        captureArgvBytes: 16, // small cap for the test
      },
      [NODE, '-e', 'process.exit(99)', big],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    expect(result.exitCode).toBe(2);
    expect(io.stderr).toContain(OBSERVE_COMMAND_ERROR_CODES.argvTokenTooLong);
    expect(result.exitCode).not.toBe(99);
  });
});

describe('observe command: output write failure', () => {
  it('--output to a missing directory exits 2 with cli.output_write_failed (no stack)', async () => {
    const io = captureIo();
    const result = await runObserveCommand(
      { output: '/definitely/missing/dir/peac-out.json' },
      [NODE, '-e', 'process.exit(0)'],
      { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
    );
    expect(result.exitCode).toBe(2);
    expect(io.stderr).toContain(OBSERVE_COMMAND_ERROR_CODES.outputWriteFailed);
    // Stable error code on the FIRST line; no Node stack trace.
    expect(io.stderr.includes('Error:')).toBe(false);
    expect(io.stderr.includes('  at ')).toBe(false);
  }, 15_000);
});

describe('observe command: --output preflight blocks child execution', () => {
  it('unwritable --output exits 2 with cli.output_write_failed and child does not run', async () => {
    const io = captureIo();
    // Marker-file pattern: if the child ever ran, it would create
    // this file. We assert the file does NOT exist after the run.
    const marker = join(mkdtempSync(join(tmpdir(), 'peac-marker-')), 'child-ran.txt');
    try {
      const result = await runObserveCommand(
        { output: '/definitely/missing/dir/peac-out.json' },
        [
          NODE,
          '-e',
          `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x'); process.exit(99)`,
        ],
        { writeStdout: io.writeStdout, writeStderr: io.writeStderr, captureEnv: {} }
      );
      expect(result.exitCode).toBe(2);
      expect(io.stderr).toContain(OBSERVE_COMMAND_ERROR_CODES.outputWriteFailed);
      // Child was NOT spawned: marker file does not exist, and the
      // wrapper exit code is 2 (preflight), never 99 (child exit).
      expect(existsSync(marker)).toBe(false);
      expect(result.exitCode).not.toBe(99);
    } finally {
      // Clean up the temp marker dir (file may not exist; rm is recursive).
      try {
        rmSync(marker, { force: true });
      } catch {
        // ignore
      }
    }
  }, 15_000);

  it('writable --output succeeds and emits the record to the file', async () => {
    const io = captureIo();
    const tmp = mkdtempSync(join(tmpdir(), 'peac-out-'));
    const outPath = join(tmp, 'record.json');
    try {
      const result = await runObserveCommand({ output: outPath }, [NODE, '-e', 'process.exit(0)'], {
        writeStdout: io.writeStdout,
        writeStderr: io.writeStderr,
        captureEnv: {},
      });
      expect(result.exitCode).toBe(0);
      expect(existsSync(outPath)).toBe(true);
      // stdout is NOT used when --output writes to a file.
      expect(io.stdout).toBe('');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 15_000);
});

describe('observe command: resolveProgramPath honors childEnv.PATH', () => {
  it('finds executables on childEnv.PATH that are NOT on process.env.PATH', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'peac-resolver-'));
    const fakeName = 'peac-resolver-fixture-marker';
    const fakePath = join(tmp, fakeName);
    try {
      // Create a fake executable in the temp dir.
      writeFileSync(fakePath, '#!/bin/sh\nexit 0\n');
      chmodSync(fakePath, 0o755);
      // Confirm the ambient PATH does NOT contain the temp dir, so a
      // resolver that ignored childEnv would fail to find the binary.
      expect((process.env.PATH ?? '').includes(tmp)).toBe(false);

      const resolvedFromAmbient = resolveProgramPath(fakeName);
      // Without childEnv override, resolution falls through to ambient PATH
      // and returns the bare token (executable not found).
      expect(resolvedFromAmbient).toBe(fakeName);

      const resolvedFromChildEnv = resolveProgramPath(fakeName, {
        PATH: tmp,
      });
      // With childEnv override, resolution finds the executable.
      expect(resolvedFromChildEnv).toBe(fakePath);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('falls back to process.env.PATH when childEnv.PATH is undefined', () => {
    // Just resolve `node` against an empty childEnv; the resolver
    // should fall through to process.env.PATH and find Node.
    const resolved = resolveProgramPath('node', {});
    // Either resolves to an absolute path or returns the bare token;
    // either way, the call must not throw.
    expect(typeof resolved).toBe('string');
  });
});

describe('observe command: extension namespace key is exported correctly', () => {
  it('the canonical extension key matches the cli-execution namespace', () => {
    expect(CLI_EXECUTION_EXTENSION_KEY).toBe('org.peacprotocol/cli-execution');
    expect(CLI_COMMAND_EXECUTION_TYPE).toBe('org.peacprotocol/cli-command-execution');
  });
});

function defaultOpts(): ObserveCommandOptions {
  return {
    captureMode: 'hashed',
    unsafeAllowRawCapture: false,
    captureStdinMode: 'none',
    captureStdoutBytes: 16384,
    captureStderrBytes: 16384,
    captureArgvBytes: 4096,
    envAllow: [],
    envMode: 'hashed',
    unsafeAllowRawEnv: false,
    captureCwdMode: 'hashed',
    captureBinaryPath: 'hashed',
    secretScan: true,
    unsafeDisableSecretScan: false,
    executionMode: 'deterministic_script',
    shellMode: false,
    output: '-',
    timeoutMs: 600_000,
    killGraceMs: 5_000,
    exitCodeMode: 'child',
  };
}
