# Access Profile

**Status:** Draft
**Since:** v0.12.2
**Extension Group:** `org.peacprotocol/access`
**Receipt Type:** `org.peacprotocol/access-decision`

## Abstract

The Access profile documents how to use the `org.peacprotocol/access`
extension group to record access control decisions as evidence receipts.
It covers resource identification, action classification, and
three-state decision outcomes (allow, deny, review). All three fields
in the access extension group are schema-required, so this profile does
not tighten any fields beyond what the schema already mandates.

## When to use

- Recording that an API gateway, MCP server, or service mesh evaluated
  an access request and reached a decision (allow, deny, or deferred
  for review)
- Producing machine-verifiable evidence that a specific resource was
  accessed (or denied) for a specific action at a specific time
- Creating auditable access decision logs that can be verified by third
  parties independently of the system that made the decision

## Required / Recommended / Prohibited fields

All fields below belong to the `org.peacprotocol/access` extension group.

| Field      | Schema Status | Profile Status | Rationale                                              |
| ---------- | ------------- | -------------- | ------------------------------------------------------ |
| `resource` | REQUIRED      | REQUIRED       | Identifies the resource being accessed                 |
| `action`   | REQUIRED      | REQUIRED       | Identifies the action performed on the resource        |
| `decision` | REQUIRED      | REQUIRED       | Records the access control outcome (allow/deny/review) |

All fields are schema-required. This profile does not tighten any
optional fields to REQUIRED status.

## Minimal valid receipt

The smallest receipt body that satisfies this profile. The `extensions`
object carries the `org.peacprotocol/access` group with the three
required fields.

```json
{
  "iss": "https://gateway.example.com",
  "aud": "https://consumer.example.com",
  "kind": "evidence",
  "type": "org.peacprotocol/access-decision",
  "pillars": ["access"],
  "extensions": {
    "org.peacprotocol/access": {
      "resource": "https://api.example.com/inference/v1",
      "action": "execute",
      "decision": "allow"
    }
  }
}
```

## Companion profiles

- **Identity** (recommended, not enforced): when the access decision
  depends on a verified identity attestation, pairing an identity
  receipt with an access receipt provides a complete evidence chain
  from identity proof to access outcome
- **Compliance** (recommended for audit workflows): when access
  decisions are subject to regulatory audit, a companion compliance
  receipt records the framework and audit reference

Companion profiles are recommendations for common workflows, not
enforced dependencies. Receipts are valid without companion profiles.

## Regulatory context

The access extension group supports evidence relevant to:

- SOC 2 Type II: access control evidence for CC6.1 (logical and
  physical access controls)
- ISO 27001: access control evidence for Annex A.9 (access control)
- NIST SP 800-53: access control evidence for AC (Access Control)
  family

This profile can help document access decisions for audit purposes.
PEAC is evidence infrastructure; these mappings do not themselves
constitute compliance.

## Conformance examples

### Valid: access-decision with allow outcome

```json
{
  "iss": "https://gateway.example.com",
  "kind": "evidence",
  "type": "org.peacprotocol/access-decision",
  "pillars": ["access"],
  "extensions": {
    "org.peacprotocol/access": {
      "resource": "https://api.example.com/data/users",
      "action": "read",
      "decision": "allow"
    }
  }
}
```

This receipt satisfies the profile: all three required fields are
present and the decision is one of the three valid values.

### Invalid: missing decision field

```json
{
  "iss": "https://gateway.example.com",
  "kind": "evidence",
  "type": "org.peacprotocol/access-decision",
  "pillars": ["access"],
  "extensions": {
    "org.peacprotocol/access": {
      "resource": "https://api.example.com/data/users",
      "action": "read"
    }
  }
}
```

This receipt fails schema validation (not just profile validation):
`decision` is schema-required. The access extension group has no
optional fields, so schema validation and profile validation are
equivalent for this group.

### Companion: access + identity

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

This receipt pairs access evidence with an identity proof reference,
providing a complete evidence chain from identity to access outcome.

## Quick demo

```typescript
import { generateKeypair } from '@peac/crypto';
import { issue, verifyLocal } from '@peac/protocol';

const { privateKey, publicKey } = await generateKeypair();

const { jws } = await issue({
  iss: 'https://gateway.example.com',
  kind: 'evidence',
  type: 'org.peacprotocol/access-decision',
  pillars: ['access'],
  extensions: {
    'org.peacprotocol/access': {
      resource: 'https://api.example.com/inference/v1',
      action: 'execute',
      decision: 'allow',
    },
  },
  privateKey,
  kid: 'key-2026-03',
});

const result = await verifyLocal(jws, publicKey, {
  issuer: 'https://gateway.example.com',
  strictness: 'strict',
});

console.log(result.valid); // true
console.log(result.claims.type); // 'org.peacprotocol/access-decision'
```

## Cross-references

- Wire 0.2 spec: section 12.5 (`org.peacprotocol/access` extension group) in `docs/specs/WIRE-0.2.md`
- Registered receipt type: `org.peacprotocol/access-decision` in `specs/kernel/registries.json`
- Type-to-extension enforcement: section 12.17 in `docs/specs/WIRE-0.2.md`

## Non-goals / not guaranteed

- This profile does not introduce new schema fields. All fields referenced
  exist in the `org.peacprotocol/access` extension group schema
- This profile does not by itself establish legal compliance with any regulation.
  PEAC is evidence infrastructure; legal compliance depends on organizational
  controls, processes, and legal interpretation beyond the scope of this protocol
- Verifier enforcement is only what the protocol specification defines.
  Profile-level field requirements (such as REQUIRED fields marked OPTIONAL
  in the schema) are documentary guidance, not runtime-enforced constraints
- Companion profile recommendations are suggestions for common workflows,
  not enforced dependencies. Receipts are valid without companion profiles

## Notes / caveats

- The `decision` field uses a closed vocabulary of three values:
  `allow`, `deny`, `review`. The `review` value represents a deferred
  decision where a human or downstream system must make the final call
- The `resource` field accepts URIs or opaque identifiers up to 2048
  characters. Organizations should use consistent resource naming
  conventions for interoperability
- The `action` field is an open vocabulary string. Common values include
  `read`, `write`, `execute`, `delete`, `list`, but any string up to
  256 characters is valid
- Access decisions are observations: recording an access decision does
  not constitute granting or revoking access
