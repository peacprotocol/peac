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

- Node.js >= 22.0.0 (pinned in `.node-version`; Node 24 is primary CI target per DD-161)
- pnpm >= 8.0.0
- Git with proper configuration

### Local Development

```bash
git clone https://github.com/peacprotocol/peac.git
cd peac
pnpm install
pnpm build
pnpm test
```

### Workspace Structure

```
peac/
├── apps/                  # Deployable applications
│   ├── api/              # @peac/app-api
│   ├── worker/           # @peac/app-worker
│   └── demo/             # @peac/app-demo
├── packages/             # Publishable libraries
│   ├── core/            # @peac/core
│   ├── receipts/        # @peac/receipts
│   └── ...              # See packages/ for full list
├── specs/kernel/         # Normative kernel definitions
├── docs/                 # Protocol documentation
└── archive/              # Legacy pre-v0.9.15 materials
```

## Contribution Workflow

1. **Issue First**: Open an issue to discuss significant changes
2. **Fork & Branch**: Create feature branch from `main`
3. **Development**: Follow coding standards and test coverage requirements
4. **Testing**: Ensure all tests pass and coverage is maintained
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
- Test coverage ≥50% maintained
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

- Receipt signing: p95 ≤ 3ms
- Receipt verification: p95 ≤ 1ms
- Crawler operations: ≤ 35ms
- API endpoints: documented SLOs

## CI/CD validation pipeline

Our 7-phase enterprise pipeline validates:

1. **Setup & Validation** - Version, structure, legacy check
2. **Code Quality** - Lint, format, typecheck, boundaries
3. **Build** - All packages with artifact caching
4. **Test Suite** - Comprehensive testing with coverage
5. **Conformance & Performance** - Schema validation, perf budgets
6. **Security & SBOM** - Audit, vulnerability scanning
7. **Production Readiness** - Final validation gate

All phases must pass before merge.

## Security Considerations

- All input validation required
- SSRF protection mandatory
- Rate limiting implemented
- Secrets never committed
- Security reviews for sensitive changes

## Release Process

The project follows semantic versioning with development releases:

- `0.9.12-dev.1` for development
- `0.9.12` for stable releases
- Breaking changes documented

### Branching workflow

- Create release branches: `release/vX.X.X`
- Feature branches: `feature/description`
- Never push releases directly to main

## Getting Help

- Open an issue for bugs or feature requests
- Join discussions for architectural questions
- Review existing code for patterns and conventions

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
