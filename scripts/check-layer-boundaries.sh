#!/usr/bin/env bash
# scripts/check-layer-boundaries.sh
# Enforce package layering: dependencies flow DOWN only.
#
# Layer 0: @peac/kernel (types, constants, errors)
# Layer 1: @peac/schema (Zod schemas, validation)
# Layer 2: @peac/crypto (signing, verification)
# Layer 3: @peac/protocol, @peac/control (high-level APIs)
# Layer 4: @peac/rails-*, @peac/mappings-*, @peac/adapter-* (adapters)
# Layer 5: @peac/server, @peac/cli, @peac/mcp-server (applications)
# Layer 6: @peac/sdk-js (consumer SDK)
#
# Violations: higher layer imported by lower layer.

set -euo pipefail

bad=0

echo "== Layer boundary check =="

# Layer 0 (kernel) must not import from any higher layer
echo "  Checking kernel (Layer 0)..."
if git grep -nE "from ['\"]@peac/(schema|crypto|protocol|control|rails|mappings|adapter|middleware|server|cli|mcp-server|sdk-js)" -- 'packages/kernel/src/**/*.ts' ':!node_modules' 2>/dev/null | grep .; then
  echo "FAIL: @peac/kernel imports from higher layer"
  bad=1
else
  echo "  OK"
fi

# Layer 1 (schema) must not import from Layer 2+
echo "  Checking schema (Layer 1)..."
if git grep -nE "from ['\"]@peac/(crypto|protocol|control|rails|mappings|adapter|middleware|server|cli|mcp-server|sdk-js)" -- 'packages/schema/src/**/*.ts' ':!node_modules' 2>/dev/null | grep .; then
  echo "FAIL: @peac/schema imports from higher layer"
  bad=1
else
  echo "  OK"
fi

# Layer 2 (crypto) must not import from Layer 3+
echo "  Checking crypto (Layer 2)..."
if git grep -nE "from ['\"]@peac/(protocol|control|rails|mappings|adapter|middleware|server|cli|mcp-server|sdk-js)" -- 'packages/crypto/src/**/*.ts' ':!node_modules' 2>/dev/null | grep .; then
  echo "FAIL: @peac/crypto imports from higher layer"
  bad=1
else
  echo "  OK"
fi

# Layer 3 (protocol, control) must not import from Layer 4+
echo "  Checking protocol/control (Layer 3)..."
if git grep -nE "from ['\"]@peac/(rails|mappings|adapter|middleware|server|cli|mcp-server|sdk-js)" -- 'packages/protocol/src/**/*.ts' 'packages/control/src/**/*.ts' ':!node_modules' 2>/dev/null | grep .; then
  echo "FAIL: @peac/protocol or @peac/control imports from higher layer"
  bad=1
else
  echo "  OK"
fi

# Schema must not import from examples or surfaces
echo "  Checking schema isolation from examples/surfaces..."
if git grep -nE "from ['\"].*examples/|from ['\"].*surfaces/" -- 'packages/schema/src/**/*.ts' ':!node_modules' 2>/dev/null | grep .; then
  echo "FAIL: @peac/schema imports from examples or surfaces"
  bad=1
else
  echo "  OK"
fi

if [ "$bad" -eq 0 ]; then
  echo "Layer boundary check passed"
else
  echo "Layer boundary check FAILED"
fi

exit $bad
