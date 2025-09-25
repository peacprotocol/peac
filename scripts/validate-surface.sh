#!/usr/bin/env bash
set -euo pipefail
echo "Checking surface invariants..."

# Critical header checks (only check our new files)
! grep -R "X-PEAC-" examples/x402-paid-fetch packages/adapters packages/core/src/problems.ts packages/core/src/limits.ts packages/receipts/src/serialize.ts tests/contract tests/golden 2>/dev/null || (echo "❌ Found banned X-PEAC- in new code" && exit 1)
grep -R "PEAC-Receipt" --include="*.ts" --include="*.md" . >/dev/null || (echo "❌ PEAC-Receipt not found" && exit 1)

# Security checks
grep -R "UUIDv7" --include="*.md" . >/dev/null || (echo "❌ UUIDv7 requirement missing" && exit 1)
grep -R "Access-Control-Expose-Headers" --include="*.ts" . >/dev/null || (echo "❌ CORS guidance missing" && exit 1)

# Internal reference leak checks
! grep -R -E "(CLAUDE\.md|DEVELOPMENT_GUIDE\.md)" --include="*.ts" --include="*.js" --include="*.md" --exclude="CLAUDE.md" . 2>/dev/null || (echo "❌ Internal doc references found" && exit 1)
! grep -R "/Users/" --include="*.ts" --include="*.js" --include="*.md" --exclude-dir=node_modules . 2>/dev/null || (echo "❌ Local paths found" && exit 1)

echo "✓ Surface invariants OK"