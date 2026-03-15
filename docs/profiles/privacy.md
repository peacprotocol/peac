# Privacy Profile

**Status:** Draft
**Since:** v0.12.2
**Extension Group:** `org.peacprotocol/privacy`
**Receipt Type:** `org.peacprotocol/privacy-signal`

## Abstract

The Privacy profile documents how to use the `org.peacprotocol/privacy`
extension group to record data classification and handling observations
as evidence receipts. It covers data classification levels, processing
basis identification, retention semantics, recipient scoping, and
cross-border transfer mechanisms. This profile does not tighten any
schema-optional fields beyond recommending `processing_basis` and
`retention_period` for regulatory evidence workflows.

## When to use

- Recording the data classification level and processing basis for a
  data handling event, with evidence suitable for GDPR Art 13-14
  information disclosure workflows
- Producing machine-verifiable privacy signal evidence that documents
  data handling practices including retention, anonymization, and
  cross-border transfers
- Creating auditable records of data classification decisions and
  recipient scope determinations

## Required / Recommended / Prohibited fields

All fields below belong to the `org.peacprotocol/privacy` extension group.

| Field                   | Schema Status | Profile Status | Rationale                                                                |
| ----------------------- | ------------- | -------------- | ------------------------------------------------------------------------ |
| `data_classification`   | REQUIRED      | REQUIRED       | Schema-required; classifies the sensitivity level of data handled        |
| `processing_basis`      | OPTIONAL      | RECOMMENDED    | Supports evidence of legal basis for processing                          |
| `retention_period`      | OPTIONAL      | RECOMMENDED    | Supports evidence of data retention commitments (ISO 8601 duration)      |
| `retention_mode`        | OPTIONAL      | OPTIONAL       | Non-duration retention semantics (time_bound, indefinite, session_only)  |
| `recipient_scope`       | OPTIONAL      | OPTIONAL       | Data recipient classification (internal, processor, third_party, public) |
| `anonymization_method`  | OPTIONAL      | OPTIONAL       | Records anonymization or pseudonymization technique applied              |
| `data_subject_category` | OPTIONAL      | OPTIONAL       | Data subject classification (customer, employee, minor)                  |
| `transfer_mechanism`    | OPTIONAL      | OPTIONAL       | Cross-border data transfer mechanism (adequacy_decision, scc, bcr)       |

## Minimal valid receipt

The smallest receipt body that satisfies this profile. Only the
schema-required `data_classification` field is needed.

```json
{
  "iss": "https://example.com",
  "iat": 1710460800,
  "peac_version": "0.2",
  "kind": "evidence",
  "type": "org.peacprotocol/privacy-signal",
  "pillars": ["privacy"],
  "extensions": {
    "org.peacprotocol/privacy": {
      "data_classification": "confidential"
    }
  }
}
```

## Companion profiles

The following combinations are recommended for common workflows. Companion
profiles are recommendations, not enforced dependencies. Receipts are valid
without companion profiles.

| Companion             | Workflow                                                              |
| --------------------- | --------------------------------------------------------------------- |
| [Consent](consent.md) | GDPR Art 7 consent evidence alongside Art 13-14 data handling signals |

## Regulatory context

This profile supports evidence relevant to data handling and privacy
workflows. PEAC is evidence infrastructure; legal compliance depends on
organizational controls, processes, and legal interpretation beyond the
scope of this protocol.

| Regulation / Standard | Relevance                                                             |
| --------------------- | --------------------------------------------------------------------- |
| GDPR Art 13-14        | Supports evidence relevant to information disclosure to data subjects |
| ISO/IEC 27701:2019    | Maps naturally to privacy information management concepts             |

## Conformance examples

### Minimal valid issue

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/privacy-signal',
  pillars: ['privacy'],
  extensions: {
    'org.peacprotocol/privacy': {
      data_classification: 'confidential',
    },
  },
  privateKey,
  kid: 'key-2026-03',
});
```

### Verify

```typescript
const result = await verifyLocal(jws, publicKey, {
  issuer: 'https://example.com',
  strictness: 'strict',
});

console.log(result.valid); // true
console.log(result.claims.type); // 'org.peacprotocol/privacy-signal'
```

### Invalid example: empty data_classification

The following receipt is schema-invalid because `data_classification`
is REQUIRED and must be a non-empty string.

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/privacy-signal',
  pillars: ['privacy'],
  extensions: {
    'org.peacprotocol/privacy': {
      data_classification: '', // schema-invalid: must be non-empty
    },
  },
  privateKey,
  kid: 'key-2026-03',
});
// Throws: schema validation error
```

### Companion example: privacy with consent

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/privacy-signal',
  pillars: ['privacy', 'consent'],
  extensions: {
    'org.peacprotocol/privacy': {
      data_classification: 'pii',
      processing_basis: 'consent',
      retention_period: 'P365D',
      retention_mode: 'time_bound',
      recipient_scope: 'processor',
    },
    'org.peacprotocol/consent': {
      consent_basis: 'explicit',
      consent_status: 'granted',
    },
  },
  privateKey,
  kid: 'key-2026-03',
});
```

## Quick demo

```typescript
import { generateKeypair } from '@peac/crypto';
import { issue, verifyLocal } from '@peac/protocol';

const { privateKey, publicKey } = await generateKeypair();

const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/privacy-signal',
  pillars: ['privacy'],
  extensions: {
    'org.peacprotocol/privacy': {
      data_classification: 'confidential',
      processing_basis: 'legitimate_interest',
      retention_period: 'P90D',
    },
  },
  privateKey,
  kid: 'key-2026-03',
});

const result = await verifyLocal(jws, publicKey, {
  issuer: 'https://example.com',
  strictness: 'strict',
});

console.log(result.valid); // true
console.log(result.claims.type); // 'org.peacprotocol/privacy-signal'
```

## Non-goals / not guaranteed

- This profile does not introduce new schema fields. All fields referenced
  exist in the `org.peacprotocol/privacy` extension group schema
- This profile does not by itself establish legal compliance with any regulation.
  PEAC is evidence infrastructure; legal compliance depends on organizational
  controls, processes, and legal interpretation beyond the scope of this protocol
- Verifier enforcement is only what the protocol specification defines.
  Profile-level field requirements (such as REQUIRED fields marked OPTIONAL
  in the schema) are documentary guidance, not runtime-enforced constraints
- Companion profile recommendations are suggestions for common workflows,
  not enforced dependencies. Receipts are valid without companion profiles

## Cross-references

- Wire 0.2 spec: section 12.11 (`org.peacprotocol/privacy` extension group) in `docs/specs/WIRE-0.2.md`
- Registered receipt type: `org.peacprotocol/privacy-signal` in `specs/kernel/registries.json`
- Type-to-extension enforcement: section 12.17 in `docs/specs/WIRE-0.2.md`

## Notes / caveats

- The `retention_mode` and `retention_period` fields are separate by design:
  `retention_period` carries ISO 8601 duration grammar; `retention_mode`
  carries non-duration retention semantics. When `retention_mode` is
  `time_bound`, `retention_period` SHOULD also be present
- The `recipient_scope` field uses a closed vocabulary of four values:
  `internal`, `processor`, `third_party`, `public`. These align with
  GDPR Art 13-14 disclosure categories
- Privacy signals are observations: recording a data classification event
  does not constitute a binding privacy commitment
- The `anonymization_method` field uses an open vocabulary. Organizations
  should document their specific anonymization technique mappings
