#!/usr/bin/env bash
set -euo pipefail
echo "Checking surface invariants..."

# Critical header checks
! grep -R "X-PEAC-" --include="*.ts" --include="*.js" . 2>/dev/null || (echo "❌ Found banned X-PEAC-" && exit 1)
grep -R "PEAC-Receipt" --include="*.ts" --include="*.md" . >/dev/null || (echo "❌ PEAC-Receipt not found" && exit 1)

# Security checks
grep -R "UUIDv7" --include="*.md" . >/dev/null || (echo "❌ UUIDv7 requirement missing" && exit 1)
grep -R "Vary: PEAC-Receipt" --include="*.md" . >/dev/null || (echo "❌ Cache guidance missing" && exit 1)
grep -R -E "(SSRF|DNS.?rebinding)" --include="*.md" . >/dev/null || (echo "❌ Security notes missing" && exit 1)

# Clean code checks
! grep -R "/Users/" --include="*.ts" --include="*.js" --include="*.md" . 2>/dev/null || (echo "❌ Local paths found" && exit 1)

echo "✅ Surface invariants OK"