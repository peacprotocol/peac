# Action Approval Records

**Outcome:** Verify that an issuer-reported invocation is linked to an approval
observation for the same action intent, with the reported approval time no later
than the invocation time.

**Audience:** Platform operator; reviewer checking records that link an
invocation observation to an approval observation for the same action intent.

**Time:** about 5 minutes.

PEAC records what an external system reported about action approval, denial, and
invocation. It does not request approval, determine authority, apply policy,
block execution, approve or deny actions, or execute actions. This example is
about action approval, not privacy/data-processing consent.

## What it shows

A single issuer (a platform or runtime) reports three kinds of observation as
existing agent-action records:

- `org.peacprotocol/agent-action-approved-observed` or
  `org.peacprotocol/agent-action-denied-observed`, binding the digest of an
  example-local action intent artifact.
- `org.peacprotocol/agent-action-invoked-observed`, issued only on the approved
  path, linked to the approval record.

The verifier (`verifyActionApprovalEvidence`) is given the expected action
intent, one issuer public key, and one expected issuer. It recomputes the intent
digest and returns exactly one of:

- `approval-linked-invocation-observed`
- `approval-observed`
- `denial-observed`
- `approval-not-established` (`missing-decision-record`)
- `invalid-evidence` (with a specific reason)

A missing approval or a digest mismatch is never reported as a denial: only a
signed denial record yields `denial-observed`.

## Action intent

The action intent is an application-level artifact, not a PEAC record. Its JCS +
SHA-256 digest is bound by the records through `upstream_artifact_digest`:

```json
{
  "artifact_type": "com.example/action-intent/1",
  "workflow_id": "workflow-action-approval-001",
  "agent_ref": "urn:agent:research-bot",
  "action_ref": "urn:action:refund-request:42",
  "target_ref": "urn:order:42",
  "parameters_ref": "urn:example:action-parameters:42",
  "parameters_digest": "sha256:<hex64>"
}
```

A digest is a binding and correlation mechanism, not a confidentiality
mechanism. Digests of low-entropy or guessable values may be dictionary tested.
Production integrations should not hash secrets or low-entropy personal data
directly, and should use appropriately scoped opaque artifacts or commitment
designs when disclosure risk exists.

## Running

From the repository root:

```bash
pnpm --filter @peac/example-action-approval-records demo
pnpm --filter @peac/example-action-approval-records demo:tamper
```

The demo uses ephemeral keys and illustrative identifiers. Production
integrations generate their own issuer keys and collision-resistant identifiers.

## Boundaries

- `agent_ref` is the subject agent taking the action, never the approver. This
  minimal example does not model approver identity, authority, signatures,
  quorum, expiry, or revocation.
- `workflow_id`, `parent_jti`, and `depends_on` are correlation metadata. They do
  not independently establish authorization, workflow membership, or issuer trust.
- `observed_at` values are issuer-reported observation times, compared as parsed
  instants. They are not independently trusted timestamps and do not prove the
  real-world time of the underlying action.
- The verifier reports what the evidence establishes. It does not approve, deny,
  authorize, or make a policy decision.
