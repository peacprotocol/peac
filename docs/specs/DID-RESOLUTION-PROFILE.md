# DID Resolution Profile

**Status:** Normative
**Package:** `@peac/adapter-did`

This document specifies the DID resolution profile for PEAC. The adapter resolves `did:key` and `did:web` identifiers to Ed25519 public keys for receipt verification.

## 1. Overview

`@peac/adapter-did` provides DID resolution at Layer 4 with zero network dependency for `did:key` and caller-injected fetch for `did:web`. It does not import `@peac/net-node` directly; instead, callers provide a hardened fetch contract.

## 2. did:key Resolution

`DidKeyResolver` resolves Ed25519 keys from `did:key` identifiers with zero I/O.

- Supports both multibase forms: `z` (base58btc) and `u` (base64url)
- Ed25519 multicodec prefix: `0xed01` (2-byte varint)
- Non-Ed25519 keys are rejected without oracle (no early-return, prevents timing side-channels)
- Returns a `DIDDocument` with the extracted verification method

## 3. did:web Resolution

`DidWebResolver` resolves DID documents from HTTPS endpoints.

- URL transformation: `did:web:example.com:path:to` transforms to `https://example.com/path/to/did.json`
- Percent-encoded port: `did:web:example.com%3A8443` transforms to `https://example.com:8443/.well-known/did.json`
- IP literal rejection
- Exact `id` match: resolved document `id` must match the input DID
- Domain allowlist with case and trailing-dot normalization
- Redirect detection
- Content-Type validation: `application/did+json` or `application/json`
- 256 KB maximum document size

The resolver accepts a `fetchFn` parameter (hardened fetch contract) rather than using global fetch.

## 4. Caching

`CachingResolver` wraps any `DIDResolver` with TTL-based caching:

- Configurable TTL and maximum entry count
- Mutation isolation via `structuredClone`
- `invalidate(did)` and `clear()` methods

## 5. Key Extraction

`extractVerificationKey()` selects an Ed25519 key from a DID document:

- Iterates all verification methods regardless of match (no early-return)
- Prefers relationship-referenced methods
- Fails on ambiguity (multiple matching methods)
- Returns 32-byte Ed25519 public key

## 6. Error Handling

Uses kernel error codes:

- `E_DID_INVALID_FORMAT`: malformed DID string
- `E_DID_METHOD_NOT_SUPPORTED`: unsupported DID method
- `E_DID_RESOLUTION_FAILED`: resolution failure (network, parsing)
- `E_DID_KEY_EXTRACTION_FAILED`: no suitable Ed25519 key found
