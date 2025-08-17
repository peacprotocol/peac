# Engineering Guide

Operational notes for implementers:

- Prefer HTTPS; disallow clear-text negotiation/receipts.
- Cache `peac.txt` with strong `ETag`.
- Treat negotiation endpoints as abuse-sensitive; rate-limit and log.
- Emit lowercase `x-peac-*`; parse case-insensitively.
