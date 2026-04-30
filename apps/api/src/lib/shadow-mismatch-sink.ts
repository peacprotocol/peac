// Internal-only. Bounded in-memory ring buffer that records redaction-safe
// shadow-mode mismatch entries. No file writes, no network egress, no
// cross-instance aggregation. Stability: internal-only, unstable; not part
// of the public surface.

import type { ParityMismatchClass } from './shadow-types.js';

export type MismatchClass =
  | ParityMismatchClass
  | 'output-byte-diff'
  | 'error-code-diff'
  | 'timing-diff'
  | 'resource-limit-diff'
  | 'cache-hit-diff'
  | 'cross-runtime-drift';

export type DurationBucket = 'fast' | 'medium' | 'slow';

export interface BoundedSummary {
  ok: boolean;
  code?: string;
  byteCount?: number;
  jwksKid?: string;
  durationBucket?: DurationBucket;
}

export interface MismatchSinkEntry {
  ts: string;
  requestHash: string;
  class: MismatchClass;
  legacySummary: BoundedSummary;
  shadowSummary: BoundedSummary;
  excerptLegacy?: string;
  excerptShadow?: string;
}

const DEFAULT_BUFFER_SIZE = 1024;
const MIN_BUFFER_SIZE = 64;
const MAX_BUFFER_SIZE = 16384;
const ENTRY_BYTE_CAP = 512;
const EXCERPT_BYTE_CAP = 128;
const CODE_MAX_LEN = 64;
const KID_MAX_LEN = 32;
const REQUEST_HASH_MAX_LEN = 64;

export function getShadowSinkBufferSize(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PEAC_INTERNAL_SHADOW_BUFFER_SIZE;
  if (typeof raw !== 'string' || raw.length === 0) return DEFAULT_BUFFER_SIZE;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_BUFFER_SIZE;
  if (parsed < MIN_BUFFER_SIZE) return MIN_BUFFER_SIZE;
  if (parsed > MAX_BUFFER_SIZE) return MAX_BUFFER_SIZE;
  return parsed;
}

let buffer: MismatchSinkEntry[] = [];
let capacity: number = DEFAULT_BUFFER_SIZE;
let head = 0;
let initialised = false;

function ensureInitialised(env: NodeJS.ProcessEnv = process.env): void {
  if (initialised) return;
  capacity = getShadowSinkBufferSize(env);
  buffer = [];
  head = 0;
  initialised = true;
}

function clampString(value: string | undefined, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.length <= max ? value : value.slice(0, max);
}

function clampSummary(summary: BoundedSummary): BoundedSummary {
  const result: BoundedSummary = { ok: summary.ok };
  const code = clampString(summary.code, CODE_MAX_LEN);
  if (code !== undefined) result.code = code;
  if (typeof summary.byteCount === 'number' && Number.isFinite(summary.byteCount)) {
    result.byteCount = summary.byteCount;
  }
  const kid = clampString(summary.jwksKid, KID_MAX_LEN);
  if (kid !== undefined) result.jwksKid = kid;
  if (
    summary.durationBucket === 'fast' ||
    summary.durationBucket === 'medium' ||
    summary.durationBucket === 'slow'
  ) {
    result.durationBucket = summary.durationBucket;
  }
  return result;
}

/**
 * Apply the ~512-byte serialised cap to a candidate entry. Strategy:
 *   1. Clamp string fields (code/kid/excerpts/requestHash) to per-field caps.
 *   2. If JSON.stringify still exceeds ENTRY_BYTE_CAP, drop excerpts.
 *   3. If still oversized, replace excerpts and codes with placeholders.
 *   4. If still oversized, return a minimal placeholder entry that records
 *      the class and timestamp only.
 */
function clampEntry(candidate: MismatchSinkEntry): MismatchSinkEntry {
  const clamped: MismatchSinkEntry = {
    ts: candidate.ts,
    requestHash: clampString(candidate.requestHash, REQUEST_HASH_MAX_LEN) ?? '',
    class: candidate.class,
    legacySummary: clampSummary(candidate.legacySummary),
    shadowSummary: clampSummary(candidate.shadowSummary),
  };
  const excerptLegacy = clampString(candidate.excerptLegacy, EXCERPT_BYTE_CAP);
  if (excerptLegacy !== undefined) clamped.excerptLegacy = excerptLegacy;
  const excerptShadow = clampString(candidate.excerptShadow, EXCERPT_BYTE_CAP);
  if (excerptShadow !== undefined) clamped.excerptShadow = excerptShadow;

  if (JSON.stringify(clamped).length <= ENTRY_BYTE_CAP) return clamped;

  // Drop excerpts.
  delete clamped.excerptLegacy;
  delete clamped.excerptShadow;
  if (JSON.stringify(clamped).length <= ENTRY_BYTE_CAP) return clamped;

  // Replace codes with bounded placeholder.
  if (clamped.legacySummary.code !== undefined) clamped.legacySummary.code = 'truncated';
  if (clamped.shadowSummary.code !== undefined) clamped.shadowSummary.code = 'truncated';
  if (JSON.stringify(clamped).length <= ENTRY_BYTE_CAP) return clamped;

  // Minimal placeholder.
  return {
    ts: clamped.ts,
    requestHash: 'truncated',
    class: clamped.class,
    legacySummary: { ok: clamped.legacySummary.ok },
    shadowSummary: { ok: clamped.shadowSummary.ok },
  };
}

export function recordMismatch(
  entry: Omit<MismatchSinkEntry, 'ts'> & { ts?: string },
  env: NodeJS.ProcessEnv = process.env
): MismatchSinkEntry {
  ensureInitialised(env);
  const ts = entry.ts ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const candidate: MismatchSinkEntry = { ...entry, ts };
  const clamped = clampEntry(candidate);
  if (buffer.length < capacity) {
    buffer.push(clamped);
  } else {
    buffer[head] = clamped;
    head = (head + 1) % capacity;
  }
  return clamped;
}

export function getMismatches(limit?: number): readonly MismatchSinkEntry[] {
  ensureInitialised();
  const ordered: MismatchSinkEntry[] = [];
  if (buffer.length < capacity) {
    ordered.push(...buffer);
  } else {
    for (let i = 0; i < capacity; i++) {
      ordered.push(buffer[(head + i) % capacity]);
    }
  }
  if (typeof limit === 'number' && Number.isFinite(limit) && limit >= 0) {
    return ordered.slice(Math.max(0, ordered.length - limit));
  }
  return ordered;
}

export function getShadowSinkCapacity(): number {
  ensureInitialised();
  return capacity;
}

export function resetShadowSinkForTests(env: NodeJS.ProcessEnv = process.env): void {
  capacity = getShadowSinkBufferSize(env);
  buffer = [];
  head = 0;
  initialised = true;
}

export const __TEST_CONSTANTS__ = {
  DEFAULT_BUFFER_SIZE,
  MIN_BUFFER_SIZE,
  MAX_BUFFER_SIZE,
  ENTRY_BYTE_CAP,
  EXCERPT_BYTE_CAP,
};
