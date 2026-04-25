# @peac/registries

Workspace-private internal package. Not published to npm.

This package is an internal facade over public `@peac/kernel` constants. It re-groups
the existing public constants into ergonomic sub-modules (`verifier-context`, `adapters`,
`extensions`, `proofs-and-receipts`) for internal consumers within this workspace.

Public consumers MUST continue to import from `@peac/kernel` directly. This package
will never appear on npm; its only purpose is internal-consumer ergonomics.

This package follows the workspace version until release-prep; the v0.13.1
version stamping happens in the release PR (the workspace-wide bump enforced
by `scripts/check-version-coherence.sh`).

See `docs/STABILITY-CONTRACT.md` for the public surface.
