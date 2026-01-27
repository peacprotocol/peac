# PEAC Dispute Attestation Specification

**Version:** 0.9.27
**Status:** Normative
**Last Updated:** 2026-01-07

## Table of Contents

1. [Overview](#1-overview)
2. [DisputeAttestation Object](#2-disputeattestation-object)
3. [Dispute Types](#3-dispute-types)
4. [Grounds Codes](#4-grounds-codes)
5. [Lifecycle State Machine](#5-lifecycle-state-machine)
6. [Resolution and Remediation](#6-resolution-and-remediation)
7. [Validation Rules](#7-validation-rules)
8. [Error Taxonomy](#8-error-taxonomy)
9. [Security Considerations](#9-security-considerations)

- [Appendix A: ULID Format](#appendix-a-ulid-format)
- [Appendix B: Audit Integration](#appendix-b-audit-integration)

---

## 1. Overview

### 1.1 Purpose

This specification defines the **DisputeAttestation** type for formally contesting PEAC receipts, attributions, identity claims, or policy decisions. It provides:

- A standardized structure for dispute evidence
- A state machine for tracking dispute lifecycle
- Resolution semantics for outcomes and remediation
- Error codes for validation failures

### 1.2 Scope

This specification covers:

- Schema definitions for dispute attestations
- Dispute types and grounds codes
- State transition rules and invariants
- Resolution and remediation structures
- Contact methods for dispute communication
- Supporting evidence references

### 1.3 Terminology

| Term            | Definition                                             |
| --------------- | ------------------------------------------------------ |
| **Dispute**     | Formal contestation of a PEAC claim                    |
| **Grounds**     | Specific reasons supporting the dispute                |
| **Resolution**  | Outcome and decision for a resolved dispute            |
| **Remediation** | Action taken to address an upheld dispute              |
| **Terminal**    | State requiring resolution (resolved, rejected, final) |

### 1.4 Requirements Notation

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

---

## 2. DisputeAttestation Object

### 2.1 Top-Level Structure

```typescript
interface DisputeAttestation {
  type: 'peac/dispute'; // REQUIRED: Type literal
  issuer: string; // REQUIRED: Party filing the dispute
  issued_at: string; // REQUIRED: RFC 3339 datetime
  expires_at?: string; // OPTIONAL: RFC 3339 datetime
  ref: string; // REQUIRED: Unique dispute ID (ULID format)
  evidence: DisputeEvidence; // REQUIRED: Dispute evidence
}
```

### 2.2 Evidence Structure

```typescript
interface DisputeEvidence {
  dispute_type: DisputeType; // REQUIRED
  target_ref: string; // REQUIRED: jti:{id}, URL, or URN
  target_type: DisputeTargetType; // REQUIRED
  grounds: DisputeGrounds[]; // REQUIRED: 1-10 grounds
  description: string; // REQUIRED: 1-4000 chars
  state: DisputeState; // REQUIRED
  contact?: DisputeContact; // OPTIONAL
  supporting_receipts?: string[]; // OPTIONAL: max 50
  supporting_attributions?: string[]; // OPTIONAL: max 50
  supporting_documents?: DocumentRef[]; // OPTIONAL: max 20
  state_changed_at?: string; // OPTIONAL: RFC 3339
  state_reason?: string; // OPTIONAL: max 1000 chars
  resolution?: DisputeResolution; // REQUIRED for terminal states
  window_hint_days?: number; // OPTIONAL: 1-365
}
```

### 2.3 Field Descriptions

| Field        | Type     | Required | Description                             |
| ------------ | -------- | -------- | --------------------------------------- |
| `type`       | string   | Yes      | MUST be `"peac/dispute"`                |
| `issuer`     | string   | Yes      | URI of the party filing the dispute     |
| `issued_at`  | datetime | Yes      | When the dispute was filed              |
| `expires_at` | datetime | No       | When the attestation expires            |
| `ref`        | string   | Yes      | Unique ULID identifier for this dispute |
| `evidence`   | object   | Yes      | Dispute evidence and state              |

---

## 3. Dispute Types

The `dispute_type` field classifies the nature of the dispute:

| Type                    | Description                                  |
| ----------------------- | -------------------------------------------- |
| `unauthorized_access`   | Content accessed without valid receipt       |
| `attribution_missing`   | Content used without attribution             |
| `attribution_incorrect` | Attribution exists but is wrong              |
| `receipt_invalid`       | Receipt was fraudulently issued              |
| `identity_spoofed`      | Agent identity was impersonated              |
| `purpose_mismatch`      | Declared purpose doesn't match actual use    |
| `policy_violation`      | Terms/policy violated despite receipt        |
| `other`                 | Catch-all (REQUIRES description >= 50 chars) |

### 3.1 Target Types

The `target_type` field identifies what is being disputed:

| Type          | Description                             |
| ------------- | --------------------------------------- |
| `receipt`     | A PEAC receipt                          |
| `attribution` | An attribution attestation              |
| `identity`    | An agent identity attestation           |
| `policy`      | A policy decision or enforcement action |

### 3.2 Target Reference Format

The `target_ref` field uses these formats:

- **Receipt**: `jti:{receipt_id}` (e.g., `jti:01H5KPT9QZA123456789VWXYZG`)
- **Attribution**: URL to the attribution attestation
- **Identity**: DID or URL (e.g., `did:web:agent.example.com`)
- **Policy**: URL to policy document or decision endpoint

---

## 4. Grounds Codes

Disputes MUST include at least one ground. Maximum is 10 grounds per dispute.

### 4.1 Evidence-Based Grounds

| Code                     | Description                                 |
| ------------------------ | ------------------------------------------- |
| `missing_receipt`        | No receipt exists for the access            |
| `expired_receipt`        | Receipt was expired at time of use          |
| `forged_receipt`         | Receipt signature invalid or tampered       |
| `receipt_not_applicable` | Receipt doesn't cover the accessed resource |

### 4.2 Attribution-Based Grounds

| Code                   | Description                                               |
| ---------------------- | --------------------------------------------------------- |
| `content_not_used`     | Content was not actually used as claimed                  |
| `source_misidentified` | Wrong source attributed                                   |
| `usage_type_wrong`     | Usage type incorrect (e.g., RAG claimed but was training) |
| `weight_inaccurate`    | Attribution weight is incorrect                           |

### 4.3 Identity-Based Grounds

| Code                  | Description                           |
| --------------------- | ------------------------------------- |
| `agent_impersonation` | Agent ID was spoofed                  |
| `key_compromise`      | Signing key was compromised           |
| `delegation_invalid`  | Delegation chain is broken or invalid |

### 4.4 Policy-Based Grounds

| Code                  | Description                  |
| --------------------- | ---------------------------- |
| `purpose_exceeded`    | Used beyond declared purpose |
| `terms_violated`      | Specific terms were violated |
| `rate_limit_exceeded` | Exceeded rate limits         |

### 4.5 Grounds Structure

```typescript
interface DisputeGrounds {
  code: DisputeGroundsCode; // REQUIRED
  evidence_ref?: string; // OPTIONAL: Reference to supporting evidence
  details?: string; // OPTIONAL: Additional context (max 1000 chars)
}
```

---

## 5. Lifecycle State Machine

### 5.1 State Diagram

```
FILED -> ACKNOWLEDGED -> UNDER_REVIEW -> RESOLVED
           |                |              |
           +-> REJECTED     +-> ESCALATED  +-> APPEALED
                                              |
                                              +-> FINAL
```

### 5.2 State Definitions

| State          | Terminal | Description                           |
| -------------- | -------- | ------------------------------------- |
| `filed`        | No       | Initial state when dispute is created |
| `acknowledged` | No       | Dispute received and assigned         |
| `under_review` | No       | Active investigation in progress      |
| `escalated`    | No       | Escalated to senior review            |
| `resolved`     | Yes      | Dispute has been resolved             |
| `rejected`     | Yes      | Dispute was rejected                  |
| `appealed`     | No       | Previous decision being appealed      |
| `final`        | Yes      | Final decision after appeal           |

### 5.3 State Transition Table

| From State     | Valid Transitions          |
| -------------- | -------------------------- |
| `filed`        | `acknowledged`, `rejected` |
| `acknowledged` | `under_review`, `rejected` |
| `under_review` | `resolved`, `escalated`    |
| `escalated`    | `resolved`                 |
| `resolved`     | `appealed`, `final`        |
| `rejected`     | `appealed`, `final`        |
| `appealed`     | `under_review`, `final`    |
| `final`        | (none - terminal)          |

### 5.4 State Invariants

1. **Terminal states REQUIRE resolution**: When `state` is `resolved`, `rejected`, or `final`, the `resolution` field MUST be present.

2. **Non-terminal states MUST NOT have resolution**: When `state` is NOT a terminal state, the `resolution` field MUST NOT be present.

3. **Transitioning to `appealed` clears resolution**: When transitioning from a terminal state to `appealed`, the previous resolution MUST be cleared.

4. **`final` has no outgoing transitions**: Once in `final` state, no further state changes are allowed.

---

## 6. Resolution and Remediation

### 6.1 Resolution Structure

```typescript
interface DisputeResolution {
  outcome: DisputeOutcome; // REQUIRED
  decided_at: string; // REQUIRED: RFC 3339 datetime
  decided_by: string; // REQUIRED: Who made the decision
  rationale: string; // REQUIRED: Explanation (1-4000 chars)
  remediation?: Remediation; // OPTIONAL
}
```

### 6.2 Outcome Types

| Outcome            | Description                           |
| ------------------ | ------------------------------------- |
| `upheld`           | Dispute was valid, in favor of filer  |
| `dismissed`        | Dispute invalid or without merit      |
| `partially_upheld` | Some grounds upheld, others dismissed |
| `settled`          | Parties reached agreement             |

### 6.3 Remediation Structure

```typescript
interface Remediation {
  type: RemediationType; // REQUIRED
  details: string; // REQUIRED: 1-4000 chars
  deadline?: string; // OPTIONAL: RFC 3339 datetime
}
```

### 6.4 Remediation Types

| Type                    | Description                     |
| ----------------------- | ------------------------------- |
| `attribution_corrected` | Attribution was fixed           |
| `receipt_revoked`       | Receipt was revoked             |
| `access_restored`       | Access was restored             |
| `compensation`          | Financial compensation provided |
| `policy_updated`        | Policy was updated              |
| `no_action`             | No action required              |
| `other`                 | Other remediation               |

---

## 7. Validation Rules

### 7.1 Schema Validation

Implementations MUST validate:

1. All required fields are present
2. `type` is exactly `"peac/dispute"`
3. `ref` is a valid ULID (26 uppercase alphanumeric, Crockford Base32)
4. All enum values are recognized
5. String lengths are within limits
6. Datetime fields are valid RFC 3339

### 7.2 Cross-Field Invariants

Implementations MUST enforce:

1. **Other-type description**: If `dispute_type` is `"other"`, `description` MUST be at least 50 characters.

2. **Terminal resolution**: If `state` is terminal (`resolved`, `rejected`, `final`), `resolution` MUST be present.

3. **Non-terminal no resolution**: If `state` is NOT terminal, `resolution` MUST NOT be present.

### 7.3 Runtime Validation

Beyond schema validation, implementations SHOULD check:

1. **Temporal validity**: `issued_at` SHOULD NOT be in the future (beyond clock skew tolerance).

2. **Expiration**: If `expires_at` is present and in the past, the attestation SHOULD be rejected.

3. **State transition validity**: State changes MUST follow the transition table.

### 7.4 Limits

| Field                     | Limit                     |
| ------------------------- | ------------------------- |
| `grounds`                 | 1-10 items                |
| `supporting_receipts`     | max 50 items              |
| `supporting_attributions` | max 50 items              |
| `supporting_documents`    | max 20 items              |
| `description`             | max 4000 chars            |
| `ground.details`          | max 1000 chars per ground |
| `rationale`               | max 4000 chars            |
| `remediation.details`     | max 4000 chars            |

---

## 8. Error Taxonomy

### 8.1 Validation Errors (400)

| Code                                   | Description                                |
| -------------------------------------- | ------------------------------------------ |
| `E_DISPUTE_INVALID_FORMAT`             | Schema validation failure                  |
| `E_DISPUTE_INVALID_ID`                 | Invalid ULID format                        |
| `E_DISPUTE_INVALID_TYPE`               | Unknown dispute type                       |
| `E_DISPUTE_INVALID_TARGET_TYPE`        | Unknown target type                        |
| `E_DISPUTE_INVALID_GROUNDS`            | Unknown grounds code                       |
| `E_DISPUTE_INVALID_STATE`              | Unknown state value                        |
| `E_DISPUTE_INVALID_TRANSITION`         | Invalid state transition                   |
| `E_DISPUTE_MISSING_RESOLUTION`         | Resolution required for terminal state     |
| `E_DISPUTE_RESOLUTION_NOT_ALLOWED`     | Resolution provided for non-terminal state |
| `E_DISPUTE_OTHER_REQUIRES_DESCRIPTION` | 'other' type needs 50+ char description    |

### 8.2 Authentication Errors (401)

| Code                      | Description                              |
| ------------------------- | ---------------------------------------- |
| `E_DISPUTE_NOT_YET_VALID` | `issued_at` is in the future (retriable) |
| `E_DISPUTE_EXPIRED`       | Attestation has expired                  |

### 8.3 Resource Errors (404/409)

| Code                         | HTTP | Description                  |
| ---------------------------- | ---- | ---------------------------- |
| `E_DISPUTE_TARGET_NOT_FOUND` | 404  | Target not found (retriable) |
| `E_DISPUTE_DUPLICATE`        | 409  | Duplicate dispute ID         |

### 8.4 WWW-Authenticate Header

Per RFC 9110, 401 responses MUST include `WWW-Authenticate`:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: PEAC-Attestation realm="peac", attestation_type=dispute, error=expired
Content-Type: application/problem+json

{
  "type": "https://www.peacprotocol.org/errors#E_DISPUTE_EXPIRED",
  "title": "Dispute Expired",
  "status": 401,
  "detail": "The dispute attestation has expired."
}
```

---

## 9. Security Considerations

### 9.1 Spam Prevention

Implementations SHOULD:

- Rate limit dispute filing by issuer
- Require proof of relationship to disputed content
- Validate that `target_ref` exists before accepting disputes
- Consider reputation scoring for frequent filers

### 9.2 Privacy

Implementations MUST:

- Not expose full dispute content to unauthorized parties
- Redact PII from audit logs
- Consider jurisdiction requirements for dispute data

Implementations SHOULD:

- Minimize `description` field content in logs
- Hash `target_ref` in analytics
- Provide data retention policies

### 9.3 Integrity

Implementations SHOULD:

- Sign dispute attestations with Ed25519
- Verify signatures before state transitions
- Maintain immutable audit trail of state changes
- Use content hashes for supporting documents

### 9.4 Authorization

Implementations SHOULD:

- Verify issuer has standing to file dispute
- Restrict state transitions to authorized parties
- Log all state changes with actor identity

---

## Appendix A: ULID Format

Dispute IDs use ULID (Universally Unique Lexicographically Sortable Identifier) format:

### A.1 Format

- 26 characters total
- Crockford Base32 encoding (excludes I, L, O, U)
- First 10 characters: timestamp (milliseconds since Unix epoch)
- Last 16 characters: randomness

### A.2 Character Set

Valid characters: `0123456789ABCDEFGHJKMNPQRSTVWXYZ`

### A.3 Case Sensitivity

PEAC enforces UPPERCASE as the canonical form:

- Generators MUST produce uppercase
- Validators MAY normalize lowercase but SHOULD warn
- Comparisons MUST use uppercase

### A.4 Example

```
01ARZ3NDEKTSV4RRFFQ69G5FAV
└─────────┴────────────────┘
 timestamp     randomness
```

---

## Appendix B: Audit Integration

### B.1 Audit Event Types

The `@peac/audit` package defines these dispute-related event types:

| Event Type             | When Emitted                    |
| ---------------------- | ------------------------------- |
| `dispute_filed`        | New dispute attestation created |
| `dispute_acknowledged` | Dispute state -> acknowledged   |
| `dispute_resolved`     | Dispute state -> resolved       |
| `dispute_rejected`     | Dispute state -> rejected       |
| `dispute_appealed`     | Dispute state -> appealed       |
| `dispute_final`        | Dispute state -> final          |

### B.2 Case Bundle

Disputes can be collected into a case bundle for resolution:

```typescript
interface CaseBundle {
  version: 'peac.bundle/0.9';
  dispute_ref: string; // ULID of the dispute
  generated_at: string; // When bundle was created
  generated_by: string; // Who generated it
  entries: AuditEntry[]; // Related audit entries
  trace_ids: string[]; // W3C trace IDs involved
  summary: CaseBundleSummary;
}
```

### B.3 Trace Correlation

Audit entries use W3C Trace Context for correlation:

```typescript
interface TraceContext {
  trace_id: string; // 32 hex characters
  span_id: string; // 16 hex characters
  parent_span_id?: string;
}
```

---

## Version History

- **v0.9.27**: Initial dispute attestation specification
