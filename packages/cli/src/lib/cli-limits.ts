/**
 * CLI capture limits and security defaults.
 *
 * Centralizes the bounded-capture caps and security-default constants
 * used by `peac observe command` and `peac record command`. Mirrored
 * (but enforced separately) by the Zod ranges in
 * `@peac/schema/src/extensions/cli-execution.ts`; keep both sides in
 * sync when changing.
 *
 * All values are POSIX-first. Windows behavior is not guaranteed by
 * the current CLI carrier profile; see `docs/specs/CLI-CARRIER-PROFILE.md`.
 */

/** Bounded-capture caps. */
export const CLI_LIMITS = {
  /** Default max bytes retained in the stdout sample buffer (raw mode only). */
  defaultStdoutSampleBytes: 16_384,
  /** Default max bytes retained in the stderr sample buffer (raw mode only). */
  defaultStderrSampleBytes: 16_384,
  /** Hard ceiling for the stdout / stderr sample buffer (raw mode only). */
  maxStdoutSampleBytes: 65_536,
  maxStderrSampleBytes: 65_536,

  /** Default max bytes recorded in argv (raw mode only). */
  defaultArgvCaptureBytes: 4_096,
  /** Hard ceiling for argv bytes (raw mode only). */
  maxArgvCaptureBytes: 16_384,

  /** Hard ceiling for env entry count (deny-by-default; allowlist <= this). */
  maxEnvEntries: 32,

  /** Default wrapper timeout (10 minutes). */
  defaultTimeoutMs: 600_000,
  /** Wrapper timeout hard ceiling (24 hours). */
  maxTimeoutMs: 86_400_000,
  /** Wrapper timeout floor (1 ms). */
  minTimeoutMs: 1,

  /** Default SIGTERM-to-SIGKILL grace (5 seconds). */
  defaultKillGraceMs: 5_000,
  /** SIGTERM-to-SIGKILL grace hard ceiling (60 seconds). */
  maxKillGraceMs: 60_000,
  /** SIGTERM-to-SIGKILL grace floor. */
  minKillGraceMs: 0,
} as const;

/**
 * Shell binaries that, when detected as the program basename, REQUIRE
 * the explicit `--shell-mode` acknowledgement. PEAC NEVER synthesizes
 * shell syntax; the wrapper is an observer, not a shell orchestrator.
 */
export const SHELL_BINARY_BASENAMES = new Set<string>([
  'sh',
  'bash',
  'zsh',
  'dash',
  'fish',
  'pwsh',
  'cmd',
]);

/** Returns true when the resolved program basename is a known shell binary. */
export function isShellBinary(programBasename: string): boolean {
  return SHELL_BINARY_BASENAMES.has(programBasename.toLowerCase());
}
