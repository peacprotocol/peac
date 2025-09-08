# PEAC Protocol Makefile
# Single-entry tasks for the modern monorepo

.PHONY: help install dev build test lint typecheck clean conformance perf sbom release dep-check

help: ## Show this help message
	@echo "PEAC Protocol v0.9.12-dev - Enterprise Monorepo"
	@echo ""
	@echo "Available commands:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install all dependencies
	@echo "📦 Installing dependencies..."
	pnpm install

dev: ## Start development server
	@echo "🚀 Starting development server..."
	pnpm run dev

build: ## Build all packages
	@echo "🔨 Building all packages..."
	pnpm run build

test: ## Run all tests
	@echo "🧪 Running all tests..."
	pnpm run test

test-coverage: ## Run tests with coverage
	@echo "🧪 Running tests with coverage..."
	pnpm run test:coverage

lint: ## Run ESLint on all packages
	@echo "🔍 Linting code..."
	pnpm run lint

typecheck: ## Run TypeScript type checking
	@echo "🔍 Type checking..."
	pnpm run typecheck

format: ## Format code with Prettier
	@echo "🎨 Formatting code..."
	pnpm run format

format-check: ## Check code formatting
	@echo "🎨 Checking code format..."
	pnpm run format:check

dep-check: ## Check dependency boundaries
	@echo "🔍 Checking dependency boundaries..."
	pnpm run dep-cruiser

conformance: ## Run conformance tests
	@echo "🔍 Running conformance tests..."
	pnpm run conformance

perf: ## Run performance validation
	@echo "🚀 Running performance validation..."
	pnpm run perf

sbom: ## Generate SBOM
	@echo "📋 Generating SBOM..."
	pnpm run sbom

clean: ## Clean all build artifacts
	@echo "🧹 Cleaning build artifacts..."
	pnpm run clean

release: ## Run full release pipeline
	@echo "🚀 Running full release pipeline..."
	pnpm run release

# Quality gates
quality-gates: lint typecheck format-check dep-check ## Run all quality gates

# Full validation pipeline (local equivalent of CI)
ci-local: quality-gates build test conformance perf ## Run full CI pipeline locally

# Production readiness check
prod-ready: ci-local sbom ## Full production readiness validation

# Development workflow
dev-setup: install build ## Set up development environment