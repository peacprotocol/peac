# Ecosystem Record Carrier Classification

> **Purpose:** Classifies public PEAC ecosystem surfaces by whether they produce, carry, or consume Wire records.
> **Rule:** This is a technical interoperability reference for repository-defined record surfaces.
> **Source:** Generated from `docs/interop/ecosystem-record-carriers.json`. Do not edit manually.

## Record-carrying ecosystem surfaces

### MCP (Model Context Protocol)

- **PR:** #472 (commit `9e5c5dea`)
- **Surface:** peac_issue tool produces Wire 0.2 records; peac_verify tool verifies them
- **Evidence:** Round-trip issuance and verification via MCP tool calls
- **Wire version:** Wire 0.2
- **Classification:** record-carrying surface
- **Test files:** `packages/mcp-server/tests/handlers/issue.test.ts`, `packages/mcp-server/tests/handlers/verify.test.ts`
- **Spec refs:** `docs/specs/EVIDENCE-CARRIER-CONTRACT.md`

### A2A (Agent-to-Agent Protocol)

- **PR:** #473 (commit `56fd7047`)
- **Surface:** Wire 0.2 records carried in A2A metadata[extensionURI] per Evidence Carrier Contract
- **Evidence:** Round-trip through A2A metadata carrier (issue, embed, extract, verify)
- **Wire version:** Wire 0.2
- **Classification:** record-carrying surface
- **Test files:** `tests/integration/a2a/wire02-roundtrip.test.ts`
- **Spec refs:** `docs/specs/EVIDENCE-CARRIER-CONTRACT.md`

## Supporting evidence inputs

### EAT (Entity Attestation Token)

- **PR:** #474 (commit `f20e0f61`)
- **Surface:** COSE_Sign1 (RFC 9052) identity adapter; maps EAT claims to PEAC actor binding
- **Evidence:** Passport-style identity input; does not produce Wire 0.2 records in the EAT ecosystem
- **Wire version:** N/A (identity input, not record output)
- **Classification:** supporting evidence input
- **Rationale:** EAT is an identity input surface. It enriches PEAC records with external attestations but does not constitute a distinct ecosystem producing Wire 0.2 evidence.
- **Test files:** `packages/adapters/eat/tests/passport.test.ts`, `packages/adapters/eat/tests/claim-mapper.test.ts`
- **Spec refs:** `docs/specs/EVIDENCE-CARRIER-CONTRACT.md`

## Classification Rules

1. A surface is classified as record-carrying when repository artifacts show it produces, carries, or consumes Wire records.
2. Identity adapters, claim mappers, and format converters are supporting evidence inputs unless they themselves produce, carry, or consume Wire records.
3. Do not classify a supporting input as a record-carrying surface without repository tests or fixtures for the record-carrying behavior.
