# Agent Run Lineage Records

**Outcome:** Export selected reported events from an agent run, plus a
run-finalization record carrying signed coverage metadata, as offline-verifiable
PEAC records, and verify offline that they are internally consistent with an
issuer-supplied run manifest. Single-issuer example: one issuer signs, and one
key verifies, every record.

**Audience:** Platform or runtime operator exporting run lineage; reviewer
checking a run's exported records without access to the runtime's database.

**Time:** about 5 minutes.

PEAC is not a runtime, graph engine, scheduler, orchestrator, replay engine, or
fork engine; it records what the runtime reports. Raw prompts, model outputs,
tool inputs/outputs, headers, and credentials never appear in the manifest, the
records, or the logs.

## What it shows

A single issuer (an agent runtime) records a deterministic run as existing
agent-action records:

- Each model or tool call is an `org.peacprotocol/agent-action-invoked-observed`
  record; a delegation hop is an `org.peacprotocol/agent-action-delegated-observed`
  record. Each binds the JCS + SHA-256 digest of its event descriptor through
  `upstream_artifact_digest`, and every record binds the whole-manifest digest
  through the example-local `com.example/agent-run-lineage` extension.
- Records are chained with the existing `parent_ref` /
  `org.peacprotocol/correlation` (`workflow_id`, `parent_jti`, `depends_on`)
  fields; order comes from the manifest `sequence_index`, not timestamps.
- A run-finalization record (an `agent-action-invoked-observed` record whose
  `action_ref` is `urn:example:action:agent-run-summary-export`) carries an
  example-local `com.example/agent-run-summary`: the sorted coverage set of
  event-record refs, its count, and a mandatory Merkle commitment
  (`@peac/audit` `buildReceiptMerkleCommitment`) over exactly those refs. Its
  `agent_ref` equals the root event's `agent_ref` in the supplied manifest.
- A forked run's finalization record carries an example-local
  `com.example/agent-run-fork` recording the parent run summary, the fork point,
  and the issuer-reported corresponding child event (`changed_event_ref`), whose
  sequence position and `changed_input_digest` are checked against the forked
  manifest and the parent fork point.

## The run manifest

The run manifest is an application-level artifact (not a PEAC record). It lists
the ordered event descriptors; each descriptor and the whole manifest are bound
by digest into the records:

```json
{
  "artifact_type": "com.example/agent-run-manifest/1",
  "run_ref": "urn:example:agent-run:001",
  "workflow_id": "agent-run-workflow-001",
  "event_count": 3,
  "events": [{ "event_ref": "urn:example:event:001", "sequence_index": 0, "...": "..." }]
}
```

A digest is a binding and correlation mechanism, not a confidentiality
mechanism. Digests of low-entropy or guessable values may be dictionary tested;
production integrations should not hash secrets or low-entropy personal data
directly.

## Running

```bash
pnpm --filter @peac/example-agent-run-lineage-records demo
pnpm --filter @peac/example-agent-run-lineage-records demo:tamper
```

Both commands run the complete demonstration (a consistent run, a manifest-tamper
beat, a payload-tamper beat, and a valid fork); the tamper beats are integral to
the walkthrough. The demo uses ephemeral keys and illustrative identifiers.

## Verifying

`verifyAgentRunLineageEvidence({ expectedManifest, records, publicKey, expectedIssuer, parentEvidence? })`
validates the manifest, recomputes its digest and every event-descriptor digest,
verifies each record under the one key and issuer, reconstructs the chain from
the manifest sequence and the existing correlation links, and recomputes the
Merkle commitment over the coverage set. It returns
`run-lineage-evidence-consistent` or `invalid-evidence` with a specific reason.

## Boundaries

- The verifier checks that the supplied records exactly match the coverage set
  asserted by the signed finalization record. This does not prove that the
  issuer recorded or disclosed every real-world runtime event.
- The Merkle commitment proves inclusion in the committed set; it does not prove
  chronology, completeness, payment finality, payment validity, privacy, or
  legal validity.
- `com.example/*` keys are example-local, not new PEAC extension groups.
- Fork evidence records a reported relationship; PEAC does not perform the fork.
- `observed_at` values are issuer-reported observation times, not independently
  trusted timestamps; run order comes from `sequence_index`.
- No adoption, integration, endorsement, partnership, or conformance claim.
