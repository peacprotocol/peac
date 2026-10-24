# Contributing to PEAC Protocol

Thank you for your interest in contributing to the PEAC Protocol! This document outlines how to contribute effectively to the PEAC open protocol repository.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Where to start

New here? A few good entry points:

- **Good first issues:** browse issues labeled [`good first issue`](https://github.com/peacprotocol/peac/labels/good%20first%20issue) for small, well-scoped tasks.
- **Run the examples first:** `pnpm demo:all` runs the start-here examples end to end; see [`examples/README.md`](../examples/README.md) for the curated set and [`docs/START_HERE.md`](../docs/START_HERE.md) for path-by-role guidance.
- **Want an example that does not exist yet?** Open an [Example Request](https://github.com/peacprotocol/peac/issues/new?template=example_request.md).
- **Questions or design discussion?** Use [Discussions](https://github.com/peacprotocol/peac/discussions) rather than an issue.

## Development Setup

### Prerequisites

- Node.js 22.13.0 or later (Node 24 recommended; see `.node-version`)
- pnpm 8.15.0 (see `packageManager` in `package.json`)
- Git with proper configuration

### Local Development

```bash
git clone https://github.com/peacprotocol/peac.git
cd peac
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

### Workspace Structure

```
peac/
├── apps/                  # api, sandbox-issuer, verifier
├── packages/              # Publishable libraries (see packages/ for the full list)
├── specs/                 # Kernel, wire, registry, conformance, benchmarks
├── docs/                  # Protocol documentation
├── examples/              # Runnable examples
├── sdks/go/               # Go SDK
└── surfaces/              # Distribution and integration surfaces
```

## Contribution Workflow

1. **Issue First**: Open an issue to discuss significant changes
2. **Fork & Branch**: Create feature branch from `main`
3. **Development**: Follow the coding standards below
4. **Testing**: Ensure all tests pass
5. **Pull Request**: Submit PR with clear description
6. **Merge**: Maintainers merge PRs manually on GitHub (see below)

### Git Safety Rules

- **Never merge PRs from terminal** - Do not use `gh pr merge`, `git merge`, or any CLI merge command
- PRs are **always merged manually on GitHub** web interface by maintainers
- Contributors: create branch, commit, push, open PR via `gh pr create`
- Tags are created **only after** PR is merged and confirmed on GitHub
- **Never force push to `main`** - main branch history must be immutable
- **Preserve git history** - Never delete or erase commits from the repository
- Force pushing to feature branches/PRs is fine (your own branch, before merge)
- Rebasing and amending on feature branches is fine

## Development Standards

### Code Quality

- TypeScript strict mode required
- ESLint + Prettier formatting enforced
- Performance budgets respected

### Commit Convention

```
feat(scope): add new feature
fix(scope): resolve bug
docs(scope): update documentation
test(scope): add test coverage
refactor(scope): improve code structure
perf(scope): optimize performance
```

### Testing Requirements

- Unit tests for all business logic
- Integration tests for API endpoints
- Performance tests for critical paths
- Security tests for validation logic

## Architecture Guidelines

### Dependency Boundaries

- Apps can depend on packages
- Packages cannot depend on apps
- No circular dependencies allowed
- External dependencies require approval

### Performance Requirements

Benchmarks and regression targets are defined in `specs/benchmarks/slo.json`; see [`docs/BENCHMARK-METHODOLOGY.md`](../docs/BENCHMARK-METHODOLOGY.md).

## CI/CD validation pipeline

CI runs lint, format, typecheck, tests, conformance, dependency audit and CodeQL; see [`docs/CI_BEHAVIOR.md`](../docs/CI_BEHAVIOR.md). All required checks must pass before merge.

## Security Considerations

- All input validation required
- SSRF protection mandatory
- Rate limiting implemented
- Secrets never committed
- Security reviews for sensitive changes

## Release Process

Versions follow SemVer; see [`docs/specs/VERSIONING.md`](../docs/specs/VERSIONING.md).

## Getting Help

- Open an issue for bugs or feature requests
- Join discussions for architectural questions
- Review existing code for patterns and conventions

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
