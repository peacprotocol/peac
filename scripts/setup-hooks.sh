#!/usr/bin/env bash
# scripts/setup-hooks.sh
# Configure git to use repo-managed hooks from .githooks/
#
# Run once after cloning: bash scripts/setup-hooks.sh
#
# This sets core.hooksPath so git uses the tracked hooks in .githooks/
# instead of the default .git/hooks/ directory. This ensures all
# maintainers run the same quality gates.

set -euo pipefail

echo "Setting up repo-managed git hooks..."

# Point git to the tracked hooks directory
git config core.hooksPath .githooks

# Make hooks executable (in case permissions weren't preserved)
chmod +x .githooks/pre-commit .githooks/pre-push

echo ""
echo "Installed hooks from .githooks/:"
echo "  pre-commit : lint-staged (auto-format) + planning leak check"
echo "  pre-push   : full CI-parity gate (scripts/gate.sh)"
echo ""
echo "Both hooks share the same checks that CI runs."
echo ""
echo "Bypass (exceptional only):"
echo "  PEAC_SKIP_PRE_COMMIT=1 git commit ...  (skip pre-commit)"
echo "  PEAC_SKIP_PRE_PUSH=1   git push   ...  (skip pre-push)"
