# Contributing to PEAC Protocol

Fork the repo, work in a dev branch, and submit PRs for review. All changes auditable/traceable.

Guidelines:

- Follow spec.md for features.
- Add tests for SDK changes.
- Use PR templates (issue description, code review checklist).
- Focus on modularity, neutrality, and compliance.

### PEAC Protocol Test Agent for EIP-712

All EIP-712 protocol integration tests use this public Ethereum test vector:

- agent_id: `0xa0fb98a1d397d13fbe71f31fbc3241c8b01488da`
- private_key: `4f3edf983ac636a65a842ce7c78d9aa706d3b113b37d7b1b6b5ddf49f7f6ed15`

This allows all contributors and auditors to run and verify protocol tests using reproducible, non-secret keys.

Paths: Spec writer (update spec.md), SDK dev (peac-core), Policy author (examples).

For major collaborations, email protocol@peacprotocol.org.
