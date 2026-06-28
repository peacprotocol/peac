# PEAC Bounded Replay Guard Profile

**Status:** Informative
**Package:** `@peac/protocol` (`createReplayGuard`)

Optional online-acceptance guidance for bounded replay detection. This profile adds
no normative requirement to the wire format and no field to any record.

## Existing record invariant

A PEAC record carries `(iss, jti)`; the pair is globally unique per issuer. This
uniqueness is the durable basis for replay detection and is independent of any
online policy.

## Optional online replay defense

An online consumer may, after verifying a record, apply a bounded replay guard:

- Accept a record only if its `iat` is within a deployer-configured window
  `[now - windowSeconds, now + maxClockSkew]`; otherwise treat it as outside the
  acceptance window.
- Within the window, treat a repeated `(iss, jti)` as a replay.
- Bound the dedup store by both a maximum retained-entry count and a time-to-live
  purge, so the store is finite and bounded against unbounded state growth.

This is an acceptance policy, not a record property. The same record remains valid
and offline-verifiable indefinitely outside any window; PEAC adds no `exp` to records
and does not change the wire format. The reference implementation is the composable
`createReplayGuard` helper in `@peac/protocol`, which returns a verdict
(`fresh` / `replayed` / `outside-window`); the deployer chooses the response. The
guard offers a verdict; it does not block, settle, authenticate, or enforce.

## Finite-memory trade-off

Under `maxEntries` pressure an older in-window key can be evicted. If that key appears
again before it falls outside the time window, the reference in-memory guard may
classify it as `fresh`. Deployers that require exact replay detection across the full
window must size `maxEntries` for expected throughput, or use durable storage. Replay
detection is therefore best-effort within the live set, not permanent replay
prevention.

## Clock handling

The guard reads a clock in epoch seconds. Backward wall-clock movement (for example an
NTP correction) is clamped to the last observed second so the bounded store stays
correct. Entry expiry is a conservative upper bound on the latest time a record
accepted now could still be replayed within the acceptance window.

## Durable evidence vs online acceptance

Offline and audit verification never apply a window: a record from years ago still
verifies. The window and TTL are solely for live, online replay defense, where a
deployer trades unbounded memory for a finite, time-bounded working set.
