# @peac/mappings-paymentauth

HTTP Payment authentication scheme (paymentauth/MPP) mapping for PEAC.

Envelope-first parsing of paymentauth wire artifacts with raw + normalized types. Method-specific payloads are treated as `unknown` because each payment method (card, lightning, stripe, tempo) has its own specification.

## Status

Experimental. The paymentauth core spec (`draft-ryan-httpauth-payment-01`) is an active IETF Internet-Draft (individual submission, not WG-adopted). Discovery and JSON-RPC/MCP transport drafts are at draft-00.

## Features

- Parse `WWW-Authenticate: Payment` challenges (multi-challenge support)
- Parse `Authorization: Payment` credentials (base64url-encoded JSON)
- Parse `Payment-Receipt` headers (base64url-encoded JSON)
- Normalize to stable PEAC-facing types with `_raw` back-references
- OpenAPI discovery extraction (`x-service-info`, `x-payment-info`)
- JSON-RPC error detection (`-32042`, `-32043`)
- MCP `_meta` key extraction (`org.paymentauth/credential`, `org.paymentauth/receipt`)
- MCP capability advertisement typing (`experimental.payment`)

## Security

- Raw `Authorization: Payment` and `Payment-Receipt` values never appear in thrown errors
- Parser limits enforced: header size, param count, payload size, JSON depth
- Decoded bytes preserved alongside strings for non-UTF-8 safety
- `redactPaymentauthHeader()` helper for safe logging

## No Network I/O

This package contains zero network calls. All functions are pure parsers and normalizers.
