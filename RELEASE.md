# PEAC Protocol Release Guide

## Release Process

### 1. Pre-Release Validation

- Ensure all CI checks pass on the release branch
- Run complete validation suite locally
- Verify performance budgets are met
- Update version numbers across packages

### 2. Versioning Strategy

- **Repository versions**: Semantic versioning (e.g., `v0.9.12.1`)
- **Wire protocol versions**: Independent versioning (e.g., `receipt@1.1`, `discovery@1.1`, `purge@1.0`)
- **Package versions**: Follow repository version for consistency

### 3. Security & Provenance

All releases include:

- **CycloneDX SBOMs** for each package and root workspace
- **SLSA Provenance** attestations signed with Cosign
- **NPM Provenance** for published packages
- **Security audit** with zero high/critical vulnerabilities

### 4. Verification Steps

#### Verify Release Artifacts

```bash
# Verify SBOM signature (when available)
cosign verify-blob --certificate sbom.json.cert --signature sbom.json.sig sbom.json

# Verify NPM package provenance
npm view @peac/core --json | jq '.dist.attestations'

# Validate package integrity
npm audit @peac/core --audit-level=high
```

#### Functional Verification

```bash
# Install and verify core functionality
pnpm add @peac/core
node -e "
import { sign, verify } from '@peac/core';
console.log('@peac/core imports successfully');
"

# Test basic operations
curl -sf http://localhost:3000/.well-known/peac
curl -sf -X POST http://localhost:3000/receipts/issue \
  -H 'content-type: application/json' \
  -d '{"subject":{"uri":"https://example.org"}, "purpose":"search"}'
```

### 5. Release Checklist

- [ ] All tests pass in CI
- [ ] Performance budgets validated
- [ ] Security scan clean (zero high/critical)
- [ ] Documentation updated
- [ ] Changelog entries complete
- [ ] Version tags applied
- [ ] GitHub release created with artifacts
- [ ] NPM packages published with provenance
- [ ] SBOM and provenance artifacts attached

### 6. Rollback Procedure

If issues are discovered post-release:

1. **NPM**: Deprecate affected versions with `npm deprecate`
2. **Git**: Create hotfix branch from last known good commit
3. **GitHub**: Mark release as pre-release and add warning
4. **Communications**: Update release notes with known issues

### 7. Support Policy

- **Latest major.minor**: Full support with security updates
- **Previous minor**: Security updates only
- **Development versions** (`*-dev.*`): No support guarantee

## Current Release

### v0.9.12.1 - Clean Architecture & Protocol v1.1 Ready

**Released**: 2025-09-07  
**Status**: Production Ready

**Key Features**:

- Clean single-root monorepo architecture
- Enhanced JSON schemas (receipt@1.1, discovery@1.1, purge@1.0)
- Neutral crawler control system
- Agent adapter ecosystem (MCP, OpenAI, LangChain)
- Performance SLOs: sign p95≤3ms, verify p95≤1ms

**Security**:

- Zero known vulnerabilities
- Full SLSA provenance
- NPM package signing enabled
- Comprehensive SBOM generation

**Verification**:

- GitHub Release: [Link to be updated]
- CI Build: [Link to be updated]
- SBOM Artifacts: [Link to be updated]

---

_For questions about releases, see [CONTRIBUTING.md](CONTRIBUTING.md) or [SECURITY.md](SECURITY.md)_
