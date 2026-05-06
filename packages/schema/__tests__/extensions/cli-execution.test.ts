/**
 * CLI Execution Observation Schema invariant tests.
 *
 * Each test exercises one schema-level rule that the wrapper itself
 * also enforces in its flag-parse / builder layers. The schema is the
 * last line of defense against records that claim safe defaults while
 * carrying unsafe content.
 */

import { describe, it, expect } from 'vitest';
import {
  CliExecutionSchema,
  CLI_COMMAND_EXECUTION_TYPE,
  CLI_EXECUTION_ERROR_CODES,
  validateCliExecution,
  CLI_SCHEMA_LIMITS,
} from '../../src/extensions/cli-execution';

const SHA256_HEX = 'a'.repeat(64);
const SHA256 = `sha256:${SHA256_HEX}`;

function minimalHashed(): Record<string, unknown> {
  return {
    type: CLI_COMMAND_EXECUTION_TYPE,
    surface: { kind: 'cli' },
    command: {
      program: 'node',
      argv_mode: 'hashed',
      argv_sha256: SHA256,
    },
    cwd: { cwd_mode: 'hashed', cwd_sha256: SHA256 },
    binary: { path_mode: 'hashed', path_sha256: SHA256 },
    stdin_ref: { mode: 'none' },
    stdout_ref: { length: 0, sha256: SHA256, truncated: false },
    stderr_ref: { length: 0, sha256: SHA256, truncated: false },
    env: { mode: 'hashed', entries: {} },
    started_at: '2026-01-01T00:00:00Z',
    finished_at: '2026-01-01T00:00:01Z',
    duration_ms: 1000,
    exit_code: 0,
    timed_out: false,
    timeout_ms: 600000,
    kill_grace_ms: 5000,
    exit_code_mode: 'child',
    shell_mode: false,
    execution_mode: 'deterministic_script',
    capture_policy: {
      stdout_max_bytes: 16384,
      stderr_max_bytes: 16384,
      argv_max_bytes: 4096,
      env_allowlist: [],
      stdin_mode: 'none',
      cwd_mode: 'hashed',
      binary_path_mode: 'hashed',
      secret_scan: true,
      raw_capture_unsafely_allowed: false,
      raw_env_unsafely_allowed: false,
      secret_scan_disabled_unsafely: false,
      timeout_ms: 600000,
      kill_grace_ms: 5000,
      exit_code_mode: 'child',
    },
    platform: { os: 'linux', arch: 'x64', peac_cli_version: '0.14.1' },
  };
}

function expectErrorCode(data: unknown, expectedCode: string): void {
  const result = validateCliExecution(data);
  if (result.ok) {
    throw new Error(`expected validation failure with code ${expectedCode}, got ok=true`);
  }
  const codes = result.errors.map((e) => e.code);
  expect(codes).toContain(expectedCode);
}

describe('CliExecutionSchema: minimal valid record', () => {
  it('accepts a minimal hashed observation with safe defaults', () => {
    const result = CliExecutionSchema.safeParse(minimalHashed());
    if (!result.success) {
      throw new Error(
        `expected minimal record to validate; errors: ${JSON.stringify(result.error.issues, null, 2)}`
      );
    }
    expect(result.success).toBe(true);
  });
});

describe('CliExecutionSchema: command.program basename-only', () => {
  it('rejects forward-slash path in command.program', () => {
    const data = minimalHashed();
    (data.command as Record<string, unknown>).program = '/usr/bin/node';
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.schemaRejection);
  });

  it('rejects backslash path in command.program', () => {
    const data = minimalHashed();
    (data.command as Record<string, unknown>).program = 'C:\\Program\\node.exe';
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.schemaRejection);
  });

  it('accepts plain basename in command.program', () => {
    const data = minimalHashed();
    (data.command as Record<string, unknown>).program = 'node';
    expect(CliExecutionSchema.safeParse(data).success).toBe(true);
  });
});

describe('CliExecutionSchema: cross-field unsafe consistency', () => {
  it('raw argv requires capture_policy.raw_capture_unsafely_allowed', () => {
    const data = minimalHashed();
    data.command = {
      program: 'node',
      argv_mode: 'raw',
      argv: ['node', '-e', 'process.exit(0)'],
    };
    // raw_capture_unsafely_allowed stays false -> hard fail
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.unsafeFlagRequired);
  });

  it('raw env requires capture_policy.raw_env_unsafely_allowed', () => {
    const data = minimalHashed();
    data.env = { mode: 'raw', entries: { FOO: { value: 'bar' } } };
    (data.capture_policy as Record<string, unknown>).env_allowlist = ['FOO'];
    // raw_env_unsafely_allowed stays false -> hard fail
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.unsafeFlagRequired);
  });

  it('secret_scan=false under raw capture requires secret_scan_disabled_unsafely', () => {
    const data = minimalHashed();
    const cp = data.capture_policy as Record<string, unknown>;
    cp.raw_capture_unsafely_allowed = true;
    cp.secret_scan = false;
    cp.secret_scan_disabled_unsafely = false;
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.secretScanDisableRequiresUnsafeFlag);
  });
});

describe('CliExecutionSchema: env entries subset of allowlist', () => {
  it('rejects env entry not declared in allowlist', () => {
    const data = minimalHashed();
    data.env = { mode: 'hashed', entries: { ROGUE_KEY: { value_sha256: SHA256 } } };
    // env_allowlist is empty -> hard fail
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.envNotInAllowlist);
  });

  it('rejects raw entry under hashed mode', () => {
    const data = minimalHashed();
    (data.capture_policy as Record<string, unknown>).env_allowlist = ['FOO'];
    data.env = { mode: 'hashed', entries: { FOO: { value: 'oops' } } };
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.envModeInconsistent);
  });

  it('rejects hashed entry under raw mode', () => {
    const data = minimalHashed();
    const cp = data.capture_policy as Record<string, unknown>;
    cp.env_allowlist = ['FOO'];
    cp.raw_env_unsafely_allowed = true;
    data.env = { mode: 'raw', entries: { FOO: { value_sha256: SHA256 } } };
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.envModeInconsistent);
  });
});

describe('CliExecutionSchema: stream sample mutual exclusion', () => {
  it('rejects sample_base64 + sample_suppressed_reason on the same stream', () => {
    const data = minimalHashed();
    (data.capture_policy as Record<string, unknown>).raw_capture_unsafely_allowed = true;
    data.stdout_ref = {
      length: 4,
      sha256: SHA256,
      truncated: false,
      sample_base64: 'YWJjZA==',
      sample_suppressed_reason: 'secret_pattern_detected',
      matched_pattern_category: 'jwt',
    };
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.streamRefInconsistent);
  });

  it('rejects matched_pattern_category without sample_suppressed_reason', () => {
    const data = minimalHashed();
    data.stdout_ref = {
      length: 0,
      sha256: SHA256,
      truncated: false,
      matched_pattern_category: 'jwt',
    };
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.streamRefInconsistent);
  });

  it('rejects sample_suppressed_reason without matched_pattern_category', () => {
    const data = minimalHashed();
    data.stdout_ref = {
      length: 0,
      sha256: SHA256,
      truncated: false,
      sample_suppressed_reason: 'secret_pattern_detected',
    };
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.streamRefInconsistent);
  });
});

describe('CliExecutionSchema: sample_base64 validation', () => {
  it('requires capture_policy.raw_capture_unsafely_allowed for sample_base64', () => {
    const data = minimalHashed();
    data.stdout_ref = {
      length: 4,
      sha256: SHA256,
      truncated: false,
      sample_base64: 'YWJjZA==',
    };
    // raw_capture_unsafely_allowed stays false -> hard fail
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.unsafeFlagRequired);
  });

  it('rejects malformed base64 in sample_base64', () => {
    const data = minimalHashed();
    (data.capture_policy as Record<string, unknown>).raw_capture_unsafely_allowed = true;
    data.stdout_ref = {
      length: 4,
      sha256: SHA256,
      truncated: false,
      sample_base64: 'not!valid!base64',
    };
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.schemaRejection);
  });

  it('rejects non-canonical base64 forms ("abc", "YWJjZA", "YWJjZA===", "YW Jj")', () => {
    const samples = ['abc', 'YWJjZA', 'YWJjZA===', 'YW Jj'];
    for (const sample of samples) {
      const data = minimalHashed();
      (data.capture_policy as Record<string, unknown>).raw_capture_unsafely_allowed = true;
      data.stdout_ref = {
        length: 4,
        sha256: SHA256,
        truncated: false,
        sample_base64: sample,
      };
      const result = CliExecutionSchema.safeParse(data);
      expect(result.success, `expected '${sample}' to be rejected as non-canonical base64`).toBe(
        false
      );
    }
  });

  it('accepts canonical base64 ("YWJjZA==")', () => {
    const data = minimalHashed();
    (data.capture_policy as Record<string, unknown>).raw_capture_unsafely_allowed = true;
    data.stdout_ref = {
      length: 4,
      sha256: SHA256,
      truncated: false,
      sample_base64: 'YWJjZA==',
    };
    const result = CliExecutionSchema.safeParse(data);
    if (!result.success) {
      throw new Error(
        `expected 'YWJjZA==' to validate; errors: ${JSON.stringify(result.error.issues)}`
      );
    }
  });

  it('rejects sample_base64 whose decoded length exceeds the stream cap', () => {
    const data = minimalHashed();
    const cp = data.capture_policy as Record<string, unknown>;
    cp.raw_capture_unsafely_allowed = true;
    cp.stdout_max_bytes = 4;
    // Encode 8 bytes of "AAAAAAAA" (8 bytes > 4-byte cap).
    data.stdout_ref = {
      length: 8,
      sha256: SHA256,
      truncated: false,
      sample_base64: Buffer.from('AAAAAAAA').toString('base64'),
    };
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.streamRefInconsistent);
  });
});

describe('CliExecutionSchema: shell_mode <-> shell_ref biconditional', () => {
  it('rejects shell_mode=true without binary.shell_ref', () => {
    const data = minimalHashed();
    data.shell_mode = true;
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.schemaRejection);
  });

  it('rejects shell_mode=false with binary.shell_ref present', () => {
    const data = minimalHashed();
    data.binary = { path_mode: 'hashed', path_sha256: SHA256, shell_ref: SHA256 };
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.schemaRejection);
  });

  it('rejects non-digest shell_ref', () => {
    const data = minimalHashed();
    data.shell_mode = true;
    data.binary = { path_mode: 'hashed', path_sha256: SHA256, shell_ref: '/bin/bash' };
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.binaryPathModeInvalid);
  });

  it('rejects shell_mode=true under binary.path_mode=none', () => {
    const data = minimalHashed();
    data.shell_mode = true;
    data.binary = { path_mode: 'none', shell_ref: SHA256 };
    (data.capture_policy as Record<string, unknown>).binary_path_mode = 'none';
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.schemaRejection);
  });

  it('rejects shell_ref that disagrees with path_sha256 under hashed mode', () => {
    const data = minimalHashed();
    data.shell_mode = true;
    data.binary = {
      path_mode: 'hashed',
      path_sha256: SHA256,
      shell_ref: `sha256:${'b'.repeat(64)}`, // distinct from path_sha256
    };
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.schemaRejection);
  });

  it('accepts shell_mode=true with shell_ref equal to path_sha256 (hashed mode)', () => {
    const data = minimalHashed();
    data.shell_mode = true;
    data.binary = { path_mode: 'hashed', path_sha256: SHA256, shell_ref: SHA256 };
    const result = CliExecutionSchema.safeParse(data);
    if (!result.success) {
      throw new Error(`expected success; errors: ${JSON.stringify(result.error.issues)}`);
    }
    // shell_ref must NOT contain a path component
    expect(result.data.binary.shell_ref).toBe(SHA256);
    expect(/[\\/]/.test(result.data.binary.shell_ref ?? '')).toBe(false);
  });
});

describe('CliExecutionSchema: UTF-8 byte limits', () => {
  it('enforces byte length, not character count, on argv tokens (multibyte)', () => {
    const data = minimalHashed();
    // Each '🔐' is 4 UTF-8 bytes; 5 characters = 20 bytes (under any cap)
    // but if we put cap at 16 bytes via a small program, the test should still
    // reject anything beyond ARGV_BYTES_MAX (16384). Use a string that
    // exceeds the cap in BYTES but appears short in characters.
    data.command = {
      program: 'node',
      argv_mode: 'redacted',
      argv: ['🔐'.repeat(CLI_SCHEMA_LIMITS.ARGV_BYTES_MAX)], // each emoji = 4 bytes
    };
    expectErrorCode(data, CLI_EXECUTION_ERROR_CODES.captureModeInvalid);
  });
});

describe('CliExecutionSchema: approval_ref opaque-ref grammar', () => {
  it('accepts a valid opaque-ref form (sha256:)', () => {
    const data = minimalHashed();
    (data as Record<string, unknown>).approval_ref = SHA256;
    expect(CliExecutionSchema.safeParse(data).success).toBe(true);
  });

  it('accepts a valid opaque-ref form (urn:)', () => {
    const data = minimalHashed();
    (data as Record<string, unknown>).approval_ref = 'urn:peac:approval:abc123';
    expect(CliExecutionSchema.safeParse(data).success).toBe(true);
  });

  it('rejects a free-form approval_ref string', () => {
    const data = minimalHashed();
    (data as Record<string, unknown>).approval_ref = 'approver@example.com';
    const result = CliExecutionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

describe('validateCliExecution: structured error contract', () => {
  it('returns ok=true with value on success', () => {
    const result = validateCliExecution(minimalHashed());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe(CLI_COMMAND_EXECUTION_TYPE);
    }
  });

  it('returns ok=false with errors on failure', () => {
    const result = validateCliExecution({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      for (const err of result.errors) {
        expect(err.code).toMatch(/^cli\./);
      }
    }
  });
});
