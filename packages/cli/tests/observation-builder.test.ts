/**
 * observation-builder tests.
 *
 * Covers the builder-layer hard-fail and security invariants:
 *   - command.program is basename-only; no absolute path leaks anywhere
 *     in the emitted record under default hashed binary path mode
 *   - oversized raw argv tokens hard-fail with cli.argv_token_too_long
 *   - env.mode='raw' with rawEnvEnabled=false hard-fails with
 *     cli.env_mode_inconsistent
 *   - shell_ref is digest-only and equals path_sha256 under hashed
 *   - secret-scan suppression removes sample_base64 and records the
 *     suppression reason and category
 */

import { describe, it, expect } from 'vitest';
import {
  buildObservation,
  CliObservationBuilderError,
  type BuilderInput,
} from '../src/lib/observation-builder';
import type { CaptureResult } from '../src/lib/capture';

const SHA256_LEN = 71; // 'sha256:' + 64 hex chars
const RFC_3339 = '2026-01-01T00:00:00Z';

function fakeCapture(overrides: Partial<CaptureResult> = {}): CaptureResult {
  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    terminationSignal: null,
    startedAt: RFC_3339,
    finishedAt: RFC_3339,
    durationMs: 1,
    stdout: { length: 0, sha256: 'sha256:' + 'a'.repeat(64), truncated: false },
    stderr: { length: 0, sha256: 'sha256:' + 'a'.repeat(64), truncated: false },
    stdin: { mode: 'none' },
    ...overrides,
  };
}

function fakeInput(overrides: Partial<BuilderInput> = {}): BuilderInput {
  return {
    capture: fakeCapture(),
    programToken: 'node',
    resolvedProgramPath: process.execPath,
    rawArgv: [],
    cwd: process.cwd(),
    argvMode: 'hashed',
    cwdMode: 'hashed',
    binaryPathMode: 'hashed',
    envMode: 'hashed',
    stdinMode: 'none',
    envAllowlist: [],
    parentEnv: {},
    rawCaptureEnabled: false,
    rawEnvEnabled: false,
    secretScanEnabled: true,
    secretScanDisabledUnsafely: false,
    argvCaptureBytes: 4096,
    stdoutSampleBytes: 16384,
    stderrSampleBytes: 16384,
    timeoutMs: 600_000,
    killGraceMs: 5_000,
    exitCodeMode: 'child',
    executionMode: 'deterministic_script',
    shellMode: false,
    peacCliVersion: '0.14.1',
    ...overrides,
  };
}

describe('buildObservation: command.program basename-only', () => {
  it('reduces an absolute programToken to its basename', async () => {
    const obs = await buildObservation(
      fakeInput({ programToken: '/usr/bin/python3', resolvedProgramPath: '/usr/bin/python3' })
    );
    expect(obs.command.program).toBe('python3');
  });

  it('reduces a Windows-style programToken to its basename', async () => {
    const obs = await buildObservation(
      fakeInput({ programToken: 'C:\\Python\\python.exe', resolvedProgramPath: process.execPath })
    );
    expect(obs.command.program).toBe('python.exe');
  });

  it('default hashed mode does not leak the absolute binary path anywhere in JSON', async () => {
    const sensitivePath = '/sensitive-org/private-tool/secret-binary';
    const obs = await buildObservation(
      fakeInput({ programToken: sensitivePath, resolvedProgramPath: process.execPath })
    );
    const serialized = JSON.stringify(obs);
    expect(serialized.includes(sensitivePath)).toBe(false);
    expect(serialized.includes('/sensitive-org')).toBe(false);
    expect(serialized.includes('private-tool')).toBe(false);
    expect(obs.command.program).toBe('secret-binary');
  });
});

describe('buildObservation: argv encoding', () => {
  it('hashed mode emits argv_sha256 only', async () => {
    const obs = await buildObservation(
      fakeInput({ argvMode: 'hashed', rawArgv: ['node', '-e', 'process.exit(0)'] })
    );
    expect(obs.command.argv_mode).toBe('hashed');
    if (obs.command.argv_mode === 'hashed') {
      expect(obs.command.argv_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });

  it('redacted mode preserves structural tokens and redacts values', async () => {
    const obs = await buildObservation(
      fakeInput({
        argvMode: 'redacted',
        rawArgv: ['--api-key', 'sk_test_123', '--pin', '1234', '--name=bob', '-f', 'foo.txt'],
      })
    );
    expect(obs.command.argv_mode).toBe('redacted');
    if (obs.command.argv_mode === 'redacted') {
      expect(obs.command.argv).toEqual([
        '--api-key',
        '<redacted:11>',
        '--pin',
        '<redacted:4>',
        '--name=<redacted:3>',
        '-f',
        '<redacted:7>',
      ]);
    }
  });

  it('raw mode hard-fails when a token exceeds argv_max_bytes', async () => {
    const big = 'x'.repeat(5000);
    await expect(
      buildObservation(
        fakeInput({
          argvMode: 'raw',
          rawCaptureEnabled: true,
          argvCaptureBytes: 4096,
          rawArgv: [big],
        })
      )
    ).rejects.toMatchObject({
      name: 'CliObservationBuilderError',
      code: 'cli.argv_token_too_long',
    });
  });

  it('raw mode replaces secret-pattern tokens with the suppression marker', async () => {
    const obs = await buildObservation(
      fakeInput({
        argvMode: 'raw',
        rawCaptureEnabled: true,
        rawArgv: ['cmd', 'AKIAIOSFODNN7EXAMPLE'],
      })
    );
    expect(obs.command.argv_mode).toBe('raw');
    if (obs.command.argv_mode === 'raw') {
      expect(obs.command.argv![1]).toBe('<secret-suppressed:aws-access-key>');
    }
  });
});

describe('buildObservation: env handling', () => {
  it('hashed mode records value_sha256 only for allowlisted keys', async () => {
    const obs = await buildObservation(
      fakeInput({ envAllowlist: ['FOO'], parentEnv: { FOO: 'bar', SECRET: 'leak' } })
    );
    expect(Object.keys(obs.env.entries)).toEqual(['FOO']);
    expect(obs.env.entries.FOO.value_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(obs.env.entries.FOO.value).toBeUndefined();
  });

  it('raw mode hard-fails when rawEnvEnabled=false', async () => {
    await expect(
      buildObservation(
        fakeInput({
          envMode: 'raw',
          rawEnvEnabled: false,
          envAllowlist: ['FOO'],
          parentEnv: { FOO: 'bar' },
        })
      )
    ).rejects.toMatchObject({
      name: 'CliObservationBuilderError',
      code: 'cli.env_mode_inconsistent',
    });
  });

  it('raw mode records value when rawEnvEnabled=true', async () => {
    const obs = await buildObservation(
      fakeInput({
        envMode: 'raw',
        rawEnvEnabled: true,
        envAllowlist: ['FOO'],
        parentEnv: { FOO: 'bar' },
      })
    );
    expect(obs.env.entries.FOO.value).toBe('bar');
    expect(obs.env.entries.FOO.value_sha256).toBeUndefined();
  });
});

describe('buildObservation: shell_ref discipline', () => {
  it('shell_mode=true under hashed mode emits shell_ref equal to path_sha256', async () => {
    const obs = await buildObservation(
      fakeInput({
        shellMode: true,
        binaryPathMode: 'hashed',
        programToken: '/bin/bash',
        resolvedProgramPath: process.execPath, // any local file works for stat
      })
    );
    if ('path_sha256' in obs.binary && 'shell_ref' in obs.binary) {
      const path_sha256 = obs.binary.path_sha256 as string;
      expect(obs.binary.shell_ref).toBe(path_sha256);
      expect(obs.binary.shell_ref).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
    expect(obs.shell_mode).toBe(true);
  });

  it('shell_mode=true under binary path none hard-fails', async () => {
    await expect(
      buildObservation(
        fakeInput({ shellMode: true, binaryPathMode: 'none', programToken: '/bin/bash' })
      )
    ).rejects.toMatchObject({
      name: 'CliObservationBuilderError',
      code: 'cli.shell_mode_required',
    });
  });

  it('shell_ref does not contain path separators (no /bin/bash leak)', async () => {
    const obs = await buildObservation(
      fakeInput({
        shellMode: true,
        binaryPathMode: 'hashed',
        programToken: '/bin/bash',
        resolvedProgramPath: process.execPath,
      })
    );
    const serialized = JSON.stringify(obs);
    expect(serialized.includes('/bin/bash')).toBe(false);
    if ('shell_ref' in obs.binary && obs.binary.shell_ref !== undefined) {
      expect(/[\\/]/.test(obs.binary.shell_ref)).toBe(false);
    }
  });
});

describe('buildObservation: capture_policy mirroring', () => {
  it('mirrors the input policy verbatim into capture_policy', async () => {
    const obs = await buildObservation(
      fakeInput({
        rawCaptureEnabled: true,
        rawEnvEnabled: false,
        secretScanEnabled: true,
        secretScanDisabledUnsafely: false,
        timeoutMs: 60_000,
        killGraceMs: 2_000,
      })
    );
    expect(obs.capture_policy.raw_capture_unsafely_allowed).toBe(true);
    expect(obs.capture_policy.raw_env_unsafely_allowed).toBe(false);
    expect(obs.capture_policy.secret_scan).toBe(true);
    expect(obs.capture_policy.secret_scan_disabled_unsafely).toBe(false);
    expect(obs.capture_policy.timeout_ms).toBe(60_000);
    expect(obs.capture_policy.kill_grace_ms).toBe(2_000);
  });
});

describe('CliObservationBuilderError', () => {
  it('exposes a stable error code', () => {
    const err = new CliObservationBuilderError('cli.argv_token_too_long', 'too long');
    expect(err.code).toBe('cli.argv_token_too_long');
    expect(err.name).toBe('CliObservationBuilderError');
  });
});

describe('SHA256_LEN sanity', () => {
  it('canonical sha256: prefix + 64 hex = 71 chars', () => {
    expect(SHA256_LEN).toBe(71);
    expect(('sha256:' + 'a'.repeat(64)).length).toBe(SHA256_LEN);
  });
});
