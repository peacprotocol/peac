# PEAC case studies and distribution artifacts

This directory collects two kinds of artifact:

1. **Case studies** - short, artifact-centric descriptions of an external party that exercises PEAC end to end (issues records, verifies them, or carries them through an MCP / A2A / commerce surface). Each case study names the external party, links a public reproducible artifact, and includes steps an evaluator can run to reproduce the observation.
2. **Distribution submissions** - status tracking for listings and marketplace submissions, with per-row state and a reproducible artifact reference per row.

Both categories share one discipline: every entry cites a public, verifiable artifact. Nothing here is a marketing claim.

## External proof admissibility

The external proof loop honest gate distinguishes between evidence that counts and evidence that does not. This admissibility block is enforced when a case study is proposed as external proof in a release note.

### Counts as external proof

- **Non-Originary external actor.** The party running the integration is independent of Originary; the party, not PEAC maintainers, owns the integration surface.
- **Reproducible public artifact.** A public URL, signed record, pinned commit SHA, public repository, or public pull request that an evaluator can open without private access.
- **Public verifiable link OR signed record.** Either a URL that any evaluator can follow, or a signed PEAC record that verifies against a non-PEAC-authored issuer.
- **Named integration surface.** One of API (verify or issue), MCP tool-call, A2A agent card, x402 settlement observation, ACP session observation, commerce evidence, or a named runtime-governance export.

### Does not count as external proof

- **Self-authored demos** produced by PEAC maintainers on behalf of an unnamed third party.
- **Submission screenshots alone** without the external-party-side acknowledgement or merge artifact.
- **Unverifiable private claims** ("a Fortune 500 pilot exists" with no public URL).
- **PEAC-authored fixtures relabeled as external proof.** Fixtures under `specs/conformance/` or `examples/` written by this repository's maintainers remain internal evidence, not external proof.
- **"We submitted to X" without the external-side signal.** A submission is tracked separately under `distribution-submissions.md`; it becomes external proof only when the external party acts on it (merge, listing, or public acceptance).

### Admissibility decision record

When a case study is added here, the submitter records, in the case-study file itself:

- External party name and public URL.
- The verifiable artifact link (signed record, commit SHA, or hosted URL).
- The named integration surface.
- A short "Evaluator reproduction" section with commands or steps a third party can run end to end.
- The date the artifact was captured and the date it was last re-verified.

A case study counts as external proof in a release note only when all four of those fields are present and verifiable.

## Files in this directory

- [`README.md`](README.md) - this document.
- [`TEMPLATE.md`](TEMPLATE.md) - template a new case study copies.
- [`distribution-submissions.md`](distribution-submissions.md) - submission tracking for listings and marketplaces, with per-row state (`prepared`, `submitted`, `discoverable`).

## Related documents

- [External audit scope](../external-audit-scope.md) (scheduled for v0.12.13 P2 landing).
- [Trust artifacts](../TRUST-ARTIFACTS.md)
- [Compliance mappings](../compliance/README.md)
