#!/usr/bin/env bash
# Distribution surface validation gate (DD-140).
# Thin wrapper: delegates to scripts/verify-distribution.mjs (Node.js).
# Preserved for backwards compatibility with local workflows and guard.sh.
# Run: ./scripts/check-distribution.sh
# Canonical implementation: node scripts/verify-distribution.mjs

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/verify-distribution.mjs"
