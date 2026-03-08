# Integration Evidence Catalog

> **Purpose:** Documents which ecosystem integrations count toward DD-90 gates and which do not.
> **Rule:** Only integrations that produce or consume Wire 0.2 receipts in a distinct ecosystem count.
> **Source:** Generated from `docs/adoption/integration-evidence.json`. Do not edit manually.

## DD-90 Ecosystem Integrations (Count: 2)

### MCP (Model Context Protocol)

- **PR:** #472 (commit `9e5c5dea`)
- **Surface:** peac_issue tool produces Wire 0.2 receipts; peac_verify tool verifies them
- **Evidence:** Round-trip issuance and verification via MCP tool calls
- **Wire version:** Wire 0.2
- **DD-90 gate:** YES (distinct ecosystem with Wire 0.2 production)
- **Test files:** `packages/mcp-server/tests/handlers/issue.test.ts`, `packages/mcp-server/tests/handlers/verify.test.ts`
- **Spec refs:** `docs/specs/EVIDENCE-CARRIER-CONTRACT.md`

### A2A (Agent-to-Agent Protocol)

- **PR:** #473 (commit `56fd7047`)
- **Surface:** Wire 0.2 receipts carried in A2A metadata[extensionURI] per Evidence Carrier Contract
- **Evidence:** Round-trip through A2A metadata carrier (issue, embed, extract, verify)
- **Wire version:** Wire 0.2
- **DD-90 gate:** YES (distinct ecosystem with Wire 0.2 production)
- **Test files:** `tests/integration/a2a/wire02-roundtrip.test.ts`
- **Spec refs:** `docs/specs/EVIDENCE-CARRIER-CONTRACT.md`

## Non-DD-90 Integrations (Correctly Classified)

### EAT (Entity Attestation Token)

- **PR:** #474 (commit `f20e0f61`)
- **Surface:** COSE_Sign1 (RFC 9052) identity adapter; maps EAT claims to PEAC actor binding
- **Evidence:** Passport-style identity input; does not produce Wire 0.2 receipts in the EAT ecosystem
- **Wire version:** N/A (identity input, not receipt output)
- **DD-90 gate:** NO (DD-154)
- **Rationale:** EAT is an identity input surface. It enriches PEAC receipts with external attestations but does not constitute a distinct ecosystem producing Wire 0.2 evidence.
- **Test files:** `packages/adapters/eat/tests/passport.test.ts`, `packages/adapters/eat/tests/claim-mapper.test.ts`
- **Spec refs:** `docs/specs/EVIDENCE-CARRIER-CONTRACT.md`

## Classification Rules

1. An integration counts toward DD-90 if it produces or consumes Wire 0.2 receipts (interaction-record+jwt) in a distinct protocol ecosystem.
2. Identity adapters, claim mappers, and format converters that feed into PEAC but do not themselves produce receipts are classified under their own DDs.
3. Do not inflate the ecosystem count by reclassifying adapters as integrations.
