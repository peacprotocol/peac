/**
 * Parity test: CLI_LIMITS (lib) <-> CLI_SCHEMA_LIMITS (schema).
 *
 * The bounded-capture caps and security-default ranges live in two
 * places: `@peac/cli/lib/cli-limits` (subcommand defaults / maxes) and
 * `@peac/schema/extensions/cli-execution` (schema validators). This
 * test enforces that both sides stay in sync; if they drift,
 * validation would accept records the wrapper could never emit (or
 * vice versa).
 */

import { describe, it, expect } from 'vitest';
import { CLI_LIMITS } from '../src/lib/cli-limits';
import { CLI_SCHEMA_LIMITS } from '@peac/schema';

describe('CLI_LIMITS / CLI_SCHEMA_LIMITS parity', () => {
  it('timeout range matches', () => {
    expect(CLI_LIMITS.minTimeoutMs).toBe(CLI_SCHEMA_LIMITS.TIMEOUT_MS_MIN);
    expect(CLI_LIMITS.maxTimeoutMs).toBe(CLI_SCHEMA_LIMITS.TIMEOUT_MS_MAX);
  });

  it('kill-grace range matches', () => {
    expect(CLI_LIMITS.minKillGraceMs).toBe(CLI_SCHEMA_LIMITS.KILL_GRACE_MS_MIN);
    expect(CLI_LIMITS.maxKillGraceMs).toBe(CLI_SCHEMA_LIMITS.KILL_GRACE_MS_MAX);
  });

  it('argv capture caps match', () => {
    expect(CLI_LIMITS.maxArgvCaptureBytes).toBe(CLI_SCHEMA_LIMITS.ARGV_BYTES_MAX);
  });

  it('stdout sample cap matches', () => {
    expect(CLI_LIMITS.maxStdoutSampleBytes).toBe(CLI_SCHEMA_LIMITS.STDOUT_BYTES_MAX);
  });

  it('stderr sample cap matches', () => {
    expect(CLI_LIMITS.maxStderrSampleBytes).toBe(CLI_SCHEMA_LIMITS.STDERR_BYTES_MAX);
  });

  it('env entries hard cap matches', () => {
    expect(CLI_LIMITS.maxEnvEntries).toBe(CLI_SCHEMA_LIMITS.ENV_ENTRIES_MAX);
  });
});
