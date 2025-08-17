# Getting Started (PEAC v0.9.5)

PEAC is an open, web-native, file-based policy layer for agents and services.

## Quick Start

1. Create `/.well-known/peac.txt` (fallback `/peac.txt`) with `version: 0.9.5`.
2. Validate locally: `npx peac validate peac.txt`.
3. Serve over HTTPS with strong `ETag` and sensible `Cache-Control`.

See: [Conformance](conformance.md) and [Templates](templates.md).
