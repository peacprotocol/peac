# PEAC v0.9.12 Ultra-Lean Development
# Single-entry tasks (dev, test, perf, sbom, release)

.PHONY: dev test perf bundle sbom release clean validate gates

# Primary development workflow
dev:
	pnpm -w -r build
	pnpm -w -r test --filter ./pkgs/*

# Performance validation (enforced gates)  
perf:
	node tests/perf/run.mjs
	@echo "✅ Performance gates: sign p95<10ms, verify p95<5ms, throughput≥1000rps"

# Bundle size validation
bundle:
	node tooling/bundle-check.mjs
	@echo "✅ Bundle size gates: each package <50KB"

# Security baseline 
security:
	npm audit --omit=dev
	node tooling/owasp-check.mjs
	@echo "✅ Security gates: OWASP baseline clean"

# SBOM generation
sbom:
	node tooling/sbom.mjs
	@echo "✅ SBOM generated with SLSA-style provenance"

# Pre-release validation (all gates)
validate: dev perf bundle security sbom
	@echo "✅ All v0.9.12 gates passed - ready for release"

# CI gates (strict)
gates: validate
	node tooling/precompile-validators.mjs
	@echo "✅ CI gates passed - deployment ready"

# Release process
release:
	node tooling/release.mjs

# Cleanup
clean:
	pnpm -w -r clean
	rm -rf dist coverage *.tsbuildinfo

# Help
help:
	@echo "PEAC v0.9.12 Ultra-Lean Development"
	@echo ""
	@echo "Primary targets:"
	@echo "  dev      - Build and test all packages"
	@echo "  perf     - Performance validation (sign<10ms, verify<5ms)"  
	@echo "  bundle   - Bundle size check (<50KB per package)"
	@echo "  security - OWASP baseline scan"
	@echo "  validate - All gates (dev+perf+bundle+security+sbom)"
	@echo "  gates    - CI gates (strict validation)"
	@echo "  release  - Release process"
	@echo "  clean    - Remove build artifacts"