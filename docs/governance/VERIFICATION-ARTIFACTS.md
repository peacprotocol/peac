# Verification Artifact Conventions

PEAC uses signed interaction records and reproducible fixtures to make verification artifacts easier to inspect, reproduce, and cite.

This document describes conventions for public verification artifacts in the PEAC repository.

## Scope

This document covers:

1. artifact URLs
2. fixture paths
3. verification commands
4. source references
5. timestamp fields
6. change history
7. non-claims

It does not define protocol semantics or implementation requirements.

## Artifact URLs

Use stable public URLs. Avoid temporary links, private links, and links that require authentication. When an artifact lives inside this repository, prefer a path-based reference (for example `specs/conformance/interop/...`) over a hosted URL.

## Fixture paths

Use committed repository paths for fixtures. Interop fixtures belong under `specs/conformance/interop/` when they describe cross-format behavior. PEAC parity fixtures belong under `specs/conformance/parity-corpus/` when they describe PEAC conformance behavior.

Do not cite placeholder paths. If an artifact does not yet have a fixture, omit the fixture field.

## Verification commands

Each artifact should include the smallest command needed to reproduce the verification result. Commands should be deterministic, offline when possible, and safe to run from a clean checkout.

A verification command is a means to reproduce a check, not a description of behavior. Behavior belongs in the artifact's referenced specification.

## Source references

Reference external specifications, repositories, or issue threads only when the artifact directly depends on them. Cite by stable identifier (RFC number, IETF draft name, GitHub issue URL, version tag) and avoid implying endorsement, certification, or relationship.

## Timestamp fields

Use ISO dates for manual verification timestamps. A timestamp records when the artifact was checked. It is not a guarantee about future availability, and it is not a status indicator.

## Change history

Changes to artifact conventions should be dated and described briefly. Change history records what was edited and why. Change history is not a place for forward-looking announcements.

## Non-claims

A verification artifact does not imply:

- an endorsement
- a certification
- a production deployment
- a standards approval
- an implementation requirement

## Versioning

| Revision | Date       | Rationale                    |
| -------- | ---------- | ---------------------------- |
| v1       | 2026-05-22 | Initial artifact convention. |
