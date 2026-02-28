# PEAC Agent Identity Profile Specification

**Status**: NORMATIVE

**Version**: 0.1

**Since**: v0.11.3

**Design Decisions**: DD-142 (ActorBinding), DD-143 (Multi-Root Proof Types), DD-144 (MVIS)

**Companion Spec**: [AGENT-IDENTITY.md](AGENT-IDENTITY.md) (v0.9.25, base agent identity)

---

## 1. Introduction

### 1.1 Purpose

This specification extends the base [AGENT-IDENTITY.md](AGENT-IDENTITY.md) specification with three additions for enterprise and zero trust deployments:

1. **ActorBinding** (DD-142): A structured binding that ties a specific actor identity to a PEAC receipt via `ext["org.peacprotocol/actor_binding"]`
2. **Multi-Root Proof Types** (DD-143): An expanded proof type vocabulary supporting 8 cryptographic and identity proof mechanisms
3. **Minimum Viable Identity Set (MVIS)** (DD-144): Five required fields that constitute a complete identity receipt

These additions are additive to Wire 0.1. All identity data flows through `ext[]` extension slots using reverse-DNS keys per PROFILE_RULES.md. The existing `AgentIdentityAttestation` type and `ProofMethod` enum (4 methods) remain unchanged; the new `ProofType` vocabulary (8 types) is separate.

### 1.2 Scope

This specification covers:

- ActorBinding shape and field semantics
- Eight proof types for multi-root identity verification
- MVIS validation requirements
- Standards alignment (RATS/EAT, Sigstore, SPIFFE, NIST SP 800-63)

This specification does NOT cover:

- Changes to the base `AgentIdentityAttestation` schema (see [AGENT-IDENTITY.md](AGENT-IDENTITY.md))
- Wire format modifications (Wire 0.1 is frozen)
- EAT adapter implementation (deferred to v0.12.0-preview.1; see DD-154)
- Unification of `ProofMethod` and `ProofType` (deferred to v0.12.0)

### 1.3 Requirements Notation

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 (RFC 2119, RFC 8174) when, and only when, they appear in all capitals.

### 1.4 Terminology

| Term | Definition |
| ---- | ---------- |
| **ActorBinding** | Structured object binding an actor identity to a receipt via `ext[]` |
| **MVIS** | Minimum Viable Identity Set: 5 required fields for a complete identity receipt |
| **Proof Type** | Method used to establish actor identity (8-value vocabulary) |
| **Origin** | URL scheme + host + optional port, no path/query/fragment |
| **Fingerprint Reference** | Opaque `sha256:<hex64>` or `hmac-sha256:<hex64>` format string |

---

## 2. ActorBinding (DD-142)

### 2.1 Overview

ActorBinding provides a structured way to bind a specific actor identity to a PEAC receipt. It is carried as an `ext[]` entry with key `org.peacprotocol/actor_binding` in Wire 0.1. In Wire 0.2, ActorBinding is planned to move to a kernel-level field.

### 2.2 Shape

```typescript
interface ActorBinding {
  id: string;            // REQUIRED: Stable actor identifier (1-256 chars, opaque, no PII)
  proof_type: ProofType; // REQUIRED: Identity proof mechanism (from DD-143 vocabulary)
  proof_ref?: string;    // OPTIONAL: URI or hash of external proof artifact (max 2048 chars)
  origin: string;        // REQUIRED: Origin of the identity assertion (origin-only, max 2048 chars)
  intent_hash?: string;  // OPTIONAL: SHA-256 digest of the actor's declared intent (sha256:<64 hex>)
}
```

### 2.3 Field Semantics

#### 2.3.1 `id`

The `id` field is a stable, opaque identifier for the actor. It MUST:

- Be 1 to 256 characters
- Not contain PII (no email addresses, real names, or government identifiers)
- Be stable across sessions for the same actor (enabling correlation within a trust boundary)

Examples: `sa:production-pipeline-v3`, `agent:crawler-prod-001`, `did:web:agent.example`

#### 2.3.2 `proof_type`

The `proof_type` field identifies the mechanism used to establish the actor's identity. See Section 3 for the full vocabulary.

#### 2.3.3 `proof_ref`

The `proof_ref` field is an optional URI or hash pointing to the external proof artifact. This allows verifiers to inspect the underlying proof without embedding it in the receipt.

Examples:

- Certificate chain: `https://ca.example.com/certs/agent-2026.pem`
- EAT token: `sha256:abc123...` (hash of the EAT CBOR)
- Sigstore entry: `https://rekor.sigstore.dev/api/v1/log/entries/abc123`
- DID document: `did:web:agent.example`
- SPIFFE ID: `spiffe://cluster.example/ns/prod/sa/agent-v3`

#### 2.3.4 `origin`

The `origin` field identifies where the identity assertion originates. It MUST be an **origin only**: scheme + host + optional port. No path, query, or fragment.

Valid:
- `https://idp.example.com`
- `https://auth.example.com:8443`

Invalid (implementations MUST reject):
- `https://idp.example.com/api/v1` (contains path)
- `https://idp.example.com?tenant=abc` (contains query)
- `https://idp.example.com#section` (contains fragment)

**Rationale**: Origin-only enforcement prevents correlation leakage through path components and eliminates ambiguity from URL normalization edge cases. Validated by `isOriginOnly()` in `@peac/schema` which parses via `new URL()` and rejects if `pathname !== '/'` or `search` or `hash` are present.

#### 2.3.5 `intent_hash`

The `intent_hash` field is an optional SHA-256 digest of the actor's declared intent, following the hash-first principle (DD-138). Format: `sha256:<64 lowercase hex characters>`.

This enables binding the actor's identity to what they claim to be doing without exposing the raw intent text. Verifiers can compare against a known intent hash without accessing the original text.

### 2.4 Wire Placement

In Wire 0.1, ActorBinding is placed in the `ext[]` array:

```json
{
  "ext": [
    {
      "key": "org.peacprotocol/actor_binding",
      "value": {
        "id": "sa:production-pipeline-v3",
        "proof_type": "spiffe",
        "proof_ref": "spiffe://cluster.example/ns/prod/sa/pipeline-v3",
        "origin": "https://spire.cluster.example"
      }
    }
  ]
}
```

### 2.5 Relationship to AgentIdentityAttestation

ActorBinding and `AgentIdentityAttestation` (from [AGENT-IDENTITY.md](AGENT-IDENTITY.md)) serve complementary purposes:

| Aspect | AgentIdentityAttestation | ActorBinding |
| ------ | ------------------------ | ------------ |
| Scope | Full attestation with proof-of-control | Lightweight identity binding |
| Placement | Dedicated header or `_meta` | Receipt `ext[]` |
| Proof detail | Full signature, binding message | Proof type + optional reference |
| Use case | Real-time request authentication | Receipt-level identity audit trail |
| Schema | `@peac/schema` AgentIdentitySchema | `@peac/schema` ActorBindingSchema |

Both MAY be present simultaneously: an agent authenticates with a full attestation (real-time) and the issuer records an ActorBinding in the receipt (audit trail).

---

## 3. Multi-Root Proof Types (DD-143)

### 3.1 Vocabulary

The `proof_type` field in ActorBinding uses a closed vocabulary of 8 values:

| Proof Type | Standard | Description | Key Discovery |
| ---------- | -------- | ----------- | ------------- |
| `ed25519-cert-chain` | RFC 8032 | Ed25519 certificate chain with trust anchor | Certificate chain validation |
| `eat-passport` | RFC 9711 | EAT Passport (no-fetch, self-contained) | Embedded in EAT |
| `eat-background-check` | RFC 9711 | EAT Background Check (fetch from attester) | Attester endpoint |
| `sigstore-oidc` | Sigstore (Fulcio/Rekor) | OIDC-based ephemeral signing via Sigstore | Rekor transparency log |
| `did` | W3C DID 1.1 | Decentralized Identifier | DID Document resolution |
| `spiffe` | CNCF SPIFFE | SPIFFE Verifiable Identity Document (SVID) | SPIFFE Workload API |
| `x509-pki` | RFC 5280 | Traditional X.509 PKI certificate | Certificate path validation |
| `custom` | (none) | Implementation-defined proof mechanism | Implementation-specific |

### 3.2 Proof Type Descriptions

#### 3.2.1 `ed25519-cert-chain`

Used when the actor's identity is established through an Ed25519 certificate chain rooted at a known trust anchor. The `proof_ref` SHOULD point to the certificate chain (PEM or DER).

Verifiers validate by:
1. Fetching the certificate chain from `proof_ref`
2. Validating the chain to a trusted root
3. Confirming the leaf certificate's public key matches the actor

#### 3.2.2 `eat-passport`

Used when the actor presents a RATS Entity Attestation Token (EAT) in Passport model (RFC 9711). The attester provides a self-contained token that the relying party can verify without contacting the attester.

The `proof_ref` SHOULD be a hash of the EAT CBOR payload (`sha256:<64 hex>`).

**Note**: EAT adapter implementation is deferred to v0.12.0-preview.1 (DD-154). The proof type is defined here for vocabulary completeness.

#### 3.2.3 `eat-background-check`

Used when the actor's identity is verified via the RATS Background Check model (RFC 9711). The relying party contacts the attester to verify the actor's claims.

The `proof_ref` SHOULD be a hash of the EAT CBOR payload or the verifier endpoint URL.

**Note**: EAT adapter implementation is deferred to v0.12.0-preview.1 (DD-154).

#### 3.2.4 `sigstore-oidc`

Used when the actor's identity is established through Sigstore's OIDC-based ephemeral signing flow (Fulcio certificate issuance + Rekor transparency log entry).

The `proof_ref` SHOULD be the Rekor log entry URL or UUID.

Verifiers validate by:
1. Fetching the Rekor entry from `proof_ref`
2. Verifying the Fulcio certificate embedded in the entry
3. Confirming the OIDC identity matches the actor

#### 3.2.5 `did`

Used when the actor's identity is established through a W3C Decentralized Identifier (DID 1.1). The `id` field MAY be the DID itself; the `proof_ref` SHOULD be the DID (e.g., `did:web:agent.example`).

Verifiers validate by:
1. Resolving the DID Document
2. Extracting verification methods
3. Verifying the signature against the resolved key

#### 3.2.6 `spiffe`

Used when the actor's identity is a SPIFFE Verifiable Identity Document (SVID) from a SPIFFE-compatible runtime (SPIRE, Istio, Consul Connect).

The `proof_ref` SHOULD be the SPIFFE ID (e.g., `spiffe://cluster.example/ns/prod/sa/agent`).

Verifiers validate by:
1. Fetching the trust bundle from the SPIFFE Workload API
2. Validating the SVID against the trust bundle
3. Confirming the SPIFFE ID matches the actor

#### 3.2.7 `x509-pki`

Used when the actor's identity is established through a traditional X.509 PKI certificate (RFC 5280). Common in mTLS deployments.

The `proof_ref` SHOULD point to the certificate or certificate chain.

Verifiers validate by:
1. Fetching the certificate from `proof_ref`
2. Validating the certificate path to a trusted CA
3. Checking revocation status (CRL or OCSP)
4. Confirming the subject matches the actor

#### 3.2.8 `custom`

Used for implementation-defined proof mechanisms not covered by the standard vocabulary. The `proof_ref` semantics are implementation-specific.

Implementations using `custom` SHOULD document:
- The proof mechanism in their deployment documentation
- How verifiers discover and validate the proof
- Any interoperability limitations

### 3.3 Extensibility

The proof type vocabulary is **extensible via `registries.json`**: new proof types can be added in future versions. Implementations encountering an unknown `proof_type` value SHOULD treat it as equivalent to `custom` (process the receipt, log a warning) rather than rejecting the receipt.

### 3.4 Relationship to ProofMethod

The existing `ProofMethod` enum in [AGENT-IDENTITY.md](AGENT-IDENTITY.md) (4 methods: `http-message-signature`, `dpop`, `mtls`, `jwk-thumbprint`) describes how an agent proves control of a key in real-time HTTP requests.

The new `ProofType` vocabulary (8 types) describes the trust root mechanism for an actor's identity in receipts.

These are **separate concerns**:

| Concern | Type | Vocabulary | Schema |
| ------- | ---- | ---------- | ------ |
| Request-time proof of key control | `ProofMethod` | 4 methods | `AgentProof.method` |
| Receipt-time identity trust root | `ProofType` | 8 types | `ActorBinding.proof_type` |

Unification of `ProofMethod` and `ProofType` into a single taxonomy is deferred to v0.12.0 as it would be a breaking change to the existing API.

---

## 4. Minimum Viable Identity Set (DD-144)

### 4.1 Overview

The Minimum Viable Identity Set (MVIS) defines the five fields that MUST be present for a receipt to constitute a complete identity assertion. An identity receipt missing any MVIS field is incomplete and MUST be flagged with error code `E_MVIS_INCOMPLETE`.

### 4.2 Required Fields

| Field | Source | Description |
| ----- | ------ | ----------- |
| **issuer** | Receipt `iss` claim | Who issued the identity receipt |
| **subject** | Receipt `sub` claim or `ActorBinding.id` | Who the identity asserts |
| **key_binding** | Receipt JWS header `kid` or `ActorBinding.proof_type` | How the identity is cryptographically bound |
| **time_bounds** | Receipt `iat` (+ optional `exp`) | When the identity assertion is valid |
| **replay_protection** | Receipt `jti` claim | Prevents receipt reuse |

### 4.3 Validation Algorithm

```text
VALIDATE_MVIS(receipt, actor_binding?):

  1. Check issuer:
     IF receipt.iss is absent OR empty:
       RETURN { ok: false, missing: "issuer" }

  2. Check subject:
     IF receipt.sub is absent OR empty:
       IF actor_binding is absent OR actor_binding.id is absent:
         RETURN { ok: false, missing: "subject" }

  3. Check key_binding:
     IF receipt JWS header kid is absent:
       IF actor_binding is absent OR actor_binding.proof_type is absent:
         RETURN { ok: false, missing: "key_binding" }

  4. Check time_bounds:
     IF receipt.iat is absent:
       RETURN { ok: false, missing: "time_bounds" }

  5. Check replay_protection:
     IF receipt.jti is absent OR empty:
       RETURN { ok: false, missing: "replay_protection" }

  6. RETURN { ok: true }
```

### 4.4 Implementation

The `validateMVIS()` function in `@peac/schema` implements this algorithm as a pure validation function with zero I/O (DD-141). It accepts the receipt claims and optional ActorBinding, returning a structured result.

### 4.5 Error Handling

When MVIS validation fails, implementations MUST use error code `E_MVIS_INCOMPLETE` with the `missing` field indicating which MVIS field is absent. This error is:

- Category: `identity`
- Retryable: `false`
- Next action: `retry_with_different_input`
- HTTP status: `400`

### 4.6 MVIS and Profiles

MVIS applies to **any receipt that includes identity information**, regardless of which ZT sub-profile is used. If a receipt contains an `org.peacprotocol/actor_binding` extension, MVIS validation SHOULD be performed.

MVIS does NOT apply to receipts without identity extensions. A commerce receipt or access receipt without identity binding is valid without satisfying MVIS.

---

## 5. Standards Alignment

### 5.1 RATS Entity Attestation Tokens (RFC 9711)

PEAC ActorBinding supports both RATS attestation models:

| RATS Model | PEAC Proof Type | Data Flow |
| ---------- | --------------- | --------- |
| Passport | `eat-passport` | Attester -> Agent -> Relying Party (self-contained token) |
| Background Check | `eat-background-check` | Agent -> Relying Party -> Verifier (fetch from attester) |

**EAT errata tracking**: RFC 9711 was published January 2025. Known errata affecting PEAC integration are tracked in the EAT adapter design (DD-154, deferred to v0.12.0-preview.1).

**CBOR dependency**: EAT tokens use CBOR Wire format (RFC 8949) and COSE signing (RFC 9052). The EAT adapter will add `@peac/adapter-eat` with CBOR dependencies at v0.12.0-preview.1.

### 5.2 Sigstore OIDC Integration

Sigstore provides ephemeral code signing based on OIDC identity:

1. Agent authenticates via OIDC provider (GitHub, Google, etc.)
2. Fulcio issues an ephemeral certificate binding the OIDC identity
3. Agent signs the receipt content
4. Signature + certificate recorded in Rekor transparency log

ActorBinding with `proof_type: "sigstore-oidc"` records this flow. The `proof_ref` links to the Rekor entry for auditability.

**Security note**: Sigstore OIDC identity is tied to the OIDC provider's trust. The OIDC provider is the trust root, not Sigstore itself.

### 5.3 NIST SP 800-63 Digital Identity Guidelines

PEAC MVIS fields map to NIST SP 800-63 identity assurance levels:

| NIST Concept | MVIS Field | PEAC Implementation |
| ------------ | ---------- | ------------------- |
| Identity Proofing (IAL) | `key_binding` via `proof_type` | Proof type indicates assurance level |
| Authentication (AAL) | `key_binding` + `time_bounds` | Cryptographic binding with temporal validity |
| Federation (FAL) | `issuer` + `origin` | Issuer origin identifies the federation endpoint |

PEAC does not mandate specific IAL/AAL/FAL levels. Deployments choose proof types appropriate to their assurance requirements. Higher assurance deployments SHOULD prefer `x509-pki` or `ed25519-cert-chain` over `custom`.

### 5.4 CNCF SPIFFE

SPIFFE (Secure Production Identity Framework for Everyone) provides workload identity in cloud-native environments:

- SPIFFE IDs: `spiffe://<trust-domain>/<workload-identifier>`
- SVIDs: X.509 or JWT documents carrying the SPIFFE ID
- Trust bundles: Root certificates per trust domain

ActorBinding with `proof_type: "spiffe"` maps directly:

| SPIFFE Concept | ActorBinding Field |
| -------------- | ------------------ |
| SPIFFE ID | `id` or `proof_ref` |
| Trust domain | Extracted from `origin` |
| SVID type | Implicit in `proof_type: "spiffe"` |

### 5.5 W3C Decentralized Identifiers (DID 1.1)

DID provides a URI scheme for self-sovereign identity:

- DID syntax: `did:<method>:<method-specific-id>`
- DID Document: JSON-LD document with verification methods
- DID Resolution: Method-specific resolution to obtain the DID Document

ActorBinding with `proof_type: "did"` supports any DID method. The `proof_ref` SHOULD be the DID itself; resolution is method-specific.

### 5.6 RFC 5280 X.509 PKI

Traditional X.509 PKI certificates remain widely deployed in enterprise environments. ActorBinding with `proof_type: "x509-pki"` supports:

- mTLS client certificates
- Code signing certificates
- Enterprise CA-issued certificates

Verifiers MUST check certificate validity, path constraints, and revocation status per RFC 5280.

---

## 6. Security Considerations

### 6.1 Origin-Only Enforcement

The `origin` field in ActorBinding MUST be origin-only (scheme + host + optional port). This prevents:

- **Correlation leakage**: Path components could reveal tenant IDs, user sessions, or internal API structure
- **Normalization ambiguity**: Paths introduce URL normalization edge cases (`/api/v1` vs `/api/v1/` vs `/api//v1`)
- **Scope expansion**: An origin identifies a trust boundary; paths subdivide it unnecessarily

### 6.2 Opaque Identifiers

The `id` field MUST be opaque and MUST NOT contain PII. Implementations SHOULD use:

- Service account identifiers: `sa:pipeline-prod-v3`
- Agent identifiers: `agent:crawler-001`
- DID identifiers: `did:web:agent.example`
- Prefixed opaque tokens: `usr:sha256-truncated-hash`

### 6.3 Proof Reference Safety

The `proof_ref` field may contain URLs. Implementations MUST:

- Validate URL scheme (HTTPS only for URLs; `did:`, `spiffe:`, and `sha256:` schemes are also valid)
- Enforce maximum length (2048 characters)
- NOT automatically fetch `proof_ref` URLs during receipt verification (DD-55, DD-135)
- Treat `proof_ref` as a locator hint, not an implicit fetch trigger

### 6.4 Credential Reference Opacity

The `credential_ref` field in the credential event extension uses opaque fingerprint references (`sha256:<hex64>` or `hmac-sha256:<hex64>`). The schema validates format only. Issuers compute values externally; verifiers MUST NOT assume they can recompute the reference (DD-146).

### 6.5 MVIS and Minimal Disclosure

MVIS requires five fields; it does not require full identity disclosure. The `subject` field can be satisfied by an opaque `ActorBinding.id`. The `key_binding` field can be satisfied by `proof_type` alone (no `proof_ref` required). This supports minimal disclosure while ensuring identity completeness.

---

## 7. Conformance

### 7.1 Issuer Conformance

An issuer producing identity-bound receipts MUST:

1. Include a valid `org.peacprotocol/actor_binding` extension in `ext[]`
2. Use a `proof_type` from the 8-value vocabulary (Section 3.1)
3. Set `origin` to an origin-only value (no path/query/fragment)
4. Satisfy MVIS requirements if the receipt is intended as an identity assertion

### 7.2 Verifier Conformance

A verifier processing identity-bound receipts MUST:

1. Parse `org.peacprotocol/actor_binding` from `ext[]`
2. Validate the `origin` field is origin-only
3. Accept all 8 proof types without error (even if verification of the underlying proof is not implemented)
4. Perform MVIS validation when the receipt contains an ActorBinding

### 7.3 Schema Conformance

The `ActorBindingSchema`, `ProofTypeSchema`, and `MVISFieldsSchema` in `@peac/schema` provide runtime validation. Conformance fixtures are located in `specs/conformance/fixtures/agent-identity/`.

Required fixtures (one per proof type):

| Fixture | Proof Type |
| ------- | ---------- |
| `valid-ed25519-cert-chain.json` | `ed25519-cert-chain` |
| `valid-eat-passport.json` | `eat-passport` |
| `valid-eat-background-check.json` | `eat-background-check` |
| `valid-sigstore-oidc.json` | `sigstore-oidc` |
| `valid-did.json` | `did` |
| `valid-spiffe.json` | `spiffe` |
| `valid-x509-pki.json` | `x509-pki` |
| `valid-custom.json` | `custom` |

Negative fixtures:

| Fixture | Violation |
| ------- | --------- |
| `invalid-mvis-missing-key-binding.json` | Missing key_binding MVIS field |
| `invalid-origin-with-path.json` | Origin contains path component |

---

## 8. Examples

### 8.1 SPIFFE Identity Binding

```json
{
  "iss": "https://gateway.example.com",
  "sub": "agent:data-pipeline-v3",
  "iat": 1709000000,
  "jti": "id_01HQXYZ123456789",
  "peac": {
    "wire_type": "peac-receipt/0.1",
    "wire_version": "0.1",
    "auth": {
      "control": {
        "chain": [
          {
            "engine_type": "spiffe",
            "engine_id": "spire-server-v1",
            "result": "allow",
            "reason": "SVID validated against trust bundle"
          }
        ],
        "decision": "allow",
        "combinator": "any_can_veto"
      }
    }
  },
  "ext": [
    {
      "key": "org.peacprotocol/actor_binding",
      "value": {
        "id": "sa:data-pipeline-v3",
        "proof_type": "spiffe",
        "proof_ref": "spiffe://cluster.example/ns/prod/sa/data-pipeline-v3",
        "origin": "https://spire.cluster.example"
      }
    }
  ]
}
```

### 8.2 Sigstore OIDC Ephemeral Signing

```json
{
  "iss": "https://ci.example.com",
  "sub": "agent:release-pipeline",
  "iat": 1709000000,
  "jti": "id_01HQABC987654321",
  "peac": {
    "wire_type": "peac-receipt/0.1",
    "wire_version": "0.1"
  },
  "ext": [
    {
      "key": "org.peacprotocol/actor_binding",
      "value": {
        "id": "ci:release-pipeline-main",
        "proof_type": "sigstore-oidc",
        "proof_ref": "https://rekor.sigstore.dev/api/v1/log/entries/24296fb24b8ad77a123456",
        "origin": "https://ci.example.com",
        "intent_hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
      }
    }
  ]
}
```

### 8.3 Minimal Identity Receipt (MVIS Satisfied)

```json
{
  "iss": "https://api.example.com",
  "sub": "agent:assistant-v2",
  "iat": 1709000000,
  "jti": "id_01HQDEF456789012",
  "peac": {
    "wire_type": "peac-receipt/0.1",
    "wire_version": "0.1"
  },
  "ext": [
    {
      "key": "org.peacprotocol/actor_binding",
      "value": {
        "id": "agent:assistant-v2",
        "proof_type": "custom",
        "origin": "https://api.example.com"
      }
    }
  ]
}
```

MVIS check:
- issuer: `iss` = `https://api.example.com`
- subject: `sub` = `agent:assistant-v2`
- key_binding: `proof_type` = `custom`
- time_bounds: `iat` = `1709000000`
- replay_protection: `jti` = `id_01HQDEF456789012`

All five fields present; MVIS satisfied.

---

## 9. Migration Path

### 9.1 From AgentIdentityAttestation to ActorBinding

Existing systems using `AgentIdentityAttestation` (v0.9.25) can adopt ActorBinding incrementally:

1. **Phase 1**: Add `org.peacprotocol/actor_binding` to receipts alongside existing attestation headers
2. **Phase 2**: Map existing `ProofMethod` to the closest `ProofType`:

| ProofMethod (existing) | ProofType (new) |
| ---------------------- | --------------- |
| `http-message-signature` | `ed25519-cert-chain` or `custom` |
| `dpop` | `custom` |
| `mtls` | `x509-pki` |
| `jwk-thumbprint` | `ed25519-cert-chain` |

3. **Phase 3**: At v0.12.0, unified taxonomy replaces both vocabularies

### 9.2 From No Identity to MVIS

Systems that do not currently include identity information in receipts can adopt MVIS by:

1. Ensure receipts already have `iss`, `sub`, `iat`, and `jti` (standard JWT claims)
2. Add `org.peacprotocol/actor_binding` extension with appropriate `proof_type`
3. Run `validateMVIS()` to confirm completeness

---

## 10. Version History

| Version | Date | Changes |
| ------- | ---- | ------- |
| 0.1 | 2026-03-01 | Initial specification (DD-142, DD-143, DD-144) |

---

## 11. References

- BCP 14 (RFC 2119, RFC 8174): Key words for use in RFCs
- RFC 5280: Internet X.509 Public Key Infrastructure Certificate and CRL Profile
- RFC 8032: Edwards-Curve Digital Signature Algorithm (EdDSA)
- RFC 8949: Concise Binary Object Representation (CBOR)
- RFC 9052: CBOR Object Signing and Encryption (COSE)
- RFC 9711: Entity Attestation Token (EAT)
- W3C DID 1.1: Decentralized Identifiers
- CNCF SPIFFE: Secure Production Identity Framework for Everyone
- Sigstore: Software Supply Chain Security (Fulcio, Rekor)
- NIST SP 800-63: Digital Identity Guidelines
- NIST SP 800-207: Zero Trust Architecture
- [AGENT-IDENTITY.md](AGENT-IDENTITY.md): Base Agent Identity Specification
- [ZERO-TRUST-PROFILE-PACK.md](ZERO-TRUST-PROFILE-PACK.md): Zero Trust Profile Pack
- [KEY-ROTATION.md](KEY-ROTATION.md): Key Rotation Lifecycle
- [PROTOCOL-BEHAVIOR.md](PROTOCOL-BEHAVIOR.md): Protocol Behavior Specification
- [EVIDENCE-CARRIER-CONTRACT.md](EVIDENCE-CARRIER-CONTRACT.md): Evidence Carrier Contract
