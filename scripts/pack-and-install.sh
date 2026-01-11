#!/bin/bash
# Combined pack gate - runs both verification and install smoke test
# For CI, you can run these separately:
#   - scripts/pack-verify.sh (tarball inspection)
#   - scripts/pack-install-smoke.sh (npm install + import test)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Running Pack Gates ==="
echo ""

# Run tarball verification
bash "$SCRIPT_DIR/pack-verify.sh"

echo ""
echo "---"
echo ""

# Run install smoke test
bash "$SCRIPT_DIR/pack-install-smoke.sh"

echo ""
echo "=== All Pack Gates PASSED ==="
