# Consent Profile

**Status:** Draft
**Since:** v0.12.2
**Extension Group:** `org.peacprotocol/consent`
**Receipt Type:** `org.peacprotocol/consent-record`

## Abstract

The Consent profile documents how to use the `org.peacprotocol/consent`
extension group to record consent collection and withdrawal events as
evidence receipts. It covers consent lifecycle states, legal basis
identification, data category scoping, and jurisdiction tagging. The
profile tightens two schema-optional fields (`data_categories` and
`jurisdiction`) to REQUIRED status so that receipts produced under this
profile carry evidence of what data categories consent covers and which
jurisdiction applies.

## When to use

- Recording that a data subject granted or withdrew consent for specific
  data processing categories, with evidence of legal basis and jurisdiction
- Producing machine-verifiable consent evidence that can feed into
  privacy-engineering workflows or data-subject access requests
- Creating auditable consent lifecycle records across jurisdictions that
  require different legal bases (explicit consent, opt-out, legitimate
  interest)

## Required / Recommended / Prohibited fields

All fields below belong to the `org.peacprotocol/consent` extension group.

| Field              | Schema Status | Profile Status | Rationale                                                        |
| ------------------ | ------------- | -------------- | ---------------------------------------------------------------- |
| `consent_basis`    | REQUIRED      | REQUIRED       | Schema-required; identifies the legal basis for consent          |
| `consent_status`   | REQUIRED      | REQUIRED       | Schema-required; records the consent lifecycle state             |
| `data_categories`  | OPTIONAL      | REQUIRED       | Supports evidence of what data categories consent covers         |
| `jurisdiction`     | OPTIONAL      | REQUIRED       | Supports evidence of which jurisdiction's law applies            |
| `retention_period` | OPTIONAL      | RECOMMENDED    | Supports evidence of data retention commitments                  |
| `consent_method`   | OPTIONAL      | RECOMMENDED    | Records how consent was collected (click-through, double opt-in) |
| `withdrawal_uri`   | OPTIONAL      | OPTIONAL       | Locator hint for consent withdrawal; callers MUST NOT auto-fetch |
| `scope`            | OPTIONAL      | OPTIONAL       | Free-text scope description                                      |

## Minimal valid receipt

The smallest receipt body that satisfies this profile. The `extensions`
object carries the `org.peacprotocol/consent` group with the four
profile-required fields.

```json
{
  "iss": "https://example.com",
  "iat": 1710460800,
  "peac_version": "0.2",
  "kind": "evidence",
  "type": "org.peacprotocol/consent-record",
  "pillars": ["consent"],
  "extensions": {
    "org.peacprotocol/consent": {
      "consent_basis": "explicit",
      "consent_status": "granted",
      "data_categories": ["personal"],
      "jurisdiction": "EU"
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
| [Purpose](purpose.md) | GDPR Art 5(1)(b) purpose limitation alongside Art 6-7 consent evidence |
| [Privacy](privacy.md) | GDPR Art 13-14 data handling disclosure alongside consent evidence     |

## Regulatory context

This profile supports evidence relevant to consent-related regulatory
workflows. PEAC is evidence infrastructure; legal compliance depends on
organizational controls, processes, and legal interpretation beyond the
scope of this protocol.

| Regulation / Standard | Relevance                                                                      |
| --------------------- | ------------------------------------------------------------------------------ |
| GDPR Art 6-7          | Supports evidence relevant to legal basis for processing and consent workflows |
| CCPA Sec 1798.120     | Can help document opt-out consent events                                       |
| LGPD Art 8            | Supports evidence relevant to consent collection in Brazilian data protection  |
| ISO/IEC 29184:2020    | Maps naturally to online privacy notice and consent concepts                   |

## Conformance examples

### Minimal valid issue

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/consent-record',
  pillars: ['consent'],
  extensions: {
    'org.peacprotocol/consent': {
      consent_basis: 'explicit',
      consent_status: 'granted',
      data_categories: ['personal'],
      jurisdiction: 'EU',
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
console.log(result.claims.type); // 'org.peacprotocol/consent-record'
```

### Invalid example: missing profile-required field

The following receipt is schema-valid (both `data_categories` and
`jurisdiction` are OPTIONAL at the schema level) but does not satisfy
this profile because it omits `jurisdiction`.

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/consent-record',
  pillars: ['consent'],
  extensions: {
    'org.peacprotocol/consent': {
      consent_basis: 'explicit',
      consent_status: 'granted',
      data_categories: ['personal'],
      // jurisdiction omitted: schema-valid but does not satisfy this profile
    },
  },
  privateKey,
  kid: 'key-2026-03',
});
```

### Companion example: consent with purpose

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/consent-record',
  pillars: ['consent', 'purpose'],
  extensions: {
    'org.peacprotocol/consent': {
      consent_basis: 'explicit',
      consent_status: 'granted',
      data_categories: ['personal', 'biometric'],
      jurisdiction: 'EU',
    },
    'org.peacprotocol/purpose': {
      external_purposes: ['identity_verification'],
      purpose_basis: 'consent',
      purpose_limitation: true,
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
  type: 'org.peacprotocol/consent-record',
  pillars: ['consent'],
  extensions: {
    'org.peacprotocol/consent': {
      consent_basis: 'explicit',
      consent_status: 'granted',
      data_categories: ['personal'],
      jurisdiction: 'EU',
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
console.log(result.claims.type); // 'org.peacprotocol/consent-record'
```

## Non-goals / not guaranteed

- This profile does not introduce new schema fields. All fields referenced
  exist in the `org.peacprotocol/consent` extension group schema
- This profile does not by itself establish legal compliance with any regulation.
  PEAC is evidence infrastructure; legal compliance depends on organizational
  controls, processes, and legal interpretation beyond the scope of this protocol
- Verifier enforcement is only what the protocol specification defines.
  Profile-level field requirements (such as REQUIRED fields marked OPTIONAL
  in the schema) are documentary guidance, not runtime-enforced constraints
- Companion profile recommendations are suggestions for common workflows,
  not enforced dependencies. Receipts are valid without companion profiles

## Cross-references

- Wire 0.2 spec: section 12.10 (`org.peacprotocol/consent` extension group) in `docs/specs/WIRE-0.2.md`
- Registered receipt type: `org.peacprotocol/consent-record` in `specs/kernel/registries.json`
- Type-to-extension enforcement: section 12.17 in `docs/specs/WIRE-0.2.md`

## Notes / caveats

- The `consent_status` field uses a closed vocabulary of four states:
  `granted`, `withdrawn`, `denied`, `expired`. These cover the universal
  consent lifecycle; jurisdiction-specific semantics are carried by
  `consent_basis` (open vocabulary)
- The `withdrawal_uri` field is a locator hint only. Callers MUST NOT
  auto-fetch this URI; it exists for human-readable reference
- Consent events are observations: recording a consent event does not
  constitute obtaining or verifying consent
- The `data_categories` field uses an open vocabulary. Organizations should
  establish consistent category naming conventions for interoperability
