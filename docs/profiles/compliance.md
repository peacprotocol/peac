# Compliance Profile

**Status:** Draft
**Since:** v0.12.2
**Extension Group:** `org.peacprotocol/compliance`
**Receipt Type:** `org.peacprotocol/compliance-check`

## Abstract

The Compliance profile documents how to use the `org.peacprotocol/compliance`
extension group to record regulatory compliance check evidence as receipts.
It covers framework identification, compliance status determination, audit
provenance, and assessor identity. The profile tightens two schema-optional
fields (`audit_ref` and `auditor`) to REQUIRED status so that receipts
produced under this profile carry evidence of audit provenance and assessor
identity.

## When to use

- Recording that a compliance check occurred against a specific regulatory
  framework, with evidence of the framework evaluated, the observed outcome,
  and who performed the assessment
- Producing machine-verifiable compliance check evidence for audit trails
  across SOC 2 Type II, ISO 27001, EU AI Act, or other regulatory frameworks
- Creating auditable compliance assessment records that include assessor
  identity and audit reference, suitable for feeding into governance workflows

## Required / Recommended / Prohibited fields

All fields below belong to the `org.peacprotocol/compliance` extension group.

| Field               | Schema Status | Profile Status | Rationale                                               |
| ------------------- | ------------- | -------------- | ------------------------------------------------------- |
| `framework`         | REQUIRED      | REQUIRED       | Schema-required; identifies the regulatory framework    |
| `compliance_status` | REQUIRED      | REQUIRED       | Schema-required; records the observed compliance state  |
| `audit_ref`         | OPTIONAL      | REQUIRED       | Supports evidence of audit provenance                   |
| `auditor`           | OPTIONAL      | REQUIRED       | Supports evidence of assessor identity                  |
| `audit_date`        | OPTIONAL      | RECOMMENDED    | Records when the compliance check was performed         |
| `scope`             | OPTIONAL      | RECOMMENDED    | Documents the scope of the compliance check             |
| `validity_period`   | OPTIONAL      | OPTIONAL       | How long this finding remains valid (ISO 8601 duration) |
| `evidence_ref`      | OPTIONAL      | OPTIONAL       | SHA-256 digest of supporting evidence document          |

## Minimal valid receipt

The smallest receipt body that satisfies this profile. The `extensions`
object carries the `org.peacprotocol/compliance` group with the four
profile-required fields.

```json
{
  "iss": "https://example.com",
  "iat": 1710460800,
  "peac_version": "0.2",
  "kind": "evidence",
  "type": "org.peacprotocol/compliance-check",
  "pillars": ["compliance"],
  "extensions": {
    "org.peacprotocol/compliance": {
      "framework": "soc2-type2",
      "compliance_status": "compliant",
      "audit_ref": "RPT-2026-0042",
      "auditor": "Acme Audit Corp"
    }
  }
}
```

## Companion profiles

The following combinations are recommended for common workflows. Companion
profiles are recommendations, not enforced dependencies. Receipts are valid
without companion profiles.

| Companion           | Workflow                                                                    |
| ------------------- | --------------------------------------------------------------------------- |
| [Safety](safety.md) | EU AI Act Art 9 risk management alongside Art 28 deployer compliance checks |

Compliance can also be used standalone for frameworks such as SOC 2 Type II
or ISO 27001 where audit reference and framework identification are the
primary evidence needs.

## Regulatory context

This profile supports evidence relevant to compliance assessment and audit
workflows. PEAC is evidence infrastructure; legal compliance depends on
organizational controls, processes, and legal interpretation beyond the
scope of this protocol.

| Regulation / Standard | Relevance                                                                  |
| --------------------- | -------------------------------------------------------------------------- |
| SOC 2 Type II         | Supports evidence relevant to service organization control audit workflows |
| ISO 27001             | Can help document information security management system audit evidence    |
| EU AI Act Art 28      | Supports evidence relevant to deployer obligation workflows                |
| ISO 19011:2018        | Maps naturally to auditing management system concepts                      |

## Conformance examples

### Minimal valid issue

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/compliance-check',
  pillars: ['compliance'],
  extensions: {
    'org.peacprotocol/compliance': {
      framework: 'soc2-type2',
      compliance_status: 'compliant',
      audit_ref: 'RPT-2026-0042',
      auditor: 'Acme Audit Corp',
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
console.log(result.claims.type); // 'org.peacprotocol/compliance-check'
```

### Invalid example: missing profile-required fields

The following receipt is schema-valid (because `audit_ref` and `auditor`
are OPTIONAL at the schema level) but does not satisfy this profile
because it omits both.

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/compliance-check',
  pillars: ['compliance'],
  extensions: {
    'org.peacprotocol/compliance': {
      framework: 'iso-27001',
      compliance_status: 'compliant',
      // audit_ref omitted: schema-valid but does not satisfy this profile
      // auditor omitted: schema-valid but does not satisfy this profile
    },
  },
  privateKey,
  kid: 'key-2026-03',
});
```

### Companion example: compliance with safety

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/compliance-check',
  pillars: ['compliance', 'safety'],
  extensions: {
    'org.peacprotocol/compliance': {
      framework: 'eu-ai-act',
      compliance_status: 'under_review',
      audit_ref: 'AIA-2026-DEPLOY-001',
      auditor: 'Internal Risk Team',
      scope: 'High-risk AI system deployment',
    },
    'org.peacprotocol/safety': {
      review_status: 'reviewed',
      risk_level: 'high',
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
  type: 'org.peacprotocol/compliance-check',
  pillars: ['compliance'],
  extensions: {
    'org.peacprotocol/compliance': {
      framework: 'soc2-type2',
      compliance_status: 'compliant',
      audit_ref: 'RPT-2026-0042',
      auditor: 'Acme Audit Corp',
      audit_date: '2026-03-15',
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
console.log(result.claims.type); // 'org.peacprotocol/compliance-check'
```

## Non-goals / not guaranteed

- This profile does not introduce new schema fields. All fields referenced
  exist in the `org.peacprotocol/compliance` extension group schema
- This profile does not by itself establish legal compliance with any regulation.
  PEAC is evidence infrastructure; legal compliance depends on organizational
  controls, processes, and legal interpretation beyond the scope of this protocol
- Verifier enforcement is only what the protocol specification defines.
  Profile-level field requirements (such as REQUIRED fields marked OPTIONAL
  in the schema) are documentary guidance, not runtime-enforced constraints
- Companion profile recommendations are suggestions for common workflows,
  not enforced dependencies. Receipts are valid without companion profiles

## Cross-references

- Wire 0.2 spec: section 12.13 (`org.peacprotocol/compliance` extension group) in `docs/specs/WIRE-0.2.md`
- Registered receipt type: `org.peacprotocol/compliance-check` in `specs/kernel/registries.json`
- Type-to-extension enforcement: section 12.17 in `docs/specs/WIRE-0.2.md`

## Notes / caveats

- The `compliance_status` field uses a closed vocabulary of five states:
  `compliant`, `non_compliant`, `partial`, `under_review`, `exempt`.
  These map to ISO 19011 audit conclusion categories
- Compliance checks are observations: recording a compliance check does
  not constitute certification or legal compliance
- The `framework` field uses an open vocabulary. Preferred grammar is
  lowercase slugs with hyphens (e.g., `eu-ai-act`, `soc2-type2`,
  `iso-27001`, `nist-ai-rmf`, `gdpr`, `hipaa`)
- The `evidence_ref` field accepts a SHA-256 digest of supporting
  evidence documents, providing a tamper-evident link to external
  audit artifacts without embedding them in the receipt
