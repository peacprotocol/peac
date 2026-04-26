/**
 * Shadow-mode scheduler.
 *
 * @internal
 *
 * INTERNAL ONLY. Not re-exported from packages/protocol/src/index.ts.
 *
 * Schedules a shadow function to run AFTER the public-call boundary
 * has returned its real-path result to the caller. The shadow run:
 *
 *   - is gated by `isShadowEnabled(options)` (env or programmatic);
 *   - starts on a MACROTASK boundary (`setTimeout(..., 0)`), NOT on a
 *     microtask, because microtasks can run before promise
 *     continuations attached to the public async call and would still
 *     add observable latency for CPU-heavy shadow work;
 *   - has a bounded wall-clock REPORTING timeout (250ms by default;
 *     see "Timeout guarantee class" below);
 *   - reports comparison results into a bounded in-memory log;
 *   - SWALLOWS every error, never propagating to the real-path return
 *     value or surfacing as an unhandled-rejection event.
 *
 * The public function:
 *
 *   - returns the real-path value FIRST (the macrotask boundary is
 *     past every async continuation already attached to the call
 *     site);
 *   - never awaits shadow work;
 *   - is byte-identical in its return value with shadow ON vs OFF.
 *
 * Timeout guarantee class. The 250ms timeout is a REPORTING bound,
 * not a hard preemption guarantee. Where the shadow function consults
 * the supplied `AbortSignal`, the runner aborts and bounds CPU; where
 * the shadow function is pure-CPU and ignores the signal (the v0.13.1
 * record-core validators are this shape), JavaScript cannot preempt
 * it. The runner stops awaiting and records `timing-diff`; the work
 * may continue to completion off the runner's await chain. Either
 * way, the public-call boundary returns its real-path value
 * immediately.
 *
 * Test-only helpers (`_peekShadowLog`, `_resetShadowLog`,
 * `_drainShadowQueueForTests`) are exposed for deterministic
 * assertions in vitest. Production code MUST NOT call them.
 *
 * Platform neutrality: this module avoids Node-only globals
 * (`Buffer`, `node:crypto`, unguarded `process`). Hashing delegates
 * to @peac/crypto; environment reads guard for the absence of
 * `process` so the module loads cleanly under browser / edge
 * runtimes.
 */

import type { ShadowCall, ShadowDivergence } from './shadow-types.js';
import { canonicalHashOf, hashJws, redactNote, utf8ByteLength } from './shadow-redact.js';

const MAX_LOG_ENTRIES = 1000;
const MAX_NOTE_BYTES = 128;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SHADOW_TIMEOUT_MS = 250;

const SHADOW_LOG: ShadowDivergence[] = [];
const PENDING_SHADOW_TASKS: Set<Promise<void>> = new Set();
let pendingScheduleCount = 0;

/**
 * Programmatic-flag shape. Internal-only; never appears in any
 * exported public option type.
 *
 * @internal
 */
export interface ShadowEnableOptions {
  readonly _internal?: {
    readonly shadowCore?: boolean;
  };
}

/**
 * Read the shadow-enable flag from environment or programmatic
 * options. Read once per call, NOT cached at module scope, so tests
 * can toggle the env var dynamically. Environment access is guarded
 * for browser / edge runtimes that do not expose `process`.
 *
 * @internal
 */
export function isShadowEnabled(options?: ShadowEnableOptions): boolean {
  if (options?._internal?.shadowCore === true) return true;
  return readEnvFlag();
}

function readEnvFlag(): boolean {
  if (typeof process === 'undefined' || process === null) return false;
  const env = (process as { env?: Record<string, string | undefined> }).env;
  return env?.PEAC_INTERNAL_SHADOW_CORE === '1';
}

/**
 * Inputs to `scheduleShadow`. The `shadowFn` factory receives an
 * `AbortSignal` so cancellable implementations can opt in. v0.13.1
 * shadow paths are pure-CPU and ignore the signal; the runner still
 * passes one for forward-compat.
 *
 * @internal
 */
export interface ScheduleShadowArgs<T> {
  readonly call: ShadowCall;
  readonly realResult: T | undefined;
  readonly realError: { code?: string } | undefined;
  readonly shadowFn: (signal?: AbortSignal) => Promise<T>;
  readonly recordRef: string;
}

/**
 * Schedule shadow work AFTER the real-path return.
 *
 * The shadow run starts on the next MACROTASK boundary (via
 * `setTimeout(..., 0)`). The public function returns its real-path
 * value before the macrotask fires, including for async callers
 * whose `.then` / `await` continuations execute on microtasks.
 * `queueMicrotask` would interleave with those continuations and is
 * intentionally avoided.
 *
 * Tasks are tracked internally so test helpers can drain them for
 * deterministic assertions; production callers ignore the (void)
 * return.
 *
 * Failures inside the shadow path are converted to divergence records
 * inside the task body. The outer `task.catch(() => {})` is defense
 * in depth: if anything inside `runShadowTask` throws after the inner
 * try/catch (e.g., a hash failure during canonical comparison), the
 * outer catch swallows the rejection so no unhandled-rejection event
 * fires.
 *
 * @internal
 */
export function scheduleShadow<T>(args: ScheduleShadowArgs<T>): void {
  pendingScheduleCount += 1;
  setTimeout(() => {
    pendingScheduleCount -= 1;
    const task = runShadowTask(args);
    PENDING_SHADOW_TASKS.add(task);
    // Cleanup runs on both fulfillment and rejection. Using
    // `task.then(remove, remove)` instead of `task.finally(remove)`
    // avoids creating a derived rejected promise that would surface
    // as an unhandled-rejection event when the inner task rejects.
    // The two-arg `then` form swallows any rejection and runs the
    // cleanup on either branch.
    const removeFromPending = (): void => {
      PENDING_SHADOW_TASKS.delete(task);
    };
    void task.then(removeFromPending, removeFromPending);
  }, 0);
}

async function runShadowTask<T>(args: ScheduleShadowArgs<T>): Promise<void> {
  const recordRefHash = await hashJws(args.recordRef);
  let shadowResult: T | undefined;
  let shadowErrorCode: string | undefined;

  try {
    shadowResult = await runWithTimeout(args.shadowFn, SHADOW_TIMEOUT_MS);
  } catch (err) {
    shadowErrorCode = extractErrorCode(err);
    appendDivergence({
      kind: shadowErrorCode === 'SHADOW_TIMEOUT' ? 'timing-diff' : 'shadow-error',
      call: args.call,
      recordRefHash,
      realErrorCode: args.realError?.code,
      shadowErrorCode,
      notes: redactNote(`shadow threw ${shadowErrorCode}`, MAX_NOTE_BYTES),
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const divergence = await compareResults(args, shadowResult, recordRefHash);
  if (divergence) appendDivergence(divergence);
}

/**
 * Bounded REPORTING timeout for shadow work. NOT a hard preemption
 * guarantee. See the module-level "Timeout guarantee class" comment.
 */
function runWithTimeout<T>(fn: (signal?: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error('SHADOW_TIMEOUT'));
    }, ms);
    fn(controller.signal).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

async function compareResults<T>(
  args: ScheduleShadowArgs<T>,
  shadowResult: T | undefined,
  recordRefHash: string
): Promise<ShadowDivergence | null> {
  const ts = new Date().toISOString();

  // Both succeeded: compare canonical hashes.
  if (!args.realError && shadowResult !== undefined && args.realResult !== undefined) {
    const realHash = await canonicalHashOf(args.realResult);
    const shadowHash = await canonicalHashOf(shadowResult);
    if (realHash !== shadowHash) {
      return {
        kind: 'output-byte-diff',
        call: args.call,
        recordRefHash,
        realResultHash: realHash,
        shadowResultHash: shadowHash,
        realByteLen: byteLenOf(args.realResult),
        shadowByteLen: byteLenOf(shadowResult),
        notes: 'canonical-hash-mismatch',
        timestamp: ts,
      };
    }
    return null;
  }

  // Both errored: comparator already handled in catch path; no record here.
  if (args.realError && shadowResult === undefined) {
    return null;
  }

  // Asymmetric: one succeeded, one failed.
  return {
    kind: 'error-code-diff',
    call: args.call,
    recordRefHash,
    realErrorCode: args.realError?.code,
    notes: args.realError ? 'real-errored-shadow-succeeded' : 'real-succeeded-shadow-errored',
    timestamp: ts,
  };
}

function byteLenOf(value: unknown): number {
  if (typeof value === 'string') return utf8ByteLength(value);
  if (value instanceof Uint8Array) return value.byteLength;
  return utf8ByteLength(JSON.stringify(value) ?? '');
}

function extractErrorCode(err: unknown): string {
  if (err && typeof err === 'object') {
    const candidate = (err as { code?: unknown; message?: unknown }).code;
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && /^[A-Z_][A-Z0-9_]*$/.test(message)) return message;
  }
  return 'SHADOW_UNKNOWN_ERROR';
}

function appendDivergence(d: ShadowDivergence): void {
  pruneStale();
  if (SHADOW_LOG.length >= MAX_LOG_ENTRIES) SHADOW_LOG.shift();
  SHADOW_LOG.push(d);
}

function pruneStale(): void {
  const cutoffIso = new Date(Date.now() - RETENTION_MS).toISOString();
  while (SHADOW_LOG.length > 0 && SHADOW_LOG[0].timestamp < cutoffIso) SHADOW_LOG.shift();
}

/**
 * Read the in-memory shadow log without mutating it. TEST USE ONLY.
 *
 * @internal
 */
export function _peekShadowLog(): readonly ShadowDivergence[] {
  return SHADOW_LOG.slice();
}

/**
 * Clear the in-memory shadow log. TEST USE ONLY.
 *
 * @internal
 */
export function _resetShadowLog(): void {
  SHADOW_LOG.length = 0;
}

/**
 * Drain the pending-shadow-tasks set so deterministic assertions can
 * run after a sequence of shadow-enabled calls. Yields to the event
 * loop until every scheduled `setTimeout` has fired AND every
 * resulting task has settled. TEST USE ONLY. Production code MUST
 * NOT call this.
 *
 * @internal
 */
export async function _drainShadowQueueForTests(): Promise<void> {
  while (pendingScheduleCount > 0 || PENDING_SHADOW_TASKS.size > 0) {
    if (pendingScheduleCount > 0) {
      // Yield so any pending setTimeout(..., 0) fires.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (PENDING_SHADOW_TASKS.size > 0) {
      await Promise.allSettled(Array.from(PENDING_SHADOW_TASKS));
    }
  }
}
