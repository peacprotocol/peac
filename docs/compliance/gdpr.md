# GDPR Compliance with PEAC

How PEAC receipts and privacy features support GDPR requirements.

**Version:** 0.9.27+

---

## Overview

The General Data Protection Regulation (GDPR) establishes requirements for processing personal data in the EU. PEAC provides privacy-preserving primitives that support GDPR compliance through:

- **Privacy-by-Design**: Opaque identifiers and hashed evidence by default
- **Receipts**: Auditable proof of lawful basis for processing
- **Purpose Limitation**: Declared and enforced purpose tracking
- **Audit Trails**: Cryptographically signed records for accountability

This document explains how PEAC artifacts map to GDPR requirements.

---

## GDPR Principles and PEAC Support

### Lawfulness, Fairness, Transparency (Article 5.1.a)

Data processing must have a lawful basis and be transparent to data subjects.

**PEAC Support:**

| Requirement     | PEAC Artifact            | How It Helps                           |
| --------------- | ------------------------ | -------------------------------------- |
| Lawful basis    | PEAC Receipt             | Records consent or legitimate interest |
| Transparency    | `purpose_declared` claim | Clear statement of processing purpose  |
| Fair processing | Control chain            | Auditable enforcement of access rules  |

### Purpose Limitation (Article 5.1.b)

Data must be collected for specified, explicit purposes and not processed incompatibly.

**PEAC Support:**

| Requirement         | PEAC Feature       | How It Helps                         |
| ------------------- | ------------------ | ------------------------------------ |
| Specified purpose   | `purpose_declared` | Explicit purpose token(s) on request |
| Purpose enforcement | `purpose_enforced` | Single canonical purpose enforced    |
| Purpose audit       | `purpose_reason`   | Explains enforcement rationale       |
| Incompatible use    | Policy evaluation  | Deny or constrain incompatible usage |

### Data Minimization (Article 5.1.c)

Data collected must be adequate, relevant, and limited to what is necessary.

**PEAC Support:**

| Requirement         | PEAC Feature       | How It Helps                         |
| ------------------- | ------------------ | ------------------------------------ |
| Minimal identifiers | Opaque subject IDs | `user:abc123` instead of PII         |
| Hashed evidence     | `@peac/privacy`    | Hash sensitive data with salt        |
| Excerpt hashes      | `excerpt_hash`     | Reference content without storing it |

### Accuracy (Article 5.1.d)

Personal data must be accurate and kept up to date.

**PEAC Support:**

| Requirement     | PEAC Feature       | How It Helps           |
| --------------- | ------------------ | ---------------------- |
| Data integrity  | JWS signatures     | Tamper-evident records |
| Content hashing | `content_hash`     | Verify source accuracy |
| Timestamps      | `issued_at`, `exp` | Clear validity windows |

### Storage Limitation (Article 5.1.e)

Data must not be kept longer than necessary.

**PEAC Support:**

| Requirement        | PEAC Feature     | How It Helps                      |
| ------------------ | ---------------- | --------------------------------- |
| Expiration         | `exp` claim      | Receipt validity window           |
| Retention guidance | Audit log format | JSONL with timestamp for rotation |
| Minimized storage  | Reference-based  | Store references, not raw data    |

### Integrity and Confidentiality (Article 5.1.f)

Data must be processed securely.

**PEAC Support:**

| Requirement      | PEAC Feature       | How It Helps                       |
| ---------------- | ------------------ | ---------------------------------- |
| Integrity        | Ed25519 signatures | Cryptographic tamper evidence      |
| Non-repudiation  | JWKS verification  | Issuer cannot deny signed receipts |
| Secure transport | HTTPS required     | TLS for all PEAC endpoints         |

---

## Data Subject Rights

### Right of Access (Article 15)

Data subjects can request access to their personal data.

**PEAC Support:**

- **Audit Logs**: JSONL format enables extraction of subject-specific records
- **Subject Filtering**: `filterByResource()` in `@peac/audit` package
- **Trace Correlation**: Link related events via trace context

### Right to Erasure (Article 17)

Data subjects can request deletion of their personal data.

**PEAC Support:**

- **Reference-Based Design**: Store receipt references, not PII
- **Opaque Identifiers**: Subject IDs can be rotated or invalidated
- **Hash-Based Evidence**: Original data not required for compliance

### Right to Data Portability (Article 20)

Data subjects can receive their data in a structured format.

**PEAC Support:**

- **JSONL Export**: Standard format for audit log portability
- **Case Bundles**: Collect all related events for a subject
- **Open Format**: No proprietary encoding

---

## Accountability (Article 5.2)

Controllers must demonstrate compliance with GDPR principles.

**PEAC Support:**

| Requirement            | PEAC Feature         | How It Helps                          |
| ---------------------- | -------------------- | ------------------------------------- |
| Demonstrate lawfulness | PEAC Receipts        | Signed proof of each processing event |
| Processing records     | Audit logs           | Complete JSONL trail                  |
| Evidence preservation  | Case bundles         | Dispute-ready evidence packages       |
| Third-party audits     | Conformance fixtures | Verifiable compliance tests           |

---

## Implementation Checklist

For GDPR-compliant PEAC deployments:

- [ ] Use opaque subject identifiers (not email/PII)
- [ ] Enable privacy mode in telemetry (`strict` or `balanced`)
- [ ] Set appropriate receipt expiration (`exp` claim)
- [ ] Document retention policy for audit logs
- [ ] Implement subject access request workflow using audit filtering
- [ ] Store content hashes, not raw content, where possible
- [ ] Configure purpose enforcement (strict/balanced/open profile)

---

## Related Documentation

- [Privacy Guidance](../specs/PROTOCOL-BEHAVIOR.md) - Section 8.4
- [Audit Package](../../packages/audit/README.md) - JSONL logging
- [Purpose Tracking](../specs/PROTOCOL-BEHAVIOR.md) - Purpose claims

---

Part of the [PEAC Protocol](https://github.com/peacprotocol/peac).
