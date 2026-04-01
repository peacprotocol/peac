# A2A Authentication Profile

**Status:** Normative
**Package:** `@peac/mappings-a2a`

This document specifies the A2A v1.0 authentication profile for PEAC. The profile covers OAuth 2.0 PKCE, Device Code types, auth evidence mapping, and gRPC error modeling.

## 1. Overview

A2A v1.0 specifies OAuth 2.0 as the preferred authentication model. PEAC maps authentication events to access extension observations without synthesizing access decisions.

Key principle: authentication success is an **observation**, not an automatic access decision.

## 2. PKCE (RFC 7636)

`generatePKCEChallenge()` produces S256 challenge pairs:

- S256 only; plain method is rejected
- 32 bytes of entropy via `crypto.getRandomValues()`
- Verifier: 43-128 chars from RFC 7636 unreserved set
- Buffer-based base64url encoding (Node-safe)
- Kernel error codes: `E_PKCE_INVALID_VERIFIER`, `E_PKCE_CHALLENGE_MISMATCH`

## 3. OAuth Configuration

Config field names mirror the A2A spec OAuth flow object:

- `authorizationUrl`, `tokenUrl`, `refreshUrl`, `scopes`, `pkceRequired`
- Device Code flow: `deviceAuthorizationUrl`, `tokenUrl`, `refreshUrl`, `scopes`
- HTTPS required on all endpoints (localhost HTTP allowed for development)

## 4. OAuth Code Exchange

`exchangeAuthorizationCode()` sends a POST to the token endpoint:

- Adapter-local `FetchFn` signature (not `typeof fetch`)
- PKCE verifier validated before network call
- `redirectUri` validated for HTTPS
- `extraParams` cannot override reserved OAuth parameters

## 5. Device Code Types

Raw RFC 8628 wire names for types-only surface:

- Polling errors: `authorization_pending`, `slow_down`, `access_denied`, `expired_token`
- No implementation in this release (types only)

## 6. Auth Evidence Mapping

`fromA2AAuthEvent()` produces access extension observations:

- `decision`: always `'review'` (never `'allow'` or `'deny'`)
- `auth_event`: always `'observation'`
- Token material never included in evidence output
- Maps to `org.peacprotocol/access` extension key

## 7. Error Modeling

`createA2AAuthStatus()` returns `google.rpc.Status` with `google.rpc.ErrorInfo`:

- Domain: `a2a-protocol.org`
- Reason codes: `PKCE_CHALLENGE_MISMATCH`, `TOKEN_EXCHANGE_FAILED`, `AUTH_SERVER_UNAVAILABLE`, etc.
- `@type`: `type.googleapis.com/google.rpc.ErrorInfo`
