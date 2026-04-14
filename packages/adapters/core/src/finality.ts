/**
 * Mapper-boundary finality-synthesis guard.
 *
 * Commerce mappings preserve raw upstream artifacts and MUST NOT synthesize
 * payment finality (authorization, capture, settlement, refund, void,
 * chargeback) from non-payment artifacts or lifecycle states alone.
 *
 * This module provides the runtime guard that callers in commerce mappings
 * use to enforce that rule at the mapper boundary. It is deliberately
 * dependency-light and emits a stable string code via MapperBoundaryError
 * rather than registering a new wire-level error code.
 */

/**
 * Strictness mode for commerce mappers.
 *
 * - `strict`   - reject any synthesis attempt; reject silent fallbacks
 *                (currency='UNKNOWN', defaulted env).
 * - `interop`  - emit a deprecation warning instead of rejecting; preserves
 *                current consumer behavior. Default.
 * - `legacy`   - preserve historical behavior with no warning. Reserved for
 *                callers that have migration plans recorded elsewhere.
 */
export type StrictnessMode = 'strict' | 'interop' | 'legacy';

/**
 * Stable string identifier for the mapper-boundary finality-synthesis
 * violation. NOT a wire-level error code; consumers may switch on this
 * value to map to caller-specific error reporting.
 */
export const COMMERCE_FINALITY_SYNTHESIS_CODE = 'commerce.finality_synthesis_blocked' as const;

export type MapperBoundaryErrorCode = typeof COMMERCE_FINALITY_SYNTHESIS_CODE;

export interface MapperBoundaryErrorInit {
  code: MapperBoundaryErrorCode;
  pointer?: string;
  upstreamArtifactHash?: string;
  reason?: string;
}

/**
 * Error thrown by mapper-boundary guards. Plain class, no schema dependency.
 * Carries a stable `code` and optional pointer + upstream-artifact-hash
 * fields to help callers correlate the failure.
 */
export class MapperBoundaryError extends Error {
  readonly code: MapperBoundaryErrorCode;
  readonly pointer?: string;
  readonly upstreamArtifactHash?: string;

  constructor(init: MapperBoundaryErrorInit) {
    const message = init.reason
      ? `${init.code}: ${init.reason}`
      : `${init.code}: mapper-boundary guard rejected synthesis`;
    super(message);
    this.name = 'MapperBoundaryError';
    this.code = init.code;
    this.pointer = init.pointer;
    this.upstreamArtifactHash = init.upstreamArtifactHash;
  }
}

/**
 * Closed enum of commerce events that imply finality and therefore require
 * an explicit upstream payment artifact when present in mapper input.
 */
const FINALITY_EVENTS = new Set([
  'authorization',
  'capture',
  'settlement',
  'refund',
  'void',
  'chargeback',
]);

export type CommerceFinalityEvent =
  | 'authorization'
  | 'capture'
  | 'settlement'
  | 'refund'
  | 'void'
  | 'chargeback';

export interface FinalityGuardInput {
  /**
   * The candidate commerce `event` value (or `undefined` if unset). When
   * unset, the guard is a no-op.
   */
  event?: string | undefined;

  /**
   * Whether the upstream artifact explicitly proves the claimed finality.
   * Mappers MUST set this from a definite read of upstream-supplied data,
   * NOT from inferred lifecycle state.
   */
  hasExplicitUpstreamArtifact: boolean;

  /**
   * The currency code as read from upstream. Mappers MUST set this; callers
   * MUST NOT silently fall back to `'UNKNOWN'`. In strict mode, an empty,
   * `'UNKNOWN'`, or non-string value rejects.
   */
  currency?: string;

  /**
   * The environment discriminant as read from upstream. Mappers MUST set
   * this when known; callers MUST NOT silently default. In strict mode, an
   * unset or non-`live`/`test` value rejects.
   */
  env?: 'live' | 'test' | string | undefined;

  /**
   * Whether the env was explicitly asserted by upstream (vs defaulted).
   */
  envExplicit?: boolean;
}

export interface FinalityGuardOptions {
  mode?: StrictnessMode;
  pointer?: string;
  upstreamArtifactHash?: string;
  /**
   * Optional warning sink for `interop` mode. Defaults to a no-op.
   */
  warn?: (message: string) => void;
}

const DEFAULT_MODE: StrictnessMode = 'interop';

function noopWarn(_message: string): void {
  /* no-op */
}

/**
 * Mapper-boundary finality-synthesis guard.
 *
 * Throws `MapperBoundaryError` when:
 *   - `event` is one of the finality-bearing values AND
 *     `hasExplicitUpstreamArtifact` is false (any mode).
 *   - `currency` is missing, empty, or `'UNKNOWN'` and mode is `strict`.
 *   - `env` is missing or `envExplicit` is false and mode is `strict`.
 *
 * In `interop` mode, the second and third conditions emit a warning via
 * the supplied `warn` sink instead of throwing. In `legacy` mode, only
 * the first condition throws; the second and third are silent.
 *
 * No-ops when `event` is unset (the common discovery / capability path).
 */
export function assertExplicitFinality(
  input: FinalityGuardInput,
  options: FinalityGuardOptions = {}
): void {
  const mode: StrictnessMode = options.mode ?? DEFAULT_MODE;
  const warn = options.warn ?? noopWarn;
  const pointer = options.pointer;
  const upstreamArtifactHash = options.upstreamArtifactHash;

  // Rule 1: finality event without explicit upstream artifact - reject in all modes.
  if (input.event !== undefined && FINALITY_EVENTS.has(input.event)) {
    if (!input.hasExplicitUpstreamArtifact) {
      throw new MapperBoundaryError({
        code: COMMERCE_FINALITY_SYNTHESIS_CODE,
        pointer,
        upstreamArtifactHash,
        reason: `event=${JSON.stringify(input.event)} requires an explicit upstream payment artifact`,
      });
    }
  }

  // Rule 2: silent currency fallback - reject in strict, warn in interop, silent in legacy.
  const isMissingCurrency =
    typeof input.currency !== 'string' ||
    input.currency.length === 0 ||
    input.currency === 'UNKNOWN';
  if (isMissingCurrency) {
    if (mode === 'strict') {
      throw new MapperBoundaryError({
        code: COMMERCE_FINALITY_SYNTHESIS_CODE,
        pointer,
        upstreamArtifactHash,
        reason:
          'currency missing or fallback (UNKNOWN); strict mode requires upstream-asserted currency',
      });
    }
    if (mode === 'interop') {
      warn(
        'commerce mapper: currency missing or fallback (UNKNOWN). Strict mode will reject this in v0.13.0+. Provide an upstream-asserted currency.'
      );
    }
  }

  // Rule 3: defaulted env - reject in strict, warn in interop, silent in legacy.
  const envIsExplicit = input.envExplicit === true;
  const envIsKnown = input.env === 'live' || input.env === 'test';
  if (!envIsKnown || !envIsExplicit) {
    if (mode === 'strict') {
      throw new MapperBoundaryError({
        code: COMMERCE_FINALITY_SYNTHESIS_CODE,
        pointer,
        upstreamArtifactHash,
        reason: 'env missing or defaulted; strict mode requires upstream-asserted env (live|test)',
      });
    }
    if (mode === 'interop') {
      warn(
        'commerce mapper: env missing or defaulted. Strict mode will reject this in v0.13.0+. Provide an upstream-asserted env.'
      );
    }
  }
}

/**
 * Returns whether the given event is one of the finality-bearing commerce
 * events. Useful for callers that want to short-circuit before assembling
 * full guard input.
 */
export function isFinalityEvent(event: string | undefined): event is CommerceFinalityEvent {
  return event !== undefined && FINALITY_EVENTS.has(event);
}
