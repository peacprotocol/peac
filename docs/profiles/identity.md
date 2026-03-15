# Identity Profile

**Status:** Draft
**Since:** v0.12.2
**Extension Group:** `org.peacprotocol/identity`
**Receipt Type:** `org.peacprotocol/identity-attestation`

## Abstract

The Identity profile documents how to use the `org.peacprotocol/identity`
extension group to record identity verification or attestation evidence
as receipts. The identity extension group is deliberately minimal: a
single optional `proof_ref` field that carries an opaque reference to
the identity proof mechanism. The top-level `actor` field (outside the
extension) is the canonical location for actor binding; the identity
extension group provides supplementary proof metadata when needed.

## When to use

- Recording that an identity attestation was verified for an agent,
  service, or user at a specific point in time
- Linking a receipt to an external identity proof mechanism (DID, SPIFFE,
  x509 certificate chain, EAT passport) via an opaque reference
- Creating auditable identity evidence that feeds into access control
  or compliance workflows alongside companion profiles

## Required / Recommended / Prohibited fields

All fields below belong to the `org.peacprotocol/identity` extension group.

| Field       | Schema Status | Profile Status | Rationale                                               |
| ----------- | ------------- | -------------- | ------------------------------------------------------- |
| `proof_ref` | OPTIONAL      | RECOMMENDED    | Links to external identity proof for audit traceability |

The identity extension group has no schema-required fields. The
extension group itself must be present for receipts with type
`org.peacprotocol/identity-attestation` (enforced by type-to-extension
enforcement in strict mode), but `proof_ref` is the only field and it
is optional at both schema and profile level.

## Minimal valid receipt

The smallest receipt body that satisfies this profile. The `extensions`
object carries the `org.peacprotocol/identity` group. Since `proof_ref`
is optional, an empty extension object is valid.

```json
{
  "iss": "https://idp.example.com",
  "aud": "https://consumer.example.com",
  "kind": "evidence",
  "type": "org.peacprotocol/identity-attestation",
  "pillars": ["identity"],
  "extensions": {
    "org.peacprotocol/identity": {}
  }
}
```

With the recommended `proof_ref`:

```json
{
  "iss": "https://idp.example.com",
  "aud": "https://consumer.example.com",
  "kind": "evidence",
  "type": "org.peacprotocol/identity-attestation",
  "pillars": ["identity"],
  "extensions": {
    "org.peacprotocol/identity": {
      "proof_ref": "did:key:z6Mkf5rGMoatrSj1f4CyvuHBeXJELe9RPdzo2PKGNCKVtZxP"
    }
  }
}
```

## Companion profiles

- **Access** (recommended, not enforced): when an identity attestation
  leads to an access decision, pairing identity evidence with an access
  receipt provides a complete chain from identity proof to access outcome
- **Compliance** (recommended for regulated workflows): when identity
  verification is subject to regulatory requirements (KYC, AML), a
  companion compliance receipt records the framework and verification status

Companion profiles are recommendations for common workflows, not
enforced dependencies. Receipts are valid without companion profiles.

## Regulatory context

The identity extension group supports evidence relevant to:

- NIST SP 800-63 (Digital Identity Guidelines): identity proofing and
  authentication assurance levels
- eIDAS 2.0 (EU Digital Identity Framework): identity attestation
  evidence for European digital identity wallets
- NIST AI 600-1 (Agent Identity): agent identity binding evidence for
  AI systems acting on behalf of users or operators

This profile can help document identity attestation events for audit
purposes. PEAC is evidence infrastructure; these mappings do not
themselves constitute compliance.

## Conformance examples

### Valid: identity attestation with DID proof reference

```json
{
  "iss": "https://idp.example.com",
  "kind": "evidence",
  "type": "org.peacprotocol/identity-attestation",
  "pillars": ["identity"],
  "extensions": {
    "org.peacprotocol/identity": {
      "proof_ref": "did:key:z6Mkf5rGMoatrSj1f4CyvuHBeXJELe9RPdzo2PKGNCKVtZxP"
    }
  }
}
```

This receipt satisfies the profile: the identity extension group is
present and `proof_ref` provides a DID reference for audit traceability.

### Valid: minimal identity attestation without proof_ref

```json
{
  "iss": "https://idp.example.com",
  "kind": "evidence",
  "type": "org.peacprotocol/identity-attestation",
  "pillars": ["identity"],
  "extensions": {
    "org.peacprotocol/identity": {}
  }
}
```

This receipt is valid at both schema and profile level. The empty
extension object satisfies type-to-extension enforcement (the group
is present). The `proof_ref` field is RECOMMENDED but not REQUIRED.

### Invalid: identity-attestation type without extension group

```json
{
  "iss": "https://idp.example.com",
  "kind": "evidence",
  "type": "org.peacprotocol/identity-attestation",
  "pillars": ["identity"]
}
```

This receipt fails strict-mode verification with
`E_EXTENSION_GROUP_REQUIRED`: the registered type
`org.peacprotocol/identity-attestation` requires the
`org.peacprotocol/identity` extension group to be present.

### Companion: identity + access

```json
{
  "iss": "https://gateway.example.com",
  "kind": "evidence",
  "type": "org.peacprotocol/access-decision",
  "pillars": ["access"],
  "extensions": {
    "org.peacprotocol/access": {
      "resource": "https://api.example.com/inference/v1",
      "action": "execute",
      "decision": "allow"
    },
    "org.peacprotocol/identity": {
      "proof_ref": "did:key:z6Mkf5rGMoatrSj1f4CyvuHBeXJELe9RPdzo2PKGNCKVtZxP"
    }
  }
}
```

This receipt pairs access evidence with identity proof metadata. The
primary type is `access-decision` with the required access extension;
the identity extension provides supplementary proof context.

## Quick demo

```typescript
import { generateKeypair } from '@peac/crypto';
import { issue, verifyLocal } from '@peac/protocol';

const { privateKey, publicKey } = await generateKeypair();

const { jws } = await issue({
  iss: 'https://idp.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/identity-attestation',
  pillars: ['identity'],
  extensions: {
    'org.peacprotocol/identity': {
      proof_ref: 'did:key:z6Mkf5rGMoatrSj1f4CyvuHBeXJELe9RPdzo2PKGNCKVtZxP',
    },
  },
  privateKey,
  kid: 'key-2026-03',
});

const result = await verifyLocal(jws, publicKey, {
  issuer: 'https://idp.example.com',
  strictness: 'strict',
});

console.log(result.valid); // true
console.log(result.claims.type); // 'org.peacprotocol/identity-attestation'
```

## Cross-references

- Wire 0.2 spec: section 12.6 (`org.peacprotocol/identity` extension group) in `docs/specs/WIRE-0.2.md`
- Registered receipt type: `org.peacprotocol/identity-attestation` in `specs/kernel/registries.json`
- Type-to-extension enforcement: section 12.17 in `docs/specs/WIRE-0.2.md`
- Agent Identity specification: `docs/specs/AGENT-IDENTITY.md`
- Actor Binding (Wire 0.1): `docs/specs/AGENT-IDENTITY-PROFILE.md`

## Non-goals / not guaranteed

- This profile does not introduce new schema fields. All fields referenced
  exist in the `org.peacprotocol/identity` extension group schema
- This profile does not by itself establish legal compliance with any regulation.
  PEAC is evidence infrastructure; legal compliance depends on organizational
  controls, processes, and legal interpretation beyond the scope of this protocol
- Verifier enforcement is only what the protocol specification defines.
  Profile-level field requirements (such as REQUIRED fields marked OPTIONAL
  in the schema) are documentary guidance, not runtime-enforced constraints
- Companion profile recommendations are suggestions for common workflows,
  not enforced dependencies. Receipts are valid without companion profiles
- The identity extension group does NOT perform identity verification.
  It records that a verification event occurred and optionally references
  the proof mechanism. Actual identity verification is performed by
  external systems

## Notes / caveats

- The `proof_ref` field is an opaque string up to 256 characters. It can
  carry DIDs, SPIFFE IDs, certificate fingerprints, or any other identifier
  meaningful to the verifier. No format validation is performed beyond
  length bounds
- The top-level `actor` claim (outside extensions) is the canonical location
  for actor binding. The identity extension supplements it with proof
  metadata; it does not replace or duplicate actor binding
- DID document resolution is not performed at the schema or protocol layer.
  DID resolution belongs in Layer 4 adapters (such as `@peac/adapter-did`)
- Identity attestation events are observations: recording an attestation
  does not constitute verifying or establishing identity
