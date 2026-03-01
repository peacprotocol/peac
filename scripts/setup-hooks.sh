#!/usr/bin/env bash
# scripts/setup-hooks.sh
# Configure git to use repo-managed hooks from .githooks/
# Run once after cloning: bash scripts/setup-hooks.sh

set -euo pipefail

echo "Setting up repo-managed git hooks..."

# Point git to the tracked hooks directory
git config core.hooksPath .githooks

# Make hooks executable
chmod +x .githooks/pre-commit .githooks/pre-push

echo "Git hooks installed from .githooks/"
echo "  pre-commit: auto-format staged files, check planning leaks"
echo "  pre-push: full CI-parity gate (lint, build, typecheck, test, guard)"
echo ""
echo "To bypass in emergency: PEAC_SKIP_PRE_PUSH=1 git push"
