# Contributing to PEAC Protocol

Thank you for your interest in contributing! PEAC Protocol is an open, global standard and welcomes input from all; developers, publishers, AI researchers, and policy experts.

## How to Contribute

1. **Fork the repo** and clone locally.
2. **Branch from `main`** for docs or bugfixes. For code/features, use an epic branch (`dev-*`).
3. **Write code/tests/docs** following project structure and style.
4. **Run all tests** (`npm test` or `pytest`).
5. **Open a Pull Request** (PR) with clear summary and related issue reference.
6. **Engage in Review**—address feedback, squash commits, and ensure clean history.
7. **Sign the DCO** (if required).

## Guidelines

- **Follow code style:** Prettier, ESLint, and black (for Python).
- **Write and update tests:** All new features/bugfixes need test coverage.
- **Document changes:** Update the relevant `.md` files, code comments, and changelog.
- **Respect privacy:** No personal or confidential data in code or issues.
- **Be inclusive and constructive:** See our [Code of Conduct](CODE_OF_CONDUCT.md).

## Development Commands

```bash
npm install         # Install Node dependencies
npm test            # Run Node tests
pytest              # Run Python tests
```
For Python SDK: cd core/sdk/python and use pytest.

## Feature/PR Naming

- Branches: dev-<feature> (e.g., dev-ed25519, dev-http402)

- Commits: feat:, fix:, test:, docs:, chore: prefixes

## Issue & PR Labels

- Use labels: bug, enhancement, good first issue, security, discussion, epic

## Security
See SECURITY.md (if present) or email security@peacprotocol.org for urgent issues.

***PEAC Protocol Test Agent for EIP-712***

All EIP-712 protocol integration tests use this public Ethereum test vector:

- agent_id: `0xa0fb98a1d397d13fbe71f31fbc3241c8b01488da`
- private_key: `4f3edf983ac636a65a842ce7c78d9aa706d3b113b37d7b1b6b5ddf49f7f6ed15`

This allows all contributors and auditors to run and verify protocol tests using reproducible, non-secret keys.

Paths: Spec writer (update spec.md), SDK dev (peac-core), Policy author (examples).

## Join the Community
- GitHub Issues: https://github.com/peacprotocol/peac/issues
- X / Twitter: @peacprotocol
- peacprotocol.org

We value all contributions; let’s build the fair, programmable web together!

New contributors: Start with examples or issues. See Join the Community for support.