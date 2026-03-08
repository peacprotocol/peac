# PEAC Protocol Specification Index

Canonical entry point for PEAC Protocol implementers and integrators.

## Normative Specifications

### Core Protocol

- **[Receipt Schema (JSON)](specs/PEAC-RECEIPT-SCHEMA-v0.1.json)** - JSON Schema for PEAC receipts (peac-receipt/0.1 wire format)
- **[Wire 0.2 Specification](specs/WIRE-0.2.md)** - Wire 0.2 envelope, kinds, typed extensions, policy binding (preview)
- **[Protocol Behavior](specs/PROTOCOL-BEHAVIOR.md)** - Issuance, verification, and discovery flows
- **[Errors](specs/ERRORS.md)** - Error codes, HTTP status mappings, and retry semantics
- **[Registries](specs/REGISTRIES.md)** - Payment rails, control engines, and transport methods

### Discovery

- **[Policy Document (PEAC-TXT)](specs/PEAC-TXT.md)** - `/.well-known/peac.txt` access terms for agents
- **[Issuer Configuration (PEAC-ISSUER)](specs/PEAC-ISSUER.md)** - `/.well-known/peac-issuer.json` JWKS discovery

### Identity and Key Management

- **[Agent Identity](specs/AGENT-IDENTITY.md)** - Cryptographic proof-of-control binding for agents
- **[Agent Identity Profile](specs/AGENT-IDENTITY-PROFILE.md)** - Expanded agent identity: 8 proof types, ActorBinding, MVIS, RATS/EAT alignment
- **[Key Rotation](specs/KEY-ROTATION.md)** - Key lifecycle management: FSM, overlap periods, kid reuse detection, emergency revocation

### Zero Trust Profiles

- **[Zero Trust Profile Pack](specs/ZERO-TRUST-PROFILE-PACK.md)** - 7 sub-profiles as documentation overlays (Access, Toolcall, Decision, Risk Signal, Sync, Tracing, ZT Extensions)

### Infrastructure

- **[Evidence Carrier Contract](specs/EVIDENCE-CARRIER-CONTRACT.md)** - Transport-neutral receipt placement: carrier types, size limits, extraction rules
- **[Kernel Constraints](specs/KERNEL-CONSTRAINTS.md)** - Structural limits enforced at issuance and verification (fail-closed)
- **[Issuer Operations Baseline](specs/ISSUER-OPS-BASELINE.md)** - Operational requirements for receipt issuers

### Attestations and Extensions

- **[Attribution](specs/ATTRIBUTION.md)** - Content provenance and attribution chain semantics
- **[Dispute](specs/DISPUTE.md)** - Formal contestation of receipts and attestations
- **[Workflow Correlation](specs/WORKFLOW-CORRELATION.md)** - Multi-agent workflow DAG reconstruction and proof-of-run

### Profiles

- **[Profiles Overview](specs/PROFILES.md)** - Transport, proof capture, and wire format profile taxonomy

### Proof Capture Profiles

- **[RFC 9421 Proof Capture](specs/PEAC-PROOF-RFC9421.md)** - HTTP Message Signature verification evidence

### Wire Format Profiles

- **[HTTP 402 Profile](specs/PEAC-HTTP402-PROFILE.md)** - HTTP 402 Payment Required integration

### Testing

- **[Test Vectors](specs/TEST_VECTORS.md)** - Golden vectors and negative test cases

## Protocol Mappings

External protocol integrations and identity anchors.

- **[ERC-8004 (Trustless Agents)](mappings/erc-8004.md)** - On-chain agent identity and reputation integration
- **[EAS (Ethereum Attestation Service)](mappings/eas.md)** - On-chain receipt anchoring via attestations (Planned)

## Guides

- **[Multi-Tenant Receipt Isolation](guides/multi-tenant.md)** - 3-tier isolation guidance (Shared, Scoped, Isolated)
- **[x402 Integration](guides/x402-peac.md)** - PEAC receipts with x402 payment flows
- **[Go Middleware](guides/go-middleware.md)** - Go SDK middleware integration

### Edge Computing

- [Cloudflare Workers](guides/edge/cloudflare-workers.md)
- [Fastly Compute](guides/edge/fastly-compute.md)
- [Akamai EdgeWorkers](guides/edge/akamai-edgeworkers.md)

## Governance Framework Mappings

- [NIST AI RMF Mapping](governance/NIST-AI-RMF-MAPPING.md)
- [EU AI Act Evidence Mapping](governance/EU-AI-ACT-EVIDENCE.md)
- [OWASP ASI Zero Trust Mapping](governance/OWASP-ASI-ZT-MAPPING.md)
- [ISO 42001 Mapping](governance/ISO-42001-MAPPING.md)
- [IEEE 7001 Mapping](governance/IEEE-7001-MAPPING.md)
- [OECD AI Principles Mapping](governance/OECD-AI-PRINCIPLES-MAPPING.md)
- [Singapore MGFAA Alignment](governance/SINGAPORE-MGFAA-ALIGNMENT.md)
- [AWS RAI Compliance Mapping](governance/AWS-RAI-COMPLIANCE-MAPPING.md)

## Related Documentation

- [API Reference](api/) - Endpoint documentation (v0.9.16+)
- [User Guides](guides/) - Integration patterns and best practices (v0.9.16+)
- [Architecture](architecture/) - High-level design and principles
- [Security](security/) - Threat models and security controls

## Versioning

- **[Versioning Doctrine](specs/VERSIONING.md)** - Wire version vs repo version, artifact identifiers, compatibility guarantees

Current wire formats: `peac-receipt/0.1` (frozen legacy), `interaction-record+jwt` (Wire 0.2, current)

## Release Artifacts

The ERC-8004 mapping release bundle (`erc8004-mapping-v0.10.6-*.zip`) contains a subset of this repository focused on the ERC-8004 integration:

- `docs/mappings/erc-8004.md` - Core mapping specification
- `docs/mappings/eas.md` - EAS integration (Planned, non-normative)
- `examples/erc8004-feedback/` - Working example with verification
- `specs/conformance/erc8004-mapping/` - Conformance test vectors

Links to other specifications in this index may not resolve within the release bundle. For the full specification set, see the [PEAC Protocol repository](https://github.com/peacprotocol/peac).
