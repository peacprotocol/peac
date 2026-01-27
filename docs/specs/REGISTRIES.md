# PEAC Protocol Registries

**Status**: INFORMATIONAL (Non-Normative)

---

## 1. Purpose

PEAC registries provide **informational guidance** on common identifiers for:

- Payment rails (`payment.rail`)
- Control engines (`control.chain[].engine`)
- Transport binding methods (`binding.method`)
- Extension keys (`ext['org.peacprotocol/...']`)
- Attestation types (`type: 'peac/...'`)

**Important**: Registries are NOT normative. The core protocol uses opaque `string` types, allowing any identifier. Registries exist for:

- **Interoperability**: Common names improve cross-implementation compatibility
- **Discovery**: Help implementers find existing rails/engines
- **Documentation**: Centralize knowledge about ecosystem

---

## 2. Registry Structure

### 2.1 Machine-Readable: registries.json

Located at: `docs/specs/registries.json`

**Format**:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "version": "0.2.0",
  "payment_rails": [ ... ],
  "control_engines": [ ... ],
  "transport_methods": [ ... ],
  "agent_protocols": [ ... ],
  "extension_keys": [ ... ],
  "attestation_types": [ ... ]
}
```

**Entry format**:

```json
{
  "id": "x402",
  "category": "agentic-payment",
  "description": "HTTP 402-based paid call receipts",
  "reference": "https://www.x402.org/",
  "status": "informational"
}
```

**Fields**:

- `id`: Identifier used in receipts (e.g., `payment.rail = "x402"`)
- `category`: Broad classification
- `description`: Human-readable explanation
- `reference`: URL to specification/documentation (nullable)
- `status`: Always "informational" (no normative entries)

---

## 3. Payment Rails Registry

### 3.1 Current Entries

| ID             | Category           | Description                               | Reference                                                     |
| -------------- | ------------------ | ----------------------------------------- | ------------------------------------------------------------- |
| `x402`         | agentic-payment    | HTTP 402-based paid call receipts         | https://www.x402.org/                                         |
| `l402`         | agentic-payment    | Lightning HTTP 402 Protocol (LSAT)        | https://docs.lightning.engineering/the-lightning-network/l402 |
| `card-network` | card               | Generic card network (Visa/MC/etc.)       | -                                                             |
| `upi`          | account-to-account | Unified Payments Interface (India)        | https://www.npci.org.in/                                      |
| `razorpay`     | payment-gateway    | Razorpay gateway (UPI, cards, netbanking) | https://razorpay.com/docs/                                    |

### 3.2 Adding New Rails

To propose a new rail:

1. Open GitHub issue with proposed entry
2. Provide: id, category, description, reference
3. Demonstrate usage in real implementation
4. Submit PR to `registries.json`

**Approval criteria**:

- Non-conflicting ID
- Clear description
- Public documentation (if protocol-based)
- At least one implementation

---

## 4. Control Engines Registry

### 4.1 Current Entries

| ID                      | Category           | Description                                         |
| ----------------------- | ------------------ | --------------------------------------------------- |
| `spend-control-service` | limits             | Generic spend control (per-tx, daily, monthly)      |
| `risk-engine`           | fraud              | Generic risk/fraud scoring                          |
| `mandate-service`       | mandate            | Enterprise mandate/approval chain                   |
| `tap`                   | agent-verification | Trusted Agent Protocol control decisions (HTTP sig) |
| `rsl`                   | access-policy      | Robots Specification Layer usage token evaluation   |

### 4.2 Vendor-Neutral Names

Engine IDs MUST be vendor-neutral:

- GOOD: `spend-control-service` (generic)
- BAD: `locus-engine` (vendor-specific)

Vendor-specific details go in:

- `control.chain[].policy_id`: Can reference vendor policy
- `control.chain[].limits_snapshot`: Vendor-specific state
- Adapter packages: `examples/control-engines/locus/`

---

## 5. Transport Methods Registry

### 5.1 Current Entries

| ID               | Category            | Description                        | Reference                              |
| ---------------- | ------------------- | ---------------------------------- | -------------------------------------- |
| `dpop`           | proof-of-possession | DPoP (RFC 9449)                    | https://www.rfc-editor.org/rfc/rfc9449 |
| `http-signature` | message-signature   | HTTP Message Signatures (RFC 9421) | https://www.rfc-editor.org/rfc/rfc9421 |
| `none`           | none                | No transport binding               | -                                      |

---

## 6. Orchestration Frameworks Registry

> **Advisory**: This registry is for discovery and interoperability guidance only.
> Implementations MUST accept any identifier that passes the framework grammar
> (`/^[a-z][a-z0-9_-]*$/`, max 64 chars). The registry is NOT an allowlist --
> absence from this table does not make an identifier invalid.
> Implementations MUST NOT reject unknown frameworks solely because they are
> not listed here. Governance affects the registry, not protocol validity.

### 6.1 Current Entries

The `framework` field in WorkflowContext is an **open string field**. Any identifier matching the framework grammar (`/^[a-z][a-z0-9_-]*$/`, max 64 chars) is valid. Well-known values are listed here for interoperability. New frameworks do NOT require protocol updates.

The following table is **NON-NORMATIVE**. It lists well-known frameworks for discovery purposes.

| ID          | Category       | Description                            | Reference                                 |
| ----------- | -------------- | -------------------------------------- | ----------------------------------------- |
| `mcp`       | tool-protocol  | Model Context Protocol orchestration   | https://modelcontextprotocol.io/          |
| `a2a`       | agent-protocol | Google Agent2Agent Protocol            | https://a2a-protocol.org/                 |
| `crewai`    | framework      | CrewAI multi-agent framework           | https://www.crewai.com/                   |
| `langgraph` | framework      | LangGraph stateful agent orchestration | https://langchain-ai.github.io/langgraph/ |
| `autogen`   | framework      | Microsoft AutoGen multi-agent          | https://microsoft.github.io/autogen/      |
| `custom`    | generic        | Custom orchestration (catch-all)       | -                                         |

### 6.2 Framework Identifier Grammar

Framework identifiers MUST match: `/^[a-z][a-z0-9_-]*$/` (max 64 characters)

- Lowercase letters, digits, hyphens, and underscores
- Must start with a lowercase letter
- Examples: `dspy`, `smolagents`, `temporal-ai`, `my_orchestrator`

### 6.3 Adding New Frameworks

No protocol update is required. To add a well-known entry:

1. Open GitHub issue with proposed entry
2. Provide: id, category, description, reference
3. Submit PR to `registries.json`

---

## 7. Extension Keys Registry

### 7.1 Current Entries

Extension keys use reverse-DNS naming (`org.peacprotocol/...`) to avoid collisions with third-party extensions.

| ID                             | Category      | Description                                                 | Reference               |
| ------------------------------ | ------------- | ----------------------------------------------------------- | ----------------------- |
| `org.peacprotocol/workflow`    | orchestration | Workflow correlation context for multi-agent orchestration  | WORKFLOW-CORRELATION.md |
| `org.peacprotocol/obligations` | attribution   | Credit and contribution requirements (CC Signals alignment) | ATTRIBUTION.md          |
| `org.peacprotocol/receipt`     | metadata      | Receipt JWS in MCP tool response metadata                   | PROTOCOL-BEHAVIOR.md    |
| `org.peacprotocol/agent_id`    | identity      | Agent identity reference in MCP metadata                    | AGENT-IDENTITY.md       |

### 7.2 Naming Convention

Extension keys MUST use reverse-DNS format:

- First-party: `org.peacprotocol/{name}`
- Third-party: `{reverse-dns}/{name}` (e.g., `com.example/custom-field`)

---

## 8. Attestation Types Registry

### 8.1 Current Entries

Attestation types use the `peac/{name}` pattern for first-party types.

| ID                      | Category      | Description                                                        | Reference               |
| ----------------------- | ------------- | ------------------------------------------------------------------ | ----------------------- |
| `peac/attribution`      | provenance    | Content provenance and usage attestation                           | ATTRIBUTION.md          |
| `peac/dispute`          | resolution    | Formal contestation of receipts, attributions, or policy decisions | DISPUTE.md              |
| `peac/agent-identity`   | identity      | Cryptographic proof-of-control binding for agents                  | AGENT-IDENTITY.md       |
| `peac/workflow-summary` | orchestration | Proof-of-run attestation for multi-step workflows                  | WORKFLOW-CORRELATION.md |

### 8.2 Naming Convention

- First-party: `peac/{name}`
- Third-party: Use extension keys in `ext` rather than custom attestation types

---

## 9. Stability and Versioning

### 9.1 Entry Lifecycle

Entries can be:

- **Added**: New rails/engines/methods
- **Updated**: Description or reference changes
- **Deprecated**: Marked as `"status": "deprecated"`
- **Removed**: Only if never widely used

### 9.2 Versioning

Registry version (e.g., "0.1.0") increments on:

- **Patch** (0.1.x): Description/reference updates
- **Minor** (0.x.0): New entries added
- **Major** (x.0.0): Entries removed or IDs changed (breaking)

---

## 10. Relationship to Core Protocol

**Core protocol** (JSON Schema, PROTOCOL-BEHAVIOR.md):

- Defines `rail: string`, `engine: string`, etc.
- NO hardcoded identifiers
- Normative and stable

**Registries** (registries.json, this document):

- List common identifier values
- Non-normative guidance
- Can evolve independently

**Adapters** (`@peac/rails-*`, `examples/control-engines/*`):

- Implement specific rails/engines
- May use registry IDs or custom IDs
- Vendor-specific logic allowed

---

## 11. Registry Governance

This file and `registries.json` serve as the authoritative registries for the PEAC ecosystem:

- Centralized, maintained by the PEAC project
- Standardized submission process via GitHub
- Long-term stability through versioning

### 11.1 Governance Metadata

Each registry in `registries.json` includes governance metadata:

| Field           | Type                                        | Description                           |
| --------------- | ------------------------------------------- | ------------------------------------- |
| `stability`     | `"stable"` or `"experimental"`              | Whether the registry shape is settled |
| `owner`         | string                                      | Maintaining team or working group     |
| `change_policy` | `"additive"` or `"breaking-requires-major"` | How the registry evolves              |

- **`stable`**: Schema shape and existing entries are settled. New entries are additive only.
- **`experimental`**: Schema shape may change. Entries may be renamed or restructured.
- **`additive`**: New entries can be added in minor versions. Existing IDs are never removed in minor versions.
- **`breaking-requires-major`**: Removing or renaming an entry requires a major version bump.

### 11.2 Entry Lifecycle Fields

Each registry entry MAY include lifecycle fields for deprecation tracking:

| Field              | Type   | Description                                            |
| ------------------ | ------ | ------------------------------------------------------ |
| `introduced`       | string | Registry version where the entry was added             |
| `deprecated_since` | string | Registry version where the entry was deprecated        |
| `deprecated_by`    | string | ID of the replacement entry (absent if no replacement) |
| `sunset_version`   | string | Major version where the entry may be removed           |

### 11.3 Entry Deprecation

Entries may be deprecated but not removed in minor versions:

1. Set `"status": "deprecated"` on the entry
2. Add `"deprecated_by"` field pointing to the replacement (if any)
3. Add `"deprecated_since"` with the registry version that deprecated it
4. Add `"sunset_version"` to indicate the major version where removal is permitted
5. Removal only happens in a major version bump

**Implementation guidance for deprecated entries:**

- Implementations SHOULD emit a warning when encountering a deprecated entry
- Implementations MUST NOT reject data solely because it references a deprecated entry
- If `deprecated_by` is present, implementations SHOULD suggest the replacement in warnings
- Deprecated entries remain valid identifiers until the `sunset_version` is reached

### 11.4 Removal Semantics

Removal of a registry entry is a **major-version-only** operation with explicit constraints:

1. An entry may only be removed if `sunset_version` has been set AND the current major version is >= the `sunset_version` value.
2. If no `sunset_version` is set, the entry is considered **valid indefinitely** and MUST NOT be removed. Implementations should treat entries without `sunset_version` as permanent.
3. Removal requires a major version bump to the registry version.
4. Removed entries MUST be documented in the registry changelog with: the removal version, the original entry ID, and a reference to the replacement (if any).
5. Implementations encountering a removed entry in existing data (e.g., stored receipts referencing a removed rail ID) MUST NOT reject the data. Historical references remain valid for verification purposes.

**"Valid forever" semantics:**

Entries without a `sunset_version` field are implicitly permanent. To explicitly mark an entry as permanent, set `"sunset_version": "never"`. Both the absence of `sunset_version` and the value `"never"` carry the same semantics: the entry will not be removed in any future version.

**Tombstone semantics:**

Registry entries are **never deleted from the registry file**. Removal means setting `"status": "removed"` on the entry (a tombstone), not deleting the JSON object. This preserves the full history of the registry and enables consumers to distinguish "never existed" from "existed and was removed."

- Producers MUST NOT emit removed values in new data.
- Verifiers MUST continue accepting previously valid values in existing data (stored receipts, historical attestations) until a major-version boundary.
- Consumers encountering a removed entry SHOULD log a warning and MAY suggest the replacement via `deprecated_by`.

The entry lifecycle is:

```text
active -> deprecated -> removed
```

Each transition is a separate minor (deprecation) or major (removal) version bump. Entries MUST pass through `deprecated` before reaching `removed` -- direct removal of an active entry is not permitted.

**Removal checklist:**

- [ ] Entry is currently `deprecated` (not `active`)
- [ ] `sunset_version` is set and current major version >= that value
- [ ] Replacement entry exists (or explicit "no replacement" rationale documented)
- [ ] Migration guidance published in changelog
- [ ] Major version bump applied to registry version
- [ ] At least one minor version has passed since `deprecated_since` (grace period)
- [ ] Entry JSON updated to `"status": "removed"` (not deleted from file)

### 11.5 Governance Flow

```text
1. Proposer opens GitHub issue with:
   - Proposed entry (id, category, description, reference)
   - Rationale and usage evidence

2. Maintainers review for:
   - Non-conflicting ID
   - Clear description
   - At least one implementation (or credible intent)

3. If approved: PR merged, minor version bump
4. If rejected: Issue closed with rationale
5. If deprecated: status changed, minor version bump
6. If removed: major version bump required
```

---

## 12. Questions

For registry questions:

- **Adding entries**: Open GitHub issue
- **General questions**: File issue or discussion
- **Vendor-specific needs**: Use adapter packages, don't pollute registry
