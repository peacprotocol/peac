// Internal-only. Runs the protocol pointer-fetch path and the resolver-http
// pointer-fetch path against the same input pair, classifies both results,
// computes the parity verdict, and records mismatches to the bounded
// in-memory sink. Default OFF: the verify route only enters this path when
// PEAC_INTERNAL_SHADOW_RESOLVER=1. Stability: internal-only, unstable; not
// part of the public surface.

import { sha256Hex } from '@peac/crypto';
import {
  classifyProtocolPointerResult,
  classifyResolverHttpPointerResult,
  computeParityVerdict,
  type ProtocolPointerResultLike,
  type ResolverHttpPointerResultLike,
} from './shadow-classify.js';
import {
  recordMismatch,
  type MismatchSinkEntry,
  type BoundedSummary,
  type DurationBucket,
} from './shadow-mismatch-sink.js';
import type { NormalizedPointerResult, ParityVerdict } from './shadow-types.js';

export type ProtocolPointerFetchFn = (options: {
  url: string;
  expectedDigest: string;
}) => Promise<ProtocolPointerResultLike>;

export type ResolverHttpPointerFetchFn = (
  url: string,
  expectedDigest: string
) => Promise<ResolverHttpPointerResultLike>;

export interface ShadowExecutorDeps {
  protocolFetch: ProtocolPointerFetchFn;
  resolverHttpFetch: ResolverHttpPointerFetchFn;
}

export interface ShadowExecutionOutcome {
  legacy: ProtocolPointerResultLike;
  shadow: ResolverHttpPointerResultLike;
  legacyNormalized: NormalizedPointerResult;
  shadowNormalized: NormalizedPointerResult;
  verdict: ParityVerdict;
  recordedEntry?: MismatchSinkEntry;
  legacyDurationMs: number;
  shadowDurationMs: number;
}

const FAST_THRESHOLD_MS = 100;
const MEDIUM_THRESHOLD_MS = 500;

function bucketDuration(ms: number): DurationBucket {
  if (ms <= FAST_THRESHOLD_MS) return 'fast';
  if (ms <= MEDIUM_THRESHOLD_MS) return 'medium';
  return 'slow';
}

function summariseProtocol(result: ProtocolPointerResultLike, durationMs: number): BoundedSummary {
  const summary: BoundedSummary = {
    ok: result.ok,
    durationBucket: bucketDuration(durationMs),
  };
  if (!result.ok && typeof result.reason === 'string') summary.code = result.reason;
  return summary;
}

function summariseResolverHttp(
  result: ResolverHttpPointerResultLike,
  durationMs: number
): BoundedSummary {
  const summary: BoundedSummary = {
    ok: result.ok,
    durationBucket: bucketDuration(durationMs),
  };
  if (!result.ok && typeof result.code === 'string') summary.code = result.code;
  return summary;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, durationMs: Date.now() - start };
}

export function createShadowExecutor(deps: ShadowExecutorDeps) {
  return async function executeShadowPointerFetch(
    url: string,
    expectedDigest: string
  ): Promise<ShadowExecutionOutcome> {
    const [legacyOutcome, shadowOutcome] = await Promise.all([
      timed(() => deps.protocolFetch({ url, expectedDigest })),
      timed(() => deps.resolverHttpFetch(url, expectedDigest)),
    ]);

    const legacy = legacyOutcome.result;
    const shadow = shadowOutcome.result;
    const legacyNormalized = classifyProtocolPointerResult(legacy);
    const shadowNormalized = classifyResolverHttpPointerResult(shadow);
    const verdict = computeParityVerdict(legacyNormalized, shadowNormalized);

    let recordedEntry: MismatchSinkEntry | undefined;
    if (verdict.mismatchClasses.length > 0) {
      const requestHash = await sha256Hex(`${url}\n${expectedDigest}`);
      const primaryClass = verdict.mismatchClasses[0];
      recordedEntry = recordMismatch({
        requestHash,
        class: primaryClass,
        legacySummary: summariseProtocol(legacy, legacyOutcome.durationMs),
        shadowSummary: summariseResolverHttp(shadow, shadowOutcome.durationMs),
      });
    }

    return {
      legacy,
      shadow,
      legacyNormalized,
      shadowNormalized,
      verdict,
      recordedEntry,
      legacyDurationMs: legacyOutcome.durationMs,
      shadowDurationMs: shadowOutcome.durationMs,
    };
  };
}
