# x402 V2 Transport Profile

**Status:** Normative
**Package:** `@peac/adapter-x402`
**Upstream:** x402-foundation/x402 `specs/transports-v2/http.md`

This document specifies the x402 V2 transport profile for PEAC. V2 moves protocol data to HTTP headers (`PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`) with Base64-encoded JSON payloads.

## 1. Overview

x402 V2 is an evolution of the x402 HTTP 402 payment protocol. Key differences from V1:

- `maxTimeoutSeconds` replaces `validUntil` (duration vs epoch timestamp)
- Resource metadata is bundled (url, description, mimeType)
- Per-accept-entry offers (one offer per accept entry)
- JWS-primary (no EIP-712 placeholder semantics)
- Scheme-specific `extra` field for extensibility

## 2. Version Detection

Version is detected from HTTP headers:

| Header               | Version |
| -------------------- | ------- |
| `PAYMENT-REQUIRED`   | V2      |
| `PAYMENT-SIGNATURE`  | V2      |
| `PAYMENT-RESPONSE`   | V2      |
| `X-PAYMENT-RESPONSE` | V1      |
| `X-PAYMENT`          | V1      |

Mixed headers (V1 + V2 present): resolves to V2. No headers: defaults to V1 with low confidence.

## 3. Opt-in Verification

V2 is opt-in via `supportedVersions` in `X402AdapterConfig`:

- Default: `[1]` (V2 rejected unless explicitly enabled)
- V2 enabled: `supportedVersions: [1, 2]`
- Unified dispatchers (`verifyOfferUnified`, `verifyReceiptUnified`) route by `config.wireVersion`

Unknown V2 shapes are rejected in strict mode (fail-closed).

## 4. V2 Offer Verification

`verifyOfferV2()` checks:

- Version gate: `supportedVersions` must include 2
- Required fields: network, asset, payTo, amount, scheme, resource.url
- `maxTimeoutSeconds`: must be a positive number (duration, not epoch)
- Network: CAIP-2 format validation (strict mode)
- Amount: non-negative integer string validation (strict mode)

## 5. V2 Receipt Verification

`verifyReceiptV2()` checks:

- Version gate: `supportedVersions` must include 2
- Required fields: network, payer, resourceUrl, issuedAt
- Recency: `issuedAt` must be within recency window + clock skew
- Future receipts: rejected if beyond clock skew tolerance

## 6. V2 Evidence Mapping

`toPeacRecordV2()` maps normalized V2 offers and receipts to `X402PeacRecord` with V2-specific fields:

- `maxTimeoutSeconds`: preserved from offer (duration)
- `scheme`: settlement scheme identifier
- `resource.url`: used for evidence `resourceUrl`

Raw upstream artifacts are preserved in `proofs.x402` (proof preservation discipline).

## 7. Drift CI

`x402-drift.yml` monitors upstream `specs/transports-v2/http.md` for changes.

## 8. Settlement Observation Boundary (v0.12.11)

PEAC records x402 settlement proofs as observation only. The
`extractSettlementProofFromHeaders()` extractor in `@peac/adapter-x402`
returns the raw proof artifact and a minimal normalized projection
(source header, wire version, raw value). PEAC does NOT verify scheme-
specific invariants:

- single-use semantics
- time-bound expiry
- recipient binding
- facilitator binding
- max-vs-actual settlement correctness

These remain the responsibility of the upstream x402 protocol and per-
operator facilitator surfaces (see
`docs/compatibility/x402-scheme-coverage.md` for the three-truth-surface
separation).

`fromX402SettlementObservation()` produces evidence with
`commerce.event = 'settlement'` only when supplied with an extracted
settlement-proof artifact whose `raw_value` is a non-empty string.
Offer-only data (no settlement header present, or an empty raw_value) is
rejected as a finality-rule violation in all strictness modes via the
shared mapper-boundary finality-synthesis guard from
`@peac/adapter-core`. The pointer field on the thrown error is
`/proofs/x402/settlement` and the stable code is
`commerce.finality_synthesis_blocked`.

Header read precedence (matches the existing carrier reader):

1. `PEAC-Receipt`
2. `PAYMENT-RESPONSE` (x402 v2)
3. `X-PAYMENT-RESPONSE` (x402 v1)

When multiple headers are present, all are returned in precedence order
so callers can record duplicates without losing fidelity.
