#!/bin/bash
# check-planning-leak.sh
#
# Verifies that planning/strategic content hasn't leaked into tracked files.
# Planning docs live in reference/ (gitignored) and must not appear in code,
# commits, or published documentation.
#
# Run: bash scripts/check-planning-leak.sh

set -euo pipefail

echo "=== Planning Leak Check ==="

FAILED=0

# 1. Check for references to local-only reference files in tracked code
echo "Checking for reference/ path leaks in source..."
LEAKS=$(git grep -l 'reference/.*_LOCAL\.' -- '*.ts' '*.js' '*.json' '*.sh' '*.yml' '*.yaml' 2>/dev/null | grep -v 'CLAUDE.md' | grep -v 'scripts/check-planning-leak.sh' | grep -v '.gitignore' || true)
if [ -n "$LEAKS" ]; then
  echo "  FAIL: Found reference/*_LOCAL.* paths in tracked files:"
  echo "$LEAKS" | sed 's/^/    /'
  FAILED=1
else
  echo "  OK: No reference path leaks"
fi

# 2. Check for strategic/planning keywords in code and docs
echo "Checking for strategic content in tracked files..."
STRATEGIC_PATTERNS='(competitive advantage|market position|business strategy|revenue model|pricing strategy|monetization plan)'
STRATEGIC_HITS=$(git grep -liE "$STRATEGIC_PATTERNS" -- '*.ts' '*.js' '*.md' '*.json' 2>/dev/null | grep -v 'CLAUDE.md' | grep -v 'node_modules' | grep -v 'scripts/check-planning-leak.sh' || true)
if [ -n "$STRATEGIC_HITS" ]; then
  echo "  FAIL: Found strategic content in tracked files:"
  echo "$STRATEGIC_HITS" | sed 's/^/    /'
  FAILED=1
else
  echo "  OK: No strategic content leaks"
fi

# 3. Check for planning artifacts in packages (build outputs in source)
echo "Checking for build artifacts in source directories..."
BUILD_ARTIFACTS=$(git ls-files 'packages/*/src/*.d.ts' 'packages/*/src/*.d.ts.map' 'packages/*/src/*.js.map' 2>/dev/null || true)
if [ -n "$BUILD_ARTIFACTS" ]; then
  echo "  WARN: Build artifacts tracked in source directories:"
  echo "$BUILD_ARTIFACTS" | sed 's/^/    /'
fi

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "FAIL: Planning leak check failed"
  exit 1
fi

echo ""
echo "=== Planning Leak Check PASSED ==="
