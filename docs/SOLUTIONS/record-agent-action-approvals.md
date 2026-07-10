# Record agent action approvals

**Status:** Informative
**Audience:** Platform operator; reviewer checking records that link an
invocation observation to an approval observation for the same action intent.

**Outcome:** Verify that an issuer-reported invocation is linked to an approval
observation for the same action intent, with the reported approval time no later
than the invocation time.

PEAC records what an external system reported about action approval, denial, and
invocation. It does not request approval, determine authority, apply policy,
block execution, approve or deny actions, or execute actions. This recipe is
about action approval, not privacy/data-processing consent.

## The problem

A platform or runtime approves (or denies) a proposed action and, when approved,
invokes it. A reviewer later needs to check offline that the reported invocation
was linked to an approval observation for the exact same action intent, without
access to the platform's live systems.

## What you'll use

- The registered agent-action record types
  `org.peacprotocol/agent-action-approved-observed`,
  `agent-action-denied-observed`, and `agent-action-invoked-observed`.
- The `org.peacprotocol/correlation` extension to carry application-supplied
  workflow and dependency correlation metadata.
- `@peac/protocol` `issue()` and `verifyLocal()`, and
  `@peac/schema` `computeReceiptRef()`.
- The runnable example
  [`examples/action-approval-records`](../../examples/action-approval-records/).

No new receipt type, extension group, schema field, or wire change is
introduced.

## The action intent

The action intent is an application-level artifact (not a PEAC record). Its
JCS + SHA-256 digest (`D_intent`) is what the records bind through
`upstream_artifact_digest`. Include `workflow_id` in the intent so it is bound
into the digest and cannot be transplanted into another workflow unchanged.

A digest is a binding and correlation mechanism, not a confidentiality
mechanism. Do not hash secrets or low-entropy personal data directly; bind an
appropriately scoped opaque parameters artifact by digest instead.

## The records

1. Approval or denial (`agent-action-approved-observed` /
   `agent-action-denied-observed`): `agent_ref` is the subject agent,
   `action_ref` the intended action, `upstream_artifact_digest` is `D_intent`,
   and `correlation.workflow_id` matches the intent. These are roots (no parent
   metadata).
2. Invocation (`agent-action-invoked-observed`), only on the approved path: the
   same `agent_ref`, `action_ref`, and `D_intent`, with `parent_ref` set to the
   approval's `receipt_ref`, `correlation.parent_jti` set to the approval's
   `jti`, and `depends_on` exactly `[approval.jti]`. Its reported `observed_at`
   is no earlier than the approval's.

## Verifying

Give the verifier the expected action intent, one issuer public key, and one
expected issuer. It recomputes `D_intent` (it never trusts a caller-supplied
digest), verifies each record under the one key and issuer, and returns exactly
one result:

- `approval-linked-invocation-observed` — a valid approval and a linked
  invocation, same intent, approval no later than invocation.
- `approval-observed` — a valid approval, no invocation.
- `denial-observed` — a valid signed denial, no invocation.
- `approval-not-established` (`missing-decision-record`) — no decision record.
- `invalid-evidence` — with a specific reason (for example `intent-mismatch`,
  `temporal-order-invalid`, `dangling-reference`, `conflicting-decision-records`,
  `unexpected-issuer`).

A missing approval or a digest mismatch is never a denial. Only a signed denial
record yields `denial-observed`.

## Optional composition

Integrators that separately evaluate a policy can additionally bind the policy
through the existing `policy_ref` / `policy_digest` fields on the record. That is
optional; this recipe does not evaluate policy or model approver identity,
authority, signatures, quorum, expiry, or revocation.

## Boundary

Given the relying party's trusted issuer key, PEAC verification establishes that
the records were signed under that key and contain the reported observations; the
example's additional checks evaluate their intent, linkage, and chronology
consistency. It does not establish the real-world truth or authority of the
underlying approval.

`workflow_id`, `parent_jti`, and `depends_on` are correlation metadata. They do
not independently establish authorization, workflow membership, or issuer trust.
`observed_at` is an issuer-reported time, not an independently trusted timestamp.
