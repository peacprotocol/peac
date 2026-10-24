# PEAC Protocol Integration Kit: [Ecosystem Name]

## What is PEAC?

PEAC is an open protocol for portable, verifiable interaction records. Records are signed JWS tokens (Ed25519) with structured claims.

## What this kit provides

- **Integration guide:** step-by-step instructions for adding PEAC receipts to your [ecosystem] implementation
- **Conformance fixtures:** test vectors for validating your integration against the PEAC specification
- **Security FAQ:** answers to common security questions about PEAC integration
- **Reference implementations:** links to canonical PEAC packages on npm

## Quick start

1. Install the PEAC packages: `npm install @peac/protocol`
2. Follow the integration guide in `INTEGRATION-GUIDE.md`
3. Run conformance tests against the provided fixtures
4. Review the security FAQ in `SECURITY-FAQ.md`

## Packages

| Package          | Purpose                          |
| ---------------- | -------------------------------- |
| `@peac/schema`   | Receipt schemas and validation   |
| `@peac/crypto`   | Ed25519 signing and verification |
| `@peac/protocol` | Issue and verify receipts        |

## Support

- GitHub Issues: https://github.com/peacprotocol/peac/issues
- Specification: https://peacprotocol.org
