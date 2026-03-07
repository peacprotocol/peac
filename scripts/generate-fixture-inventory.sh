#!/usr/bin/env bash
# Generate or check fixture inventory freshness.
# Usage:
#   ./scripts/generate-fixture-inventory.sh          # generate
#   ./scripts/generate-fixture-inventory.sh --check  # CI freshness check
set -euo pipefail
exec node "$(dirname "$0")/conformance/generate-inventory.mjs" "$@"
