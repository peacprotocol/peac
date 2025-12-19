# PEAC Protocol Registries

**Status**: INFORMATIONAL (Non-Normative)

---

## 1. Purpose

PEAC registries provide **informational guidance** on common identifiers for:

- Payment rails (`payment.rail`)
- Control engines (`control.chain[].engine`)
- Transport binding methods (`binding.method`)

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
  "version": "0.1.0",
  "payment_rails": [ ... ],
  "control_engines": [ ... ],
  "transport_methods": [ ... ]
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

| ID             | Category           | Description                         | Reference                                                     |
| -------------- | ------------------ | ----------------------------------- | ------------------------------------------------------------- |
| `x402`         | agentic-payment    | HTTP 402-based paid call receipts   | https://www.x402.org/                                         |
| `l402`         | agentic-payment    | Lightning HTTP 402 Protocol (LSAT)  | https://docs.lightning.engineering/the-lightning-network/l402 |
| `card-network` | card               | Generic card network (Visa/MC/etc.) | -                                                             |
| `upi`          | account-to-account | Unified Payments Interface (India)  | https://www.npci.org.in/                                      |

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

## 6. Stability and Versioning

### 6.1 Entry Lifecycle

Entries can be:

- **Added**: New rails/engines/methods
- **Updated**: Description or reference changes
- **Deprecated**: Marked as `"status": "deprecated"`
- **Removed**: Only if never widely used

### 6.2 Versioning

Registry version (e.g., "0.1.0") increments on:

- **Patch** (0.1.x): Description/reference updates
- **Minor** (0.x.0): New entries added
- **Major** (x.0.0): Entries removed or IDs changed (breaking)

---

## 7. Relationship to Core Protocol

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

## 8. Registry Governance

This file and `registries.json` serve as the authoritative registries for the PEAC ecosystem:

- Centralized, maintained by the PEAC project
- Standardized submission process via GitHub
- Long-term stability through versioning

---

## 9. Questions

For registry questions:

- **Adding entries**: Open GitHub issue
- **General questions**: File issue or discussion
- **Vendor-specific needs**: Use adapter packages, don't pollute registry
