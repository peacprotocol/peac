# PEAC Protocol Specification Index

Canonical entry point for PEAC Protocol implementers and integrators.

## Normative Specifications

### Core Protocol

- **[Receipt Schema (JSON)](specs/PEAC-RECEIPT-SCHEMA-v0.1.json)** - JSON Schema for PEAC receipts (peac-receipt/0.1 wire format)
- **[Protocol Behavior](specs/PROTOCOL-BEHAVIOR.md)** - Issuance, verification, and discovery flows
- **[Errors](specs/ERRORS.md)** - Error codes, HTTP status mappings, and retry semantics
- **[Registries](specs/REGISTRIES.md)** - Payment rails, control engines, and transport methods

### Discovery

- **[Policy Document (PEAC-TXT)](specs/PEAC-TXT.md)** - `/.well-known/peac.txt` access terms for agents
- **[Issuer Configuration (PEAC-ISSUER)](specs/PEAC-ISSUER.md)** - `/.well-known/peac-issuer.json` JWKS discovery

### Attestations and Extensions

- **[Agent Identity](specs/AGENT-IDENTITY.md)** - Cryptographic proof-of-control binding for agents
- **[Attribution](specs/ATTRIBUTION.md)** - Content provenance and attribution chain semantics
- **[Dispute](specs/DISPUTE.md)** - Formal contestation of receipts and attestations
- **[Workflow Correlation](specs/WORKFLOW-CORRELATION.md)** - Multi-agent workflow DAG reconstruction and proof-of-run

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

## Related Documentation

- [API Reference](api/) - Endpoint documentation (v0.9.16+)
- [User Guides](guides/) - Integration patterns and best practices (v0.9.16+)
- [Architecture](architecture/) - High-level design and principles
- [Security](security/) - Threat models and security controls

## Versioning

- **[Versioning Doctrine](specs/VERSIONING.md)** - Wire version vs repo version, artifact identifiers, compatibility guarantees

Current wire format: `peac-receipt/0.1`

## Release Artifacts

The ERC-8004 mapping release bundle (`erc8004-mapping-v0.10.6-*.zip`) contains a subset of this repository focused on the ERC-8004 integration:

- `docs/mappings/erc-8004.md` - Core mapping specification
- `docs/mappings/eas.md` - EAS integration (Planned, non-normative)
- `examples/erc8004-feedback/` - Working example with verification
- `specs/conformance/erc8004-mapping/` - Conformance test vectors

Links to other specifications in this index may not resolve within the release bundle. For the full specification set, see the [PEAC Protocol repository](https://github.com/peacprotocol/peac).
