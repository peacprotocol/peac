#!/usr/bin/env bash
# Validate conformance coverage: no orphans, no uncovered gaps.
# Exit 0: all requirements covered or explicitly deferred
# Exit 1: uncovered requirements found
set -euo pipefail
exec node "$(dirname "$0")/conformance/check-matrix.mjs"
