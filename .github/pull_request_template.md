## Summary

<!-- Technical summary of what this PR changes. Keep factual and implementation-focused. -->

## Scope

<!-- What this PR changes and what it does not change. -->

## Changes

<!-- List the specific changes made -->

-
-
-

## Test plan

<!-- How these changes were verified -->

- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck:core` passes
- [ ] `bash scripts/guard.sh` passes

## Checklist

- [ ] Code follows project coding standards
- [ ] Documentation updated as needed
- [ ] Tests added for new functionality
- [ ] Commit messages use conventional format
- [ ] PR title is technical and under 70 chars
- [ ] PR body contains only technical content (no internal planning, sequencing, or process language)

## Neutrality and abstraction check

Required only for changes involving an external standard, ecosystem, vendor,
framework, or integration surface
(see [`docs/architecture/ABSTRACTION-BOUNDARIES.md`](../docs/architecture/ABSTRACTION-BOUNDARIES.md)).
For PRs that do not touch any external integration surface, mark each item
"not applicable" and proceed.

- [ ] Generic PEAC primitive identified, or not applicable.
- [ ] Ecosystem-specific semantics kept in profile, mapping, adapter, fixture, or example (not in core).
- [ ] No external SDK dependency added to PEAC core (`@peac/kernel`, `@peac/schema`, `@peac/crypto`, `@peac/protocol`).
- [ ] Generic abstraction does not weaken profile-specific validation.
- [ ] Normative vs informative boundaries are clear.

## Follow-ups

<!-- Technical follow-ups only. Leave empty if none. -->
