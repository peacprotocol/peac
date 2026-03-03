# PEAC Protocol Wire 0.2 Format Specification

**Status**: NORMATIVE PREVIEW

**Version**: 0.12.0-preview.1

**Wire Format**: `interaction-record+jwt`

**Design Decisions**: DD-150, DD-151, DD-152, DD-153, DD-155, DD-156

---

**Key words**: The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 (RFC 2119, RFC 8174) when, and only when, they appear in all capitals, as shown here.

---

## 1. Introduction

This document defines the normative structure, semantics, and validation rules for PEAC Wire 0.2, the next-generation wire format for interaction records. Wire 0.2 introduces two structural kinds (`evidence` and `challenge`), an open semantic type field with reverse-DNS grammar, a multi-valued pillar taxonomy, canonical issuer form, typed extension groups, and a structured warning system.

Wire 0.1 (`peac-receipt/0.1`) remains FROZEN and fully supported. Existing Wire 0.1 receipts, schemas, test fixtures, and verification paths are unchanged. Wire 0.2 adds capabilities without modifying Wire 0.1 semantics. Both wire versions coexist in a dual-stack model (Section 15).

**Implementation requirement**: A conformant Wire 0.2 implementation MUST enforce all rules defined in this document procedurally, even if the underlying schema validation library does not fully support the conditional constraints described here.

This specification MUST be read in conjunction with:

- [PROTOCOL-BEHAVIOR.md](PROTOCOL-BEHAVIOR.md): Wire 0.1 behavioral semantics (unchanged)
- [KERNEL-CONSTRAINTS.md](KERNEL-CONSTRAINTS.md): Structural limits enforced on all receipts
- [ERRORS.md](ERRORS.md): Error code definitions
- [REGISTRIES.md](REGISTRIES.md): Informational identifier registries

### 1.1 Cross-References

- Kernel constants: `packages/kernel/src/constants.ts`
- Kernel types: `packages/kernel/src/types.ts`
- Envelope schema: `packages/schema/src/wire-02-envelope.ts`
- Extension schemas: `packages/schema/src/wire-02-extensions.ts`
- Representation schema: `packages/schema/src/wire-02-representation.ts`
- Warning codes: `packages/schema/src/wire-02-warnings.ts`
- Registry constants: `packages/schema/src/wire-02-registries.ts`
- Receipt parser: `packages/schema/src/receipt-parser.ts`
- JWS signing and verification: `packages/crypto/src/jws.ts`

---

## 2. Media Type

Wire 0.2 receipts use the JWS `typ` header value `interaction-record+jwt` (compact form, per RFC 7515 Section 4.1.9).

### 2.1 Accepted Forms

| Form                | Value                                | Usage                                             |
| ------------------- | ------------------------------------ | ------------------------------------------------- |
| Compact (canonical) | `interaction-record+jwt`             | Issuers MUST emit this form                       |
| Full media type     | `application/interaction-record+jwt` | Verifiers MUST accept; normalized to compact form |

The full media type form `application/interaction-record+jwt` is accepted by verifiers and MUST be normalized to the compact form `interaction-record+jwt` before returning the decoded header. Issuers MUST NOT emit the full media type form.

Wire 0.1 continues to use `peac-receipt/0.1` as its `typ` value (`WIRE_01_JWS_TYP`).

### 2.2 Coherence Check

Verifiers MUST enforce coherence between the JWS `typ` header and the `peac_version` payload claim:

| `typ` Value              | `peac_version`  | Result                                                                      |
| ------------------------ | --------------- | --------------------------------------------------------------------------- |
| `interaction-record+jwt` | `"0.2"`         | Valid                                                                       |
| `interaction-record+jwt` | any other value | `E_WIRE_VERSION_MISMATCH`                                                   |
| `peac-receipt/0.1`       | `"0.2"`         | `E_WIRE_VERSION_MISMATCH`                                                   |
| `peac-receipt/0.1`       | absent          | Valid (Wire 0.1)                                                            |
| absent                   | any             | No coherence check at crypto layer; strictness profiles govern (Section 16) |

### 2.3 Strict vs Interop Mode

- **Strict** (default): `typ` MUST be present and MUST match `interaction-record+jwt` (or its full media type form). Missing `typ` is a hard error.
- **Interop**: Missing `typ` emits a `typ_missing` warning. The verifier routes by `peac_version` payload claim instead.

See Section 16 for full strictness profile semantics.

---

## 3. Envelope Structure

A Wire 0.2 receipt payload is a JSON object conforming to the following claims schema. The envelope uses `.strict()` validation: unknown top-level fields MUST be rejected.

### 3.1 Claims Fields

| Field              | Type                          | Required | Max Length | Description                                                        |
| ------------------ | ----------------------------- | -------- | ---------- | ------------------------------------------------------------------ |
| `peac_version`     | `"0.2"` (literal)             | REQUIRED | N/A        | Wire format version discriminant                                   |
| `kind`             | `"evidence"` or `"challenge"` | REQUIRED | N/A        | Structural kind (Section 5)                                        |
| `type`             | string                        | REQUIRED | 256        | Open semantic type in reverse-DNS or absolute URI form (Section 6) |
| `iss`              | string                        | REQUIRED | 2048       | Canonical issuer identifier (Section 8)                            |
| `iat`              | integer                       | REQUIRED | N/A        | Issued-at time (Unix seconds)                                      |
| `jti`              | string (1 to 256 chars)       | REQUIRED | 256        | Unique receipt identifier                                          |
| `sub`              | string                        | OPTIONAL | 2048       | Subject identifier                                                 |
| `pillars`          | array of EvidencePillar       | OPTIONAL | N/A        | Sorted unique pillar values from closed taxonomy (Section 7)       |
| `actor`            | ActorBinding                  | OPTIONAL | N/A        | Actor identity binding; sole location in Wire 0.2 (Section 3.4)    |
| `policy`           | PolicyBlock                   | OPTIONAL | N/A        | Policy binding block (Section 11)                                  |
| `representation`   | RepresentationFields          | OPTIONAL | N/A        | Content representation metadata (Section 3.3)                      |
| `occurred_at`      | string (ISO 8601 / RFC 3339)  | OPTIONAL | N/A        | When the interaction occurred; evidence kind only (Section 9)      |
| `purpose_declared` | string                        | OPTIONAL | 256        | Declared purpose of the interaction                                |
| `extensions`       | `Record<string, unknown>`     | OPTIONAL | N/A        | Extension groups keyed by reverse-DNS (Section 12)                 |

Every Wire 0.2 receipt MUST include `peac_version`, `kind`, `type`, `iss`, `iat`, and `jti`. Absence of any required field is a validation error. JSON field ordering is not normatively significant.

### 3.2 Policy Block

The optional `policy` block records the binding between a receipt and its governing policy document.

| Field     | Type         | Required | Max Length | Description                                       |
| --------- | ------------ | -------- | ---------- | ------------------------------------------------- |
| `digest`  | string       | REQUIRED | N/A        | JCS + SHA-256 digest: `sha256:<64 lowercase hex>` |
| `uri`     | string (URL) | OPTIONAL | 2048       | HTTPS locator hint; MUST start with `https://`    |
| `version` | string       | OPTIONAL | 256        | Caller-assigned version label                     |

The `policy.uri` field is a locator hint only. Implementations MUST NOT trigger automatic fetch on encountering this URL (DD-55: no implicit network I/O).

### 3.3 Representation Fields

The optional `representation` block records metadata about the content that was observed or served. Unknown keys are rejected (`.strict()` schema). An empty object is valid.

| Field            | Type    | Required | Max Length | Description                                                                    |
| ---------------- | ------- | -------- | ---------- | ------------------------------------------------------------------------------ |
| `content_hash`   | string  | OPTIONAL | 76         | SHA-256 FingerprintRef: `sha256:<64 lowercase hex>`; hmac-sha256 NOT permitted |
| `content_type`   | string  | OPTIONAL | 256        | MIME type (conservative pattern: `type/subtype` with optional parameters)      |
| `content_length` | integer | OPTIONAL | N/A        | Size in bytes (non-negative, finite, bounded by `Number.MAX_SAFE_INTEGER`)     |

### 3.4 Actor Binding

The `actor` field is the sole location for actor identity binding in Wire 0.2 (promoted from `ext["org.peacprotocol/actor_binding"]` in Wire 0.1).

| Field         | Type         | Required | Max Length  | Description                                                             |
| ------------- | ------------ | -------- | ----------- | ----------------------------------------------------------------------- |
| `id`          | string       | REQUIRED | 256 (min 1) | Stable actor identifier (opaque, no PII)                                |
| `proof_type`  | string       | REQUIRED | N/A         | Trust root model from the proof types registry (DD-143)                 |
| `proof_ref`   | string       | OPTIONAL | 2048        | URI or hash of external proof artifact                                  |
| `origin`      | string (URL) | REQUIRED | N/A         | Origin-only URL (scheme + host + optional port; no path/query/fragment) |
| `intent_hash` | string       | OPTIONAL | N/A         | SHA-256 hash of the intent: `sha256:<64 hex>`                           |

---

## 4. Compatibility Contract

Each top-level construct in Wire 0.2 has a compatibility classification that governs extensibility.

### 4.1 Field Categories

| Construct      | Compatibility | Description                                                             |
| -------------- | ------------- | ----------------------------------------------------------------------- |
| `peac_version` | Closed        | Literal `"0.2"` only                                                    |
| `kind`         | Closed        | Only `evidence` and `challenge`; new values require a wire version bump |
| `pillars`      | Closed        | Exactly 10 values; unknown values rejected                              |
| `iss` schemes  | Closed        | Only `https://` and `did:` accepted                                     |
| `type`         | Open          | Any value matching the type grammar (Section 6)                         |
| `extensions`   | Open          | Unknown keys with valid grammar preserved with warning                  |

### 4.2 Open Fields

Open fields accept new values without a protocol version bump. Implementations MUST preserve unrecognized but well-formed values. For `extensions`, unrecognized keys with valid grammar trigger an `unknown_extension_preserved` warning but are not rejected.

### 4.3 Closed Fields

Closed fields have a fixed set of permitted values. Adding a new value to a closed field constitutes a breaking change and requires a wire version increment.

### 4.4 Normalization

The following normalization rules apply:

- The `iss` field enforces canonical form per Section 8.
- The `pillars` array MUST be sorted in ascending lexicographic order with no duplicates.
- The JWS `typ` header normalizes the full media type form to the compact form.
- The envelope uses `.strict()` validation: unknown top-level keys are rejected.

---

## 5. Kind Semantics

Wire 0.2 defines two structural kinds that classify the fundamental nature of each interaction record. The `kind` vocabulary is **closed forever**: these two values will not change. Open semantic meaning is expressed entirely through the `type` field (Section 6).

### 5.1 Evidence Kind

`evidence`: Records an event that has already occurred. Evidence receipts are factual attestations about past interactions.

- The `occurred_at` field is permitted only on evidence receipts (Section 9).
- Evidence receipts typically carry extension groups such as commerce, access, identity, or correlation.

### 5.2 Challenge Kind

`challenge`: Requests an action from the receiver. Challenge receipts describe a condition that the receiver must satisfy before proceeding.

- The `occurred_at` field MUST NOT appear on challenge receipts. Its presence produces `E_OCCURRED_AT_ON_CHALLENGE`.
- Challenges SHOULD include the challenge extension group (Section 13) with a `challenge_type` and an RFC 9457 `problem` body.

### 5.3 Kind and Type Relationship

The `kind` and `type` fields are complementary: `kind` is structural (what the record IS), `type` is semantic (what it is ABOUT). A single `type` MAY appear with either kind. For example, `org.peacprotocol/payment` as evidence means "payment completed"; as challenge it means "payment required".

---

## 6. Type Grammar

The `type` field identifies the semantic meaning of a receipt. It is an open vocabulary: any value matching the grammar is valid. Maximum length: 256 characters (`TYPE_GRAMMAR.maxLength`).

### 6.1 Accepted Forms

Two forms are accepted:

1. **Reverse-DNS notation**: `<domain>/<segment>` where `<domain>` has at least one dot and `<segment>` is non-empty.
2. **Absolute URI**: starts with `<scheme>://` per RFC 3986.

### 6.2 Validation Algorithm

```text
Input: value (string)
Output: boolean (true if valid type grammar)

1. IF value is empty OR value.length > 256:
     RETURN false

2. IF value matches /^[a-z][a-z0-9+.-]*:\/\//:
     RETURN true  (absolute URI)

3. Find the first '/' in value:
   IF no slash found OR slash is at position 0:
     RETURN false

4. Split: domain = value before first '/', segment = value after first '/'

5. Validate domain:
   a. MUST contain at least one dot
   b. MUST match /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/

6. Validate segment:
   a. MUST be non-empty
   b. MUST match /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
   c. Additional slashes are NOT permitted in reverse-DNS form;
      use an absolute URI for multi-segment paths

7. RETURN true
```

### 6.3 Reverse-DNS Rules

**Domain**: Letters, digits, dots, and hyphens. MUST start with an alphanumeric character. MUST contain at least one dot (distinguishes from single-label paths).

**Segment**: Letters, digits, hyphens, underscores, and dots. MUST start with an alphanumeric character. Underscores are permitted (for type names such as `access-decision`). Additional slashes are NOT permitted; use the absolute URI form for multi-segment paths.

**Examples**: `org.peacprotocol/commerce`, `com.example/custom-flow`, `https://example.com/types/custom`

### 6.4 Registered Receipt Types

All 10 pillars have registered type values in the `receipt_types` registry. A type NOT matching any registered value triggers a `type_unregistered` warning (not an error).

| Registered Type                         | Pillar      |
| --------------------------------------- | ----------- |
| `org.peacprotocol/payment`              | commerce    |
| `org.peacprotocol/access-decision`      | access      |
| `org.peacprotocol/identity-attestation` | identity    |
| `org.peacprotocol/consent-record`       | consent     |
| `org.peacprotocol/compliance-check`     | compliance  |
| `org.peacprotocol/privacy-signal`       | privacy     |
| `org.peacprotocol/safety-review`        | safety      |
| `org.peacprotocol/provenance-record`    | provenance  |
| `org.peacprotocol/attribution-event`    | attribution |
| `org.peacprotocol/purpose-declaration`  | purpose     |

---

## 7. Pillar Taxonomy

The `pillars` field is an OPTIONAL array that classifies a receipt across one or more of 10 closed pillar values.

### 7.1 Pillar Values

| Value         | Description                                   |
| ------------- | --------------------------------------------- |
| `access`      | Authorization and access control decisions    |
| `attribution` | Content provenance and usage credit           |
| `commerce`    | Payment, billing, and financial evidence      |
| `compliance`  | Regulatory and audit trail evidence           |
| `consent`     | User consent grants and withdrawals           |
| `identity`    | Agent and actor identity attestation          |
| `privacy`     | Data protection and privacy evidence          |
| `provenance`  | Supply chain and artifact origin evidence     |
| `purpose`     | Declared purpose and usage intent             |
| `safety`      | Content safety and content moderation signals |

### 7.2 Constraints

- **Closed vocabulary**: Unknown values MUST be rejected. New pillars require a protocol specification change.
- **Non-empty**: When present, the array MUST contain at least one element.
- **Sorted**: Values MUST be in ascending lexicographic order. Implementations MUST verify that each element is strictly greater than the preceding element.
- **Unique**: Duplicate values MUST be rejected.
- **Error**: Arrays that violate sorting or uniqueness produce `E_PILLARS_NOT_SORTED`.

### 7.3 Relationship to Type

Pillars and type are complementary. The `type` field identifies what happened (open vocabulary). The `pillars` field identifies which governance domains are relevant (closed vocabulary). A receipt MAY have a type that does not directly correspond to any single pillar, and MAY have multiple pillars for a single type (e.g., `pillars: ["commerce", "compliance"]` for a payment that also satisfies a regulatory requirement).

---

## 8. Issuer Canonical Form

The `iss` (issuer) field identifies the entity that issued the interaction record. Wire 0.2 accepts exactly two URI schemes and enforces strict canonical form. Maximum length: 2048 characters (`ISS_CANONICAL.maxLength`).

### 8.1 HTTPS Scheme

Format: `https://<host>` (origin-only, per RFC 3986).

Requirements:

- Scheme MUST be lowercase `https`.
- Host MUST be lowercase ASCII. Raw Unicode hostnames are rejected; punycode (`xn--` labels) is accepted.
- The default port 443 MUST NOT appear explicitly (`:443` is rejected).
- No trailing slash, path, query string, fragment, or userinfo.

Valid examples: `https://example.com`, `https://issuer.example.org`

Invalid examples: `https://Example.com` (uppercase), `https://example.com/` (trailing slash), `https://example.com:443` (default port), `http://example.com` (wrong scheme), `https://user@example.com` (userinfo)

### 8.2 DID Scheme

Format: `did:<method>:<method-specific-id>` per DID Core.

Requirements:

- Method: lowercase letters and digits only (`[a-z0-9]+`).
- Method-specific-id: non-empty, MUST NOT contain `/`, `?`, or `#`.

Valid examples: `did:key:z6Mkf5rG`, `did:web:example.com`

### 8.3 Validation Algorithm

```text
Input: iss (string)
Output: boolean (true if canonical form)

1. IF iss is empty OR iss.length > 2048:
     RETURN false

2. IF iss starts with 'did:':
     RETURN /^did:[a-z0-9]+:[^#?/]+$/.test(iss)

3. TRY parse iss as URL:
   a. Protocol MUST be 'https:'
   b. Hostname MUST be non-empty
   c. Username and password MUST be empty (no userinfo)
   d. Reconstruct origin: protocol + '//' + host
   e. iss MUST equal the reconstructed origin exactly
      (rejects: uppercase host, trailing slash, default port,
       path, query, fragment, raw Unicode hostname)

4. IF any check fails or URL parse throws:
     RETURN false

5. RETURN true
```

### 8.4 Rejected Schemes

All schemes other than `https` and `did` produce `E_ISS_NOT_CANONICAL`. This includes `http`, `urn`, `mailto`, and any custom schemes.

### 8.5 DID Key Resolution

Canonical `iss` validation checks format only. It does NOT resolve DID documents or discover public keys. DID document auto-resolution is NOT performed by `verifyLocal()`; callers MUST always provide the `publicKey: Uint8Array` parameter directly. DID-based key resolution is deferred to Layer 4+ (`@peac/adapter-did`).

---

## 9. Occurred-at Semantics

The `occurred_at` field records when the interaction occurred, as an ISO 8601 / RFC 3339 datetime string with timezone offset.

### 9.1 Kind Restriction

`occurred_at` is permitted ONLY on `evidence` receipts. Including `occurred_at` on a `challenge` receipt is a hard error: `E_OCCURRED_AT_ON_CHALLENGE`.

### 9.2 Format

The value MUST be a valid ISO 8601 / RFC 3339 datetime string with a timezone offset.

Valid examples: `2026-03-03T12:00:00Z`, `2026-03-03T17:30:00+05:30`

### 9.3 Temporal Consistency Algorithm

```text
Input: occurred_at (string or undefined), iat (integer, Unix seconds),
       now (integer, Unix seconds)
Constants: tolerance = 300 seconds (OCCURRED_AT_TOLERANCE_SECONDS)
Output: hard_error | warning | null

1. IF occurred_at is undefined:
     RETURN null (no check performed)

2. Parse occurred_at to Unix seconds (ts).
   IF parse fails:
     RETURN null (parse error surfaces from schema validation)

3. IF ts > now + tolerance:
     RETURN hard_error (E_OCCURRED_AT_FUTURE)

4. IF ts > iat:
     RETURN warning: {
       code: 'occurred_at_skew',
       message: 'occurred_at is after iat',
       pointer: '/occurred_at'
     }

5. RETURN null (valid: occurred_at <= iat, no warning)
```

**Rationale**: A small skew between `occurred_at` and `iat` is normal in distributed systems (the interaction occurs, then the receipt is issued moments later). The warning informs callers without blocking verification.

---

## 10. JWS Header Constraints

Wire 0.2 receipts are signed as compact JWS tokens (RFC 7515). The following JOSE hardening rules apply to the protected header.

### 10.1 Required Fields

| Field | Value                    | Constraint                                                     |
| ----- | ------------------------ | -------------------------------------------------------------- |
| `alg` | `EdDSA`                  | Ed25519 only (RFC 8032); all other algorithms MUST be rejected |
| `typ` | `interaction-record+jwt` | MUST be present in strict mode (Section 16)                    |
| `kid` | string (1 to 256 chars)  | REQUIRED; identifies the signing key in the issuer JWKS        |

### 10.2 Rejected Header Parameters

Presence of any of the following MUST cause a hard error:

| Parameter             | Error Code            | Rationale                                                            |
| --------------------- | --------------------- | -------------------------------------------------------------------- |
| `jwk`                 | `E_JWS_EMBEDDED_KEY`  | Embedded key material bypasses trust pinning (RFC 8725 Section 3.10) |
| `x5c`                 | `E_JWS_EMBEDDED_KEY`  | Certificate chain embedding not permitted                            |
| `x5u`                 | `E_JWS_EMBEDDED_KEY`  | Remote certificate URL not permitted                                 |
| `jku`                 | `E_JWS_EMBEDDED_KEY`  | Remote JWK Set URL not permitted                                     |
| `crit`                | `E_JWS_CRIT_REJECTED` | Critical header extensions not supported                             |
| `b64` (value `false`) | `E_JWS_B64_REJECTED`  | RFC 7797 unencoded payload not permitted                             |
| `zip`                 | `E_JWS_ZIP_REJECTED`  | Payload compression not permitted                                    |

### 10.3 kid Constraints

- `kid` MUST be present and non-empty. Absent or empty `kid` produces `E_JWS_MISSING_KID`.
- `kid` MUST NOT exceed 256 characters (DoS safety). Oversized `kid` also produces `E_JWS_MISSING_KID`.

### 10.4 JWS Size Cap

The total JWS compact serialization MUST NOT exceed 262,144 bytes (256 KB). Tokens exceeding this limit are rejected before parsing to prevent denial-of-service via oversized payloads. The limit is defined by `VERIFIER_LIMITS.maxReceiptBytes`.

### 10.5 JOSE Hardening Scope

JOSE hardening (embedded key rejection, crit, b64, zip checks) applies to:

- Wire 0.2 tokens (`typ` is `interaction-record+jwt`)
- Tokens with no `typ` header (`UnTypedJWSHeader`)

Wire 0.1 tokens (`typ` is `peac-receipt/0.1`) are excluded because the legacy format predates these constraints.

### 10.6 JSON Parse Safety

All `JSON.parse` calls on JWS header and payload segments are wrapped in try/catch. Parse failures produce `CRYPTO_INVALID_JWS_FORMAT` errors with stable error codes.

---

## 11. Policy Binding

The optional `policy` block records a cryptographic reference to the policy document that governed the interaction. Policy binding uses JCS canonicalization (RFC 8785) and SHA-256 hashing to produce a deterministic digest.

### 11.1 Digest Format

The policy digest uses the self-describing format: `sha256:<64 lowercase hex characters>`.

Example: `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`

### 11.2 Digest Computation Algorithm

```text
Input: policy (JSON value)
Output: digest (string)

1. Canonicalize: canonical_bytes = JCS(policy)
   (RFC 8785: deterministic key ordering, minimal whitespace)

2. Hash: hash_bytes = SHA-256(canonical_bytes)

3. Encode: hex = lowercase_hex(hash_bytes)
   (64 hexadecimal characters)

4. Format: digest = 'sha256:' + hex

RETURN digest
```

The computation is deterministic and key-order independent. The `computePolicyDigestJcs()` function in `@peac/protocol` (Layer 3) implements this algorithm.

### 11.3 Binding Verification

Policy binding produces a three-state result:

| State         | Condition                                                          | Verification Outcome                  |
| ------------- | ------------------------------------------------------------------ | ------------------------------------- |
| `verified`    | Both receipt digest and local digest are present and match exactly | Success                               |
| `failed`      | Both digests are present and do not match                          | Hard error: `E_POLICY_BINDING_FAILED` |
| `unavailable` | Either the receipt digest or the local digest (or both) is absent  | No assertion (informational)          |

### 11.4 Binding Algorithm

```text
Input: receipt_policy_digest (string or undefined),
       local_policy_digest (string or undefined)
Output: 'verified' | 'failed' | 'unavailable'

1. IF receipt_policy_digest is undefined OR local_policy_digest is undefined:
     RETURN 'unavailable'

2. IF receipt_policy_digest === local_policy_digest:
     RETURN 'verified'

3. RETURN 'failed'
```

Verifiers pass a local policy digest as the `policyDigest` option to `verifyLocal()`. The option value MUST match the format `sha256:<64 lowercase hex>` or it is rejected with `E_INVALID_FORMAT`. A mismatch between receipt and local digest returns `E_POLICY_BINDING_FAILED` with `receipt_policy_digest`, `local_policy_digest`, and `policy_uri` details.

### 11.5 Layer Architecture

Policy binding is split across two layers:

- **Layer 1** (`@peac/schema`): `verifyPolicyBinding(receiptDigest, localDigest)` performs pure string comparison. Returns `'verified'` or `'failed'`. Both arguments must be present; the caller handles the absent case.
- **Layer 3** (`@peac/protocol`): `checkPolicyBinding(receiptDigest?, localDigest?)` handles the 3-state logic (absent arguments produce `'unavailable'`). `computePolicyDigestJcs(policy)` performs JCS + SHA-256.

### 11.6 Policy URI

The `policy.uri` field MUST be an `https://` URL. Implementations MUST NOT auto-fetch the policy document based on this URI (DD-55: no implicit network I/O). The URI serves as a reference for human operators and audit trails.

### 11.7 Wire 0.1 Behavior

Wire 0.1 receipts always return `policy_binding: 'unavailable'` regardless of whether a `policyDigest` option is provided to `verifyLocal()`. Policy binding is a Wire 0.2 feature.

---

## 12. Extension Groups

The `extensions` field is an OPTIONAL record of typed extension groups keyed by reverse-DNS identifiers.

### 12.1 Extension Key Grammar

Extension keys MUST conform to the grammar: `<domain>/<segment>`.

**Domain rules:**

- At least one dot (single-label domains are rejected).
- Each DNS label matches `[a-z0-9]([a-z0-9-]*[a-z0-9])?` (lowercase only).
- Single-character labels are valid (e.g., `a` in `a.example`).
- Maximum label length: 63 characters (RFC 1035).
- Maximum domain length: 253 characters (RFC 1035).

**Segment rules:**

- Matches `[a-z0-9][a-z0-9_-]*` (lowercase only).
- Underscores are permitted for names such as `credential_event`.
- The segment MUST be non-empty.

**Overall key length:** maximum 512 characters.

Keys that do not match this grammar produce `E_INVALID_EXTENSION_KEY` (hard error). The `isValidExtensionKey()` function implements the grammar check.

### 12.2 Key Validation Algorithm

```text
Input: key (string)
Output: boolean (true if valid extension key grammar)

1. IF key is empty OR key.length > 512:
     RETURN false

2. Find first '/' in key:
   IF no slash OR slash at position 0:
     RETURN false

3. Split: domain = key before first '/', segment = key after first '/'

4. Domain validation:
   a. MUST contain at least one dot
   b. Total domain length MUST NOT exceed 253 characters
   c. Split domain by '.'; for each label:
      - MUST be non-empty
      - MUST NOT exceed 63 characters
      - MUST match /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

5. Segment validation:
   a. MUST be non-empty
   b. MUST match /^[a-z0-9][a-z0-9_-]*$/

6. RETURN true
```

### 12.3 Core Extension Groups

Five core extension groups have typed schemas in `@peac/schema`. All use `.strict()` mode (unknown keys within a group are rejected).

| Key                            | Group       | Section |
| ------------------------------ | ----------- | ------- |
| `org.peacprotocol/commerce`    | Commerce    | 12.4    |
| `org.peacprotocol/access`      | Access      | 12.5    |
| `org.peacprotocol/challenge`   | Challenge   | 13      |
| `org.peacprotocol/identity`    | Identity    | 12.6    |
| `org.peacprotocol/correlation` | Correlation | 12.7    |

### 12.4 Commerce Extension

Records payment and transaction metadata.

| Field          | Type                 | Required | Max Length | Description                                                                      |
| -------------- | -------------------- | -------- | ---------- | -------------------------------------------------------------------------------- |
| `payment_rail` | string               | REQUIRED | 128        | Payment rail identifier (e.g., `stripe`, `x402`, `lightning`)                    |
| `amount_minor` | string               | REQUIRED | 64         | Amount in smallest currency unit; base-10 integer string matching `/^-?[0-9]+$/` |
| `currency`     | string               | REQUIRED | 16         | ISO 4217 currency code or asset identifier                                       |
| `reference`    | string               | OPTIONAL | 256        | Caller-assigned payment reference                                                |
| `asset`        | string               | OPTIONAL | 256        | Asset identifier for non-fiat (e.g., token address)                              |
| `env`          | `"live"` or `"test"` | OPTIONAL | N/A        | Environment discriminant                                                         |

The `amount_minor` field MUST be a base-10 integer string. Decimal values and empty strings are rejected. String representation is used for arbitrary precision without floating-point loss.

### 12.5 Access Extension

Records access control decisions.

| Field      | Type                               | Required | Max Length | Description                                 |
| ---------- | ---------------------------------- | -------- | ---------- | ------------------------------------------- |
| `resource` | string                             | REQUIRED | 2048       | Resource being accessed (URI or identifier) |
| `action`   | string                             | REQUIRED | 256        | Action performed on the resource            |
| `decision` | `"allow"`, `"deny"`, or `"review"` | REQUIRED | N/A        | Access decision                             |

### 12.6 Identity Extension

Records identity proof metadata. The `actor` binding itself is a top-level field (Section 3.4); this extension group carries only supplementary identity metadata.

| Field       | Type   | Required | Max Length | Description                   |
| ----------- | ------ | -------- | ---------- | ----------------------------- |
| `proof_ref` | string | OPTIONAL | 256        | Opaque proof reference string |

The identity extension does not include `actor_binding`; the top-level `actor` field is the sole location for actor binding in Wire 0.2.

### 12.7 Correlation Extension

Links receipts to distributed traces and causal chains.

| Field         | Type            | Required | Max Length | Description                                              |
| ------------- | --------------- | -------- | ---------- | -------------------------------------------------------- |
| `trace_id`    | string          | OPTIONAL | 32 (exact) | OpenTelemetry trace ID: 32 lowercase hex characters      |
| `span_id`     | string          | OPTIONAL | 16 (exact) | OpenTelemetry span ID: 16 lowercase hex characters       |
| `workflow_id` | string          | OPTIONAL | 256        | Workflow identifier                                      |
| `parent_jti`  | string          | OPTIONAL | 256        | Parent receipt JTI for causal chains                     |
| `depends_on`  | array of string | OPTIONAL | 64 entries | JTIs this receipt depends on (each string max 256 chars) |

`trace_id` MUST match `/^[0-9a-f]{32}$/` (exactly 32 lowercase hex characters). `span_id` MUST match `/^[0-9a-f]{16}$/` (exactly 16 lowercase hex characters).

### 12.8 Unknown Extension Keys

Extension keys that pass grammar validation but are not recognized as a core group:

- MUST be preserved (not silently dropped).
- MUST trigger an `unknown_extension_preserved` warning at the protocol layer (Section 14).
- MUST NOT cause a validation error.

This ensures forward compatibility: new extension groups can be defined without breaking existing verifiers.

### 12.9 Typed Accessor Helpers

Five typed accessor functions are provided by `@peac/schema`:

- `getCommerceExtension(extensions)`
- `getAccessExtension(extensions)`
- `getChallengeExtension(extensions)`
- `getIdentityExtension(extensions)`
- `getCorrelationExtension(extensions)`

Each returns `undefined` if the key is absent from the extensions record. If the key is present but the value fails schema validation, the accessor throws a `PEACError` with a leaf-precise RFC 6901 JSON Pointer identifying the invalid field (e.g., `/extensions/org.peacprotocol~1commerce/amount_minor`). Accessors use `Object.prototype.hasOwnProperty.call()` to prevent prototype pollution.

---

## 13. Challenge Body

The challenge extension group (`org.peacprotocol/challenge`) carries structured problem details for challenge-kind receipts. The extension group uses `.strict()` mode; the nested `problem` object uses `.passthrough()` per RFC 9457 Section 6.2.

### 13.1 Challenge Types

Seven challenge type values are defined:

| Value                  | Description                                             |
| ---------------------- | ------------------------------------------------------- |
| `payment_required`     | Payment is required to proceed                          |
| `identity_required`    | Identity verification is required                       |
| `consent_required`     | User consent is required                                |
| `attestation_required` | An attestation must be provided                         |
| `rate_limited`         | Request rate limit has been exceeded                    |
| `purpose_disallowed`   | The declared purpose is not permitted for this resource |
| `custom`               | Custom challenge type (details in the `problem` object) |

### 13.2 Problem Details (RFC 9457)

The `problem` field uses RFC 9457 Problem Details format. Two fields are REQUIRED; three are OPTIONAL. Extension members beyond these five are permitted and preserved (`.passthrough()`).

| Field      | Type         | Required | Max Length | Description                                            |
| ---------- | ------------ | -------- | ---------- | ------------------------------------------------------ |
| `status`   | integer      | REQUIRED | N/A        | HTTP status code (100 to 599 inclusive)                |
| `type`     | string (URL) | REQUIRED | 2048       | Problem type URI                                       |
| `title`    | string       | OPTIONAL | 256        | Short human-readable summary                           |
| `detail`   | string       | OPTIONAL | 4096       | Human-readable explanation specific to this occurrence |
| `instance` | string       | OPTIONAL | 2048       | URI reference identifying the specific occurrence      |

### 13.3 Additional Challenge Fields

| Field          | Type                      | Required | Max Length | Description                            |
| -------------- | ------------------------- | -------- | ---------- | -------------------------------------- |
| `resource`     | string                    | OPTIONAL | 2048       | Resource that triggered the challenge  |
| `action`       | string                    | OPTIONAL | 256        | Action that triggered the challenge    |
| `requirements` | `Record<string, unknown>` | OPTIONAL | N/A        | Caller-defined resolution requirements |

---

## 14. Warning Plumbing

Wire 0.2 introduces a structured warning system for non-fatal conditions. Warnings do NOT affect the verification allow/deny decision unless caller policy explicitly requires it.

### 14.1 Warning Structure

Each warning is a `VerificationWarning` object:

| Field     | Type   | Required | Description                                                                                   |
| --------- | ------ | -------- | --------------------------------------------------------------------------------------------- |
| `code`    | string | REQUIRED | Stable warning code identifier (assert on this)                                               |
| `message` | string | REQUIRED | Human-readable description (implementation-defined; MUST NOT be used for conformance testing) |
| `pointer` | string | OPTIONAL | RFC 6901 JSON Pointer to the relevant field                                                   |

### 14.2 Warning Codes (Append-Only)

| Code                          | Pointer             | Condition                                                |
| ----------------------------- | ------------------- | -------------------------------------------------------- |
| `type_unregistered`           | `/type`             | Type value is not in the `receipt_types` registry        |
| `unknown_extension_preserved` | `/extensions/<key>` | Extension key is valid but unrecognized                  |
| `occurred_at_skew`            | `/occurred_at`      | `occurred_at` is after `iat` within the tolerance window |
| `typ_missing`                 | (none)              | JWS `typ` header is absent (interop mode only)           |

**Append-only contract**: New warning codes MAY be added in future versions. Existing warning codes MUST NOT be removed or renamed. Consumers MUST tolerate unknown warning codes gracefully.

### 14.3 RFC 6901 JSON Pointer Escaping

Warning `pointer` values follow RFC 6901 escaping rules:

- `/` within a key name is escaped as `~1`
- `~` within a key name is escaped as `~0`

Example: the extension key `org.peacprotocol/commerce` in a pointer becomes `/extensions/org.peacprotocol~1commerce`.

### 14.4 Sort Order

Warnings MUST be sorted by `(pointer ascending, code ascending)`. Warnings with undefined pointer sort before warnings with any defined pointer value. The `sortWarnings()` function enforces this ordering.

### 14.5 Conformance

Conformance implementations MUST assert on `code` and `pointer` fields only. The `message` field is implementation-defined and MUST NOT be used for conformance testing.

---

## 15. Dual-Stack Compatibility

Wire 0.1 and Wire 0.2 coexist in the same implementation. The verification pipeline routes receipts to the correct path based on the JWS header `typ` value.

### 15.1 Version Routing

| `typ` Value                          | Wire Version         | Payload Schema                                   |
| ------------------------------------ | -------------------- | ------------------------------------------------ |
| `peac-receipt/0.1`                   | Wire 0.1             | Wire 0.1 envelope (PROTOCOL-BEHAVIOR.md)         |
| `interaction-record+jwt`             | Wire 0.2             | Wire 0.2 claims (this document)                  |
| `application/interaction-record+jwt` | Wire 0.2             | Normalized to compact form, then Wire 0.2 claims |
| absent                               | Strictness-dependent | See Section 16                                   |

### 15.2 Routing Algorithm

```text
1. Decode the JWS header (base64url decode + JSON parse).
2. Read the typ header parameter.
3. Route based on typ:
   - 'peac-receipt/0.1': Wire 0.1 path
   - 'interaction-record+jwt' or 'application/interaction-record+jwt': Wire 0.2 path
   - absent: strictness-dependent (Section 16)
4. Strict mode + absent typ: hard error.
5. Interop mode + absent typ: emit typ_missing warning,
   detect version from peac_version payload field, route accordingly.
```

### 15.3 Coherence Check

After routing, implementations MUST verify coherence between the JWS `typ` and the payload `peac_version` field:

- Wire 0.1 route: payload MUST NOT contain `peac_version: "0.2"`.
- Wire 0.2 route: payload MUST contain `peac_version: "0.2"`.

A mismatch produces `E_WIRE_VERSION_MISMATCH`.

### 15.4 Wire 0.1 Preservation

Wire 0.1 (`peac-receipt/0.1`) is FROZEN. All Wire 0.1 schemas, test fixtures, and verification behavior remain unchanged. Wire 0.1 receipts do not gain Wire 0.2 fields or constraints. No new fields, constraints, or semantics will be added to Wire 0.1.

### 15.5 Receipt Reference

The receipt reference (`receipt_ref`) computation is unchanged across wire versions:

```text
receipt_ref = "sha256:" + hex(SHA-256(compact_jws_bytes))
```

Where `compact_jws_bytes` is the UTF-8 encoding of the complete compact JWS string (`header.payload.signature`). The `computeReceiptRef()` function from `@peac/schema` is reused without modification for both Wire 0.1 and Wire 0.2.

---

## 16. Strictness Profiles

Two verification strictness profiles control how tolerant the verifier is of deviations from the normative `typ` requirement.

### 16.1 Strict Profile (Default)

Enforces all normative requirements:

- JWS `typ` MUST be present.
- `typ` MUST be a recognized value (`interaction-record+jwt`, `application/interaction-record+jwt`, or `peac-receipt/0.1`).
- Missing `typ` is a hard verification failure.

Production deployments SHOULD use strict mode.

### 16.2 Interop Profile

Relaxes the `typ` requirement for testing and migration:

- Missing `typ` emits a `typ_missing` warning instead of a hard error.
- Wire version detection falls back to the `peac_version` payload field:
  - `peac_version: "0.2"` routes to Wire 0.2 validation.
  - Absent `peac_version` routes to Wire 0.1 validation.
- An incorrect `typ` value (present but not matching any recognized value) remains a hard error.
- All other constraints remain fully enforced.

### 16.3 Ownership

Strictness is owned exclusively by `@peac/protocol.verifyLocal()`. The `@peac/crypto` layer has no strictness parameter; it decodes the JWS header and returns it as a typed variant without applying strictness decisions. The protocol layer interprets the header variant and applies the appropriate strictness rules.

### 16.4 JWS Header Type Union

The JWS header is represented as a 3-variant discriminated union in `@peac/crypto`:

| Variant            | `typ` Value                | Usage                                     |
| ------------------ | -------------------------- | ----------------------------------------- |
| `Wire01JWSHeader`  | `'peac-receipt/0.1'`       | Wire 0.1 receipts                         |
| `Wire02JWSHeader`  | `'interaction-record+jwt'` | Wire 0.2 receipts                         |
| `UnTypedJWSHeader` | `undefined`                | Missing typ; routed by strictness profile |

Callers narrow the variant by checking `header.typ`.

---

## 17. Standards References

| Standard                                       | Identifier         | Usage in Wire 0.2                                        |
| ---------------------------------------------- | ------------------ | -------------------------------------------------------- |
| JSON Web Signature                             | RFC 7515           | Compact JWS serialization, `typ` header parameter        |
| JSON Web Key                                   | RFC 7517           | Key representation in JWKS                               |
| JWS Unencoded Payload Option                   | RFC 7797           | Explicitly rejected (`b64: false`)                       |
| Edwards-Curve Digital Signature Algorithm      | RFC 8032           | EdDSA (Ed25519) signing and verification                 |
| JWT Best Current Practices                     | RFC 8725           | Embedded key rejection rationale (Section 3.10)          |
| JSON Canonicalization Scheme                   | RFC 8785           | Policy binding digest computation                        |
| Problem Details for HTTP APIs                  | RFC 9457           | Challenge body problem field                             |
| Uniform Resource Identifier                    | RFC 3986           | Issuer canonical form, type grammar (absolute URI)       |
| JSON Pointer                                   | RFC 6901           | Warning pointer field, extension accessor error pointers |
| Media Type Registration                        | RFC 6838           | `interaction-record+jwt` media type structure            |
| Domain Names: Implementation and Specification | RFC 1035           | Extension key DNS label and domain length constraints    |
| UUIDs                                          | RFC 9562           | JTI generation (informational)                           |
| BCP 14 (Key Words)                             | RFC 2119, RFC 8174 | Requirement level language                               |
| Decentralized Identifiers                      | W3C DID Core       | DID-scheme issuer acceptance                             |

---

## Appendix A. Error Codes

Wire 0.2 introduces the following error codes (in addition to existing Wire 0.1 codes). All produce HTTP status 400.

| Code                         | Title                      | Description                                                                                    |
| ---------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| `E_ISS_NOT_CANONICAL`        | Issuer Not Canonical       | `iss` does not conform to canonical form: must be `https://` ASCII origin or `did:` identifier |
| `E_OCCURRED_AT_ON_CHALLENGE` | occurred_at on Challenge   | `occurred_at` is present on a challenge-kind receipt; only permitted on evidence-kind          |
| `E_OCCURRED_AT_FUTURE`       | occurred_at in Future      | `occurred_at` is beyond the tolerance window ahead of the current time                         |
| `E_PILLARS_NOT_SORTED`       | Pillars Not Sorted         | Pillars array is not in ascending lexicographic order or contains duplicates                   |
| `E_POLICY_BINDING_FAILED`    | Policy Binding Failed      | `policy.digest` does not match the computed digest of the provided policy document             |
| `E_WIRE_VERSION_MISMATCH`    | Wire Version Mismatch      | JWS `typ` and `peac_version` indicate different wire versions                                  |
| `E_JWS_EMBEDDED_KEY`         | JWS Embedded Key Rejected  | JWS header contains embedded key material (`jwk`, `x5c`, `x5u`, or `jku`)                      |
| `E_JWS_CRIT_REJECTED`        | JWS crit Header Rejected   | JWS header contains a `crit` field                                                             |
| `E_JWS_MISSING_KID`          | JWS kid Missing or Invalid | JWS `kid` is absent, empty, or exceeds 256 characters                                          |
| `E_JWS_B64_REJECTED`         | JWS b64:false Rejected     | JWS header contains `b64:false` (unencoded payload)                                            |
| `E_JWS_ZIP_REJECTED`         | JWS zip Header Rejected    | JWS header contains a `zip` compression field                                                  |
| `E_INVALID_EXTENSION_KEY`    | Invalid Extension Key      | Extension key does not conform to the `<domain>/<segment>` grammar                             |

---

## Appendix B. Extension Limits Reference

Centralized bounds for Wire 0.2 extension fields, defined in `EXTENSION_LIMITS`:

| Constant                   | Value | Purpose                                            |
| -------------------------- | ----- | -------------------------------------------------- |
| `maxExtensionKeyLength`    | 512   | Maximum extension key string length                |
| `maxDnsLabelLength`        | 63    | Maximum DNS label length (RFC 1035)                |
| `maxDnsDomainLength`       | 253   | Maximum DNS domain length (RFC 1035)               |
| `maxPaymentRailLength`     | 128   | Commerce: payment rail identifier                  |
| `maxCurrencyLength`        | 16    | Commerce: currency code                            |
| `maxAmountMinorLength`     | 64    | Commerce: amount string                            |
| `maxReferenceLength`       | 256   | Commerce: payment reference                        |
| `maxAssetLength`           | 256   | Commerce: asset identifier                         |
| `maxResourceLength`        | 2048  | Access/Challenge: resource identifier              |
| `maxActionLength`          | 256   | Access/Challenge: action identifier                |
| `maxProblemTypeLength`     | 2048  | Challenge: RFC 9457 problem type URI               |
| `maxProblemTitleLength`    | 256   | Challenge: problem title                           |
| `maxProblemDetailLength`   | 4096  | Challenge: problem detail                          |
| `maxProblemInstanceLength` | 2048  | Challenge: problem instance URI                    |
| `maxProofRefLength`        | 256   | Identity: proof reference                          |
| `maxTraceIdLength`         | 32    | Correlation: OpenTelemetry trace ID (exact length) |
| `maxSpanIdLength`          | 16    | Correlation: OpenTelemetry span ID (exact length)  |
| `maxWorkflowIdLength`      | 256   | Correlation: workflow identifier                   |
| `maxParentJtiLength`       | 256   | Correlation: parent JTI                            |
| `maxDependsOnLength`       | 64    | Correlation: max entries in depends_on array       |

---

## Version History

- **0.12.0-preview.1**: Initial Wire 0.2 specification (NORMATIVE PREVIEW). Two structural kinds, open semantic type, 10-pillar taxonomy, canonical issuer form, JOSE hardening, policy binding (JCS + SHA-256, three-state), 5 typed extension groups, RFC 9457 challenge body, 4 warning codes, dual-stack compatibility, strictness profiles.
