# PEAC Proof Capture Profile: RFC 9421 HTTP Message Signatures

**Status:** Informational
**Version:** 0.1
**Extension Key:** `org.peacprotocol/rfc9421-proof@0.1`
**Introduced in:** 0.10.12

---

## 1. Overview

This profile specifies how PEAC receipts capture the result of verifying
an RFC 9421 HTTP Message Signature. The proof is stored as an extension
on an `http.request` interaction evidence record.

The profile does NOT define how to perform RFC 9421 signing or verification --
that is the responsibility of the transport layer. It defines the structure
for recording the verification outcome in a receipt so that auditors can
assess whether the HTTP request was cryptographically authenticated.

## 2. Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
BCP 14 [RFC 2119] [RFC 8174] when, and only when, they appear in all
capitals, as shown here.

- **Proof:** The verification result of an RFC 9421 HTTP Message Signature.
- **Covered components:** The ordered list of HTTP message component
  identifiers that were included in the signature base string.
- **Signature base:** The canonical string constructed from covered
  components per RFC 9421 Section 2.5, used as input to the signing algorithm.

## 3. Extension Location

The proof MUST be stored in the interaction evidence extensions block:

```text
evidence.extensions["org.peacprotocol/interaction@0.1"].extensions["org.peacprotocol/rfc9421-proof@0.1"]
```

The parent interaction MUST have `kind: "http.request"`.

## 4. Extension Structure

### 4.1 Required Fields

| Field                | Type     | Description                                                    |
| -------------------- | -------- | -------------------------------------------------------------- |
| `result`             | string   | Verification outcome: `verified`, `failed`, or `unavailable`   |
| `reason`             | string   | Machine-readable reason code (see Section 5)                   |
| `covered_components` | string[] | Ordered list of component identifiers from `@signature-params` |

### 4.2 Optional Fields

| Field                   | Type    | Description                                                       |
| ----------------------- | ------- | ----------------------------------------------------------------- |
| `label`                 | string  | Signature label from the `Signature` header (e.g., `sig1`)        |
| `alg`                   | string  | Signing algorithm from the signature parameters (e.g., `ed25519`) |
| `keyid`                 | string  | Key identifier from the signature parameters                      |
| `created`               | integer | Unix timestamp (seconds) from the `created` parameter             |
| `expires`               | integer | Unix timestamp (seconds) from the `expires` parameter             |
| `nonce`                 | string  | Nonce value from the signature parameters (if present)            |
| `canonical_base_sha256` | string  | SHA-256 hex digest of the signature base string                   |
| `verified_at`           | string  | ISO 8601 timestamp when verification was performed                |

### 4.3 Example

```json
{
  "interaction_id": "gateway:req_abc123",
  "kind": "http.request",
  "executor": {
    "platform": "api-gateway"
  },
  "resource": {
    "uri": "https://api.example.com/v1/payments",
    "method": "POST"
  },
  "started_at": "2026-02-15T10:00:00Z",
  "completed_at": "2026-02-15T10:00:00.050Z",
  "result": {
    "status": "ok"
  },
  "extensions": {
    "org.peacprotocol/rfc9421-proof@0.1": {
      "result": "verified",
      "reason": "sig_valid",
      "covered_components": [
        "@method",
        "@authority",
        "@request-target",
        "content-digest",
        "content-type"
      ],
      "label": "sig1",
      "alg": "ed25519",
      "keyid": "key-2026-02",
      "created": 1739613600,
      "expires": 1739614200,
      "canonical_base_sha256": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
    }
  }
}
```

## 5. Reason Codes

| Code                  | Result        | Description                                                        |
| --------------------- | ------------- | ------------------------------------------------------------------ |
| `sig_valid`           | `verified`    | Signature verified successfully                                    |
| `sig_expired`         | `failed`      | Signature `expires` timestamp is in the past                       |
| `sig_future`          | `failed`      | Signature `created` timestamp is in the future (beyond clock skew) |
| `sig_key_not_found`   | `unavailable` | Key referenced by `keyid` could not be resolved                    |
| `sig_alg_unsupported` | `failed`      | Signing algorithm is not supported by the verifier                 |
| `sig_base_mismatch`   | `failed`      | Signature base reconstruction did not match (tampered message)     |

### 5.1 Result-Reason Invariants

- `result: "verified"` MUST use reason `sig_valid`.
- `result: "failed"` MUST use one of: `sig_expired`, `sig_future`,
  `sig_alg_unsupported`, `sig_base_mismatch`.
- `result: "unavailable"` MUST use reason `sig_key_not_found`.

Implementations MAY define additional reason codes using reverse-DNS
prefixes (e.g., `com.example.custom_reason`). Unknown reason codes
MUST NOT cause verification to fail.

## 6. Privacy Requirements

### 6.1 Covered Components Are Names Only

The `covered_components` array MUST contain only component identifiers
(e.g., `@method`, `content-digest`), NEVER actual header values.

### 6.2 No Raw Header Values

Raw HTTP header values MUST NOT appear anywhere in the proof extension.
If the verifier needs to record the content that was signed, it SHOULD
use `canonical_base_sha256` (a SHA-256 hash of the signature base string)
rather than the base string itself.

### 6.3 Keyid Opacity

The `keyid` field is an opaque identifier. Implementations MUST NOT
embed secret material, session tokens, or personally identifiable
information in the key identifier.

## 7. Verification State Mapping

The three-state result model aligns with the PEAC policy binding
verification model (DD-49):

| Proof Result  | Meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| `verified`    | Signature was checked and is cryptographically valid           |
| `failed`      | Signature was checked and is invalid or expired                |
| `unavailable` | Signature could not be verified (key not found, input missing) |

A `failed` result indicates a definite problem. An `unavailable` result
indicates the verifier lacked the information to make a determination --
it is NOT equivalent to failure.

## 8. Normative Requirements

### 8.1 Issuers

1. Issuers MUST set `result` to exactly one of `verified`, `failed`, or `unavailable`.
2. Issuers MUST populate `covered_components` with the component identifiers
   from the `@signature-params` structured field.
3. Issuers SHOULD populate `alg`, `keyid`, `created`, and `expires` when
   available from the signature parameters.
4. Issuers MUST NOT include raw HTTP header values in the proof extension.
5. Issuers SHOULD include `canonical_base_sha256` when `result` is `verified`
   to enable future re-verification.

### 8.2 Verifiers (Receipt Consumers)

1. Verifiers MUST accept all three result values without treating `unavailable`
   as equivalent to `failed`.
2. Verifiers MUST ignore unknown reason codes (forward compatibility).
3. Verifiers SHOULD check that `result` and `reason` are consistent per
   the invariants in Section 5.1.

## 9. Security Considerations

### 9.1 Replay Protection

This profile records proof of verification at a point in time. The receipt
itself does not provide replay protection for the underlying HTTP request.
Consumers requiring replay protection SHOULD check the `nonce` field and
maintain their own nonce registry.

### 9.2 Clock Skew

Implementations verifying `created` and `expires` timestamps SHOULD
allow a clock skew tolerance of up to 60 seconds. The `verified_at`
timestamp (if present) records when the verification occurred, allowing
auditors to assess whether clock skew was a factor.

### 9.3 Proof Is Issuer-Observed

Per DD-33 and DD-50, the proof result is an issuer assertion about what
the issuer observed during verification. It is NOT ground truth. A receipt
claiming `result: "verified"` means the issuer's verification code returned
success -- it does not guarantee the signature was valid from all perspectives.

## 10. References

- [RFC 9421] HTTP Message Signatures
- [RFC 8941] Structured Field Values for HTTP
- [RFC 2119] Key words for use in RFCs to Indicate Requirement Levels
- [RFC 8174] Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words
