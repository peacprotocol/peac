# PEAC Issuer Operations Baseline (NORMATIVE)

Status: NORMATIVE
Version: 0.1
Last-Updated: 2026-02-05

This document defines the operational baseline for PEAC receipt issuers, including key management, discovery, rotation, and incident response.

## 1. Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119 and RFC 8174.

## 2. Key requirements

### 2.1 Algorithm

- Issuers MUST support Ed25519 (EdDSA, RFC 8032) for signing
- Issuers MAY additionally support ES256 (ECDSA with P-256) for interoperability
- Issuers MUST NOT use RSA or other algorithms for PEAC receipts
- Ed25519 key size: 256 bits (32 bytes) for private key, 256 bits for public key

**Recommendation**: Use Ed25519 as the default. ES256 is permitted for environments where Ed25519 is not available (e.g., some HSMs, legacy integrations).

### 2.2 Key generation

- Issuers MUST use cryptographically secure random number generators
- Issuers MUST NOT derive signing keys from passwords or low-entropy sources
- Issuers SHOULD generate keys in secure environments (HSM, secure enclave, or equivalent)

### 2.3 Key storage

| Environment | Recommended Storage                  |
| ----------- | ------------------------------------ |
| Production  | HSM, KMS (AWS/GCP/Azure), or Vault   |
| Staging     | KMS or encrypted secrets             |
| Development | Local encrypted file (not committed) |

Private keys MUST NOT be:

- Committed to source control
- Logged or printed
- Transmitted over unencrypted channels
- Stored in environment variables in plain text (use secret references)

## 3. Key ID (kid) conventions

### 3.1 Format

The `kid` claim MUST uniquely identify the signing key within the issuer's key set.

Recommended formats:

- Date-based: `prod-2026-02`, `staging-2026-Q1`
- UUID: `550e8400-e29b-41d4-a716-446655440000`
- Fingerprint: `sha256:2c1a9b8e7d6c5b4a3f2e1d0c9b8a7f6e` (truncated)

### 3.2 Requirements

- `kid` MUST be unique per key within the issuer's JWKS
- `kid` SHOULD be stable (never reused for different keys)
- `kid` SHOULD be human-readable for operational debugging
- `kid` MUST NOT contain secrets or sensitive information

### 3.3 Example

```json
{
  "kty": "OKP",
  "crv": "Ed25519",
  "kid": "prod-2026-02",
  "x": "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo"
}
```

## 4. Key discovery

### 4.1 Discovery endpoint

Issuers MUST publish public keys at:

```
https://<issuer-origin>/.well-known/peac-issuer.json
```

### 4.2 JWKS format

The discovery endpoint MUST return a JWKS (RFC 7517):

```json
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "kid": "prod-2026-02",
      "x": "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
      "use": "sig",
      "key_ops": ["verify"]
    },
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "kid": "prod-2026-01",
      "x": "WPexQO7IqCdyJJAhCa2lXt6Rz8F8ZJLLqCxnN7TuFLc",
      "use": "sig",
      "key_ops": ["verify"]
    }
  ]
}
```

### 4.3 HTTP requirements

| Header                        | Recommended Value              |
| ----------------------------- | ------------------------------ |
| `Content-Type`                | `application/json`             |
| `Cache-Control`               | `public, max-age=3600`         |
| `Access-Control-Allow-Origin` | `*` (for browser verification) |

### 4.4 Availability

- Discovery endpoint MUST be highly available
- Issuers SHOULD use CDN for global distribution
- Issuers SHOULD monitor endpoint health

## 5. Key rotation

### 5.1 Rotation cadence

| Environment   | Recommended Rotation |
| ------------- | -------------------- |
| Production    | 90 days              |
| High-security | 30 days              |
| Development   | As needed            |

### 5.2 Rotation process

```
Day 0: Generate new key pair
       Add new public key to JWKS

Day 1: Begin signing with new key
       Keep old public key in JWKS

Day 30: Grace period (old key still in JWKS)
        Old receipts still verifiable

Day 31: Remove old public key from JWKS
        Old receipts may become unverifiable*
```

\*Note: Receipts verified offline with bundled keys remain verifiable.

### 5.3 Overlap requirements

- Issuers MUST maintain at least 30 days of key overlap
- Both old and new public keys MUST be in JWKS during overlap
- Issuers SHOULD sign with new key as soon as it's added

### 5.4 Retention policy alignment

Key overlap duration SHOULD align with your receipt retention and dispute resolution requirements:

| Use Case                   | Recommended Key Retention | Rationale                         |
| -------------------------- | ------------------------- | --------------------------------- |
| Real-time API verification | 30 days minimum           | Standard rotation overlap         |
| Payment disputes           | 90-180 days               | Credit card chargeback windows    |
| Audit compliance           | 1-7 years                 | Regulatory retention requirements |
| Long-term evidence         | Indefinite or archived    | Legal hold scenarios              |

**Guidance:**

- If receipts may be verified after 30 days (e.g., dispute resolution), extend key overlap accordingly
- For long-term verification needs, maintain a **key archive** separate from active JWKS
- Key archive MAY be published at `/.well-known/peac-issuer-archive.json` for historical verification
- Alternatively, bundle keys with receipts for offline verification (see TRUST-PINNING-POLICY.md)

**Example: Payment provider with 180-day dispute window:**

```text
Day 0:    Generate key K2, add to JWKS alongside K1
Day 1:    Begin signing with K2
Day 90:   Generate key K3, add to JWKS
Day 91:   Begin signing with K3
Day 180:  Remove K1 from JWKS (K1 receipts now 180 days old)
          K2 still in JWKS for another 90 days
```

### 5.5 Key retirement

When removing a key from JWKS:

- Issuers SHOULD announce retirement in advance (if possible)
- Issuers MUST NOT reuse the same `kid` for a different key
- Issuers MAY maintain an archive of retired keys for audit purposes

## 6. Incident response

### 6.1 Key compromise

If a private key is compromised:

**Immediate (within 1 hour):**

1. Remove compromised public key from JWKS
2. Generate new key pair
3. Add new public key to JWKS
4. Begin signing with new key
5. Alert security team

**Within 24 hours:**

1. Document incident (when discovered, scope of exposure)
2. Notify affected parties if required
3. Review access logs for unauthorized use
4. Update key management procedures if needed

**Verification behavior:**

- Receipts signed by compromised key become unverifiable (by design)
- This is the correct behavior -- compromised signatures should not verify
- Parties with offline bundles retain their evidence

### 6.2 Discovery endpoint outage

If `/.well-known/peac-issuer.json` is unavailable:

**Immediate:**

1. Verifiers using offline mode continue working
2. Verifiers using network mode fail with `key_fetch_failed`
3. Investigate and restore endpoint

**Mitigation strategies:**

- Use CDN with high availability
- Enable CDN caching with long TTL
- Monitor endpoint health
- Document expected behavior in SLA

### 6.3 Time skew issues

If receipts are rejected due to time issues:

**Diagnosis:**

1. Check `iat` and `exp` claims in rejected receipts
2. Compare issuer clock to NTP servers
3. Compare verifier clock to NTP servers

**Resolution:**

- Ensure both issuer and verifier use NTP
- Consider increasing clock tolerance (up to 60 seconds)
- Document recommended time synchronization

## 7. Operational monitoring

### 7.1 Recommended metrics

| Metric                       | Description                        |
| ---------------------------- | ---------------------------------- |
| `receipts_issued_total`      | Counter of receipts issued         |
| `receipts_issued_size_bytes` | Histogram of receipt sizes         |
| `signing_latency_ms`         | Histogram of signing time          |
| `jwks_requests_total`        | Counter of JWKS discovery requests |
| `key_rotation_timestamp`     | Gauge of last rotation time        |

### 7.2 Alerting

| Condition                   | Severity | Action            |
| --------------------------- | -------- | ----------------- |
| JWKS endpoint down > 5 min  | High     | Page on-call      |
| Signing latency > 100ms p99 | Medium   | Investigate       |
| Key age > 80 days           | Medium   | Schedule rotation |
| Signing errors > 0.1%       | High     | Investigate       |

## 8. Time handling

### 8.1 Issuer requirements

- Issuers MUST synchronize clocks with NTP
- Issuers SHOULD use UTC for all timestamps
- Issuers MUST set `iat` to current time (not backdated)

### 8.2 Expiration guidance

| Use Case             | Recommended `exp`      |
| -------------------- | ---------------------- |
| API response receipt | 5 minutes              |
| Payment settlement   | 1 hour                 |
| Audit trail          | 24 hours or more       |
| Long-term evidence   | No expiry (omit `exp`) |

### 8.3 Clock tolerance

Issuers SHOULD assume verifiers accept:

- `iat` up to 60 seconds in the future
- `exp` with no tolerance (exactly honored)

## 9. Multi-region considerations

### 9.1 Key distribution

- All regions SHOULD use the same signing keys
- JWKS MUST present a consistent view across all regions (invariant)
- Use global KMS or replicated secret storage

**Rationale**: The invariant is that verifiers see the same JWKS regardless of which region they query. Per-region keys are acceptable if JWKS contains all keys from all regions.

### 9.2 Clock synchronization

- All regions MUST use NTP
- Maximum acceptable clock skew: 30 seconds
- Monitor cross-region clock drift

### 9.3 Failover

- JWKS endpoint SHOULD survive single-region failure
- Signing capability SHOULD survive single-region failure
- Consider active-active multi-region deployment

## 10. Compliance considerations

### 10.1 Audit logging

Issuers SHOULD log:

- Key generation events
- Key rotation events
- Signing operations (without receipt content)
- JWKS access patterns

### 10.2 Access control

- Limit who can generate/rotate keys
- Limit who can modify JWKS
- Require MFA for key management operations
- Review access quarterly

### 10.3 Documentation

Maintain documentation of:

- Key management procedures
- Rotation schedule
- Incident response plan
- Contact information for security team

## 11. Implementation checklist

### 11.1 Initial setup

- [ ] Generate Ed25519 key pair
- [ ] Store private key in KMS/HSM/Vault
- [ ] Create `kid` following conventions
- [ ] Deploy JWKS at `/.well-known/peac-issuer.json`
- [ ] Configure CORS headers
- [ ] Test key discovery from browser

### 11.2 Ongoing operations

- [ ] Set up key rotation schedule
- [ ] Configure monitoring and alerting
- [ ] Document incident response procedures
- [ ] Review access controls quarterly
- [ ] Test key rotation process

### 11.3 Incident preparedness

- [ ] Document key compromise procedure
- [ ] Test JWKS endpoint failover
- [ ] Verify backup key generation capability
- [ ] Establish communication plan for security incidents
