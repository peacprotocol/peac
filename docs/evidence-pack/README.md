# PEAC Protocol Evidence Pack

Self-contained evidence package demonstrating PEAC Protocol capabilities for content authenticity and AI system traceability.

## Contents

### evidence/

Example receipts and verification transcripts demonstrating:

- Receipt issuance and offline verification
- Content signal observation (three-state model)
- A2A carrier attachment and extraction
- Conformance fixture validation

### conformance/

Deterministic conformance report generated from the protocol test suite:

- Test counts and pass rates
- Package coverage
- Build target summary

### spec-snapshots/

Pinned copies of normative specifications at generation time:

- Wire format specification (`peac-receipt/0.1`)
- Evidence Carrier Contract
- Kernel Constraints
- Issuer Configuration
- Discovery Surface

## Generation

```bash
pnpm evidence-pack
```

This produces a `peac-evidence-pack.zip` archive in `dist/`.

## Protocol Version

Built against the current protocol version at generation time.
