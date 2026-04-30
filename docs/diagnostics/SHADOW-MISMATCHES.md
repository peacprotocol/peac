# Shadow-mode pointer-fetch mismatches (internal-only)

**Internal-only diagnostic doc.** Not part of the public surface; not a normative spec; not linked from the front door. Stability classification is captured in [`docs/STABILITY-CONTRACT.md`](../STABILITY-CONTRACT.md). Threat-coverage entries are captured in [`docs/THREAT_MODEL.md`](../THREAT_MODEL.md).

## Purpose

v0.13.2 PR B1 adds a **shadow-mode diagnostic foundation** for comparing the protocol pointer-fetch path against a workspace-private resolver composition layer on the same input pair, without changing public protocol or wire behavior.

The foundation provides:

- A lazy-import boundary that loads the workspace-private resolver composition layer only when `PEAC_INTERNAL_SHADOW_RESOLVER=1`.
- Bounded normalization shapes so two implementations with different native taxonomies can be compared like-for-like.
- A redaction-safe in-memory ring buffer (`shadow-mismatch-sink`) capped to `[64, 16384]` entries with a `~512`-byte JSON-stringified cap per entry.
- A pure-function parity verdict computer that tags each mismatch into a small set of public classes.
- A no-network parity smoke that drives both implementations through inputs they reject before any network I/O is attempted.

## What PR B1 does NOT ship

- **No live Hosted Verify route shadowing.** The `apps/api` `/v1/verify` route receives an inline compact JWS receipt; it does not accept a pointer URL or expected digest. Pointer-fetch is caller-side today: callers dereference pointer URLs and pass the resulting JWS into `/v1/verify`. There is therefore no primary-path pointer-fetch result to capture for shadow comparison without introducing brand-new network behavior on the verify route.
- **No internal mismatch endpoint.** A read-only viewer endpoint (`GET /__internal__/shadow-mismatches`) is intentionally omitted in PR B1 because the sink has no live producer in this PR; an empty endpoint adds review surface without operational value.
- **No `packages/protocol` source change.** No diagnostic capture hook is added in this PR; that pattern is reserved for a future PR.
- **No public API, wire-format, OpenAPI, or publish-manifest change.**

## Why route integration is deferred

A live Hosted Verify route integration would have to either:

1. Run protocol's pointer-fetch as a brand-new behavior on a route that has none today, then run the workspace-private resolver alongside as a "shadow." This would be a new feature, not shadow observation, and would double-fetch upstream pointer URLs. The diagnostic foundation's "no double-fetch" invariant rejects this.
2. Wait for a primary-path pointer-fetch result to capture from a route that already does pointer-fetch. No such route exists in `apps/api` as of v0.13.2.

Live route shadowing is therefore deferred to a future PR contingent on either:

- A new Hosted Verify pointer-input feature that legitimately exercises pointer-fetch on the verify path (route would surface `pointer_url` + `expected_digest` in the request shape), OR
- A protocol diagnostic capture hook (callback or telemetry channel exposed by `@peac/protocol`) that surfaces pointer-fetch outcomes from any caller for observation, without requiring the observer to invoke pointer-fetch a second time.

Until one of those exists, PR B1's foundation supports offline parity comparison only.

## Mismatch classes

The sink records entries with the following `class` field. Parity classes capture cross-implementation drift detected by the verdict computer; the remaining classes are reserved for future producers.

| Class                                  | Meaning                                                                                                               |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `parity_class_mismatch`                | Protocol and resolver-http normalize to different `NormalizedPointerClass` values for the same input.                 |
| `parity_digest_mismatch`               | Both implementations succeeded but reported different `actualDigest` values. Stop-the-line if observed in production. |
| `parity_content_type_warning_mismatch` | One implementation surfaced a content-type warning class and the other did not.                                       |
| `parity_success_shape_mismatch`        | Both succeeded but the public success-shape keys (`actualDigest`, `contentType` presence) differ.                     |
| `output-byte-diff`                     | Reserved. Future producer for raw-output byte divergence under a future capture hook.                                 |
| `error-code-diff`                      | Reserved. Future producer for native-error-code divergence under a future capture hook.                               |
| `timing-diff`                          | Reserved. Future producer for cross-implementation timing-bucket divergence.                                          |
| `resource-limit-diff`                  | Reserved. Future producer for resource-limit-class divergence.                                                        |
| `cache-hit-diff`                       | Reserved. Future producer for JWKS cache-hit divergence.                                                              |
| `cross-runtime-drift`                  | Reserved. Future producer for cross-runtime drift.                                                                    |

## Sink entry shape

Each sink entry is bounded to `~512` bytes when JSON-stringified. Strict redaction: no raw URL path or query, no headers, no body bytes, no excerpts beyond the bounded `excerptLegacy` / `excerptShadow` fields (`<=128` bytes each, only set for `output-byte-diff`). No bearer tokens, cookies, private key material, or secret-shaped values reach the sink.

```text
ts                ISO 8601, second precision
requestHash       sha256 hex of normalized request signature (<=64 chars)
class             one of the classes above
legacySummary     bounded { ok, code? <=64, byteCount?, jwksKid? <=32, durationBucket? }
shadowSummary     same shape as legacySummary
excerptLegacy?    <=128 bytes; only for output-byte-diff (no live producer in PR B1)
excerptShadow?    <=128 bytes; only for output-byte-diff (no live producer in PR B1)
```

When an entry would exceed the `~512`-byte cap, the sink degrades progressively: clamp string fields to per-field caps, then drop excerpts, then replace summary codes with the placeholder `truncated`, then fall back to a minimal entry (`ts`, `class`, `ok` flags).

## Buffer behavior

The buffer is a fixed-capacity in-memory ring. Default capacity 1024 entries. `PEAC_INTERNAL_SHADOW_BUFFER_SIZE` is read once at first use and clamped to `[64, 16384]`. When the buffer is full, the oldest entry is overwritten; entries are never persisted to disk and never sent over the network.

In clustered deployments each Hosted Verify instance has its own ring buffer; no cross-instance aggregation is built or planned in PR B1.

## How to read entries (after a future producer ships)

Once a real producer is wired (live route integration, protocol diagnostic hook, or both), entries can be inspected via the in-process getter `getMismatches()` exported from `apps/api/src/lib/shadow-mismatch-sink.ts`. PR B1 ships no remote retrieval surface.

When investigating drift:

1. Group recent entries by `class`. Any `parity_digest_mismatch` is a stop-the-line bug; both implementations should compute the same SHA-256 of the same UTF-8 decoded body.
2. `parity_class_mismatch` typically points to a taxonomy gap in `apps/api/src/lib/shadow-classify.ts`. Inspect the input that produced the mismatch (via `requestHash`) and whether the classifiers map a new error code or reason from either implementation.
3. `parity_content_type_warning_mismatch` and `parity_success_shape_mismatch` typically reflect implementation differences that are operationally benign but worth tracking. They may inform future doctrine clarifications.

## What this is not

This document does not specify any normative protocol behavior. It does not commit to wire formats, public APIs, or operational SLOs. It is a maintainer-facing diagnostic note about the shadow-mode foundation shipped in v0.13.2 PR B1.

## Related documents

- [`docs/STABILITY-CONTRACT.md`](../STABILITY-CONTRACT.md) — internal-only flag declarations and the shadow-mode timeout guarantee class.
- [`docs/THREAT_MODEL.md`](../THREAT_MODEL.md) — shadow-mode telemetry threat and mitigation entries.
- [`docs/specs/RESOURCE-LIMITS.md`](../specs/RESOURCE-LIMITS.md) — verifier resource limits (informative for future shadow-class producers).
