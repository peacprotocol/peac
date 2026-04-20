# Go middleware adapter parity harness

This test-only Go module enforces that every framework-specific PEAC
middleware adapter returns identical responses for a shared request
corpus. The core middleware at `sdks/go/middleware/` is the single
source of behavior; adapters (chi, gin, echo, nethttp) are thin
wrappers that re-expose the same `Config`, `DefaultConfig`, and
`Verifier` surface.

## What the harness asserts

- `type Config = middleware.Config` across every adapter (reflect-equality on a zero value).
- `DefaultConfig()` returns a struct byte-identical to the core default across every adapter.
- For each scenario in the shared corpus, every adapter returns the same HTTP status, the same `Content-Type` / `X-Downstream-Reached` headers, and the same body bytes.

The chi adapter is used as the reference; other adapters are asserted
against chi's response.

## Scope

- Covers the three stdlib-shaped adapters (chi, echo, nethttp).
- The gin adapter uses its own `gin.HandlerFunc` type and carries a
  third-party dependency; it is verified by `sdks/go/middleware/gin/gin_test.go`
  against the same scenario list (no-receipt required → 401, no-receipt
  optional pass-through → 200, malformed receipt → 400 E_INVALID_FORMAT,
  and case-insensitive `peac-receipt` header). The scenario sets are
  kept in sync by convention; update both when adding new scenarios.

## Running

Run from the repository checkout. Because this module is nested inside
a parent Go module (`sdks/go`), the parity module is not part of any
Go workspace; disable workspace resolution when invoking `go test` so
the per-module `replace` directives are honored:

```bash
cd sdks/go/middleware/paritytest
GOWORK=off go test ./...
```

The harness does not need network access; every scenario runs entirely
against `httptest.NewRecorder` with an in-process downstream handler.
The same `GOWORK=off` invocation applies to the other adapter modules
(`chi`, `gin`, `echo`, `nethttp`) when running their test suites from
the repository checkout.

## Related documents

- [Compatibility matrix for Go middleware](../../../../docs/compatibility/go-middleware.md)
- [Hosted Verify contract](../../../../docs/HOSTED_VERIFY_CONTRACT.md)
- [Threat model](../../../../docs/THREAT_MODEL.md)
