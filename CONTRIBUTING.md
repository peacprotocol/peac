# Contributing to PEAC Protocol

Thank you for your interest in contributing to the PEAC Protocol! This document outlines how to contribute effectively to our modern enterprise monorepo.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Development Setup

### Prerequisites
- Node.js 22+ with pnpm 9+
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
│   ├── crawler/         # @peac/crawler
│   ├── receipts/        # @peac/receipts
│   └── adapters/        # Agent integrations
├── schemas/             # JSON schemas
└── profiles/           # Wire format profiles
```

## Contribution Workflow

1. **Issue First**: Open an issue to discuss significant changes
2. **Fork & Branch**: Create feature branch from `main`
3. **Development**: Follow coding standards and test coverage requirements
4. **Testing**: Ensure all tests pass and coverage is maintained
5. **Pull Request**: Submit PR with clear description

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

## Enterprise CI/CD Pipeline

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

### Branch Strategy
- Create release branches: `release/vX.X.X`
- Feature branches: `feature/description`
- Never push releases directly to main

## Getting Help

- Open an issue for bugs or feature requests
- Join discussions for architectural questions
- Review existing code for patterns and conventions

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
