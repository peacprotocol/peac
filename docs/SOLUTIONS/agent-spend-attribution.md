# Agent spend attribution

**Status:** Informative
**Audience:** Finance and audit reviewer; platform operator attributing
agent spend over verified records.

PEAC can preserve payment-related observations associated with agent
workflows as portable signed records. The record issuer can be a gateway,
payment adapter, runtime, API provider, or agent system; the record
reports what that system observed. This page describes how to attribute
that observed spend for review using records and helpers that already
ship. It is informative and adds no PEAC field.

PEAC verifies individual records and preserves correlation data. Graph
reconstruction, payment-lifecycle correlation, acknowledgment matching,
and aggregation are relying-party or application functions unless a
specific profile defines otherwise.

PEAC is not an accounting system. Totals here are observed amounts, not
authoritative balances. PEAC does not classify expenses or determine
accounting treatment. This page supports operational finance review and
does not replace an organization's accounting records or review
processes.

## The workflow-correlation graph

In this page, `correlation.*` is shorthand for fields under
`ext["org.peacprotocol/correlation"]`.

The shipped `examples/workflow-correlation` demo issues payment records
representing payment-related observations across a `root -> fork -> join`
structure. Because a join uses
`correlation.parent_jti` and `correlation.depends_on`, the records form a
directed **workflow graph**, not a tree. Each node carries its own
observed `amount_minor` (per-step and per-branch), so the same verified
records can be reviewed as a list or reconstructed as a workflow graph
from the correlation links.

## Attributing spend over verified records

Attribution is a read over verified records. Treat `workflow_id` as
correlation metadata, not proof of workflow membership, authorization, or
common issuer. Establish the bounded review set and its accepted issuers
or participants before grouping records. Apply these rules:

1. Verify every PEAC record and confirm that its issuer/key is accepted
   under the relying party's review policy.
2. Establish a bounded review set and an explicit accepted-issuer or
   participant policy. A valid signature proves control of the signing
   key; it does not by itself establish that the issuer belongs to the
   reviewed workflow.
3. Group only accepted records by `correlation.workflow_id`. A matching
   `workflow_id` is a correlator, not an authorization or membership
   credential.
4. Resolve every `correlation.parent_jti` and `correlation.depends_on`
   value to exactly one accepted record in the review set. Zero matches
   are dangling references. Multiple matches are ambiguous and must be
   rejected; never select a match by display, ingestion, or array order.
   Where a profile supplies issuer-qualified or digest-bound references,
   use those stronger bindings. Detect or reject cycles, and bound graph
   traversal for untrusted or very large record sets.
5. Deduplicate exact records: the same `receipt_ref` is a duplicate; the
   same `(iss, jti)` with different signed bytes is a conflict to
   investigate, not an ordinary duplicate.
6. Correlate authorization, capture, and settlement observations for one
   economic event using the applicable rail or profile's stable
   reference and a documented lifecycle policy; do not count them as
   three separate expenses.
7. Do not silently net refunds, reversals, disputes, or adjustments.
8. Validate `amount_minor` with the shipped PEAC commerce validator
   (`@peac/schema` `isValidAmountMinor` / `AmountMinorStringSchema`). Sum
   with arbitrary-precision integer arithmetic (`BigInt`), never
   JavaScript `Number` or binary floating point. An invalid amount is
   unusable evidence, not zero.
9. Group totals by the exact validated `currency`; never combine
   different currencies into one total without an explicitly external FX
   source and timestamp.
10. Preserve the source `receipt_ref` and `(iss, jti)` tuple behind every
    displayed amount. `receipt_ref` identifies the exact signed bytes;
    `jti` is issuer-scoped, so it is only meaningful together with its
    `iss`.
11. Treat missing branches or absent records as incomplete evidence, not
    zero spend. Totals remain observed amounts, never authoritative
    balances.

## Delegation context

Delegated actions appear as `org.peacprotocol/agent-action-delegated-observed`
records (which carry `delegated_to_ref`), and an agent's
`agent_identity.delegation_chain` can reference the delegating records.
Delegation references provide review context. Their presence alone does
not establish authority; verify the referenced delegation records,
issuers, validity periods where present, and bindings independently.

## Integrator finance context (example-local, not core)

An integrator that needs finance-review context can carry it in an
example-local extension. This is not a PEAC schema field. The surrounding
`extensions` object below is illustrative and must still satisfy the
normal PEAC extension-key and record validation rules:

```json
{
  "extensions": {
    "com.example/finance": {
      "integrator_category": "research-tools",
      "business_purpose_ref": "sha256:<hex64>",
      "invoice_ref": "sha256:<hex64>",
      "line_items_digest": "sha256:<hex64>"
    }
  }
}
```

PEAC does not interpret or classify these values.
`integrator_category` is an integrator-defined allowlisted code. The
integrator documents its grammar, maximum length, accepted values, and
versioning policy. It must not contain free-form financial, personal, or
credential data. `business_purpose_ref` and `invoice_ref` must
be opaque references or digest references, not raw descriptions, invoice
contents, customer identities, account data, or credentials.
`line_items_digest` is a digest only; raw line items remain outside the
signed PEAC record, and the integrator documents its source
representation, canonicalization, hash algorithm, version, and digest
grammar so the digest can be reproduced.

Digest references are not confidentiality controls. Low-entropy or
guessable source values may be dictionary-tested, and stable digests can
correlate records across systems. Integrators should hash canonicalized,
appropriately scoped source material and use access-controlled opaque
references where disclosure risk remains.

## Reviewer summary

`@peac/audit` `createDisputeBundle` packages the referenced records and
verification material; `formatReportText` renders the bundle verification
result. The summary below is an illustrative integrator-composed view
over verified records; it is not the literal output of `formatReportText`.

```text
Agent Spend Attribution Summary
Observed payment rail: x402 (illustrative)
Settlement artifact ref: sha256:<...>
Issuer: https://payer.example | Agent: research-bot-v3
Service ref: example-data-api
Observed amount: 1250 minor units | Currency: USD
Purpose ref: sha256:<...> | Line items digest: sha256:<...>
Linked acknowledgment binding: present / absent / not requested
Records: 1. payer payment observation  2. provider observation of the payer payment record with an acknowledgment binding  3. delivery observation
PEAC verification: passed for each record
Integrator-defined correlation and linkage checks: passed
```

The acknowledgment binding in this specimen is integrator-defined and
does not name a new PEAC receipt type or extension group.

x402 is illustrative; the attribution pattern is payment-rail-neutral
when the underlying records provide a stable payment or settlement
reference. A settlement artifact reference being present does not imply
settlement finality.

## Boundary

PEAC records observations and preserves references and digests. It does
not classify expenses, compute authoritative balances, settle payments,
or make accounting determinations. Verify each record independently.

## Related

- [Commerce evidence bundle](commerce-evidence-bundle.md)
- [Regulatory audit trail](regulatory-audit-trail.md)
- [Anchoring evidence digests](../guides/anchoring-evidence-digests.md)
