/**
 * Optional, composable replay defense for online consumers of PEAC records.
 *
 * createReplayGuard() returns a stateful guard that classifies an already-verified
 * record as 'fresh', 'replayed', or 'outside-window'. The store is bounded by both
 * count (maxEntries) and time (a TTL purge plus an iat acceptance window), so
 * it is finite and bounded against unbounded state growth. The dedup key is
 * (iss, jti); iat gates the window. All timestamp/window values are safe integers
 * (epoch seconds); unsafe-integer input fails closed.
 *
 * This is an online acceptance policy, not a record property: PEAC adds no exp to
 * records, changes no wire bytes, and enforces nothing. The same record stays valid
 * and offline-verifiable indefinitely outside any window. The guard returns a
 * verdict; the deployer chooses the response. It is intentionally not wired into the
 * stateless verifyLocal path.
 *
 * The clock (now) returns epoch seconds; backward movement (e.g. an NTP or manual
 * wall-clock regression) is clamped internally to the last observed second, so the
 * guard stays correct even if the clock goes backward. TTL entries expire at
 * insertion-time + windowSeconds + maxClockSkewSeconds; with the clamped (monotonic)
 * clock, expiry order equals insertion order and purge is O(number expired).
 */

/** Default future-skew tolerance for iat, in seconds (mirrors verifyLocal maxClockSkew). */
const DEFAULT_MAX_CLOCK_SKEW_SECONDS = 300;
/** Default upper bound on retained (iss,jti) entries. */
const DEFAULT_MAX_ENTRIES = 100_000;

export interface ReplayGuardOptions {
  /**
   * Accept only records whose iat is within [now - windowSeconds, now + maxClockSkewSeconds].
   * Positive integer (seconds).
   */
  windowSeconds: number;
  /** Allowed future skew for iat (seconds). Default 300. Non-negative integer. */
  maxClockSkewSeconds?: number;
  /** Upper bound on retained entries. Default 100_000. Positive integer. */
  maxEntries?: number;
  /**
   * Injectable clock returning epoch seconds (tests/determinism). Backward movement
   * is clamped internally to the last observed second. Default Math.floor(Date.now() / 1000).
   */
  now?: () => number;
}

export type ReplayGuardVerdict = 'fresh' | 'replayed' | 'outside-window';

export interface ReplayGuard {
  /** Classify a record that has already been verified (e.g. by verifyLocal). No I/O. */
  check(record: { iss: string; jti: string; iat: number }): ReplayGuardVerdict;
}

/** Internal retained-entry shape (not exported). */
interface ReplayEntry {
  expiresAt: number;
}

function safeInteger(value: number, name: string): number {
  // Use Number.isSafeInteger (not Number.isInteger) for all timestamp/window
  // arithmetic: values beyond MAX_SAFE_INTEGER lose exactness, so the guard
  // fails closed rather than computing imprecise window/TTL boundaries.
  if (!Number.isSafeInteger(value)) {
    throw new Error(`createReplayGuard: ${name} must be a safe integer`);
  }
  return value;
}

function positiveInt(value: number, name: string): number {
  safeInteger(value, name);
  if (value <= 0) {
    throw new Error(`createReplayGuard: ${name} must be a positive integer`);
  }
  return value;
}

function nonNegativeInt(value: number, name: string): number {
  safeInteger(value, name);
  if (value < 0) {
    throw new Error(`createReplayGuard: ${name} must be a non-negative integer`);
  }
  return value;
}

function nonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`createReplayGuard: ${name} must be a non-empty string`);
  }
  return value;
}

/**
 * Create a bounded replay guard for already-verified records.
 *
 * @param options - window, optional max clock skew, optional entry cap, optional clock.
 * @returns a guard whose `check(record)` returns 'fresh' | 'replayed' | 'outside-window'.
 */
export function createReplayGuard(options: ReplayGuardOptions): ReplayGuard {
  const windowSeconds = positiveInt(options.windowSeconds, 'windowSeconds');
  const maxClockSkewSeconds =
    options.maxClockSkewSeconds === undefined
      ? DEFAULT_MAX_CLOCK_SKEW_SECONDS
      : nonNegativeInt(options.maxClockSkewSeconds, 'maxClockSkewSeconds');
  const maxEntries =
    options.maxEntries === undefined
      ? DEFAULT_MAX_ENTRIES
      : positiveInt(options.maxEntries, 'maxEntries');
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));

  // Date.now() is a wall clock and can move backward (NTP / manual time changes);
  // clamp to the last observed second so the insertion-order TTL purge stays correct
  // even if the clock regresses. now() is validated (safe integer) here too.
  let lastNow = Number.NEGATIVE_INFINITY;
  const currentNow = (): number => {
    const raw = safeInteger(now(), 'now()');
    if (raw < lastNow) return lastNow;
    lastNow = raw;
    return raw;
  };

  // key -> entry. JS Map preserves insertion order. expiresAt is computed from the
  // (clamped, monotonic) insertion-time clock, so the front of the map always holds
  // the soonest-expiring entry: a front-scan that breaks on the first not-yet-expired
  // entry is correct and O(number actually expired). A replay does not refresh the
  // entry (no recency/TTL bump), so insertion order remains the eviction order.
  const seen = new Map<string, ReplayEntry>();

  // Length-prefixed key so (iss="a", jti="bc") cannot collide with (iss="ab", jti="c").
  const keyOf = (iss: string, jti: string): string => `${iss.length}:${iss}${jti.length}:${jti}`;

  const purgeExpired = (nowSeconds: number): void => {
    for (const [key, entry] of seen) {
      if (entry.expiresAt > nowSeconds) break;
      seen.delete(key);
    }
  };

  return {
    check(record: { iss: string; jti: string; iat: number }): ReplayGuardVerdict {
      // Fail closed on runtime misuse (plain-JS callers bypass the TS types). Validate
      // the record before any state mutation so invalid input never changes the store.
      const iat = safeInteger(record.iat, 'record.iat');
      const iss = nonEmptyString(record.iss, 'record.iss');
      const jti = nonEmptyString(record.jti, 'record.jti');
      const t = currentNow(); // validates now() + clamps backward movement

      // Time bound: drop entries that can no longer match within any window.
      purgeExpired(t);

      // Window first: out-of-window records never consume store capacity, and the
      // verdict is unambiguous (reported outside-window without being recorded).
      if (iat < t - windowSeconds || iat > t + maxClockSkewSeconds) {
        return 'outside-window';
      }

      const key = keyOf(iss, jti);
      if (seen.has(key)) {
        return 'replayed';
      }

      // Conservative TTL: an upper bound on the latest time any record accepted now
      // could still be replayed within the acceptance window. May retain older-iat
      // entries slightly longer than their exact iat + windowSeconds horizon, but it
      // preserves monotonic expiry order and keeps the store time-bounded (a stale
      // entry re-checked short-circuits as outside-window before dedup regardless).
      // Validate the expiry sum is a safe integer before any store mutation, so an
      // overflow fails closed without evicting or inserting.
      const expiresAt = safeInteger(t + windowSeconds + maxClockSkewSeconds, 'entry expiry');

      // Count bound: apply the hard maxEntries cap before inserting.
      if (seen.size >= maxEntries) {
        const oldest = seen.keys().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
      seen.set(key, { expiresAt });
      return 'fresh';
    },
  };
}
