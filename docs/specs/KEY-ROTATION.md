# PEAC Key Rotation Lifecycle Specification

**Version:** 0.11.3
**Status:** Normative
**Design Decision:** DD-148

## 1. Purpose

This specification defines the normative key management lifecycle for PEAC receipt signing keys.
It covers rotation, deprecation, retirement, emergency revocation, kid reuse prevention, and
Cache-Control coordination. The lifecycle aligns with NIST SP 800-57 key management stages.

## 2. Key Lifecycle States

```
                     +----------+
                     | PENDING  |
                     +----+-----+
                          |
                     activate
                          |
                     +----v-----+
          +--------->|  ACTIVE  |<---------+
          |          +----+-----+          |
          |               |                |
          |          deprecate        (emergency)
          |               |           revoke
          |          +----v--------+   |
          |          | DEPRECATED  |   |
          |          +----+--------+   |
          |               |            |
          |            retire          |
          |               |            |
          |          +----v-----+  +---v-----+
          |          | RETIRED  |  | REVOKED |
          |          +----------+  +---------+
          |
     (re-activate: NOT RECOMMENDED)
```

### 2.1 State Definitions

| State      | Description                                                       | Key in JWKS? | Signs new receipts? |
| ---------- | ----------------------------------------------------------------- | ------------ | ------------------- |
| PENDING    | Key generated, not yet deployed                                   | No           | No                  |
| ACTIVE     | Key deployed and signing receipts                                 | Yes          | Yes                 |
| DEPRECATED | Key still verifiable but no longer signs new receipts             | Yes          | No                  |
| RETIRED    | Key removed from JWKS after overlap period                        | No           | No                  |
| REVOKED    | Key removed due to compromise or emergency (branches from ACTIVE) | No           | No                  |

### 2.2 Transitions

- PENDING -> ACTIVE: Key published in JWKS, begins signing.
- ACTIVE -> DEPRECATED: New key activated; old key stops signing but remains in JWKS for verification.
- DEPRECATED -> RETIRED: Overlap period elapsed; key removed from JWKS.
- ACTIVE -> REVOKED: Emergency revocation; key immediately removed from JWKS and added to `revoked_keys[]`.

Re-activating a RETIRED or REVOKED key is NOT RECOMMENDED.
Issuers that must re-activate a RETIRED key MUST use a new kid.

## 3. Overlap Period

Issuers MUST maintain a minimum overlap period of **30 days** between key deprecation and retirement.
During the overlap period, both the new ACTIVE key and the old DEPRECATED key are present in the JWKS.

This ensures that:

- Verifiers with cached JWKS can still verify receipts signed with the old key.
- Consumers relying on longer cache lifetimes are not broken.
- Dispute resolution timelines (which may extend 90-180 days) have adequate key availability.

For payment dispute contexts, issuers SHOULD extend the overlap to 90-180 days.
For audit trail contexts, issuers SHOULD extend retention to 1-7 years (keys may be served
from archival JWKS endpoints rather than the primary JWKS).

## 4. Cache-Control Coordination

The `Cache-Control: max-age` value on the JWKS HTTP response MUST be less than or equal to the
rotation overlap period. This prevents verifiers from caching a JWKS response that outlives
the overlap window.

```
max-age <= overlap_period_seconds
```

For a 30-day overlap: `max-age` MUST be <= 2,592,000 seconds.

Issuers SHOULD set `max-age` to a value that balances freshness against verification latency.
A typical value is 86400 (24 hours).

## 5. JWKS Rollover Procedure

1. **Generate new key** in PENDING state.
2. **Add new key to JWKS** (state: ACTIVE). Old key remains (state: DEPRECATED).
3. **Wait for propagation**: at least `max-age` seconds for caches to refresh.
4. **Switch signing** to new key. Old key is now DEPRECATED (verification only).
5. **Wait for overlap period** (>= 30 days).
6. **Remove old key** from JWKS (state: RETIRED).

## 6. Emergency Revocation

When a key is compromised:

1. **Immediately remove** the key from the JWKS endpoint.
2. **Add the key** to the `revoked_keys[]` array in `peac-issuer.json`.
3. **Generate and deploy** a replacement key.
4. **Notify** affected parties via `security_contact`.

The `revoked_keys[]` array in `peac-issuer.json` has the following element shape:

```json
{
  "kid": "key-compromised-001",
  "revoked_at": "2026-02-28T12:00:00Z",
  "reason": "key_compromise"
}
```

### 6.1 Revocation Reasons

Reason values are aligned with RFC 5280 CRLReason subset (only values meaningful for
receipt signing keys):

| Reason                   | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `key_compromise`         | Private key material has been compromised      |
| `superseded`             | Key replaced by a newer key (planned rotation) |
| `cessation_of_operation` | Issuer ceasing operations                      |
| `privilege_withdrawn`    | Key no longer authorized to sign receipts      |

The `reason` field is OPTIONAL. When omitted, the reason is unspecified.

### 6.2 Revoked Keys Limits

The `revoked_keys[]` array MUST NOT exceed 100 entries. Issuers SHOULD periodically
prune entries older than their retention policy (see Section 3).

## 7. Kid Reuse Prevention

### 7.1 Normative Requirement

A `kid` value MUST be treated as permanently bound to a specific key (the `x` coordinate
for Ed25519 keys). Re-using a `kid` for a different key within the retention window is
a protocol violation.

### 7.2 Tiered Enforcement

**Stateful resolvers** (those maintaining key history, such as JWKS caches):

- MUST reject when `(iss, kid)` maps to a different key thumbprint within the retention window.
- MUST raise error code `E_KID_REUSE_DETECTED`.

**Stateless verifiers** (those without key history):

- SHOULD warn `kid_reuse_not_verifiable` when they cannot verify kid uniqueness.
- MUST NOT hard-fail (they cannot detect kid reuse).

This tiered approach avoids asserting a MUST that some deployments cannot satisfy.

### 7.3 Retention Window

The kid-to-thumbprint mapping MUST be retained for at least the overlap period (30 days minimum).
Resolvers MAY extend retention to match their audit trail requirements.

## 8. Issuer Configuration: `revoked_keys[]`

The `peac-issuer.json` configuration file supports an optional `revoked_keys` array:

```json
{
  "version": "peac-issuer/0.1",
  "issuer": "https://issuer.example.com",
  "jwks_uri": "https://issuer.example.com/.well-known/jwks.json",
  "algorithms": ["EdDSA"],
  "revoked_keys": [
    {
      "kid": "key-2025-compromised",
      "revoked_at": "2025-12-15T08:30:00Z",
      "reason": "key_compromise"
    }
  ]
}
```

Verifiers MUST check the `revoked_keys[]` array before accepting a receipt signature.
If the receipt's `kid` appears in `revoked_keys[]`, verification MUST fail with reason
`key_revoked`.

## 9. NIST SP 800-57 Alignment

| NIST Phase               | PEAC State    | Duration                           |
| ------------------------ | ------------- | ---------------------------------- |
| Pre-activation           | PENDING       | Until deployment                   |
| Active                   | ACTIVE        | Issuer-defined (typically 90 days) |
| Deactivated (Protection) | DEPRECATED    | >= 30 days (overlap)               |
| Deactivated (Processing) | RETIRED       | Archival only                      |
| Compromised              | REVOKED       | Permanent                          |
| Destroyed                | (not modeled) | N/A                                |

## 10. Conformance

### 10.1 Issuer Requirements

- MUST maintain >= 30 day overlap between key deprecation and retirement.
- MUST set `Cache-Control: max-age` on JWKS response to <= overlap period.
- MUST immediately remove compromised keys from JWKS.
- MUST add compromised keys to `revoked_keys[]` in `peac-issuer.json`.
- MUST NOT reuse a `kid` for a different key.

### 10.2 Verifier Requirements

- MUST check `revoked_keys[]` before accepting a receipt signature.
- Stateful resolvers MUST detect and reject kid reuse (`E_KID_REUSE_DETECTED`).
- Stateless verifiers SHOULD warn when kid uniqueness cannot be verified.

### 10.3 Conformance Fixtures

See `specs/conformance/fixtures/key-rotation/key-rotation.json` for test vectors covering:

- Normal rotation (30-day overlap)
- Emergency revocation
- Overlap validation
- Stale cache coordination
- Kid reuse rejection
- Cache-based kid reuse detection

## 11. Security Considerations

- **Key compromise window**: The overlap period means receipts signed with a compromised key
  may be accepted for up to 30 days after the key is deprecated (but before revocation).
  Emergency revocation addresses this by immediately invalidating the key.
- **Kid reuse attacks**: An attacker who gains temporary control of an issuer's JWKS endpoint
  could publish a key with an existing kid. Kid reuse detection prevents this from persisting
  beyond a single cache cycle for stateful verifiers.
- **Revocation list size**: The 100-entry limit on `revoked_keys[]` prevents denial-of-service
  via an unbounded revocation list. Issuers SHOULD prune old entries.

## 12. References

- NIST SP 800-57 Part 1: Recommendation for Key Management
- RFC 5280: Internet X.509 Public Key Infrastructure Certificate and CRL Profile
- RFC 7517: JSON Web Key (JWK)
- RFC 8032: Edwards-Curve Digital Signature Algorithm (EdDSA)
