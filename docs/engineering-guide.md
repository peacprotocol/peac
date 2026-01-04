# Engineering Guide

Operational notes for implementers:

- Prefer HTTPS; disallow clear-text negotiation/receipts.
- Cache discovery responses with strong `ETag`.
- Treat verification endpoints as abuse-sensitive; rate-limit and log.
- Use the `PEAC-Receipt` header for receipts. Accept case-insensitive variants (e.g., `peac-receipt`) per HTTP/2 norms.
- Do not emit or depend on legacy `X-`-prefixed PEAC headers (removed in v0.9.15).
