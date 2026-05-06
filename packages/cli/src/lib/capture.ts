/**
 * CLI subprocess capture.
 *
 * Implements the bounded-capture wrapper used by `peac observe command`
 * and `peac record command`. Hard implementation invariants:
 *
 *   - Spawn discipline: `spawn(prog, args, { shell: false })`
 *     exclusively. NEVER `exec()`. The wrapper does NOT synthesize
 *     shell syntax or rewrite the command. `--shell-mode` is
 *     acknowledgement only.
 *   - Streaming capture: `node:crypto.createHash` updated chunk-by-chunk.
 *     Byte counter incremented chunk-by-chunk. Bounded sample buffer
 *     is the ONLY buffer retained, and ONLY when raw capture is
 *     double-opted-in. Full streams NEVER held in memory.
 *   - Stdin: `--capture-stdin-mode` controls BOTH whether the wrapper
 *     pipes parent stdin to the child AND what the wrapper records.
 *     `none` (default) closes child stdin and does NOT read parent stdin.
 *     The stdin pump must terminate when the child exits even if the
 *     parent stream is still open.
 *   - Timeout: `--timeout-ms` / `--kill-grace-ms` cascade SIGTERM then
 *     SIGKILL; the record IS still emitted. The nested SIGKILL timer
 *     is cleared on child close so it cannot keep the event loop alive.
 *   - Signal exit codes follow POSIX `128 + signal-num`: SIGINT=130,
 *     SIGTERM=143, SIGKILL=137; unknown signals fall back to 128.
 *   - Stdin pumping respects Writable backpressure via async iteration
 *     + `await once(childStdin, 'drain')`.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash, type Hash } from 'node:crypto';
import { once } from 'node:events';
import type { Readable, Writable } from 'node:stream';

/**
 * Thrown by `captureCommand` when the child process fails to spawn
 * (missing binary, ENOENT, EACCES, etc.). Node emits the `'error'`
 * event in this case and never emits `'spawn'`/`'close'` -- without
 * explicit handling the wrapper would hang waiting for `'close'`.
 */
export class CliSpawnFailedError extends Error {
  readonly code = 'cli.spawn_failed';
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'CliSpawnFailedError';
  }
}

export type StdinMode = 'none' | 'length-only' | 'hashed';
export type CaptureMode = 'hashed' | 'redacted' | 'raw';

/**
 * Spawn-input barrier. Asserts the program token is a non-empty
 * string with no NUL byte (POSIX exec rejects NUL anyway, but better
 * to fail loudly with a stable error than to surface a NodeJS
 * ERR_INVALID_ARG_VALUE). Args must be a string array with no NUL.
 *
 * The barrier deliberately does NOT block shell metacharacters in
 * tokens: per CLI-CARRIER-PROFILE.md the wrapper is an OBSERVER,
 * not a sandbox; operators may legitimately pass tokens such as
 * `;`, `|`, or `$VAR` as program arguments and `shell: false`
 * guarantees they are NOT interpreted as shell syntax.
 *
 * Returns the validated tokens. Centralising the spawn-input
 * checks here also gives static-analysis tools an explicit
 * sanitization step between caller-supplied input and `spawn()`.
 */
function validateSpawnInputs(program: unknown, args: unknown): { program: string; args: string[] } {
  if (typeof program !== 'string' || program.length === 0) {
    throw new CliSpawnFailedError('program token must be a non-empty string');
  }
  if (program.includes('\0')) {
    throw new CliSpawnFailedError('program token must not contain a NUL byte');
  }
  if (!Array.isArray(args)) {
    throw new CliSpawnFailedError('args must be an array of strings');
  }
  const validatedArgs: string[] = [];
  for (const a of args) {
    if (typeof a !== 'string') {
      throw new CliSpawnFailedError('args must be an array of strings');
    }
    if (a.includes('\0')) {
      throw new CliSpawnFailedError('args must not contain NUL bytes');
    }
    validatedArgs.push(a);
  }
  return { program, args: validatedArgs };
}

export interface CaptureOptions {
  /** Resolved program path (passed verbatim to `spawn`). */
  program: string;
  /** Argv tail (passed verbatim to `spawn`; never wrapped in a shell). */
  args: string[];
  /** Working directory for the child (passed to `spawn`); not the recorded cwd. */
  cwd: string;
  /**
   * Environment passed to the child. REQUIRED. Callers (the
   * pipeline / pure handler) must construct the env explicitly so
   * the env source is auditable; this function does NOT silently
   * fall back to `process.env`.
   */
  env: NodeJS.ProcessEnv;
  stdinMode: StdinMode;
  /**
   * Whether raw sample emission is enabled (requires `--capture-mode raw`
   * AND `--unsafe-allow-raw-capture`). When false, no `sample_base64` is
   * retained for stdout / stderr and the bounded sample buffer stays
   * empty even though the streams are still hashed and counted.
   */
  rawCaptureEnabled: boolean;
  /** Bounded sample cap for stdout (raw mode only). */
  stdoutSampleBytes: number;
  /** Bounded sample cap for stderr (raw mode only). */
  stderrSampleBytes: number;
  /** Wrapper timeout (ms). After this, the wrapper sends SIGTERM. */
  timeoutMs: number;
  /** SIGTERM-to-SIGKILL grace (ms). */
  killGraceMs: number;
  /**
   * Optional readable from which to source parent stdin. Defaults to
   * `process.stdin`. Tests inject a custom stream.
   */
  parentStdin?: Readable;
}

export interface StreamCaptureRef {
  length: number;
  /** sha256 hex digest with the canonical `sha256:` prefix. */
  sha256: string;
  truncated: boolean;
  /** Present only when raw capture is enabled and the secret-scan does not suppress it. */
  sample_base64?: string;
}

export interface StdinCaptureRef {
  mode: StdinMode;
  length?: number;
  sha256?: string;
  truncated?: boolean;
}

export interface CaptureResult {
  exitCode: number;
  /** OS-reported child exit signal. Distinct from `terminationSignal`. */
  signal: string | null;
  /** True when the wrapper sent termination signals due to `--timeout-ms` elapsing. */
  timedOut: boolean;
  /** Signal sent BY THE WRAPPER after timeout. */
  terminationSignal: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stdout: StreamCaptureRef;
  stderr: StreamCaptureRef;
  stdin: StdinCaptureRef;
}

const SHA256_PREFIX = 'sha256:';

/**
 * POSIX `128 + signal-num` mapping. Unknown signals fall back to 128
 * so the wrapper never returns NaN. Tests pin SIGINT=130, SIGTERM=143,
 * SIGKILL=137.
 */
const SIGNAL_EXIT_CODES: Record<string, number> = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGQUIT: 131,
  SIGABRT: 134,
  SIGKILL: 137,
  SIGUSR1: 138,
  SIGUSR2: 140,
  SIGPIPE: 141,
  SIGALRM: 142,
  SIGTERM: 143,
};

export function exitCodeForSignal(signal: string | null | undefined): number {
  if (!signal) return 128;
  return SIGNAL_EXIT_CODES[signal] ?? 128;
}

interface StreamHasher {
  hasher: Hash;
  length: number;
  truncated: boolean;
  sampleBuffer: Buffer[];
  sampleBytes: number;
}

function newStreamHasher(): StreamHasher {
  return {
    hasher: createHash('sha256'),
    length: 0,
    truncated: false,
    sampleBuffer: [],
    sampleBytes: 0,
  };
}

/**
 * Update the streaming hasher and append to the bounded sample buffer
 * iff raw capture is enabled. Streaming-capture invariants:
 *   - bytes are ALWAYS hashed and counted (`length` is exact, `sha256`
 *     is computed over the full stream)
 *   - the sample buffer is appended to ONLY when raw capture is enabled
 *     AND the cap has not yet been reached; once the cap is reached the
 *     `truncated` flag is set and additional bytes are NOT appended
 *   - the full stream is NEVER held in memory
 */
function feedHasher(state: StreamHasher, chunk: Buffer, sampleCap: number, rawEnabled: boolean) {
  state.hasher.update(chunk);
  state.length += chunk.length;
  if (rawEnabled && state.sampleBytes < sampleCap) {
    const remaining = sampleCap - state.sampleBytes;
    if (chunk.length <= remaining) {
      state.sampleBuffer.push(chunk);
      state.sampleBytes += chunk.length;
    } else {
      state.sampleBuffer.push(chunk.subarray(0, remaining));
      state.sampleBytes += remaining;
      state.truncated = true;
    }
  } else if (rawEnabled && state.sampleBytes >= sampleCap) {
    state.truncated = true;
  }
}

function finalizeStreamRef(state: StreamHasher, rawEnabled: boolean): StreamCaptureRef {
  const ref: StreamCaptureRef = {
    length: state.length,
    sha256: SHA256_PREFIX + state.hasher.digest('hex'),
    truncated: state.truncated,
  };
  if (rawEnabled && state.sampleBuffer.length > 0) {
    ref.sample_base64 = Buffer.concat(state.sampleBuffer, state.sampleBytes).toString('base64');
  }
  return ref;
}

/**
 * Pump parent stdin to child stdin, respecting Writable backpressure
 * via async iteration + `await once(stdin, 'drain')`. Optionally
 * hashing/counting per stdin mode. Resolves when the parent stream
 * ends, the child stdin closes, or the abort signal fires (the latter
 * lets the wrapper terminate the pump as soon as the child exits, even
 * if the parent stream is still open -- for example, on a TTY).
 */
async function pumpStdin(
  parent: Readable,
  childStdin: Writable,
  mode: Exclude<StdinMode, 'none'>,
  abortSignal: AbortSignal
): Promise<{ length: number; sha256?: string; truncated: boolean }> {
  let length = 0;
  const truncated = false;
  const hasher = mode === 'hashed' ? createHash('sha256') : null;

  // Abort path: when the abort signal fires, end the child's stdin
  // and pause the parent stream. Ending child stdin breaks the
  // for-await loop on the next pending write (EPIPE / writable close);
  // pausing the parent stops further data delivery. The pump never
  // calls `removeAllListeners()` on the parent because the parent
  // stream (typically `process.stdin`) is owned by the caller, and
  // removing listeners would clobber unrelated consumers.
  const onAbort = () => {
    try {
      childStdin.end();
    } catch {
      // ignore
    }
    try {
      parent.pause();
    } catch {
      // ignore
    }
  };
  if (abortSignal.aborted) {
    onAbort();
  } else {
    abortSignal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    for await (const chunk of parent as AsyncIterable<Buffer>) {
      if (abortSignal.aborted) break;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += buf.length;
      if (hasher) hasher.update(buf);
      // Best-effort write; ignore EPIPE if child closed stdin early.
      let writable = false;
      try {
        writable = childStdin.write(buf);
      } catch {
        break;
      }
      if (!writable) {
        // Backpressure: wait for the writable to drain or for abort.
        try {
          await once(childStdin, 'drain', { signal: abortSignal });
        } catch {
          break;
        }
      }
    }
  } catch {
    // parent stream errored or pump aborted; fall through and finalize.
  }
  abortSignal.removeEventListener('abort', onAbort);
  try {
    childStdin.end();
  } catch {
    // child may have already closed
  }
  const result: { length: number; sha256?: string; truncated: boolean } = { length, truncated };
  if (hasher) result.sha256 = SHA256_PREFIX + hasher.digest('hex');
  return result;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Run the bounded-capture wrapper. The promise resolves when the child
 * exits OR is killed by the wrapper after timeout; it does NOT reject
 * on non-zero exit; the record IS still emitted regardless of child exit code.
 */
export async function captureCommand(opts: CaptureOptions): Promise<CaptureResult> {
  const startedAt = nowIso();
  const startMs = Date.now();

  const stdoutState = newStreamHasher();
  const stderrState = newStreamHasher();

  // Configure spawn stdio per stdin mode. `none` closes child stdin
  // (wrapper does NOT read parent stdin); other modes pipe.
  const stdioConfig: ('ignore' | 'pipe')[] =
    opts.stdinMode === 'none' ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'];

  // Validate the spawn inputs through an explicit barrier. The
  // wrapper's documented purpose (CLI-CARRIER-PROFILE.md section 2)
  // is to spawn a caller-supplied child process; the security floor
  // is `shell: false` (no metacharacter expansion). The barrier
  // additionally rejects empty program tokens, NUL bytes, and
  // non-string argv tokens. It intentionally permits shell
  // metacharacters as ordinary argv bytes because spawn() is called
  // with shell: false and PEAC does not synthesize shell syntax.
  const { program, args } = validateSpawnInputs(opts.program, opts.args);
  const child = spawn(program, args, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: stdioConfig,
    shell: false,
    windowsHide: true,
  }) as ChildProcessWithoutNullStreams;

  // Stream capture (always hashed and counted; sample only when raw enabled).
  child.stdout.on('data', (chunk: Buffer) => {
    feedHasher(stdoutState, chunk, opts.stdoutSampleBytes, opts.rawCaptureEnabled);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    feedHasher(stderrState, chunk, opts.stderrSampleBytes, opts.rawCaptureEnabled);
  });

  // Stdin handling. The pump runs concurrently with the child; when the
  // child closes we abort the pump so the wrapper cannot hang on a
  // never-ending parent stream (TTY, infinite pipe, etc.).
  let stdinCapture: { length: number; sha256?: string; truncated: boolean } = {
    length: 0,
    truncated: false,
  };
  let stdinPromise: Promise<typeof stdinCapture> | null = null;
  const stdinAbort = new AbortController();
  if (opts.stdinMode !== 'none') {
    const parent = opts.parentStdin ?? process.stdin;
    stdinPromise = pumpStdin(parent, child.stdin, opts.stdinMode, stdinAbort.signal);
  } else {
    // 'none': child stdin already closed via stdio: 'ignore'. Wrapper
    // does NOT read parent stdin (no parent.read, no parent.on('data')).
  }

  // Timeout / kill cascade. The nested SIGKILL timer is stored and
  // cleared on child close so it cannot keep the event loop alive.
  let timedOut = false;
  let terminationSignal: string | null = null;
  let killHandle: NodeJS.Timeout | undefined;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    terminationSignal = 'SIGTERM';
    try {
      child.kill('SIGTERM');
    } catch {
      // ignore
    }
    killHandle = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        terminationSignal = 'SIGKILL';
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }
    }, opts.killGraceMs);
  }, opts.timeoutMs);

  // Race the child's `'close'` event against `'error'`. Per Node docs,
  // a child that fails to spawn (ENOENT / EACCES / non-executable)
  // emits `'error'` and NEVER emits `'spawn'` / `'close'`; without
  // explicit handling the wrapper would hang waiting for `'close'`.
  const exitInfo = await new Promise<{ exitCode: number; signal: string | null }>(
    (resolve, reject) => {
      let settled = false;
      child.on('close', (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        if (killHandle) clearTimeout(killHandle);
        stdinAbort.abort();
        // Synthesize POSIX `128 + signal-num` for signal exits; pass
        // through normal exit codes verbatim.
        const exitCode = code === null ? exitCodeForSignal(signal) : code;
        resolve({ exitCode, signal: signal ?? null });
      });
      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        if (killHandle) clearTimeout(killHandle);
        stdinAbort.abort();
        reject(
          new CliSpawnFailedError(
            `failed to spawn child process: ${err instanceof Error ? err.message : String(err)}`,
            err
          )
        );
      });
    }
  );

  if (stdinPromise) {
    stdinCapture = await stdinPromise;
  }

  const finishedAt = nowIso();
  const durationMs = Date.now() - startMs;

  const stdinRef: StdinCaptureRef =
    opts.stdinMode === 'none'
      ? { mode: 'none' }
      : opts.stdinMode === 'length-only'
        ? { mode: 'length-only', length: stdinCapture.length, truncated: stdinCapture.truncated }
        : {
            mode: 'hashed',
            length: stdinCapture.length,
            sha256: stdinCapture.sha256!,
            truncated: stdinCapture.truncated,
          };

  return {
    exitCode: exitInfo.exitCode,
    signal: exitInfo.signal,
    timedOut,
    terminationSignal,
    startedAt,
    finishedAt,
    durationMs,
    stdout: finalizeStreamRef(stdoutState, opts.rawCaptureEnabled),
    stderr: finalizeStreamRef(stderrState, opts.rawCaptureEnabled),
    stdin: stdinRef,
  };
}
