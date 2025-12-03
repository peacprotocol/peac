# PEAC Protocol Specification Index

Canonical entry point for PEAC Protocol implementers and integrators.

## Normative Specifications

### Core Protocol

- **[Receipt Schema (JSON)](specs/PEAC-RECEIPT-SCHEMA-v0.9.json)** - JSON Schema for PEAC receipts (v0.9.x wire format)
- **[Protocol Behavior](specs/PROTOCOL-BEHAVIOR.md)** - Issuance, verification, and discovery flows
- **[Errors](specs/ERRORS.md)** - Error codes, HTTP status mappings, and retry semantics
- **[Registries](specs/REGISTRIES.md)** - Payment rails, control engines, and transport methods

### Wire Format Profiles

- **[HTTP 402 Profile](specs/PEAC-HTTP402-PROFILE.md)** - HTTP 402 Payment Required integration

### Testing

- **[Test Vectors](specs/TEST_VECTORS.md)** - Golden vectors and negative test cases

## Related Documentation

- [API Reference](api/) - Endpoint documentation (v0.9.16+)
- [User Guides](guides/) - Integration patterns and best practices (v0.9.16+)
- [Architecture](architecture/) - High-level design and principles
- [Security](security/) - Threat models and security controls

## Versioning

Current wire format: `peac.receipt/0.9`
