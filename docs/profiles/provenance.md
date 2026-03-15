# Provenance Profile

**Status:** Draft
**Since:** v0.12.2
**Extension Group:** `org.peacprotocol/provenance`
**Receipt Type:** `org.peacprotocol/provenance-record`

## Abstract

The Provenance profile documents how to use the `org.peacprotocol/provenance`
extension group to record origin tracking and chain of custody observations
as evidence receipts. It covers source type classification, source references,
verification methods, custody chain entries, and SLSA-aligned build provenance
metadata. This profile does not tighten any schema-optional fields beyond
recommending `source_uri` and `verification_method` for content origin
evidence workflows.

## When to use

- Recording the origin and derivation type of a data artifact or content
  asset, with evidence suitable for AI-generated content transparency
  workflows
- Producing machine-verifiable provenance evidence that documents the
  chain of custody from source to current holder, including custodian
  actions and timestamps
- Creating auditable provenance records aligned with supply chain
  integrity standards such as SLSA for software artifacts

## Required / Recommended / Prohibited fields

All fields below belong to the `org.peacprotocol/provenance` extension group.

| Field                  | Schema Status | Profile Status | Rationale                                                           |
| ---------------------- | ------------- | -------------- | ------------------------------------------------------------------- |
| `source_type`          | REQUIRED      | REQUIRED       | Schema-required; classifies the derivation type                     |
| `source_uri`           | OPTIONAL      | RECOMMENDED    | Supports evidence of origin location (locator hint; no auto-fetch)  |
| `verification_method`  | OPTIONAL      | RECOMMENDED    | Records how provenance was verified                                 |
| `source_ref`           | OPTIONAL      | OPTIONAL       | Opaque source reference identifier (commit hash, artifact ID)       |
| `build_provenance_uri` | OPTIONAL      | OPTIONAL       | HTTPS URI hint for build provenance metadata; no auto-fetch         |
| `custody_chain`        | OPTIONAL      | OPTIONAL       | Ordered custody chain entries with custodian, action, and timestamp |
| `slsa`                 | OPTIONAL      | OPTIONAL       | SLSA-aligned provenance metadata (track, level, version)            |

## Minimal valid receipt

The smallest receipt body that satisfies this profile. Only the
schema-required `source_type` field is needed.

```json
{
  "iss": "https://example.com",
  "iat": 1710460800,
  "peac_version": "0.2",
  "kind": "evidence",
  "type": "org.peacprotocol/provenance-record",
  "pillars": ["provenance"],
  "extensions": {
    "org.peacprotocol/provenance": {
      "source_type": "original"
    }
  }
}
```

## Companion profiles

The following combinations are recommended for common workflows. Companion
profiles are recommendations, not enforced dependencies. Receipts are valid
without companion profiles.

| Companion                     | Workflow                                                       |
| ----------------------------- | -------------------------------------------------------------- |
| [Attribution](attribution.md) | Content origin tracking alongside creator credit and licensing |

## Regulatory context

This profile supports evidence relevant to content provenance and
transparency workflows. PEAC is evidence infrastructure; legal compliance
depends on organizational controls, processes, and legal interpretation
beyond the scope of this protocol.

| Regulation / Standard | Relevance                                                                         |
| --------------------- | --------------------------------------------------------------------------------- |
| EU AI Act Art 50      | Supports evidence relevant to AI-generated content transparency obligations       |
| W3C PROV-DM           | Maps naturally to W3C Provenance Data Model concepts                              |
| SLSA v1.2             | Supports evidence relevant to Supply-chain Levels for Software Artifacts tracking |

## Conformance examples

### Minimal valid issue

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/provenance-record',
  pillars: ['provenance'],
  extensions: {
    'org.peacprotocol/provenance': {
      source_type: 'original',
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
console.log(result.claims.type); // 'org.peacprotocol/provenance-record'
```

### Invalid example: empty source_type

The following receipt is schema-invalid because `source_type` is
REQUIRED and must be a non-empty string.

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/provenance-record',
  pillars: ['provenance'],
  extensions: {
    'org.peacprotocol/provenance': {
      source_type: '', // schema-invalid: must be non-empty
    },
  },
  privateKey,
  kid: 'key-2026-03',
});
// Throws: schema validation error
```

### Companion example: provenance with attribution

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/provenance-record',
  pillars: ['provenance', 'attribution'],
  extensions: {
    'org.peacprotocol/provenance': {
      source_type: 'derived',
      source_uri: 'https://example.com/datasets/v2',
      verification_method: 'hash_chain',
      custody_chain: [
        {
          custodian: 'DataSource Inc',
          action: 'released',
          timestamp: '2026-03-01T10:00:00Z',
        },
        {
          custodian: 'ML Team',
          action: 'transformed',
          timestamp: '2026-03-10T14:30:00Z',
        },
      ],
    },
    'org.peacprotocol/attribution': {
      creator_ref: 'did:example:datasource',
      license_spdx: 'Apache-2.0',
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
  type: 'org.peacprotocol/provenance-record',
  pillars: ['provenance'],
  extensions: {
    'org.peacprotocol/provenance': {
      source_type: 'original',
      source_uri: 'https://example.com/artifact/abc123',
      verification_method: 'signature_check',
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
console.log(result.claims.type); // 'org.peacprotocol/provenance-record'
```

## Non-goals / not guaranteed

- This profile does not introduce new schema fields. All fields referenced
  exist in the `org.peacprotocol/provenance` extension group schema
- This profile does not by itself establish legal compliance with any regulation.
  PEAC is evidence infrastructure; legal compliance depends on organizational
  controls, processes, and legal interpretation beyond the scope of this protocol
- Verifier enforcement is only what the protocol specification defines.
  Profile-level field requirements (such as REQUIRED fields marked OPTIONAL
  in the schema) are documentary guidance, not runtime-enforced constraints
- Companion profile recommendations are suggestions for common workflows,
  not enforced dependencies. Receipts are valid without companion profiles

## Cross-references

- Wire 0.2 spec: section 12.14 (`org.peacprotocol/provenance` extension group) in `docs/specs/WIRE-0.2.md`
- Registered receipt type: `org.peacprotocol/provenance-record` in `specs/kernel/registries.json`
- Type-to-extension enforcement: section 12.17 in `docs/specs/WIRE-0.2.md`

## Notes / caveats

- The `source_type` field uses an open vocabulary. Common values include
  `original`, `derived`, `curated`, `synthetic`, `aggregated`, `transformed`
- URI fields (`source_uri`, `build_provenance_uri`) are locator hints only.
  Callers MUST NOT auto-fetch these URIs; they exist for human-readable
  reference or explicit out-of-band resolution
- The `custody_chain` array is ordered: entries represent sequential custody
  events. Each entry includes a `custodian`, `action`, and `timestamp`
  (RFC 3339 with seconds)
- The `slsa` field records SLSA-aligned metadata using a track-based model
  (track, level, version). It does not certify SLSA compliance; it records
  observed SLSA-relevant metadata
- Provenance records are observations: recording provenance does not
  constitute a guarantee of origin or chain of custody integrity
