# PEAC Workflow Correlation Specification

**Version:** 0.1
**Status:** Draft
**Since:** v0.10.2

## Abstract

This specification defines the workflow correlation primitives for PEAC Protocol, enabling verifiable multi-agent orchestration across heterogeneous frameworks (MCP, A2A, CrewAI, LangGraph, AutoGen, etc.). The design provides:

1. **WorkflowContext** - Per-receipt extension linking individual receipts into a DAG
2. **WorkflowSummary** - Attestation type providing a single "proof of run" artifact
3. **Merkle commitment** - Efficient verification for large workflows

These primitives enable auditors, compliance systems, and cross-organization partners to reconstruct and verify multi-step agentic workflows without relying on framework-specific logs.

## Table of Contents

1. [Motivation](#1-motivation)
2. [Design Principles](#2-design-principles)
3. [Workflow Context Extension](#3-workflow-context-extension)
4. [Workflow Summary Attestation](#4-workflow-summary-attestation)
5. [ID Formats](#5-id-formats)
6. [DAG Semantics](#6-dag-semantics)
7. [Merkle Commitment](#7-merkle-commitment)
8. [Streaming Receipts](#8-streaming-receipts)
9. [Framework Bindings](#9-framework-bindings)
10. [Security Considerations](#10-security-considerations)
11. [Conformance](#11-conformance)

## 1. Motivation

Multi-agent systems are increasingly used in enterprise AI. However, current orchestration frameworks provide:

- **Framework-native traces** - Not portable across organizations
- **Observability telemetry** - Not cryptographically verifiable
- **Blockchain-based proofs** - High latency, infrastructure requirements

PEAC fills the gap by providing **portable, offline-verifiable, cryptographic evidence** for multi-step workflows without requiring blockchain infrastructure.

### Use Cases

1. **Compliance** - EU AI Act Article 12 requires audit trails for AI systems
2. **Cross-org workflows** - Two companies prove "what our agents did together"
3. **Insurance/liability** - Identify exactly which step failed and who was responsible
4. **Payment settlement** - Pay-per-workflow (not just pay-per-call) commercial models

## 2. Design Principles

### 2.1 Non-Breaking

All workflow fields use the existing extensions mechanism (`claims.ext`). The wire format `peac-receipt/0.1` remains unchanged.

### 2.2 Framework-Agnostic

The correlation primitive works with any orchestration layer. The `framework` field is an open string identifier -- any value matching the grammar `/^[a-z][a-z0-9_-]*$/` (max 64 chars) is valid. Well-known values are listed in the PEAC registries for interoperability, but new frameworks do NOT require protocol updates.

Well-known frameworks (informational):

- `mcp` - Model Context Protocol
- `a2a` - Google Agent2Agent Protocol
- `crewai` - CrewAI
- `langgraph` - LangGraph
- `autogen` - AutoGen
- `custom` - Generic/custom orchestrators

### 2.3 DAG Semantics

Workflow steps form a directed acyclic graph (DAG), not a linear chain. This supports:

- Fork/join patterns
- Parallel execution
- Conditional branches

### 2.4 Deterministic Verification

All verification can be performed offline with the same result across implementations (TypeScript, Go, etc.).

## 3. Workflow Context Extension

### 3.1 Extension Key

The workflow context is placed in the receipt claims extensions:

```
claims.ext['org.peacprotocol/workflow']
```

**Canonical location (JWS payload):** `ext["org.peacprotocol/workflow"]`

The constant `WORKFLOW_EXTENSION_KEY` is exported from `@peac/schema` for programmatic access.

### 3.2 Schema

```typescript
interface WorkflowContext {
  // Correlation (REQUIRED)
  workflow_id: string; // Format: wf_{ulid|uuid}
  step_id: string; // Format: step_{ulid|uuid}
  parent_step_ids: string[]; // DAG parents (empty for root)

  // Orchestration (OPTIONAL)
  orchestrator_id?: string; // Agent identity ref
  orchestrator_receipt_ref?: string; // Receipt that started the workflow

  // Sequencing (OPTIONAL, for linear workflows)
  step_index?: number; // 0-based position
  step_total?: number; // Total steps if known

  // Metadata (OPTIONAL)
  tool_name?: string; // MCP tool, A2A skill, etc.
  framework?: string; // "mcp" | "a2a" | "crewai" | etc.

  // Hash Chain (OPTIONAL, for streaming)
  prev_receipt_hash?: string; // Format: sha256:{hex64}
}
```

### 3.3 Field Definitions

| Field                      | Type     | Required | Description                             |
| -------------------------- | -------- | -------- | --------------------------------------- |
| `workflow_id`              | string   | Yes      | Globally unique run identifier          |
| `step_id`                  | string   | Yes      | This step's unique identifier           |
| `parent_step_ids`          | string[] | Yes      | DAG parent edges (empty for root)       |
| `orchestrator_id`          | string   | No       | Agent identity of coordinator           |
| `orchestrator_receipt_ref` | string   | No       | Receipt ID that initiated this workflow |
| `step_index`               | number   | No       | 0-based position (linear workflows)     |
| `step_total`               | number   | No       | Total steps if known upfront            |
| `tool_name`                | string   | No       | Tool or skill invoked                   |
| `framework`                | string   | No       | Orchestration framework identifier      |
| `prev_receipt_hash`        | string   | No       | SHA-256 of previous receipt (streaming) |

### 3.4 Limits (DoS Protection)

| Limit                  | Value | Rationale                    |
| ---------------------- | ----- | ---------------------------- |
| Max parent steps       | 16    | Prevent unbounded fan-in     |
| Max workflow ID length | 128   | Reasonable for ULID + prefix |
| Max step ID length     | 128   | Reasonable for ULID + prefix |
| Max tool name length   | 256   | Accommodate namespaced tools |

### 3.5 Example

Receipt claims with workflow context (JWS payload):

```json
{
  "iss": "https://orchestrator.example.com",
  "aud": "https://tool.example.com",
  "iat": 1706000000,
  "rid": "019abc12-def3-7890-abcd-ef1234567890",
  "amt": 500,
  "cur": "USD",
  "payment": { "rail": "internal", "reference": "step-001" },
  "ext": {
    "org.peacprotocol/workflow": {
      "workflow_id": "wf_01HXZ5NWJQ8QJXKZ3V5N7BMGHC",
      "step_id": "step_01HXZ5NWJQ8QJXKZ3V5N7BMGHD",
      "parent_step_ids": ["step_01HXZ5NWJQ8QJXKZ3V5N7BMGHA"],
      "orchestrator_id": "agent:orchestrator@example.com",
      "tool_name": "web_search",
      "framework": "mcp"
    }
  }
}
```

## 4. Workflow Summary Attestation

### 4.1 Attestation Type

```
peac/workflow-summary
```

### 4.2 Schema

```typescript
interface WorkflowSummaryAttestation {
  type: 'peac/workflow-summary';
  issuer: string; // HTTPS URL
  issued_at: string; // ISO 8601
  expires_at?: string; // ISO 8601
  evidence: WorkflowSummaryEvidence;
}

interface WorkflowSummaryEvidence {
  workflow_id: string;
  status: 'in_progress' | 'completed' | 'failed' | 'cancelled';
  started_at: string; // ISO 8601
  completed_at?: string; // ISO 8601

  // Receipt commitment (at least one required)
  receipt_refs?: string[]; // For small workflows
  receipt_merkle_root?: string; // For large workflows (sha256:{hex64})
  receipt_count?: number; // Required if using Merkle root

  // Orchestration
  orchestrator_id: string;
  agents_involved: string[];

  // Outcome
  final_result_hash?: string; // sha256:{hex64}
  error_context?: WorkflowErrorContext;
}

interface WorkflowErrorContext {
  failed_step_id: string;
  error_code: string;
  error_message: string;
}
```

### 4.3 Validation Rules

1. MUST include either `receipt_refs` or `receipt_merkle_root` (or both)
2. If `receipt_merkle_root` is present, `receipt_count` MUST be present
3. If `status` is `"failed"`, `error_context` SHOULD be present
4. If `status` is terminal (`completed`, `failed`, `cancelled`), `completed_at` SHOULD be present

### 4.4 Example

```json
{
  "type": "peac/workflow-summary",
  "issuer": "https://orchestrator.example.com",
  "issued_at": "2026-01-25T10:30:00Z",
  "evidence": {
    "workflow_id": "wf_01HXZ5NWJQ8QJXKZ3V5N7BMGHC",
    "status": "completed",
    "started_at": "2026-01-25T10:00:00Z",
    "completed_at": "2026-01-25T10:30:00Z",
    "receipt_refs": [
      "0193c4d0-0000-7000-8000-000000000001",
      "0193c4d0-0000-7000-8000-000000000002",
      "0193c4d0-0000-7000-8000-000000000003"
    ],
    "orchestrator_id": "agent:orchestrator@example.com",
    "agents_involved": [
      "agent:orchestrator@example.com",
      "agent:search@example.com",
      "agent:writer@example.com"
    ],
    "final_result_hash": "sha256:a9d254ae620dd2e3747e14aae375f62dc414f7425705e202a94d71555a34c4fb"
  }
}
```

## 5. ID Formats

### 5.1 Workflow ID

Format: `wf_{payload}`

Where `{payload}` is:

- **ULID** (recommended): 26 uppercase alphanumeric characters
- **UUID**: 36 characters with hyphens

Pattern: `/^wf_[a-zA-Z0-9_-]{20,48}$/`

Examples:

- `wf_01HXZ5NWJQ8QJXKZ3V5N7BMGHC` (ULID)
- `wf_550e8400-e29b-41d4-a716-446655440000` (UUID)

### 5.2 Step ID

Format: `step_{payload}`

Where `{payload}` follows the same rules as workflow ID.

Pattern: `/^step_[a-zA-Z0-9_-]{20,48}$/`

Examples:

- `step_01HXZ5NWJQ8QJXKZ3V5N7BMGHD` (ULID)
- `step_550e8400-e29b-41d4-a716-446655440001` (UUID)

### 5.3 ID Generation

Implementations SHOULD use ULID for new IDs because:

- Time-ordered (millisecond precision)
- Lexicographically sortable
- URL-safe
- 128-bit entropy

Implementations MAY accept UUID payloads for compatibility with existing systems.

## 6. DAG Semantics

### 6.1 Root Step

A root step has an empty `parent_step_ids` array:

```json
{
  "workflow_id": "wf_01HXZ...",
  "step_id": "step_01HXZ...",
  "parent_step_ids": []
}
```

### 6.2 Linear Sequence

For linear workflows, each step has exactly one parent:

```
step_A (root) -> step_B -> step_C
```

```json
// step_B
{
  "parent_step_ids": ["step_A"]
}

// step_C
{
  "parent_step_ids": ["step_B"]
}
```

### 6.3 Fork Pattern

One step spawns multiple parallel steps:

```
step_A -> step_B
      \-> step_C
```

```json
// step_B
{ "parent_step_ids": ["step_A"] }

// step_C
{ "parent_step_ids": ["step_A"] }
```

### 6.4 Join Pattern

Multiple steps converge into one:

```
step_A -\
        -> step_C
step_B -/
```

```json
// step_C
{ "parent_step_ids": ["step_A", "step_B"] }
```

### 6.5 Per-Receipt Validation Rules (MUST)

Implementations MUST enforce these rules when issuing or validating a single receipt's WorkflowContext. These are enforced at schema validation time (issuance boundary).

1. **No self-parent**: `step_id` MUST NOT appear in `parent_step_ids`
2. **No duplicate parents**: `parent_step_ids` MUST NOT contain duplicate values
3. **Max fan-in**: `parent_step_ids.length` MUST be <= 16
4. **ID format**: `workflow_id` MUST match `/^wf_[a-zA-Z0-9_-]{20,48}$/`; `step_id` MUST match `/^step_[a-zA-Z0-9_-]{20,48}$/`
5. **Framework grammar**: If present, `framework` MUST match `/^[a-z][a-z0-9_-]*$/` (max 64 chars)
6. **Hash format**: If present, `prev_receipt_hash` MUST match `/^sha256:[a-f0-9]{64}$/`

Violations of any MUST rule MUST cause issuance to fail with an appropriate `E_WORKFLOW_*` error code.

### 6.6 Workflow-Level Verification Rules (SHOULD)

Implementations SHOULD enforce these rules when verifying a complete workflow (e.g., when verifying a `peac/workflow-summary` attestation). These require the full receipt set and cannot be checked per-receipt.

1. **Acyclic**: The full workflow graph SHOULD be verified as acyclic (topological sort)
2. **Parent existence**: All `parent_step_ids` references SHOULD resolve to existing step IDs within the workflow
3. **Single workflow**: All receipts in a summary SHOULD share the same `workflow_id`
4. **Hash chain integrity**: If `prev_receipt_hash` is used, the hash SHOULD match the SHA-256 of the referenced previous receipt

### 6.7 Optional Verification (MAY)

Implementations MAY additionally check:

1. **Step ordering**: `step_index` values are sequential and consistent with `step_total`
2. **Agent consistency**: All agent IDs in workflow contexts appear in the summary's `agents_involved`
3. **Temporal ordering**: Receipt timestamps are consistent with the DAG structure

> **Implementation Status:** Per-receipt validation (Section 6.5) is enforced by `@peac/schema` and `@peac/protocol` at `issue()` time. Workflow-level verification (Section 6.6) will be provided by `@peac/audit` via `verifyWorkflowSummary()` in a future release.

## 7. Merkle Commitment

> **Implementation Status:** Merkle commitment is specified for large workflows but implementation is deferred. The schema supports `receipt_merkle_root` field; helper functions for Merkle tree construction and verification will be added to `@peac/audit` in a future release.

For large workflows (100+ receipts), use Merkle root instead of listing all receipt IDs.

### 7.1 Construction (RFC 6962 Style)

```
MTH({d(0)}) = SHA-256(0x00 || d(0))  // Leaf
MTH(D[n]) = SHA-256(0x01 || MTH(D[0:k]) || MTH(D[k:n]))  // Internal node
```

Where:

- `d(i)` is the receipt digest (SHA-256 of JWS bytes)
- Leaves are prefixed with `0x00`
- Internal nodes are prefixed with `0x01`
- Tree is computed over lexicographically sorted receipt digests

### 7.2 Digest Computation

For each receipt JWS:

```
receipt_digest = SHA-256(jws_bytes)
```

Format in workflow summary: `sha256:{hex64}`

### 7.3 Inclusion Proof

To prove a receipt is part of a workflow:

```typescript
interface MerkleInclusionProof {
  leaf_index: number;
  tree_size: number;
  hashes: string[]; // sha256:{hex64}
}
```

### 7.4 Verification

```typescript
function verifyMerkleInclusion(
  root: string, // Expected Merkle root
  receiptDigest: string, // SHA-256 of receipt JWS
  proof: MerkleInclusionProof
): boolean;
```

## 8. Streaming Receipts

For long-running workflows, emit receipts progressively.

### 8.1 Hash Chain

Each streaming receipt links to the previous via `prev_receipt_hash`:

```json
{
  "workflow_id": "wf_01HXZ...",
  "step_id": "step_01HXZ...",
  "parent_step_ids": [],
  "prev_receipt_hash": "sha256:a9d254ae620dd2e3..."
}
```

### 8.2 Verification

Hash chain verification proves ordering:

1. Verify each receipt's signature
2. Verify `prev_receipt_hash` matches SHA-256 of previous receipt
3. Build sequence from root (no `prev_receipt_hash`) to tip

### 8.3 Progress Events

For steps that emit multiple receipts (progress updates), use the same `step_id` with different `prev_receipt_hash`:

```
receipt_1 (step_A, prev: null)
  -> receipt_2 (step_A, prev: hash(receipt_1))
  -> receipt_3 (step_A, prev: hash(receipt_2))
```

## 9. Framework Bindings

### 9.1 MCP (Model Context Protocol)

```typescript
// In @peac/mappings-mcp
interface MCPOrchestrationContext {
  mcp_session_id: string;
  mcp_server_uri: string;
  tool_call_id: string;
  tool_name: string;

  // Link to workflow
  workflow_id?: string;
  step_id?: string;
}
```

MCP bindings:

- `mcp_session_id` maps to same-session receipts
- `tool_call_id` is unique per invocation
- Store in `auth.extensions['org.peacprotocol/mcp']`

### 9.2 A2A (Agent2Agent Protocol)

```typescript
// In @peac/mappings-a2a
interface A2ATaskBinding {
  task_id: string;
  context_id: string; // A2A's grouping ID
  agent_card_url: string;
  skill_name: string;

  // Link to workflow
  workflow_id?: string;
  step_id?: string;
}
```

A2A bindings:

- `context_id` maps to `workflow_id`
- `task_id` maps to `step_id`
- Store in `auth.extensions['org.peacprotocol/a2a']`

### 9.3 Custom Frameworks

For CrewAI, LangGraph, AutoGen, or custom orchestrators:

- Set `framework` field to identify the source
- Use native IDs (run_id, task_id) as payload in PEAC IDs
- Store framework-specific context in `ext['your.domain/context']`

### 9.4 OpenTelemetry / W3C Trace Context Mapping

PEAC workflow correlation can integrate with existing observability pipelines through W3C Trace Context (OpenTelemetry). This enables enterprises to correlate receipts with distributed traces.

**Mapping:**

| PEAC Field             | OTel/Trace Context       | Notes                               |
| ---------------------- | ------------------------ | ----------------------------------- |
| `workflow_id`          | `trace-id`               | Both identify the overall operation |
| `step_id`              | `span-id`                | Both identify a single step         |
| `parent_step_ids[0]`   | `parent-id`              | OTel spans have single parent       |
| `parent_step_ids[1..]` | span links               | Multi-parent joins use span links   |
| `tool_name`            | `span.name` / attributes | Maps to operation name              |
| `framework`            | `otel.library.name`      | Instrumentation library             |

**Multi-parent handling:**

OTel spans have exactly one parent, but PEAC supports multi-parent DAGs (fork-join). When mapping:

```typescript
// PEAC multi-parent join
{
  "step_id": "step_join",
  "parent_step_ids": ["step_branch_a", "step_branch_b"]
}

// OTel representation
{
  "span_id": "step_join_span",
  "parent_span_id": "step_branch_a_span",  // First parent
  "links": [
    { "span_id": "step_branch_b_span" }    // Additional parents as links
  ]
}
```

**Traceparent header integration:**

When issuing receipts in an OTel-instrumented context:

```typescript
import { context, trace } from '@opentelemetry/api';

const span = trace.getActiveSpan();
if (span) {
  const ctx = span.spanContext();
  // Use trace_id as workflow_id basis (or create mapping)
  const workflowId = createWorkflowId(ctx.traceId);
  const stepId = createStepId(ctx.spanId);
}
```

**Recommended practices:**

- Store OTel trace-id in receipt for cross-system correlation
- Use span links for multi-parent relationships
- Include `trace.trace_id` in receipt metadata for debugging
- Export receipts as OTel span events for unified observability

## 10. Security Considerations

### 10.1 ID Guessing

Workflow and step IDs should be unpredictable:

- Use cryptographically random ULID/UUID payloads
- Do not derive IDs from predictable inputs

### 10.2 Correlation Privacy and Threat Model

Workflow correlation creates **linkability** - the ability to connect multiple receipts and infer business process structure. Enterprises deploying this feature MUST understand these implications.

**What correlation reveals:**

| Data Element      | Risk                              | Mitigation                              |
| ----------------- | --------------------------------- | --------------------------------------- |
| `workflow_id`     | Links all steps in a workflow     | Use opaque, non-semantic IDs            |
| `parent_step_ids` | Reveals execution graph structure | Consider redaction for external parties |
| `orchestrator_id` | Identifies coordinator agent      | May leak organizational structure       |
| `tool_name`       | Reveals capabilities used         | Use generic names when sensitive        |
| `step_total`      | Reveals workflow complexity       | Omit if not needed                      |

**Privacy requirements:**

- **MUST** allow pseudonymous IDs (opaque, non-semantic workflow/step IDs)
- **SHOULD** support tenant scoping (e.g., namespace workflow IDs by `iss` domain)
- **SHOULD** support selective disclosure (publish summary without full step graph)
- **MAY** support redaction mode (omit `parent_step_ids` in shared receipts)

**Threat scenarios:**

1. **Cross-tenant correlation**: A vendor correlates workflow IDs across tenants to infer usage patterns.
   - Mitigation: Generate unique workflow ID prefixes per tenant.

2. **Business process inference**: An attacker reconstructs business logic from DAG structure.
   - Mitigation: Use generic tool names; omit `step_index`/`step_total` if sensitive.

3. **Selective omission**: An orchestrator selectively omits steps to hide failures.
   - Mitigation: Require Merkle commitment for audited workflows; verify completeness.

**Recommended practices:**

- Generate workflow IDs with per-tenant entropy
- Do not embed semantic information in IDs (e.g., avoid `wf_payroll_2026_01`)
- Consider workflow correlation an opt-in feature for privacy-sensitive deployments
- Document what correlation reveals in your privacy policy

### 10.3 DoS Protection

Limits prevent resource exhaustion:

- Max 16 parent steps (fan-in limit)
- Max 10,000 receipt refs in summary
- Max 100 agents involved

### 10.4 Replay Protection

Workflow summaries should include:

- Unique workflow_id (prevents replay of entire workflow)
- Timestamps (issued_at, completed_at) for freshness

## 11. Conformance

### 11.1 Conformance Levels

**MUST** (per-receipt, enforced at issuance -- see Section 6.5):

- Validate `workflow_id` and `step_id` formats against regex patterns
- Enforce `parent_step_ids` max limit (16)
- Reject self-parent and duplicate parents
- Validate `framework` grammar if present
- Validate `prev_receipt_hash` format if present
- Validate workflow summary has receipt commitment (`receipt_refs` or `receipt_merkle_root`)
- Accept any `framework` value matching the grammar (open string, not closed enum)

**SHOULD** (workflow-level, enforced at summary verification -- see Section 6.6):

- Verify acyclic graph structure
- Verify all parent step references exist
- Verify single `workflow_id` across all receipts
- Verify hash chain integrity for streaming receipts
- Use ULID for new IDs
- Include `framework` field for traceability

**MAY** (optional -- see Section 6.7):

- Support Merkle inclusion proofs
- Support framework-specific bindings
- Verify step ordering consistency
- Verify temporal ordering consistency

### 11.2 Test Vectors

Conformance fixtures are provided at:

```text
specs/conformance/fixtures/workflow/
  valid.json           # Valid WorkflowContext and WorkflowSummaryAttestation vectors
  invalid.json         # Invalid vectors that must be rejected
  edge-cases.json      # Boundary conditions and limits testing
  README.md            # Fixture documentation
```

### 11.3 Implementation Requirements

Implementations MUST (per-receipt):

1. Parse and validate WorkflowContext from extensions
2. Validate ID formats with provided regex patterns
3. Enforce per-receipt DAG semantics (no self-parent, no duplicates, max fan-in)
4. Validate framework grammar when present (open string, constrained pattern)
5. Verify workflow summaries include receipt commitment

Implementations SHOULD (workflow-level):

1. Provide helpers for ID generation
2. Support Merkle root computation for large workflows
3. Provide DAG reconstruction and cycle detection from receipt set
4. Verify parent step reference existence

## References

- [RFC 6962: Certificate Transparency](https://datatracker.ietf.org/doc/html/rfc6962) - Merkle tree construction
- [ULID Spec](https://github.com/ulid/spec) - ID format
- [MCP Specification](https://modelcontextprotocol.io/specification) - Model Context Protocol
- [A2A Protocol](https://a2a-protocol.org/) - Agent-to-Agent Protocol
- [W3C PROV-DM](https://www.w3.org/TR/prov-dm/) - Provenance Data Model
