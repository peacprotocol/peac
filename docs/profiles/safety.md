# Safety Profile

**Status:** Draft
**Since:** v0.12.2
**Extension Group:** `org.peacprotocol/safety`
**Receipt Type:** `org.peacprotocol/safety-review`

## Abstract

The Safety profile documents how to use the `org.peacprotocol/safety`
extension group to record safety assessment evidence as receipts. It
covers review status lifecycle, risk classification, assessment methods,
and safety measures. The profile tightens one schema-optional field
(`risk_level`) to REQUIRED status so that receipts produced under this
profile carry evidence of risk classification, which supports evidence
relevant to EU AI Act Art 9 risk classification workflows.

## When to use

- Recording that a safety review occurred for an AI system or content,
  with evidence of the review outcome and risk classification
- Producing machine-verifiable safety assessment evidence that documents
  risk level, assessment method, and safety measures applied
- Creating auditable safety review records that can feed into risk
  management workflows across regulatory frameworks

## Required / Recommended / Prohibited fields

All fields below belong to the `org.peacprotocol/safety` extension group.

| Field               | Schema Status | Profile Status | Rationale                                                                   |
| ------------------- | ------------- | -------------- | --------------------------------------------------------------------------- |
| `review_status`     | REQUIRED      | REQUIRED       | Schema-required; records the safety assessment lifecycle state              |
| `risk_level`        | OPTIONAL      | REQUIRED       | Supports evidence relevant to EU AI Act Art 9 risk classification workflows |
| `assessment_method` | OPTIONAL      | RECOMMENDED    | Records how the safety assessment was performed                             |
| `safety_measures`   | OPTIONAL      | RECOMMENDED    | Documents safety measures applied                                           |
| `incident_ref`      | OPTIONAL      | OPTIONAL       | Opaque reference to incident report                                         |
| `model_ref`         | OPTIONAL      | OPTIONAL       | Opaque reference to AI model version                                        |
| `category`          | OPTIONAL      | OPTIONAL       | Safety category (content_safety, bias, hallucination, toxicity)             |

## Minimal valid receipt

The smallest receipt body that satisfies this profile. The `extensions`
object carries the `org.peacprotocol/safety` group with the two
profile-required fields.

```json
{
  "iss": "https://example.com",
  "iat": 1710460800,
  "peac_version": "0.2",
  "kind": "evidence",
  "type": "org.peacprotocol/safety-review",
  "pillars": ["safety"],
  "extensions": {
    "org.peacprotocol/safety": {
      "review_status": "reviewed",
      "risk_level": "limited"
    }
  }
}
```

## Companion profiles

The following combinations are recommended for common workflows. Companion
profiles are recommendations, not enforced dependencies. Receipts are valid
without companion profiles.

| Companion                   | Workflow                                                              |
| --------------------------- | --------------------------------------------------------------------- |
| [Compliance](compliance.md) | EU AI Act Art 9 risk management alongside Art 28 deployer obligations |

## Regulatory context

This profile supports evidence relevant to safety assessment and risk
management workflows. PEAC is evidence infrastructure; legal compliance
depends on organizational controls, processes, and legal interpretation
beyond the scope of this protocol.

| Regulation / Standard | Relevance                                                                          |
| --------------------- | ---------------------------------------------------------------------------------- |
| EU AI Act Art 9       | Supports evidence relevant to risk management system workflows                     |
| EU AI Act Art 14      | Can help document human oversight measures                                         |
| EU AI Act Art 15      | Supports evidence relevant to accuracy, robustness, and cybersecurity requirements |
| ISO/IEC 23894:2023    | Maps naturally to AI risk management concepts                                      |

## Conformance examples

### Minimal valid issue

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/safety-review',
  pillars: ['safety'],
  extensions: {
    'org.peacprotocol/safety': {
      review_status: 'reviewed',
      risk_level: 'limited',
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
console.log(result.claims.type); // 'org.peacprotocol/safety-review'
```

### Invalid example: missing profile-required field

The following receipt is schema-valid (because `risk_level` is OPTIONAL
at the schema level) but does not satisfy this profile because it omits
`risk_level`.

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/safety-review',
  pillars: ['safety'],
  extensions: {
    'org.peacprotocol/safety': {
      review_status: 'reviewed',
      // risk_level omitted: schema-valid but does not satisfy this profile
    },
  },
  privateKey,
  kid: 'key-2026-03',
});
```

### Companion example: safety with compliance

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/safety-review',
  pillars: ['safety', 'compliance'],
  extensions: {
    'org.peacprotocol/safety': {
      review_status: 'reviewed',
      risk_level: 'high',
      assessment_method: 'human_review',
      safety_measures: ['content_filter', 'rate_limiting'],
    },
    'org.peacprotocol/compliance': {
      framework: 'eu-ai-act',
      compliance_status: 'under_review',
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
  type: 'org.peacprotocol/safety-review',
  pillars: ['safety'],
  extensions: {
    'org.peacprotocol/safety': {
      review_status: 'reviewed',
      risk_level: 'limited',
      assessment_method: 'automated_scan',
      category: 'content_safety',
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
console.log(result.claims.type); // 'org.peacprotocol/safety-review'
```

## Non-goals / not guaranteed

- This profile does not introduce new schema fields. All fields referenced
  exist in the `org.peacprotocol/safety` extension group schema
- This profile does not by itself establish legal compliance with any regulation.
  PEAC is evidence infrastructure; legal compliance depends on organizational
  controls, processes, and legal interpretation beyond the scope of this protocol
- Verifier enforcement is only what the protocol specification defines.
  Profile-level field requirements (such as REQUIRED fields marked OPTIONAL
  in the schema) are documentary guidance, not runtime-enforced constraints
- Companion profile recommendations are suggestions for common workflows,
  not enforced dependencies. Receipts are valid without companion profiles

## Cross-references

- Wire 0.2 spec: section 12.12 (`org.peacprotocol/safety` extension group) in `docs/specs/WIRE-0.2.md`
- Registered receipt type: `org.peacprotocol/safety-review` in `specs/kernel/registries.json`
- Type-to-extension enforcement: section 12.17 in `docs/specs/WIRE-0.2.md`

## Notes / caveats

- The `risk_level` field uses a closed vocabulary of four tiers:
  `unacceptable`, `high`, `limited`, `minimal`. These converge across
  EU AI Act Art 6, NIST AI RMF, and ISO 23894 risk classification
- The `review_status` field uses a closed vocabulary of four states:
  `reviewed`, `pending`, `flagged`, `not_applicable`. These cover the
  universal safety assessment lifecycle
- Safety reviews are observations: recording a safety review does not
  constitute safety certification or approval
- The `safety_measures` field is an array of open vocabulary strings.
  Organizations should establish consistent measure naming conventions
  for interoperability
