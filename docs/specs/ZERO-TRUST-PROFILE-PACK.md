# PEAC Zero Trust Profile Pack Specification

**Status**: NORMATIVE

**Version**: 0.1

**Since**: v0.11.3

**Design Decision**: DD-145

---

## 1. Introduction

### 1.1 Purpose

This specification defines the **Zero Trust Profile Pack**: a collection of seven documentation overlays that constrain which PEAC receipt fields are REQUIRED, RECOMMENDED, or PROHIBITED for specific zero trust use cases.

Profiles do NOT add new wire format fields. All zero trust data flows through existing `ext[]` extension slots using reverse-DNS keys per [PROFILE_RULES.md](../../reference/PROFILE_RULES.md). New fields belong in schemas (`@peac/schema`); profiles constrain their usage for specific deployment patterns.

### 1.2 Scope

This specification covers:

- Seven sub-profiles for zero trust receipt issuance
- Field requirements per sub-profile (REQUIRED/RECOMMENDED/PROHIBITED)
- Extension key assignments for ZT data
- Conformance requirements for each sub-profile

This specification does NOT cover:

- Wire format changes (Wire 0.1 is frozen)
- Schema definitions (see `@peac/schema` extensions)
- Transport mechanisms (see [TRANSPORT-PROFILES.md](TRANSPORT-PROFILES.md))
- Key management (see [KEY-ROTATION.md](KEY-ROTATION.md))

### 1.3 Requirements Notation

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in BCP 14 (RFC 2119, RFC 8174) when, and only when, they appear in all capitals.

### 1.4 Relationship to Wire Format

All seven sub-profiles operate within Wire 0.1 (`peac-receipt/0.1`). Zero trust data is carried in `ext[]` entries using `org.peacprotocol/` reverse-DNS keys. This approach:

- Preserves wire format stability (no schema migration required)
- Allows incremental adoption (deploy one sub-profile at a time)
- Maintains backward compatibility (unknown extensions are pass-through)

---

## 2. Architecture

### 2.1 Profile Pack Composition

The Zero Trust Profile Pack consists of seven sub-profiles organized into three tiers:

| Tier          | Sub-Profile   | Extension Key                       | Purpose                           |
| ------------- | ------------- | ----------------------------------- | --------------------------------- |
| Core          | Access        | (uses existing receipt fields)      | Access control decision recording |
| Core          | Toolcall      | (uses existing receipt fields)      | Tool invocation evidence          |
| Signal        | Decision      | `org.peacprotocol/control_action`   | Policy evaluation outcomes        |
| Signal        | Risk Signal   | `org.peacprotocol/risk_signal`      | Anomaly and threat observations   |
| Observability | Sync          | `org.peacprotocol/sync_checkpoint`  | Multi-agent state synchronization |
| Observability | Tracing       | `org.peacprotocol/trace_context`    | Distributed trace correlation     |
| Extension     | ZT Extensions | `org.peacprotocol/credential_event` | Credential lifecycle events       |

### 2.2 Design Principles

1. **Documentation overlays only**: Profiles constrain existing fields; they never define new wire format keys
2. **Incremental adoption**: Each sub-profile is independently deployable
3. **Observation model**: Receipts record observations; they never enforce policy (DD-136)
4. **No custody**: Zero trust profiles record evidence of access decisions; they do not make or enforce those decisions (DD-95)
5. **Vendor neutral**: No vendor names, frameworks, or products referenced in profile constraints

### 2.3 Extension Key Registry

The following extension keys are used by ZT sub-profiles. All keys are registered in `specs/kernel/registries.json`.

| Extension Key                       | Sub-Profile     | Schema Package      |
| ----------------------------------- | --------------- | ------------------- |
| `org.peacprotocol/credential_event` | ZT Extensions   | `@peac/schema`      |
| `org.peacprotocol/tool_registry`    | Toolcall        | `@peac/schema`      |
| `org.peacprotocol/control_action`   | Decision        | `@peac/schema`      |
| `org.peacprotocol/risk_signal`      | Risk Signal     | (reserved, v0.11.4) |
| `org.peacprotocol/sync_checkpoint`  | Sync            | (reserved, v0.11.4) |
| `org.peacprotocol/trace_context`    | Tracing         | (reserved, v0.11.4) |
| `org.peacprotocol/actor_binding`    | (cross-cutting) | `@peac/schema`      |

Extension keys marked "reserved" have registered names but no schema implementation yet. Implementations encountering reserved keys in `ext[]` MUST pass them through without validation errors.

---

## 3. Access Sub-Profile

### 3.1 Purpose

Records evidence that an access control decision was made for an agent request. Applicable to API gateways, service meshes, and resource servers that evaluate whether an agent may access a resource.

### 3.2 Field Requirements

| Field                        | Requirement | Notes                                         |
| ---------------------------- | ----------- | --------------------------------------------- |
| `iss`                        | REQUIRED    | Issuer (gateway or resource server origin)    |
| `sub`                        | REQUIRED    | Subject (agent identifier or token reference) |
| `aud`                        | RECOMMENDED | Audience (resource being accessed)            |
| `iat`                        | REQUIRED    | Issued-at timestamp                           |
| `jti`                        | REQUIRED    | Unique receipt identifier                     |
| `exp`                        | RECOMMENDED | Expiration for receipt validity               |
| `peac.wire_type`             | REQUIRED    | `peac-receipt/0.1`                            |
| `peac.wire_version`          | REQUIRED    | `0.1`                                         |
| `peac.purpose`               | RECOMMENDED | Access purpose declaration                    |
| `peac.auth.control`          | REQUIRED    | Control chain with access decision            |
| `peac.auth.control.decision` | REQUIRED    | `allow`, `deny`, or `review`                  |
| `peac.evidence`              | RECOMMENDED | Evidence of the access event                  |
| `peac.settlement`            | PROHIBITED  | Access receipts are non-financial             |

### 3.3 Control Chain Semantics

For access receipts, the control chain SHOULD contain at least one step recording the access decision:

- `engine_type`: SHOULD be `policy` or `gateway`
- `result`: MUST reflect the actual access decision
- `reason`: SHOULD describe the policy or rule that produced the decision

### 3.4 Example

```json
{
  "iss": "https://gateway.example.com",
  "sub": "agent:crawler-prod-001",
  "aud": "https://api.example.com/v1/data",
  "iat": 1709000000,
  "jti": "acc_01HQXYZ123456789",
  "peac": {
    "wire_type": "peac-receipt/0.1",
    "wire_version": "0.1",
    "purpose": "access",
    "auth": {
      "control": {
        "chain": [
          {
            "engine_type": "policy",
            "engine_id": "opa-gateway-v2",
            "result": "allow",
            "reason": "Agent in allowlist for /v1/data"
          }
        ],
        "decision": "allow",
        "combinator": "any_can_veto"
      }
    }
  }
}
```

---

## 4. Toolcall Sub-Profile

### 4.1 Purpose

Records evidence of a tool invocation by an agent. Applicable to MCP servers, function-calling runtimes, and any system where an agent invokes a tool or function with observable inputs and outputs.

### 4.2 Field Requirements

| Field                                         | Requirement | Notes                                          |
| --------------------------------------------- | ----------- | ---------------------------------------------- |
| `iss`                                         | REQUIRED    | Issuer (tool host or MCP server)               |
| `sub`                                         | REQUIRED    | Subject (invoking agent identifier)            |
| `iat`                                         | REQUIRED    | Issued-at timestamp                            |
| `jti`                                         | REQUIRED    | Unique receipt identifier                      |
| `peac.wire_type`                              | REQUIRED    | `peac-receipt/0.1`                             |
| `peac.wire_version`                           | REQUIRED    | `0.1`                                          |
| `peac.evidence`                               | REQUIRED    | Interaction evidence                           |
| `peac.auth.control`                           | RECOMMENDED | Control chain (if access decision was made)    |
| `ext[]` with `org.peacprotocol/tool_registry` | RECOMMENDED | Tool metadata (tool_id, registry_uri)          |
| `peac.settlement`                             | PROHIBITED  | Toolcall receipts are non-financial by default |

### 4.3 Interaction Evidence

Toolcall receipts SHOULD use the InteractionEvidence extension (see [INTERACTION-EVIDENCE.md](INTERACTION-EVIDENCE.md)) to capture:

- Tool name and invocation kind (`tool_call`, `api_request`, `function_call`)
- Input/output digests (SHA-256 hashes, not raw payloads)
- Duration and status

### 4.4 Tool Registry Extension

When the `org.peacprotocol/tool_registry` extension is present in `ext[]`, it provides metadata about the tool that was invoked:

- `tool_id`: Stable identifier for the tool
- `registry_uri`: HTTPS or URN reference to the tool registry
- `version`: Tool version (optional)
- `capabilities`: Tool capability tags (optional)

### 4.5 Example

```json
{
  "iss": "https://mcp-server.example.com",
  "sub": "agent:assistant-v3",
  "iat": 1709000000,
  "jti": "tool_01HQXYZ123456789",
  "peac": {
    "wire_type": "peac-receipt/0.1",
    "wire_version": "0.1",
    "evidence": {
      "interaction": {
        "kind": "tool_call",
        "tool_name": "search_documents",
        "input_hash": "sha256:a1b2c3d4e5f6...",
        "output_hash": "sha256:f6e5d4c3b2a1...",
        "duration_ms": 342,
        "status": "success"
      }
    }
  },
  "ext": [
    {
      "key": "org.peacprotocol/tool_registry",
      "value": {
        "tool_id": "search_documents",
        "registry_uri": "https://registry.example.com/tools/search_documents",
        "version": "2.1.0"
      }
    }
  ]
}
```

---

## 5. Decision Sub-Profile

### 5.1 Purpose

Records evidence of a policy evaluation outcome. Applicable to policy engines (OPA, Cedar, custom), authorization services, and any system that evaluates rules to produce an access or control decision.

### 5.2 Field Requirements

| Field                                          | Requirement | Notes                                           |
| ---------------------------------------------- | ----------- | ----------------------------------------------- |
| `iss`                                          | REQUIRED    | Issuer (policy engine or authorization service) |
| `sub`                                          | REQUIRED    | Subject (agent or principal being evaluated)    |
| `iat`                                          | REQUIRED    | Issued-at timestamp                             |
| `jti`                                          | REQUIRED    | Unique receipt identifier                       |
| `peac.wire_type`                               | REQUIRED    | `peac-receipt/0.1`                              |
| `peac.wire_version`                            | REQUIRED    | `0.1`                                           |
| `peac.auth.control`                            | REQUIRED    | Control chain with decision                     |
| `ext[]` with `org.peacprotocol/control_action` | REQUIRED    | Control action details                          |
| `peac.settlement`                              | PROHIBITED  | Decision receipts are non-financial             |

### 5.3 Control Action Extension

The `org.peacprotocol/control_action` extension captures the control action details:

- `action`: One of `grant`, `deny`, `escalate`, `delegate`, `audit`
- `trigger`: One of `policy_evaluation`, `manual_review`, `anomaly_detection`, `scheduled`, `event_driven`
- `policy_ref`: Reference to the policy document (optional)
- `evaluation_duration_ms`: Time taken for policy evaluation (optional)
- `context`: Additional evaluation context (optional)

### 5.4 Example

```json
{
  "iss": "https://authz.example.com",
  "sub": "agent:data-pipeline-v2",
  "iat": 1709000000,
  "jti": "dec_01HQXYZ123456789",
  "peac": {
    "wire_type": "peac-receipt/0.1",
    "wire_version": "0.1",
    "auth": {
      "control": {
        "chain": [
          {
            "engine_type": "policy",
            "engine_id": "opa-v0.62",
            "result": "deny",
            "reason": "Agent lacks write scope for production data"
          }
        ],
        "decision": "deny",
        "combinator": "any_can_veto"
      }
    }
  },
  "ext": [
    {
      "key": "org.peacprotocol/control_action",
      "value": {
        "action": "deny",
        "trigger": "policy_evaluation",
        "policy_ref": "https://policies.example.com/data-access/v3",
        "evaluation_duration_ms": 12
      }
    }
  ]
}
```

---

## 6. Risk Signal Sub-Profile

### 6.1 Purpose

Records evidence of an anomaly or threat observation. Applicable to security monitoring systems, anomaly detectors, and risk scoring engines that observe agent behavior and flag deviations.

### 6.2 Field Requirements

| Field                                       | Requirement | Notes                          |
| ------------------------------------------- | ----------- | ------------------------------ |
| `iss`                                       | REQUIRED    | Issuer (monitoring system)     |
| `sub`                                       | REQUIRED    | Subject (observed agent)       |
| `iat`                                       | REQUIRED    | Issued-at timestamp            |
| `jti`                                       | REQUIRED    | Unique receipt identifier      |
| `peac.wire_type`                            | REQUIRED    | `peac-receipt/0.1`             |
| `peac.wire_version`                         | REQUIRED    | `0.1`                          |
| `peac.evidence`                             | REQUIRED    | Evidence of the observation    |
| `ext[]` with `org.peacprotocol/risk_signal` | REQUIRED    | Risk signal details            |
| `peac.settlement`                           | PROHIBITED  | Risk signals are non-financial |

### 6.3 Observation Model

Risk signal receipts follow the observation model (DD-136): signals record observations; they never enforce policy. A risk signal receipt records that something was observed; downstream systems decide what action to take.

### 6.4 Risk Signal Extension (Reserved)

The `org.peacprotocol/risk_signal` extension key is reserved in `registries.json`. Schema implementation is planned for v0.11.4. Implementations MAY use this key with custom payloads in `ext[]`; verifiers MUST pass unknown extension payloads through without error.

Anticipated fields (non-normative, subject to change):

- `signal_type`: Category of risk signal (e.g., `anomaly`, `threshold_breach`, `behavioral_drift`)
- `severity`: Signal severity level
- `confidence`: Confidence score (0.0 to 1.0)
- `observed_at`: Timestamp of observation
- `baseline_ref`: Reference to the behavioral baseline

### 6.5 Example (Non-Normative)

```json
{
  "iss": "https://monitor.example.com",
  "sub": "agent:trading-bot-v4",
  "iat": 1709000000,
  "jti": "risk_01HQXYZ123456789",
  "peac": {
    "wire_type": "peac-receipt/0.1",
    "wire_version": "0.1",
    "evidence": {
      "observation": "API call frequency 3x above baseline for trailing 5-minute window"
    }
  },
  "ext": [
    {
      "key": "org.peacprotocol/risk_signal",
      "value": {
        "signal_type": "threshold_breach",
        "severity": "warning",
        "confidence": 0.87,
        "observed_at": "2026-03-01T12:00:00Z"
      }
    }
  ]
}
```

---

## 7. Sync Sub-Profile

### 7.1 Purpose

Records evidence of a state synchronization checkpoint between agents. Applicable to multi-agent orchestration systems, distributed workflows, and consensus protocols where agents need to agree on shared state.

### 7.2 Field Requirements

| Field                                           | Requirement | Notes                                      |
| ----------------------------------------------- | ----------- | ------------------------------------------ |
| `iss`                                           | REQUIRED    | Issuer (orchestrator or sync coordinator)  |
| `sub`                                           | REQUIRED    | Subject (participating agent)              |
| `iat`                                           | REQUIRED    | Issued-at timestamp                        |
| `jti`                                           | REQUIRED    | Unique receipt identifier                  |
| `peac.wire_type`                                | REQUIRED    | `peac-receipt/0.1`                         |
| `peac.wire_version`                             | REQUIRED    | `0.1`                                      |
| `ext[]` with `org.peacprotocol/sync_checkpoint` | REQUIRED    | Sync checkpoint details                    |
| `peac.settlement`                               | PROHIBITED  | Sync receipts are non-financial by default |

### 7.3 Sync Checkpoint Extension (Reserved)

The `org.peacprotocol/sync_checkpoint` extension key is reserved in `registries.json`. Schema implementation is planned for v0.11.4.

Anticipated fields (non-normative, subject to change):

- `checkpoint_id`: Unique identifier for this sync point
- `state_hash`: Hash of the shared state at this checkpoint
- `participants`: List of agent identifiers that acknowledged the checkpoint
- `sequence`: Monotonic sequence number within the sync chain
- `previous_checkpoint`: Reference to prior checkpoint (hash chain)

### 7.4 Example (Non-Normative)

```json
{
  "iss": "https://orchestrator.example.com",
  "sub": "agent:planner-v2",
  "iat": 1709000000,
  "jti": "sync_01HQXYZ123456789",
  "peac": {
    "wire_type": "peac-receipt/0.1",
    "wire_version": "0.1"
  },
  "ext": [
    {
      "key": "org.peacprotocol/sync_checkpoint",
      "value": {
        "checkpoint_id": "cp_01HQXYZ123456789",
        "state_hash": "sha256:abc123def456...",
        "participants": ["agent:planner-v2", "agent:executor-v1"],
        "sequence": 42
      }
    }
  ]
}
```

---

## 8. Tracing Sub-Profile

### 8.1 Purpose

Records trace context for distributed tracing correlation. Applicable to systems using OpenTelemetry, W3C Trace Context, or similar distributed tracing frameworks where agent operations span multiple services.

### 8.2 Field Requirements

| Field                                         | Requirement | Notes                                  |
| --------------------------------------------- | ----------- | -------------------------------------- |
| `iss`                                         | REQUIRED    | Issuer (service producing the receipt) |
| `sub`                                         | REQUIRED    | Subject (agent being traced)           |
| `iat`                                         | REQUIRED    | Issued-at timestamp                    |
| `jti`                                         | REQUIRED    | Unique receipt identifier              |
| `peac.wire_type`                              | REQUIRED    | `peac-receipt/0.1`                     |
| `peac.wire_version`                           | REQUIRED    | `0.1`                                  |
| `ext[]` with `org.peacprotocol/trace_context` | REQUIRED    | Trace correlation data                 |

### 8.3 Trace Context Extension (Reserved)

The `org.peacprotocol/trace_context` extension key is reserved in `registries.json`. Schema implementation is planned for v0.11.4.

Anticipated fields (non-normative, subject to change):

- `trace_id`: W3C Trace Context trace-id (32 hex chars)
- `span_id`: W3C Trace Context span-id (16 hex chars)
- `parent_span_id`: Parent span identifier (optional)
- `trace_flags`: W3C Trace Context trace-flags (optional)
- `baggage`: Key-value baggage items (optional)

### 8.4 W3C Trace Context Alignment

When interoperating with W3C Trace Context (https://www.w3.org/TR/trace-context/), implementations SHOULD:

- Use the same `trace_id` and `span_id` formats as the incoming `traceparent` header
- Propagate trace context through receipt chains
- Include PEAC-specific attributes in OpenTelemetry spans (see [AGENT-IDENTITY.md](AGENT-IDENTITY.md) Appendix B.4)

### 8.5 Example (Non-Normative)

```json
{
  "iss": "https://service-a.example.com",
  "sub": "agent:workflow-coordinator",
  "iat": 1709000000,
  "jti": "trace_01HQXYZ123456789",
  "peac": {
    "wire_type": "peac-receipt/0.1",
    "wire_version": "0.1"
  },
  "ext": [
    {
      "key": "org.peacprotocol/trace_context",
      "value": {
        "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
        "span_id": "00f067aa0ba902b7",
        "parent_span_id": "b3de928a0ba902c8",
        "trace_flags": "01"
      }
    }
  ]
}
```

---

## 9. ZT Extensions Sub-Profile

### 9.1 Purpose

Records evidence of credential lifecycle events. Applicable to identity providers, certificate authorities, and credential management systems that issue, rotate, or revoke credentials used by agents.

### 9.2 Field Requirements

| Field                                            | Requirement | Notes                                |
| ------------------------------------------------ | ----------- | ------------------------------------ |
| `iss`                                            | REQUIRED    | Issuer (credential authority)        |
| `sub`                                            | REQUIRED    | Subject (credential holder or agent) |
| `iat`                                            | REQUIRED    | Issued-at timestamp                  |
| `jti`                                            | REQUIRED    | Unique receipt identifier            |
| `peac.wire_type`                                 | REQUIRED    | `peac-receipt/0.1`                   |
| `peac.wire_version`                              | REQUIRED    | `0.1`                                |
| `ext[]` with `org.peacprotocol/credential_event` | REQUIRED    | Credential event details             |
| `ext[]` with `org.peacprotocol/actor_binding`    | RECOMMENDED | Actor identity binding               |

### 9.3 Credential Event Extension

The `org.peacprotocol/credential_event` extension captures credential lifecycle events:

- `event`: One of `issued`, `leased`, `rotated`, `revoked`, `expired`
- `credential_ref`: Opaque fingerprint reference (`sha256:<64 hex>` or `hmac-sha256:<64 hex>`). This is a format-validated reference; verifiers MUST NOT assume they can recompute it (DD-146)
- `authority`: HTTPS URL of the credential authority
- `expires_at`: Credential expiration (optional)
- `previous_ref`: Reference to the previous credential (optional, for rotation chains)

### 9.4 Actor Binding

ZT extension receipts SHOULD include an `org.peacprotocol/actor_binding` extension to bind the credential event to a specific actor identity (DD-142). See [AGENT-IDENTITY-PROFILE.md](AGENT-IDENTITY-PROFILE.md) for the ActorBinding specification.

### 9.5 Example

```json
{
  "iss": "https://idp.example.com",
  "sub": "agent:service-account-v3",
  "iat": 1709000000,
  "jti": "cred_01HQXYZ123456789",
  "peac": {
    "wire_type": "peac-receipt/0.1",
    "wire_version": "0.1"
  },
  "ext": [
    {
      "key": "org.peacprotocol/credential_event",
      "value": {
        "event": "rotated",
        "credential_ref": "sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
        "authority": "https://idp.example.com",
        "previous_ref": "sha256:f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5"
      }
    },
    {
      "key": "org.peacprotocol/actor_binding",
      "value": {
        "id": "sa:service-account-v3",
        "proof_type": "x509-pki",
        "origin": "https://idp.example.com"
      }
    }
  ]
}
```

---

## 10. Cross-Cutting Concerns

### 10.1 Actor Binding (DD-142)

Any ZT sub-profile receipt MAY include an `org.peacprotocol/actor_binding` extension to identify the actor involved. Actor binding is cross-cutting: it is not specific to any single sub-profile. See [AGENT-IDENTITY-PROFILE.md](AGENT-IDENTITY-PROFILE.md) for the full ActorBinding specification.

### 10.2 Receipt Chaining

Zero trust workflows often involve multiple receipts forming a chain: an access decision, followed by a tool invocation, followed by a risk assessment. Implementations SHOULD correlate receipts using:

- Shared `sub` (same agent across receipts)
- Trace context extension (same `trace_id`)
- Workflow correlation per [WORKFLOW-CORRELATION.md](WORKFLOW-CORRELATION.md)

### 10.3 Privacy

Zero trust receipts MUST follow PEAC privacy principles:

- No PII in receipt claims (use opaque identifiers)
- Hash-first approach for sensitive data (DD-138)
- Extension values SHOULD use digests, not raw payloads
- `user_id` fields SHOULD be opaque (not email addresses or names)

### 10.4 Neutrality

Zero trust profiles are vendor-neutral:

- No vendor names in profile constraints or extension keys
- No dependency on specific policy engines, identity providers, or monitoring tools
- Profiles work with any implementation that produces conforming receipts
- Record-vs-enforce distinction is explicit: receipts record what happened; they do not enforce what should happen

---

## 11. Conformance

### 11.1 Profile Conformance Levels

| Level        | Description                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------- |
| **Minimal**  | Receipt satisfies all REQUIRED fields for the sub-profile                                    |
| **Standard** | Receipt satisfies all REQUIRED and RECOMMENDED fields                                        |
| **Full**     | Receipt satisfies all fields including cross-cutting concerns (actor binding, trace context) |

### 11.2 Issuer Requirements

An issuer claiming conformance to a ZT sub-profile MUST:

1. Include all REQUIRED fields specified by the sub-profile
2. Not include PROHIBITED fields
3. Use registered extension keys from `registries.json`
4. Validate extension payloads against `@peac/schema` when schema is available
5. Sign the receipt using EdDSA (Ed25519)

### 11.3 Verifier Requirements

A verifier checking ZT sub-profile conformance MUST:

1. Verify the receipt signature per [PROTOCOL-BEHAVIOR.md](PROTOCOL-BEHAVIOR.md)
2. Check that all REQUIRED fields for the claimed sub-profile are present
3. Pass unknown extension keys through without error
4. NOT reject receipts for missing RECOMMENDED fields

### 11.4 Fixture References

Conformance fixtures for zero trust sub-profiles are located in `specs/conformance/fixtures/` under the relevant category directories:

- Agent identity fixtures: `specs/conformance/fixtures/agent-identity/`
- Attribution fixtures: `specs/conformance/fixtures/attribution/`
- Interaction fixtures: `specs/conformance/fixtures/interaction/`

---

## 12. Security Considerations

### 12.1 Extension Payload Size

Extension payloads in `ext[]` MUST NOT exceed 64 KB per entry (per Evidence Carrier Contract DD-124 through DD-131 transport limits). Implementations SHOULD enforce size limits at the schema layer.

### 12.2 URL Validation

All URL fields in extension payloads (such as `authority`, `registry_uri`, `policy_ref`) MUST:

- Use HTTPS scheme (no HTTP, `file://`, or `data://`)
- Not exceed 2048 characters
- Be validated against SSRF protection rules (DD-55)

### 12.3 Replay Protection

Each receipt MUST have a unique `jti` claim. Verifiers SHOULD maintain a replay detection window to prevent reuse of receipts across different authorization contexts.

### 12.4 Clock Skew

Verifiers SHOULD allow a clock skew tolerance of 30 seconds for `iat` and `exp` claims, consistent with [AGENT-IDENTITY.md](AGENT-IDENTITY.md) Section 5.2.

---

## 13. Version History

| Version | Date       | Changes                        |
| ------- | ---------- | ------------------------------ |
| 0.1     | 2026-03-01 | Initial specification (DD-145) |

---

## 14. References

- BCP 14 (RFC 2119, RFC 8174): Key words for use in RFCs
- RFC 8032: Edwards-Curve Digital Signature Algorithm (EdDSA)
- W3C Trace Context: https://www.w3.org/TR/trace-context/
- NIST SP 800-207: Zero Trust Architecture
- OWASP Agentic Security Initiative: ASI-01 through ASI-10
- [AGENT-IDENTITY.md](AGENT-IDENTITY.md): Agent Identity Specification
- [AGENT-IDENTITY-PROFILE.md](AGENT-IDENTITY-PROFILE.md): Agent Identity Profile (ActorBinding, MVIS)
- [INTERACTION-EVIDENCE.md](INTERACTION-EVIDENCE.md): Interaction Evidence Specification
- [PROTOCOL-BEHAVIOR.md](PROTOCOL-BEHAVIOR.md): Protocol Behavior Specification
- [KEY-ROTATION.md](KEY-ROTATION.md): Key Rotation Lifecycle Specification
- [WORKFLOW-CORRELATION.md](WORKFLOW-CORRELATION.md): Workflow Correlation Specification
- [EVIDENCE-CARRIER-CONTRACT.md](EVIDENCE-CARRIER-CONTRACT.md): Evidence Carrier Contract
