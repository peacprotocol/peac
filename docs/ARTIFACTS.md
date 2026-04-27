# PEAC artifacts

PEAC uses several different nouns for related-but-distinct things. This page fixes the vocabulary.

## The short version

| Noun         | Scope                                          | Example                                                         |
| ------------ | ---------------------------------------------- | --------------------------------------------------------------- |
| **Record**   | Top-level category term                        | "PEAC is the records layer."                                    |
| **Receipt**  | Per-action / per-transaction artifact          | The `PEAC-Receipt` header value; one signed interaction.        |
| **Evidence** | What a record carries (deep architecture)      | "The extension group carries the evidence the issuer attested." |
| **Bundle**   | A portable collection of records plus metadata | A `peac-bundle/0.1` audit package.                              |
| **Report**   | Output of verification                         | The DD-210 JSON the reference verifier returns.                 |

Front-door copy leads with **records** as the category term and **receipts** as the per-action noun. Deeper architecture and compliance prose sometimes calls the same substrate the "evidence plane" or "evidence floor"; this is deep-architecture vocabulary, not the top-line category term.

## Record

A **record** is any signed interaction artifact PEAC produces or verifies. It is always a compact JWS with `typ: interaction-record+jwt` in the JOSE header. It is the category noun: "PEAC is the records layer," "portable signed records anyone can verify offline."

A record has a fixed structural shape:

- `iss` — issuer URI (`https://` or `did:`).
- `iat`, optional `nbf`, optional `exp` — timing.
- `jti` — record identifier, UUIDv7.
- `kind` — `evidence` or `challenge`. Two fixed structural kinds.
- `type` — reverse-DNS or URI (open set). Identifies what the record represents.
- `pillars` — subset of the ten-pillar closed taxonomy (access, attribution, commerce, consent, compliance, privacy, provenance, safety, identity, purpose).
- `peac_version` — `"0.2"` for the current Wire default.
- `schema` — `"interaction-record+jwt"`.
- `ext` — optional typed extension groups keyed by pillar.

Normative shape: [`docs/specs/WIRE-0.2.md`](specs/WIRE-0.2.md).

## Receipt

A **receipt** is a record carried in a specific per-action context. The term is correct in three places:

- The HTTP header name **`PEAC-Receipt`** (and the `PEAC-Receipt-Ref` variant for oversized payloads).
- Per-interaction artifact examples: a receipt for a single MCP tool call, a receipt for a single API response, a receipt for a single payment observation.
- Commerce-specific surfaces, where "payment receipt" is the idiomatic term.

Do not globally rename "receipt" to "record." The artifact noun stays.

## Evidence

A **record carries evidence**. The extension group data inside a record is the evidence — the specific claims the issuer attested about what happened.

- **Front-door copy:** lead with "records" (category) and "receipts" (per-action). Only use "evidence" when the sentence subject is the claim the record carries.
- **Compliance / audit prose:** "portable audit records," "audit trail," "signed audit evidence" are all acceptable translations for regulator-facing material.
- **Deep architecture / threat model / compliance doctrine:** the same substrate is sometimes called the **evidence plane** or **evidence floor**. This is a deep-architecture term, not the top-line category term. It does not appear on the README, Start Here, examples, listings, or package descriptions.

## Bundle

A **bundle** is a portable collection of records plus the metadata needed to verify them offline at a later time. The current format is `peac-bundle/0.1`.

A bundle typically contains:

- One or more compact JWS records.
- A JWKS snapshot (the public keys that were current when the records were issued).
- Optional policy artifacts (the `peac.txt` / `peac-issuer.json` documents that were current).
- Optional pointer targets fetched and attached by value.
- A manifest describing the bundle contents.

Use bundles for audit and dispute workflows where a third party needs to verify records days, months, or years after issuance without live access to the issuer's key rotation history.

Spec: [`docs/specs/EVIDENCE-CARRIER-CONTRACT.md`](specs/EVIDENCE-CARRIER-CONTRACT.md).

## Report

A **report** is the deterministic JSON output of a verification call. The reference verifier (`POST /v1/verify`) returns the DD-210 report shape:

```json
{
  "verified": true,
  "receipt_ref": "sha256:abcd...",
  "claims": { "iss": "...", "kind": "evidence", "type": "...", "pillars": ["..."] },
  "warnings": [],
  "policy_binding": "verified",
  "issuer": "https://...",
  "kid": "...",
  "wire_version": "0.2"
}
```

Content negotiation on the `Accept` header selects between:

- `application/json` — byte-identical DD-210 report (default).
- `application/peac-report+json` — extended report with `report_id`, `verified_at`, `duration_ms`, `key_resolution`, and `failure_reasons`.
- `text/plain` — human-readable summary.

On error the reference verifier returns RFC 9457 Problem Details (`application/problem+json`) with PEAC extensions (`peac_error_code`, `peac_trace_id`).

Contract: [`packages/schema/openapi/verify.yaml`](../packages/schema/openapi/verify.yaml).

## Lifecycle example

A single API call produces one record, which travels as a receipt, which can later be collected into a bundle, which a third party verifies and receives a report about:

```text
 HTTP request to /api/v1/resource
     |
     v
 issue()                      --> record (compact JWS, typ: interaction-record+jwt)
     |
     v
 PEAC-Receipt response header --> receipt (carried per-action)
     |
     v
 accumulate many receipts
     |
     v
 peac-bundle/0.1              --> bundle (portable audit package)
     |
     v
 POST /v1/verify              --> report (DD-210 JSON, per record)
```

Each of those four words has one specific meaning. Mixing them up loses information.
