# Purpose Profile

**Status:** Draft
**Since:** v0.12.2
**Extension Group:** `org.peacprotocol/purpose`
**Receipt Type:** `org.peacprotocol/purpose-declaration`

## Abstract

The Purpose profile documents how to use the `org.peacprotocol/purpose`
extension group to record external, legal, or business purpose declarations
as evidence receipts. It covers purpose labeling, purpose basis
identification, purpose limitation, data minimization, and bridging to
PEAC operational purpose tokens. This profile does not tighten any
schema-optional fields beyond recommending `purpose_basis` and
`purpose_limitation` for regulatory evidence workflows. The Purpose
extension carries external compliance-level purpose declarations, not
PEAC operational purpose tokens; the optional `peac_purpose_mapping`
field bridges between the two vocabularies.

## When to use

- Recording the declared purpose(s) of a data processing activity, with
  evidence suitable for GDPR Art 5(1)(b) purpose limitation workflows
- Producing machine-verifiable purpose declaration evidence that documents
  which external purposes apply to a processing operation and whether
  purpose limitation was asserted
- Creating auditable purpose records that bridge external purpose
  vocabularies to PEAC operational tokens via the
  `peac_purpose_mapping` field

## Required / Recommended / Prohibited fields

All fields below belong to the `org.peacprotocol/purpose` extension group.

| Field                  | Schema Status | Profile Status | Rationale                                                                      |
| ---------------------- | ------------- | -------------- | ------------------------------------------------------------------------------ |
| `external_purposes`    | REQUIRED      | REQUIRED       | Schema-required; declares external/legal/business purpose labels               |
| `purpose_basis`        | OPTIONAL      | RECOMMENDED    | Supports evidence of legal or policy basis for the declared purposes           |
| `purpose_limitation`   | OPTIONAL      | RECOMMENDED    | Supports evidence of whether purpose limitation applies                        |
| `data_minimization`    | OPTIONAL      | OPTIONAL       | Records whether data minimization was applied                                  |
| `compatible_purposes`  | OPTIONAL      | OPTIONAL       | Lists compatible purposes for secondary use                                    |
| `peac_purpose_mapping` | OPTIONAL      | OPTIONAL       | Bridges external purpose vocabulary to PEAC operational CanonicalPurpose token |

## Minimal valid receipt

The smallest receipt body that satisfies this profile. Only the
schema-required `external_purposes` field is needed.

```json
{
  "iss": "https://example.com",
  "iat": 1710460800,
  "peac_version": "0.2",
  "kind": "evidence",
  "type": "org.peacprotocol/purpose-declaration",
  "pillars": ["purpose"],
  "extensions": {
    "org.peacprotocol/purpose": {
      "external_purposes": ["analytics"]
    }
  }
}
```

## Companion profiles

The following combinations are recommended for common workflows. Companion
profiles are recommendations, not enforced dependencies. Receipts are valid
without companion profiles.

| Companion             | Workflow                                                               |
| --------------------- | ---------------------------------------------------------------------- |
| [Consent](consent.md) | GDPR Art 6-7 consent evidence alongside Art 5(1)(b) purpose limitation |

## Regulatory context

This profile supports evidence relevant to purpose declaration and
limitation workflows. PEAC is evidence infrastructure; legal compliance
depends on organizational controls, processes, and legal interpretation
beyond the scope of this protocol.

| Regulation / Standard | Relevance                                                            |
| --------------------- | -------------------------------------------------------------------- |
| GDPR Art 5(1)(b)      | Supports evidence relevant to purpose limitation principle workflows |
| W3C DPV               | Maps naturally to Data Privacy Vocabulary purpose concepts           |

## Conformance examples

### Minimal valid issue

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/purpose-declaration',
  pillars: ['purpose'],
  extensions: {
    'org.peacprotocol/purpose': {
      external_purposes: ['analytics'],
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
console.log(result.claims.type); // 'org.peacprotocol/purpose-declaration'
```

### Invalid example: empty external_purposes array

The following receipt is schema-invalid because `external_purposes`
requires at least one item.

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/purpose-declaration',
  pillars: ['purpose'],
  extensions: {
    'org.peacprotocol/purpose': {
      external_purposes: [], // schema-invalid: min 1 item required
    },
  },
  privateKey,
  kid: 'key-2026-03',
});
// Throws: schema validation error
```

### Companion example: purpose with consent

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/purpose-declaration',
  pillars: ['purpose', 'consent'],
  extensions: {
    'org.peacprotocol/purpose': {
      external_purposes: ['ai_training', 'model_evaluation'],
      purpose_basis: 'consent',
      purpose_limitation: true,
      data_minimization: true,
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
  type: 'org.peacprotocol/purpose-declaration',
  pillars: ['purpose'],
  extensions: {
    'org.peacprotocol/purpose': {
      external_purposes: ['analytics', 'reporting'],
      purpose_basis: 'legitimate_interest',
      purpose_limitation: true,
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
console.log(result.claims.type); // 'org.peacprotocol/purpose-declaration'
```

## Non-goals / not guaranteed

- This profile does not introduce new schema fields. All fields referenced
  exist in the `org.peacprotocol/purpose` extension group schema
- This profile does not by itself establish legal compliance with any regulation.
  PEAC is evidence infrastructure; legal compliance depends on organizational
  controls, processes, and legal interpretation beyond the scope of this protocol
- Verifier enforcement is only what the protocol specification defines.
  Profile-level field requirements (such as REQUIRED fields marked OPTIONAL
  in the schema) are documentary guidance, not runtime-enforced constraints
- Companion profile recommendations are suggestions for common workflows,
  not enforced dependencies. Receipts are valid without companion profiles

## Cross-references

- Wire 0.2 spec: section 12.16 (`org.peacprotocol/purpose` extension group) in `docs/specs/WIRE-0.2.md`
- Registered receipt type: `org.peacprotocol/purpose-declaration` in `specs/kernel/registries.json`
- Type-to-extension enforcement: section 12.17 in `docs/specs/WIRE-0.2.md`

## Notes / caveats

- The `external_purposes` field carries external, legal, or business
  purpose labels, not PEAC operational purpose tokens. Use the
  `peac_purpose_mapping` field to bridge external purposes to PEAC
  operational CanonicalPurpose tokens
- Purpose tokens use machine-safe lowercase grammar: alphanumeric
  characters, underscores, and hyphens (e.g., `ai_training`, `analytics`,
  `marketing`). Items in `external_purposes` must be unique
- The `compatible_purposes` field lists purposes that are compatible for
  secondary use. These use the same machine-safe token grammar as
  `external_purposes` and must also be unique
- Purpose declarations are observations: recording a purpose declaration
  does not constitute a binding commitment to limit processing
- The distinction between `external_purposes` and PEAC operational tokens
  is intentional. External purposes are compliance-level declarations;
  PEAC operational tokens (`CanonicalPurpose`) are protocol-level routing
  semantics
