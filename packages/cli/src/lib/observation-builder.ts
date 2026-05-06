/**
 * CLI observation record builder.
 *
 * Assembles the final `org.peacprotocol/cli-execution` observation
 * record from the raw capture result + the flag-derived capture policy.
 * Applies argv encoding, env filtering (captures only what the policy
 * records; never mutates the child's execution env), cwd / binary-path
 * encoding, and secret-scan suppression on stdout / stderr samples.
 *
 * Builder hard-fail invariants (mirrors of the schema invariants;
 * surface the failure before emission so a flag-layer bug cannot
 * produce a misleading record):
 *   - command.program is basename-only; path-bearing tokens are
 *     reduced to their basename. Path disclosure is governed by
 *     --capture-binary-path and lives only under binary.path_*.
 *   - raw argv tokens that exceed argv_max_bytes hard-fail with
 *     `cli.argv_token_too_long`; raw mode never silently truncates.
 *   - env.mode='raw' with rawEnvEnabled=false hard-fails with
 *     `cli.env_mode_inconsistent` rather than silently downgrading
 *     to hashed.
 */

export class CliObservationBuilderError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CliObservationBuilderError';
    this.code = code;
  }
}

import { createHash } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';

/**
 * Platform-agnostic basename. Strips everything up through the LAST
 * forward-slash or backslash so the output is the same on POSIX and
 * Windows. Mirrors the schema-level `command.program` invariant
 * (rejects `/` and `\`).
 */
function basenameAny(p: string): string {
  return p.replace(/^.*[\\/]/, '');
}
import { CLI_COMMAND_EXECUTION_TYPE, type CliExecutionObservation } from '@peac/schema';
import type { CaptureResult } from './capture.js';
import { scanArgvElement, scanForSecrets } from './secret-scan.js';

const SHA256_PREFIX = 'sha256:';

export type ArgvMode = 'hashed' | 'redacted' | 'raw';
export type CwdMode = 'none' | 'hashed' | 'basename' | 'absolute';
export type BinaryPathMode = 'none' | 'hashed' | 'absolute';
export type EnvMode = 'hashed' | 'raw';
export type StdinMode = 'none' | 'length-only' | 'hashed';
export type ExitCodeMode = 'child' | 'record';
export type ExecutionMode =
  | 'deterministic_script'
  | 'templated_flow'
  | 'agent_loop'
  | 'human_step'
  | 'hybrid';

export interface BuilderInput {
  capture: CaptureResult;
  /**
   * The program token AS THE USER SUPPLIED IT (e.g. `node`, `./script.sh`,
   * `/usr/bin/env`). This is what `command.program` records -- it does NOT
   * leak the resolved absolute path. Path disclosure is governed
   * exclusively by `--capture-binary-path` (recorded in `binary.path_*`).
   */
  programToken: string;
  /**
   * The resolved absolute path the wrapper actually spawned. Used
   * internally for stat metadata and content digest under
   * `--capture-binary-path hashed|absolute` -- NEVER recorded under
   * `command.program`.
   */
  resolvedProgramPath: string;
  /** Argv tail as supplied (post-`--`); never modified. */
  rawArgv: string[];
  cwd: string;
  argvMode: ArgvMode;
  cwdMode: CwdMode;
  binaryPathMode: BinaryPathMode;
  envMode: EnvMode;
  stdinMode: StdinMode;
  envAllowlist: string[];
  parentEnv: NodeJS.ProcessEnv;
  rawCaptureEnabled: boolean;
  rawEnvEnabled: boolean;
  secretScanEnabled: boolean;
  secretScanDisabledUnsafely: boolean;
  argvCaptureBytes: number;
  stdoutSampleBytes: number;
  stderrSampleBytes: number;
  timeoutMs: number;
  killGraceMs: number;
  exitCodeMode: ExitCodeMode;
  executionMode: ExecutionMode;
  shellMode: boolean;
  policyDigest?: string;
  configDigest?: string;
  approvalRef?: string;
  peacCliVersion: string;
}

function sha256Hex(input: string | Buffer): string {
  return SHA256_PREFIX + createHash('sha256').update(input).digest('hex');
}

/**
 * Streaming sha256 of a file's content. Never holds the full file in
 * memory; suitable for capturing the binary content digest of large
 * executables.
 */
async function sha256OfFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hasher = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => {
      hasher.update(chunk);
    });
    stream.on('end', () => {
      resolve(SHA256_PREFIX + hasher.digest('hex'));
    });
    stream.on('error', reject);
  });
}

function isStructuralArgvToken(token: string): boolean {
  if (token === '--') return true;
  if (/^-[A-Za-z0-9?]$/.test(token)) return true; // -f
  if (/^--[A-Za-z][A-Za-z0-9_-]*$/.test(token)) return true; // --flag-name
  return false;
}

/**
 * Encode argv per --capture-mode.
 *   hashed   -> single sha256 over the JSON-canonical argv array
 *   redacted -> preserve only structural tokens; redact values as
 *               `<redacted:N>` (UTF-8 byte length); preserve `--key=`
 *               prefix and redact only the value portion
 *   raw      -> verbatim, with secret-scan suppression replacing token
 *               text with `<secret-suppressed:CATEGORY>`; tokens that
 *               exceed argv_max_bytes HARD-FAIL with
 *               `cli.argv_token_too_long` (no silent truncation)
 */
function encodeArgv(
  rawArgv: string[],
  mode: ArgvMode,
  argvCaptureBytes: number,
  secretScanEnabled: boolean
): { argv?: string[]; argv_sha256?: string; argv_token_count: number } {
  const tokenCount = rawArgv.length;
  if (mode === 'hashed') {
    const canon = JSON.stringify(rawArgv);
    return { argv_sha256: sha256Hex(canon), argv_token_count: tokenCount };
  }
  if (mode === 'redacted') {
    const out: string[] = rawArgv.map((tok) => {
      if (isStructuralArgvToken(tok)) return tok;
      // `--key=value` -> preserve `--key=`; redact value
      const eq = tok.match(/^(--[A-Za-z][A-Za-z0-9_-]*=)(.*)$/);
      if (eq) {
        const value = eq[2];
        const byteLen = Buffer.byteLength(value, 'utf8');
        return `${eq[1]}<redacted:${byteLen}>`;
      }
      const byteLen = Buffer.byteLength(tok, 'utf8');
      return `<redacted:${byteLen}>`;
    });
    return { argv: out, argv_token_count: tokenCount };
  }
  // raw: hard-fail on oversized token rather than silently truncate.
  const out: string[] = rawArgv.map((tok, idx) => {
    if (Buffer.byteLength(tok, 'utf8') > argvCaptureBytes) {
      throw new CliObservationBuilderError(
        'cli.argv_token_too_long',
        `command.argv[${idx}] (${Buffer.byteLength(tok, 'utf8')} bytes) exceeds argv_max_bytes (${argvCaptureBytes}); raise --capture-argv-bytes or use --capture-mode hashed/redacted`
      );
    }
    let scanResult: { category: string } | null = null;
    if (secretScanEnabled) {
      scanResult = scanArgvElement(tok);
    }
    if (scanResult) {
      return `<secret-suppressed:${scanResult.category}>`;
    }
    return tok;
  });
  return { argv: out, argv_token_count: tokenCount };
}

function buildEnvBlock(
  parentEnv: NodeJS.ProcessEnv,
  allowlist: string[],
  mode: EnvMode,
  rawEnvEnabled: boolean
): { mode: EnvMode; entries: Record<string, { value_sha256?: string; value?: string }> } {
  // Hard-fail on inconsistent state: env.mode='raw' without the
  // double-opt-in flag is a flag-layer bug; never silently downgrade
  // to hashed (would mask the bug AND emit a misleading record).
  if (mode === 'raw' && !rawEnvEnabled) {
    throw new CliObservationBuilderError(
      'cli.env_mode_inconsistent',
      'env.mode=raw requires --unsafe-allow-raw-env; refusing to silently downgrade to hashed'
    );
  }
  const entries: Record<string, { value_sha256?: string; value?: string }> = {};
  for (const key of allowlist) {
    const val = parentEnv[key];
    if (val === undefined) continue;
    if (mode === 'hashed') {
      entries[key] = { value_sha256: sha256Hex(val) };
    } else {
      entries[key] = { value: val };
    }
  }
  return { mode, entries };
}

interface CwdRefBuilt {
  cwd_mode: CwdMode;
  cwd_sha256?: string;
  cwd_basename?: string;
  cwd_absolute?: string;
}

function buildCwd(cwd: string, mode: CwdMode): CwdRefBuilt {
  switch (mode) {
    case 'none':
      return { cwd_mode: 'none' };
    case 'hashed':
      return { cwd_mode: 'hashed', cwd_sha256: sha256Hex(cwd) };
    case 'basename':
      return { cwd_mode: 'basename', cwd_basename: basenameAny(cwd) };
    case 'absolute':
      return { cwd_mode: 'absolute', cwd_absolute: cwd };
  }
}

interface BinaryRefBuilt {
  path_mode: BinaryPathMode;
  path_sha256?: string;
  path_absolute?: string;
  size_bytes?: number;
  mode_octal?: string;
  sha256?: string;
  version?: string;
  shell_ref?: string;
}

async function buildBinary(
  resolvedProgram: string,
  pathMode: BinaryPathMode,
  shellMode: boolean
): Promise<BinaryRefBuilt> {
  const built: BinaryRefBuilt = { path_mode: pathMode };
  let isRegularFile = false;
  if (pathMode !== 'none') {
    try {
      const st = statSync(resolvedProgram);
      built.size_bytes = st.size;
      built.mode_octal = (st.mode & 0o7777).toString(8).padStart(4, '0');
      isRegularFile = st.isFile();
    } catch {
      // Shell builtins / non-file targets: skip stat metadata.
    }
  }
  switch (pathMode) {
    case 'none':
      break;
    case 'hashed':
      built.path_sha256 = sha256Hex(resolvedProgram);
      break;
    case 'absolute':
      built.path_absolute = resolvedProgram;
      break;
  }
  // Content digest: streaming; never read the full binary into memory.
  if (pathMode !== 'none' && isRegularFile) {
    try {
      built.sha256 = await sha256OfFile(resolvedProgram);
    } catch {
      // ignore (race: binary moved/deleted between stat and read)
    }
  }
  if (shellMode) {
    if (pathMode === 'none') {
      throw new CliObservationBuilderError(
        'cli.shell_mode_required',
        'shell_mode=true requires --capture-binary-path != none so shell_ref has a defined source'
      );
    }
    // shell_ref is ALWAYS a sha256 digest of the resolved shell binary
    // path. Under hashed mode it equals path_sha256 by construction;
    // under absolute mode it is still a digest (path disclosure stays
    // in binary.path_absolute, never in shell_ref). shell_mode is
    // biconditional with the presence of shell_ref (enforced by schema).
    built.shell_ref = built.path_sha256 ?? sha256Hex(resolvedProgram);
  }
  return built;
}

/**
 * Apply secret-scan suppression to a stream sample. If scan detects a
 * token-like pattern, the sample is OMITTED and
 * `sample_suppressed_reason` + `matched_pattern_category` are recorded.
 */
function applySecretScan<T extends { sample_base64?: string }>(
  ref: T,
  scanEnabled: boolean
): T & {
  sample_suppressed_reason?: 'secret_pattern_detected';
  matched_pattern_category?: string;
} {
  if (!scanEnabled || ref.sample_base64 === undefined) {
    return ref;
  }
  const decoded = Buffer.from(ref.sample_base64, 'base64').toString('utf8');
  const match = scanForSecrets(decoded);
  if (!match) return ref;
  // Suppress: omit sample_base64; record reason + category.
  const { sample_base64: _omit, ...rest } = ref;
  void _omit;
  return {
    ...(rest as T),
    sample_suppressed_reason: 'secret_pattern_detected' as const,
    matched_pattern_category: match.category,
  };
}

export async function buildObservation(input: BuilderInput): Promise<CliExecutionObservation> {
  const argvEncoded = encodeArgv(
    input.rawArgv,
    input.argvMode,
    input.argvCaptureBytes,
    input.secretScanEnabled
  );

  // command.program is ALWAYS basename-only. The resolved absolute path
  // is governed by --capture-binary-path and recorded only under
  // binary.path_*. Reduce path-bearing user tokens to their basename
  // using a platform-agnostic helper (handles both / and \ on any OS).
  const programName = basenameAny(input.programToken);
  const command =
    input.argvMode === 'hashed'
      ? {
          program: programName,
          argv_mode: 'hashed' as const,
          argv_sha256: argvEncoded.argv_sha256!,
          argv_token_count: argvEncoded.argv_token_count,
        }
      : input.argvMode === 'redacted'
        ? {
            program: programName,
            argv_mode: 'redacted' as const,
            argv: argvEncoded.argv!,
            argv_token_count: argvEncoded.argv_token_count,
          }
        : {
            program: programName,
            argv_mode: 'raw' as const,
            argv: argvEncoded.argv!,
            argv_token_count: argvEncoded.argv_token_count,
          };

  const cwd = buildCwd(input.cwd, input.cwdMode);
  const binary = await buildBinary(
    input.resolvedProgramPath,
    input.binaryPathMode,
    input.shellMode
  );

  const env = buildEnvBlock(
    input.parentEnv,
    input.envAllowlist,
    input.envMode,
    input.rawEnvEnabled
  );

  const stdoutRef = applySecretScan(input.capture.stdout, input.secretScanEnabled);
  const stderrRef = applySecretScan(input.capture.stderr, input.secretScanEnabled);

  const observation: CliExecutionObservation = {
    type: CLI_COMMAND_EXECUTION_TYPE,
    surface: { kind: 'cli' },
    command,
    cwd: cwd as CliExecutionObservation['cwd'],
    binary: binary as CliExecutionObservation['binary'],
    stdin_ref: input.capture.stdin as CliExecutionObservation['stdin_ref'],
    stdout_ref: stdoutRef as CliExecutionObservation['stdout_ref'],
    stderr_ref: stderrRef as CliExecutionObservation['stderr_ref'],
    env,
    started_at: input.capture.startedAt,
    finished_at: input.capture.finishedAt,
    duration_ms: input.capture.durationMs,
    exit_code: input.capture.exitCode,
    ...(input.capture.signal ? { signal: input.capture.signal } : {}),
    timed_out: input.capture.timedOut,
    timeout_ms: input.timeoutMs,
    kill_grace_ms: input.killGraceMs,
    ...(input.capture.terminationSignal
      ? { termination_signal: input.capture.terminationSignal }
      : {}),
    exit_code_mode: input.exitCodeMode,
    shell_mode: input.shellMode,
    execution_mode: input.executionMode,
    capture_policy: {
      stdout_max_bytes: input.stdoutSampleBytes,
      stderr_max_bytes: input.stderrSampleBytes,
      argv_max_bytes: input.argvCaptureBytes,
      env_allowlist: input.envAllowlist,
      stdin_mode: input.stdinMode,
      cwd_mode: input.cwdMode,
      binary_path_mode: input.binaryPathMode,
      secret_scan: input.secretScanEnabled,
      raw_capture_unsafely_allowed: input.rawCaptureEnabled,
      raw_env_unsafely_allowed: input.rawEnvEnabled,
      secret_scan_disabled_unsafely: input.secretScanDisabledUnsafely,
      timeout_ms: input.timeoutMs,
      kill_grace_ms: input.killGraceMs,
      exit_code_mode: input.exitCodeMode,
    },
    platform: {
      os: process.platform,
      arch: process.arch,
      peac_cli_version: input.peacCliVersion,
    },
    ...(input.policyDigest ? { policy_digest: input.policyDigest } : {}),
    ...(input.configDigest ? { config_digest: input.configDigest } : {}),
    ...(input.approvalRef ? { approval_ref: input.approvalRef } : {}),
  };

  return observation;
}
