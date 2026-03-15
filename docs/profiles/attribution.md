# Attribution Profile

**Status:** Draft
**Since:** v0.12.2
**Extension Group:** `org.peacprotocol/attribution`
**Receipt Type:** `org.peacprotocol/attribution-event`

## Abstract

The Attribution profile documents how to use the `org.peacprotocol/attribution`
extension group to record credit, licensing, and content signal observations
as evidence receipts. It covers creator identification, SPDX license
expressions, obligation types, content signal sources, and content digests.
This profile does not tighten any schema-optional fields beyond recommending
`license_spdx` and `content_digest` for content licensing and origin
evidence workflows.

## When to use

- Recording that content has a specific creator and license, with evidence
  suitable for content licensing workflows and creator credit obligations
- Producing machine-verifiable attribution evidence that documents SPDX
  license expressions, content signal observations, and obligation types
- Creating auditable attribution records that link content digests to
  creator identifiers and license terms

## Required / Recommended / Prohibited fields

All fields below belong to the `org.peacprotocol/attribution` extension group.

| Field                   | Schema Status | Profile Status | Rationale                                                         |
| ----------------------- | ------------- | -------------- | ----------------------------------------------------------------- |
| `creator_ref`           | REQUIRED      | REQUIRED       | Schema-required; identifies the creator (DID, URI, or opaque ID)  |
| `license_spdx`          | OPTIONAL      | RECOMMENDED    | Supports evidence of content licensing terms                      |
| `content_digest`        | OPTIONAL      | RECOMMENDED    | Supports evidence of which content is attributed (SHA-256 digest) |
| `obligation_type`       | OPTIONAL      | OPTIONAL       | Records obligation type (attribution_required, share_alike)       |
| `attribution_text`      | OPTIONAL      | OPTIONAL       | Required attribution text for display                             |
| `content_signal_source` | OPTIONAL      | OPTIONAL       | Content signal observation source (closed vocabulary)             |

## Minimal valid receipt

The smallest receipt body that satisfies this profile. Only the
schema-required `creator_ref` field is needed.

```json
{
  "iss": "https://example.com",
  "iat": 1710460800,
  "peac_version": "0.2",
  "kind": "evidence",
  "type": "org.peacprotocol/attribution-event",
  "pillars": ["attribution"],
  "extensions": {
    "org.peacprotocol/attribution": {
      "creator_ref": "did:example:creator123"
    }
  }
}
```

## Companion profiles

The following combinations are recommended for common workflows. Companion
profiles are recommendations, not enforced dependencies. Receipts are valid
without companion profiles.

| Companion                   | Workflow                                                       |
| --------------------------- | -------------------------------------------------------------- |
| [Provenance](provenance.md) | Content origin tracking alongside creator credit and licensing |

## Regulatory context

This profile supports evidence relevant to content attribution and licensing
workflows. PEAC is evidence infrastructure; legal compliance depends on
organizational controls, processes, and legal interpretation beyond the
scope of this protocol.

| Regulation / Standard         | Relevance                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------- |
| SPDX 3.0.1                    | Maps naturally to Software Package Data Exchange license expression concepts |
| C2PA                          | Complementary to Coalition for Content Provenance and Authenticity concepts  |
| Content licensing obligations | Supports evidence relevant to creator credit and license attribution         |

## Conformance examples

### Minimal valid issue

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/attribution-event',
  pillars: ['attribution'],
  extensions: {
    'org.peacprotocol/attribution': {
      creator_ref: 'did:example:creator123',
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
console.log(result.claims.type); // 'org.peacprotocol/attribution-event'
```

### Invalid example: empty creator_ref

The following receipt is schema-invalid because `creator_ref` is
REQUIRED and must be a non-empty string.

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/attribution-event',
  pillars: ['attribution'],
  extensions: {
    'org.peacprotocol/attribution': {
      creator_ref: '', // schema-invalid: must be non-empty
    },
  },
  privateKey,
  kid: 'key-2026-03',
});
// Throws: schema validation error
```

### Companion example: attribution with provenance

```typescript
const { jws } = await issue({
  iss: 'https://example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/attribution-event',
  pillars: ['attribution', 'provenance'],
  extensions: {
    'org.peacprotocol/attribution': {
      creator_ref: 'did:example:photographer',
      license_spdx: 'CC-BY-4.0',
      obligation_type: 'attribution_required',
      attribution_text: 'Photo by Example Photographer',
      content_digest: 'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    },
    'org.peacprotocol/provenance': {
      source_type: 'original',
      source_uri: 'https://example.com/photos/sunset-2026',
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
  type: 'org.peacprotocol/attribution-event',
  pillars: ['attribution'],
  extensions: {
    'org.peacprotocol/attribution': {
      creator_ref: 'did:example:creator123',
      license_spdx: 'MIT',
      content_digest: 'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
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
console.log(result.claims.type); // 'org.peacprotocol/attribution-event'
```

## Non-goals / not guaranteed

- This profile does not introduce new schema fields. All fields referenced
  exist in the `org.peacprotocol/attribution` extension group schema
- This profile does not by itself establish legal compliance with any regulation.
  PEAC is evidence infrastructure; legal compliance depends on organizational
  controls, processes, and legal interpretation beyond the scope of this protocol
- Verifier enforcement is only what the protocol specification defines.
  Profile-level field requirements (such as REQUIRED fields marked OPTIONAL
  in the schema) are documentary guidance, not runtime-enforced constraints
- Companion profile recommendations are suggestions for common workflows,
  not enforced dependencies. Receipts are valid without companion profiles

## Cross-references

- Wire 0.2 spec: section 12.15 (`org.peacprotocol/attribution` extension group) in `docs/specs/WIRE-0.2.md`
- Registered receipt type: `org.peacprotocol/attribution-event` in `specs/kernel/registries.json`
- Type-to-extension enforcement: section 12.17 in `docs/specs/WIRE-0.2.md`

## Notes / caveats

- The `creator_ref` field is not an identity attestation: it records
  observed attribution metadata. Identity verification belongs to the
  Identity extension group
- The `license_spdx` field uses a structural subset of the SPDX license
  expression grammar. Complex expressions may be truncated by the parser;
  use the simplest valid expression
- The `content_signal_source` field uses a closed vocabulary of five
  values: `tdmrep_json`, `content_signal_header`, `content_usage_header`,
  `robots_txt`, `custom`. These map to the content signals precedence
  chain
- The `content_digest` field accepts SHA-256 digests in
  `sha256:<hex>` format, providing a tamper-evident link to the
  attributed content without embedding it
- Attribution events are observations: recording an attribution event
  does not constitute a binding license grant or obligation
