/**
 * Shared CLI execution observation pipeline.
 *
 * Both `peac observe command` (unsigned JSON emission) and `peac
 * record command` (Wire 0.2 JWS signing) reuse the same capture +
 * build + validate pipeline so a record produced by one is
 * indistinguishable from a record produced by the other (modulo the
 * outer signing envelope). This module is the single source of truth
 * for that shared behavior.
 *
 * Public surface intentionally narrow:
 *   - resolveProgramPath(token, childEnv)        -- childEnv-aware PATH lookup
 *   - preflightOutputWritable(output)            -- writability check before spawn
 *   - runObservationCore(opts, ...)              -- capture + build + validate
 *
 * The pipeline is an OBSERVER, not a sandbox / permission system /
 * shell orchestrator / process supervisor / job scheduler.
 */

import {
  closeSync,
  constants as fsConstants,
  existsSync,
  openSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { delimiter, dirname, join, resolve as pathResolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { CliExecutionSchema, type CliExecutionObservation } from '@peac/schema';
import { captureCommand, CliSpawnFailedError, type CaptureResult } from './capture.js';
import {
  buildObservation,
  CliObservationBuilderError,
  type ArgvMode,
  type CwdMode,
  type BinaryPathMode,
  type EnvMode,
  type StdinMode,
  type ExitCodeMode,
  type ExecutionMode,
} from './observation-builder.js';

/** Capture-pipeline options shared by both subcommands. */
export interface CoreObservationOptions {
  captureMode: ArgvMode;
  unsafeAllowRawCapture: boolean;
  captureStdinMode: StdinMode;
  captureStdoutBytes: number;
  captureStderrBytes: number;
  captureArgvBytes: number;
  envAllow: string[];
  envMode: EnvMode;
  unsafeAllowRawEnv: boolean;
  captureCwdMode: CwdMode;
  captureBinaryPath: BinaryPathMode;
  secretScan: boolean;
  unsafeDisableSecretScan: boolean;
  policyDigest?: string;
  configDigest?: string;
  approvalRef?: string;
  executionMode: ExecutionMode;
  shellMode: boolean;
  timeoutMs: number;
  killGraceMs: number;
  exitCodeMode: ExitCodeMode;
}

export interface CoreObservationIO {
  /** Environment passed to the spawned child (what the child RECEIVES). */
  childEnv: NodeJS.ProcessEnv;
  /** Environment inspected by --env-allow for record entries. */
  captureEnv: NodeJS.ProcessEnv;
  cwd: string;
  peacCliVersion: string;
}

export type CoreObservationResult =
  | { ok: true; observation: CliExecutionObservation; capture: CaptureResult }
  | { ok: false; code: string; message: string };

/**
 * Resolve a program token to its absolute path. Resolution honors the
 * supplied `childEnv` ONLY (the environment that will be passed to
 * spawn). The ambient `process.env` is not consulted: callers must
 * pass `childEnv` explicitly so the execution-environment source is
 * auditable at the call site. When no executable is found in
 * `childEnv.PATH`, returns the token unchanged so spawn surfaces a
 * clear ENOENT error.
 */
export function resolveProgramPath(token: string, childEnv: NodeJS.ProcessEnv): string {
  if (token.includes('/') || token.includes('\\')) {
    return pathResolve(token);
  }
  const PATH = childEnv.PATH ?? '';
  const dirs = PATH.split(delimiter);
  const exts =
    process.platform === 'win32' ? (childEnv.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, token + ext);
      try {
        const st = statSync(candidate);
        if (!st.isFile()) continue;
        if (process.platform !== 'win32' && (st.mode & 0o111) === 0) continue;
        return candidate;
      } catch {
        // not found; try next
      }
    }
  }
  return token;
}

/**
 * Verify that `--output <file>` will be writable BEFORE the child runs.
 * Returns null on success; otherwise an error message suitable for
 * pairing with `cli.output_write_failed`. A record-producing wrapper
 * must never run a child only to discover the record cannot be
 * persisted.
 *
 * The preflight is deliberately non-invasive on the final target
 * path:
 *   - if the final target exists, open it for append/write check and
 *     close it; never unlink the existing target
 *   - if the final target does NOT exist, create a uniquely-named
 *     sibling temp file in the parent directory with O_EXCL and
 *     immediately unlink that temp file; the final target path is
 *     not created or touched until the actual write step
 *
 * Result: between preflight and the eventual write, the wrapper has
 * NOT created or modified the final output path. Concurrent observers
 * cannot race against a transient zero-byte target file produced by
 * the preflight.
 */
export function preflightOutputWritable(output: string): string | null {
  if (output === '-' || output === '') return null;
  const absPath = pathResolve(output);
  const parent = dirname(absPath);
  try {
    const st = statSync(parent);
    if (!st.isDirectory()) {
      return `parent path '${parent}' is not a directory`;
    }
  } catch (err) {
    return `parent directory '${parent}' does not exist (${(err as NodeJS.ErrnoException)?.code ?? (err instanceof Error ? err.message : String(err))})`;
  }

  if (existsSync(absPath)) {
    // Existing target: open for append to verify writability, then
    // close. Do NOT unlink or modify the existing target.
    let fd: number | undefined;
    try {
      fd = openSync(absPath, 'a');
    } catch (err) {
      return `cannot open '${absPath}' for write (${(err as NodeJS.ErrnoException)?.code ?? (err instanceof Error ? err.message : String(err))})`;
    } finally {
      if (fd !== undefined) {
        try {
          closeSync(fd);
        } catch {
          // ignore
        }
      }
    }
    return null;
  }

  // Missing target: probe writability via a uniquely-named sibling
  // temp file, then immediately unlink the temp file. The final
  // target path is NOT touched.
  const tempName = `.peac-preflight-${randomBytes(8).toString('hex')}.tmp`;
  const tempPath = join(parent, tempName);
  let fd: number | undefined;
  try {
    fd = openSync(tempPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600);
  } catch (err) {
    return `parent directory '${parent}' is not writable (${(err as NodeJS.ErrnoException)?.code ?? (err instanceof Error ? err.message : String(err))})`;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
  try {
    unlinkSync(tempPath);
  } catch {
    // not fatal; the temp file will linger but the final target was
    // never touched and the eventual write will succeed.
  }
  return null;
}

/**
 * Run the shared capture + build + validate pipeline.
 *
 * Returns `{ ok: true, observation, capture }` when all stages succeed
 * (observation is the schema-validated record; capture carries the
 * child's exit info for downstream exit-code-mode handling).
 * Returns `{ ok: false, code, message }` for any structured failure.
 *
 * Stages:
 *   1. resolveProgramPath(programToken, childEnv)
 *   2. captureCommand(...)        (raises CliSpawnFailedError)
 *   3. buildObservation(...)      (raises CliObservationBuilderError)
 *   4. CliExecutionSchema.safeParse(observation)
 */
export async function runObservationCore(
  opts: CoreObservationOptions,
  programToken: string,
  args: string[],
  io: CoreObservationIO
): Promise<CoreObservationResult> {
  const resolvedProgramPath = resolveProgramPath(programToken, io.childEnv);

  let capture: CaptureResult;
  try {
    capture = await captureCommand({
      program: resolvedProgramPath,
      args,
      cwd: io.cwd,
      env: io.childEnv,
      stdinMode: opts.captureStdinMode,
      rawCaptureEnabled: opts.captureMode === 'raw' && opts.unsafeAllowRawCapture,
      stdoutSampleBytes: opts.captureStdoutBytes,
      stderrSampleBytes: opts.captureStderrBytes,
      timeoutMs: opts.timeoutMs,
      killGraceMs: opts.killGraceMs,
    });
  } catch (err) {
    if (err instanceof CliSpawnFailedError) {
      return { ok: false, code: err.code, message: err.message };
    }
    return {
      ok: false,
      code: 'cli.spawn_failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  let observation: CliExecutionObservation;
  try {
    observation = await buildObservation({
      capture,
      programToken,
      resolvedProgramPath,
      rawArgv: args,
      cwd: io.cwd,
      argvMode: opts.captureMode,
      cwdMode: opts.captureCwdMode,
      binaryPathMode: opts.captureBinaryPath,
      envMode: opts.envMode,
      stdinMode: opts.captureStdinMode,
      envAllowlist: opts.envAllow,
      parentEnv: io.captureEnv,
      rawCaptureEnabled: opts.captureMode === 'raw' && opts.unsafeAllowRawCapture,
      rawEnvEnabled: opts.envMode === 'raw' && opts.unsafeAllowRawEnv,
      secretScanEnabled: opts.secretScan,
      secretScanDisabledUnsafely: opts.unsafeDisableSecretScan,
      argvCaptureBytes: opts.captureArgvBytes,
      stdoutSampleBytes: opts.captureStdoutBytes,
      stderrSampleBytes: opts.captureStderrBytes,
      timeoutMs: opts.timeoutMs,
      killGraceMs: opts.killGraceMs,
      exitCodeMode: opts.exitCodeMode,
      executionMode: opts.executionMode,
      shellMode: opts.shellMode,
      policyDigest: opts.policyDigest,
      configDigest: opts.configDigest,
      approvalRef: opts.approvalRef,
      peacCliVersion: io.peacCliVersion,
    });
  } catch (err) {
    if (err instanceof CliObservationBuilderError) {
      return { ok: false, code: err.code, message: err.message };
    }
    return {
      ok: false,
      code: 'cli.builder_failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const parsed = CliExecutionSchema.safeParse(observation);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path?.join('.') ?? '';
    return {
      ok: false,
      code: 'cli.schema_rejection',
      message: `${path ? '[' + path + '] ' : ''}${first?.message ?? 'schema validation failed'}`,
    };
  }
  return { ok: true, observation: parsed.data, capture };
}
