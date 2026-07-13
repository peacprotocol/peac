# Agent runtime lineage export

**Status:** Informative

Event-sourced and durable-execution runtimes can keep local lineage; PEAC can
record selected reported events as portable signed records for independent
verification. This guide describes how such a runtime exports run lineage as
existing PEAC records that a third party can verify offline, without access to
the runtime's database.

PEAC is not a runtime, graph engine, scheduler, orchestrator, replay engine, or
fork engine. It records what the runtime reports. This guide introduces no new
wire format, schema, registry entry, receipt type, or extension group.

## What gets recorded

The runtime chooses which reported events to export. Each event becomes an
existing agent-action record:

| Runtime event               | PEAC record type                                                               |
| --------------------------- | ------------------------------------------------------------------------------ |
| Model call, tool call       | `org.peacprotocol/agent-action-invoked-observed`                               |
| Delegation to another agent | `org.peacprotocol/agent-action-delegated-observed`                             |
| Run finalization / export   | `org.peacprotocol/agent-action-invoked-observed` (a run-summary-export action) |

Raw prompts, model outputs, tool inputs and outputs, headers, and credentials
are never placed in a record. Event content is represented by digests and opaque
references; the records also carry normal PEAC envelope, issuer, time, type, and
correlation metadata.

This is a single-issuer example: every record is signed by, and verifies under,
one issuer key.

## The run manifest and event descriptors

The runtime builds an application-level run manifest (not a PEAC record) listing
ordered event descriptors. Each descriptor carries an opaque `event_ref`, a
`sequence_index`, the agent and action references, and a strict RFC 3339
(seconds-precision) `observed_at`. Invoked-event descriptors carry `sha256:`
input and output digests; delegation descriptors carry a `sha256:` input digest
and the `delegated_to_ref`. Each event record binds:

- its event descriptor by digest, through `upstream_artifact_ref` (the
  `event_ref`) and `upstream_artifact_digest` (the RFC 8785 JCS + SHA-256 digest
  of the descriptor); and
- the whole-manifest digest, through the example-local `com.example/agent-run-lineage`
  extension (`run_ref`, `run_manifest_digest`, `sequence_index`).

Run order comes from the manifest `sequence_index`, not from timestamps.
Timestamps are issuer-reported observation times.

## Chaining records

Records are chained with the existing PEAC fields, not a new lineage mechanism:

- agent-action `parent_ref` binds the previous record's `receipt_ref`;
- `org.peacprotocol/correlation` carries `workflow_id`, `parent_jti`, and
  `depends_on` for the causal edge.

The first event is a root (no parent metadata); each later record links to
exactly the preceding one; the finalization record links to the last event.

## Run-finalization coverage assertion

The run-finalization record carries a `com.example/agent-run-summary`: the
coverage set of event-record refs (canonically sorted, and excluding the
finalization record's own ref), the count, and a Merkle commitment over exactly
those refs, produced with `@peac/audit` `buildReceiptMerkleCommitment` (a CT-style
[RFC 9162](https://www.rfc-editor.org/rfc/rfc9162.html) sorted-set commitment).
The finalization record's `agent_ref` equals the root event's `agent_ref` in the
supplied manifest; it is an issuer-reported record, not an independently trusted
runtime identity.

A verifier given the manifest, the run records, one issuer key, and one issuer
checks that the supplied records exactly match the coverage set asserted by the
signed finalization record. This establishes internal consistency between the
issuer-supplied manifest, the run records, and the signed summary. It does not
prove that the issuer recorded or disclosed every real-world runtime event, and
the Merkle commitment proves inclusion in the committed set, not chronology or
real-world completeness.

## Forks

A forked run's finalization record can carry a `com.example/agent-run-fork` that
records the parent run summary reference, the fork-point record reference, the
`changed_event_ref`, and digests of the changed input and the diff.
`changed_event_ref` identifies the child-manifest event the issuer reports as
corresponding to the fork point. The verifier checks that it identifies exactly
one event in the child manifest, that its `sequence_index` equals the parent
fork-point record's sequence position, and that `changed_input_digest` equals
that child descriptor's input digest. It does not independently prove that the
child event differs from the parent event without the parent manifest or a
separately supplied diff artifact. `diff_artifact_digest` is validated as a
signed grammar but is not independently recomputed, because the diff artifact
itself is not supplied to the verifier.

Verifying the parent evidence establishes a link to a signed parent coverage
assertion: the verifier confirms the parent summary is a valid finalization
record whose Merkle commitment recomputes and whose coverage set includes the
fork-point record. It does not re-verify the entire historical parent run unless
that run is supplied and verified separately. PEAC records the fork relationship
the runtime reports; it does not perform the fork.

## Third-party verification

A relying party verifies offline with only the issuer's public key, the issuer
identifier, and the manifest. No access to the runtime's database is required.
Verification uses RFC 8785 JCS + SHA-256 digesting and standard PEAC signature
and schema validation.

## Boundary

PEAC does not replay, fork, execute, or govern runtimes. Example-local
`com.example/*` keys are not new PEAC extension groups. This guide makes no
adoption, integration, endorsement, partnership, or conformance claim about any
runtime.

## See also

- Runnable example: [`examples/agent-run-lineage-records`](../../examples/agent-run-lineage-records/)
- [`examples/action-approval-records`](../../examples/action-approval-records/) for
  the single-issuer evidence-verifier pattern this example follows.
- [RFC 8785 (JSON Canonicalization Scheme)](https://www.rfc-editor.org/rfc/rfc8785.html);
  [RFC 9162 (Certificate Transparency 2.0)](https://www.rfc-editor.org/rfc/rfc9162.html).
