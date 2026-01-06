# SOC 2 Compliance with PEAC

How PEAC receipts and audit features support SOC 2 Type II audit requirements.

**Version:** 0.9.27+

---

## Overview

SOC 2 (Service Organization Control 2) defines criteria for managing customer data based on five Trust Service Criteria. PEAC provides audit-ready primitives that support SOC 2 compliance through:

- **Immutable Audit Trails**: Cryptographically signed, tamper-evident logs
- **Access Control Evidence**: Receipts proving each access decision
- **Change Management**: Version-controlled policy definitions
- **Incident Response**: Dispute attestations and case bundles

This document maps PEAC artifacts to SOC 2 Trust Service Criteria.

---

## Trust Service Criteria

### Security (Common Criteria)

Controls to protect against unauthorized access.

**PEAC Support:**

| Control Area   | PEAC Artifact      | Evidence Provided                    |
| -------------- | ------------------ | ------------------------------------ |
| Access control | PEAC Receipt       | Signed proof of each access decision |
| Authentication | Agent Identity     | Cryptographic proof of agent control |
| Authorization  | Control chain      | Policy evaluation with deny/allow    |
| Encryption     | Ed25519 + JWS      | Signatures on all protocol artifacts |
| Logging        | Audit logs (JSONL) | Immutable, timestamped event trail   |

**Relevant Controls:**

- **CC6.1**: Logical access security - PEAC receipts document each access
- **CC6.2**: Access authorization - Control chain records policy decisions
- **CC6.3**: Access removal - Expiration claims and key rotation

### Availability

Controls to ensure system availability.

**PEAC Support:**

| Control Area       | PEAC Feature      | Evidence Provided                 |
| ------------------ | ----------------- | --------------------------------- |
| Monitoring         | Telemetry package | Metrics and traces for operations |
| Incident detection | Error codes       | Structured error classification   |
| Recovery           | Case bundles      | Complete event reconstruction     |

**Relevant Controls:**

- **A1.1**: Capacity planning - Telemetry metrics for load monitoring
- **A1.2**: Environmental controls - Error categorization for incident triage

### Processing Integrity

Controls to ensure system processing is complete and accurate.

**PEAC Support:**

| Control Area        | PEAC Feature      | Evidence Provided                    |
| ------------------- | ----------------- | ------------------------------------ |
| Data integrity      | JWS signatures    | Tamper-evident receipts              |
| Input validation    | Zod schemas       | Runtime validation of all inputs     |
| Output verification | Content hashing   | SHA-256 hashes for content integrity |
| Error handling      | Structured errors | Consistent error taxonomy            |

**Relevant Controls:**

- **PI1.1**: Processing integrity - Signed receipts prove processing occurred
- **PI1.2**: System inputs - Schema validation rejects malformed data
- **PI1.3**: Processing accuracy - Content hashes verify data integrity

### Confidentiality

Controls to protect confidential information.

**PEAC Support:**

| Control Area        | PEAC Feature       | Evidence Provided               |
| ------------------- | ------------------ | ------------------------------- |
| Data classification | Purpose claims     | Tagged by usage intent          |
| Encryption at rest  | Hashed evidence    | Sensitive data hashed with salt |
| Access restrictions | Policy enforcement | Purpose-based access control    |

**Relevant Controls:**

- **C1.1**: Confidential information - Purpose tracking classifies data use
- **C1.2**: Data disposal - Expiration claims and retention policies

### Privacy

Controls to protect personal information (aligned with GDPR).

**PEAC Support:**

| Control Area       | PEAC Feature        | Evidence Provided                |
| ------------------ | ------------------- | -------------------------------- |
| Privacy notice     | Purpose declaration | Explicit purpose on each request |
| Choice and consent | Control chain       | Records consent-based decisions  |
| Data minimization  | Opaque identifiers  | No PII in receipt claims         |
| Access requests    | Audit filtering     | Extract subject-specific records |

**Relevant Controls:**

- **P1.1**: Privacy notice - `purpose_declared` documents intent
- **P3.1**: Personal information collection - Minimal data in receipts
- **P6.1**: Data subject access - Audit log filtering and export

---

## Audit Evidence

### Evidence Collection

PEAC provides structured evidence for SOC 2 auditors:

| Evidence Type       | PEAC Source                | Format               |
| ------------------- | -------------------------- | -------------------- |
| Access logs         | Audit logs                 | JSONL (newline JSON) |
| Policy definitions  | `peac-policy.yaml`         | YAML/JSON            |
| Change history      | Git commits                | Version control      |
| Incident records    | Case bundles               | JSON with trace IDs  |
| Error documentation | `specs/kernel/errors.json` | JSON registry        |

### Audit Log Fields

Each audit entry includes SOC 2-relevant fields:

```typescript
interface AuditEntry {
  version: 'peac.audit/0.9';
  id: string; // ULID for ordering
  timestamp: string; // ISO 8601
  event_type: string; // Classification
  severity: 'info' | 'warn' | 'error' | 'critical';
  actor: {
    type: 'user' | 'system' | 'agent';
    id: string; // Opaque identifier
  };
  resource: {
    type: string;
    id: string;
  };
  outcome: {
    success: boolean;
    result?: string;
    message?: string;
  };
  trace?: {
    trace_id: string; // W3C Trace Context
    span_id: string;
  };
}
```

### Case Bundles for Incidents

For incident investigation, create case bundles:

```typescript
import { createCaseBundle, filterByDispute } from '@peac/audit';

const bundle = createCaseBundle({
  dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  generated_by: 'https://platform.example.com',
  entries: filterByDispute(auditEntries, disputeRef),
});

// Bundle includes:
// - All related audit entries (sorted chronologically)
// - Trace IDs for correlation
// - Summary statistics (counts by event type, severity)
```

---

## Control Mapping

### PEAC Features to SOC 2 Controls

| PEAC Feature        | SOC 2 Controls            |
| ------------------- | ------------------------- |
| PEAC Receipt        | CC6.1, CC6.2, PI1.1       |
| Agent Identity      | CC6.1, CC6.3              |
| Control Chain       | CC6.2, P1.1               |
| Audit Logs (JSONL)  | CC6.1, CC7.2, A1.1        |
| Dispute Attestation | CC7.3, CC7.4              |
| Case Bundle         | CC7.4, CC7.5              |
| Telemetry           | A1.1, CC7.1               |
| Conformance Tests   | CC8.1 (change management) |

---

## Implementation Checklist

For SOC 2-ready PEAC deployments:

### Security

- [ ] Enable audit logging for all receipt operations
- [ ] Configure issuer allowlist (fail-closed)
- [ ] Enable replay protection for DPoP/TAP
- [ ] Set up JWKS rotation schedule
- [ ] Document key management procedures

### Availability

- [ ] Configure telemetry provider
- [ ] Set up alerting on error rate thresholds
- [ ] Document incident response using case bundles

### Processing Integrity

- [ ] Enable content hashing for attributions
- [ ] Configure schema validation (strict mode)
- [ ] Document error handling procedures

### Confidentiality

- [ ] Use opaque subject identifiers
- [ ] Enable privacy mode in telemetry
- [ ] Configure purpose enforcement profile
- [ ] Document data retention policy

### Change Management

- [ ] Version control policy files
- [ ] Run conformance tests in CI
- [ ] Document policy change procedures

---

## Related Documentation

- [Audit Package](../../packages/audit/README.md) - JSONL logging and case bundles
- [Telemetry](../../packages/telemetry/README.md) - Metrics and tracing
- [Error Registry](../specs/ERRORS.md) - Structured error codes

---

Part of the [PEAC Protocol](https://github.com/peacprotocol/peac).
