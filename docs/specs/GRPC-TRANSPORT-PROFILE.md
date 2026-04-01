# gRPC Transport Profile

**Status:** Normative
**Package:** `@peac/transport-grpc`

This document specifies the gRPC transport profile for PEAC evidence carriers.

## 1. Overview

`@peac/transport-grpc` provides gRPC transport bindings for PEAC evidence carriers. It maps receipts to gRPC metadata keys, translates between HTTP and gRPC status codes, and implements the `CarrierAdapter` interface. Pure TypeScript with no `@grpc/grpc-js` dependency.

## 2. Metadata Keys

| Key                        | Purpose                                         |
| -------------------------- | ----------------------------------------------- |
| `peac-receipt`             | Compact JWS of the signed receipt               |
| `peac-receipt-type`        | Receipt typ (default: `interaction-record+jwt`) |
| `peac-tap-signature`       | TAP signature                                   |
| `peac-tap-signature-input` | TAP signature input                             |
| `peac-error-code`          | PEAC error code in trailer                      |
| `peac-request-id`          | Request ID for tracing                          |

All keys are ASCII lowercase. Keys starting with `grpc-` are reserved and rejected.

## 3. Carrier Adapter

`A2AGrpcCarrierAdapter` implements `CarrierAdapter<GrpcMetadataLike, GrpcMetadataLike>`:

- `extract()`: reads receipt from metadata, computes real SHA-256 `receipt_ref` via `node:crypto`
- `attach()`: writes receipt JWS and type to metadata, validates carrier constraints
- `validateConstraints()`: delegates to `@peac/schema` carrier constraint validation

## 4. Header Size Constraints

gRPC metadata is carried in HTTP/2 headers. Default `GRPC_MAX_CARRIER_SIZE` is 8,192 bytes (8 KiB):

- Conservative interoperability-safe default
- Larger limits are deployment-specific (override via `createGrpcCarrierMeta({ max_size: ... })`)
- For receipts exceeding the header budget, prefer reference mode (`receipt_url`)

## 5. Binary Metadata Rejection

Binary metadata (gRPC `-bin` suffix convention) is rejected for PEAC receipt data:

- `peac-receipt-bin` key in metadata causes `extract()` to return null
- Ensures receipt JWS is always transmitted as ASCII text metadata

## 6. Wire Format

Default receipt type: `interaction-record+jwt` (Wire 0.2). Wire 0.1 (`peac-receipt/0.1`) supported via explicit parameter.

## 7. Status Code Mapping

Bidirectional mapping between HTTP and gRPC status codes:

| HTTP | gRPC                | Semantics                |
| ---- | ------------------- | ------------------------ |
| 400  | INVALID_ARGUMENT    | Malformed request        |
| 401  | UNAUTHENTICATED     | Authentication required  |
| 402  | FAILED_PRECONDITION | Payment required         |
| 403  | PERMISSION_DENIED   | Not authorized           |
| 409  | ABORTED             | Conflict/replay detected |
| 500  | INTERNAL            | Server error             |
