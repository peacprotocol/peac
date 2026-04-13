# Runtime Governance Profile

> Part of [PEAC Specs](../specs/) | Since: v0.12.10 | Status: Draft

Defines how runtime-governance records map to existing PEAC primitives.
Documentary overlay: no wire change, no new frozen extension group.

PEAC validates the structure and signature of the PEAC record, not the truth
of the upstream governance decision or the operating effectiveness of the
upstream control plane.

## 1. Abstract

Managed runtimes (such as Microsoft Agent Governance Toolkit, Claude Managed
Agents, and OpenAI ACP-backed runtimes) produce governance artifacts: policy
decisions, audit entries, authority scope changes, lifecycle transitions, trust
signals, and compliance assessments. This profile defines how to record those
artifacts as signed PEAC Interaction Records using existing Wire 0.2 primitives.

PEAC is the records plane beneath these runtimes, not the control plane itself.
A runtime decides and enforces; PEAC records what the runtime reported, in a
form any third party can verify with the issuer's public key.

## 2. Scope

This profile covers **observational records** from runtime governance systems.

**In scope:**

- Recording governance decisions (allow, deny, warn, require_approval, log)
- Recording audit entries with upstream integrity references
- Recording authority and scope changes
- Recording agent lifecycle state transitions
- Recording trust signals as opaque observational data
- Recording compliance assessments as opaque observational data

**Out of scope:**

- Policy enforcement (runtime responsibility)
- Trust score computation or validation (runtime responsibility)
- Compliance determination (auditor responsibility)
- Runtime control (sandbox management, kill switch, privilege rings)
- Upstream cryptographic verification (ML-DSA-65, SPIFFE, Merkle chain)
- Identity issuance or management

## 3. Record Categories

Six observation-specific categories, each mapped to a distinct type URI.
All categories produce Interaction Records with `kind: "evidence"`.

| #   | Category               | Type URI                                                     | Description                                                                                                                       |
| --- | ---------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Policy Decision        | `org.peacprotocol/runtime-governance-policy-decision`        | Observational record of a governance decision: action taken, rule matched, policy referenced, evaluation duration                 |
| 2   | Audit Entry            | `org.peacprotocol/runtime-governance-audit-entry`            | Observational record of a runtime audit log entry, preserving upstream integrity references (hash chain, entry ID) as opaque data |
| 3   | Authority Scope        | `org.peacprotocol/runtime-governance-authority-scope`        | Observational record of scope narrowing, privilege tier assignment, or invariant matching                                         |
| 4   | Lifecycle Event        | `org.peacprotocol/runtime-governance-lifecycle-event`        | Observational record of agent state transitions (provisioning, credential rotation, suspension, decommissioning, etc.)            |
| 5   | Trust Observation      | `org.peacprotocol/runtime-governance-trust-observation`      | Observational record of trust signals. PEAC never computes, validates, or weights trust scores                                    |
| 6   | Compliance Observation | `org.peacprotocol/runtime-governance-compliance-observation` | Observational record of compliance framework assessments. PEAC never makes compliance determinations                              |

## 4. Extension Namespace

All runtime-governance adapters share a single extension namespace:

```
org.peacprotocol/runtime-governance
```

This namespace is used by `@peac/adapter-runtime-governance` and any future
runtime-governance adapters. It is NOT frozen as a first-party typed extension
group unless two independent integrations require the identical structure.

## 5. Type URI Pattern

```
org.peacprotocol/runtime-governance-{observation-type}
```

The `{observation-type}` suffix is observation-specific (e.g., `policy-decision`,
`trust-observation`). This prevents semantic bleed into authoritative claims:
a `trust-observation` is explicitly observational, not a trust determination.

## 6. Interaction Record Kind

All runtime-governance records use `kind: "evidence"` (Wire 0.2 protocol value).
This is the standard kind for observational records in PEAC.

## 7. Preserved Upstream Artifact

Adapters SHOULD include a `upstream` block in the extension data with stable
observational fields for source correlation:

| Field                     | Type     | Description                                                  |
| ------------------------- | -------- | ------------------------------------------------------------ |
| `source_system`           | `string` | Identifier for the upstream system (e.g., `"microsoft-agt"`) |
| `source_event_type`       | `string` | Upstream event type identifier                               |
| `source_event_id`         | `string` | Upstream event identifier for deduplication                  |
| `source_timestamp`        | `string` | Upstream event timestamp (ISO 8601)                          |
| `source_artifact_hash`    | `string` | Hash of the upstream artifact, if available                  |
| `source_artifact_ref`     | `string` | URI or reference to the upstream artifact                    |
| `source_cloud_event_type` | `string` | CloudEvents type URI for cross-system correlation            |

All fields are optional. All fields are observational: they record what the
upstream system reported, not what PEAC verified.

## 8. Anti-Patterns

Runtime-governance adapters MUST NOT:

- Compute trust scores or risk assessments
- Enforce policies or make allow/deny decisions
- Make compliance determinations or issue certifications
- Reproduce or verify upstream cryptographic operations (ML-DSA-65, SPIFFE/SVID, Merkle chain integrity)
- Synthesize governance state from non-governance artifacts
- Import upstream vendor SDKs as runtime dependencies
- Hardcode vendor or provider names in type URIs, constants, or extension namespace

An upstream "allow" decision is recorded as a signed record of what the runtime
reported, not proof that the action actually completed or that policy was
globally satisfied.

## 9. CloudEvents Compatibility

Adapters MAY reference upstream CloudEvents type URIs (e.g.,
`ai.agentmesh.policy.evaluation`, `ai.agentmesh.trust.handshake`) in the
`source_cloud_event_type` field of the preserved upstream artifact block.

This is non-normative correlation metadata. PEAC does not consume, validate,
or depend on CloudEvents semantics.

## 10. Cryptographic Diversity

Upstream runtime governance systems may use cryptographic schemes that differ
from PEAC's signing algorithm. For example, Microsoft AGT uses Ed25519 plus
ML-DSA-65 (FIPS 204, quantum-safe). PEAC signs its own Interaction Records
with Ed25519 per the Wire 0.2 specification.

Upstream cryptographic artifacts (signatures, certificates, key material) are
preserved as opaque metadata in the extension data. PEAC does not verify,
reproduce, or validate upstream cryptographic operations in v0.12.10.
