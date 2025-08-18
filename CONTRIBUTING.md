# Contributing to PEAC Protocol

Thank you for your interest in contributing to PEAC Protocol. This guide provides information on how to contribute effectively.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md). We strive to maintain a welcoming and inclusive community.

## How to Contribute

### Reporting Issues

Before creating an issue:

1. Check existing issues to avoid duplicates
2. Verify the issue with the latest version
3. Gather relevant information

When reporting:

- Use a clear, descriptive title
- Provide steps to reproduce
- Include error messages and logs
- Specify your environment (OS, Node.js version)

### Suggesting Features

Feature suggestions should include:

- Problem description
- Proposed solution
- Alternative approaches considered
- Potential impact on existing users

### Code Contributions

#### Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR-USERNAME/peac.git
   cd peac
   ```
3. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

#### Development Process

1. Install dependencies:

   ```bash
   npm install
   ```

2. Make your changes following the coding standards

3. Add or update tests as needed

4. Run tests:

   ```bash
   npm test
   ```

5. Run linter:
   ```bash
   npm run lint
   ```

#### Commit Messages

Follow conventional commit format:

```
type(scope): brief description

Longer explanation if needed

Fixes #123
```

Types: feat, fix, docs, style, refactor, test, chore

#### Submitting Pull Requests

1. Push to your fork
2. Create a pull request with:
   - Clear title and description
   - Reference to related issues
   - Description of testing performed

3. Address review feedback promptly

### Documentation Contributions

Documentation improvements are highly valued:

- Fix typos and clarify explanations
- Add examples and use cases
- Improve getting started guides
- Ensure technical accuracy

## Development Setup

```bash
# Clone repository
git clone https://github.com/peacprotocol/peac.git
cd peac

# Install dependencies
npm install

# Run tests
npm test

# Run linter
npm run lint
```

## Testing

- Write tests for new functionality
- Ensure existing tests pass
- Aim for clear, maintainable test code

## PEIP Process

To propose protocol changes, please follow the PEIP process:

1. Review existing PEIPs in `docs/peip/`
2. Use the template at `docs/peip/PEIP-0000.md`
3. Submit your proposal as a PR
4. Participate in community discussion

## Commit Message Convention

We use Conventional Commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `chore:` Maintenance tasks
- `refactor:` Code restructuring
- `test:` Test additions/changes
- `perf:` Performance improvements

Example: `feat: add content negotiation middleware`

## Code Review Process

1. All PRs require at least one maintainer approval
2. CI must pass (tests, lint, typecheck)
3. Security scan must pass
4. SBOM generation must succeed

## Security

- Never commit secrets or API keys
- Follow OWASP best practices
- Report security issues privately to security@peacprotocol.org

## Questions?

- Open an issue for questions
- Email: contact@peacprotocol.org
