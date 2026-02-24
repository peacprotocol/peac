#!/usr/bin/env bash
# Distribution surface validation gate (DD-140).
# Validates server.json, smithery.yaml, llms.txt, and mcpName consistency.
# Run: ./scripts/check-distribution.sh
# Called by CI (.github/workflows/ci.yml) before tagging.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

ERRORS=0

pass() { echo -e "${GREEN}PASS${NC}: $1"; }
fail() { echo -e "${RED}FAIL${NC}: $1"; ERRORS=$((ERRORS + 1)); }

# ---------------------------------------------------------------------------
# 1. Validate server.json against vendored MCP Registry JSON Schema (ajv)
# ---------------------------------------------------------------------------
SERVER_JSON="$REPO_ROOT/packages/mcp-server/server.json"
SCHEMA="$REPO_ROOT/specs/registry/server.schema.json"

if [ ! -f "$SERVER_JSON" ]; then
  fail "server.json not found at $SERVER_JSON"
else
  # Use Node.js inline script with ajv (already in devDeps)
  RESULT=$(node -e "
    const Ajv = require('ajv');
    const addFormats = require('ajv-formats');
    const fs = require('fs');
    const schema = JSON.parse(fs.readFileSync('$SCHEMA', 'utf8'));
    const data = JSON.parse(fs.readFileSync('$SERVER_JSON', 'utf8'));
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    if (validate(data)) {
      console.log('VALID');
    } else {
      console.log('INVALID: ' + JSON.stringify(validate.errors, null, 2));
    }
  " 2>&1) || true

  if echo "$RESULT" | grep -q "^VALID$"; then
    pass "server.json validates against MCP Registry JSON Schema"
  else
    fail "server.json schema validation failed: $RESULT"
  fi
fi

# ---------------------------------------------------------------------------
# 2. Validate mcpName in package.json matches server.json name
# ---------------------------------------------------------------------------
PKG_JSON="$REPO_ROOT/packages/mcp-server/package.json"

if [ -f "$SERVER_JSON" ] && [ -f "$PKG_JSON" ]; then
  SERVER_NAME=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SERVER_JSON','utf8')).name)")
  MCP_NAME=$(node -e "
    const pkg = JSON.parse(require('fs').readFileSync('$PKG_JSON','utf8'));
    console.log(pkg.mcpName || '');
  ")

  if [ -z "$MCP_NAME" ]; then
    fail "package.json missing mcpName field"
  elif [ "$SERVER_NAME" = "$MCP_NAME" ]; then
    pass "server.json name matches package.json mcpName: $SERVER_NAME"
  else
    fail "server.json name ($SERVER_NAME) does not match package.json mcpName ($MCP_NAME)"
  fi
fi

# ---------------------------------------------------------------------------
# 3. Validate smithery.yaml structure (real YAML parsing via js-yaml)
# ---------------------------------------------------------------------------
SMITHERY="$REPO_ROOT/packages/mcp-server/smithery.yaml"

if [ ! -f "$SMITHERY" ]; then
  fail "smithery.yaml not found at $SMITHERY"
else
  # Parse YAML properly and validate Smithery canonical structure
  RESULT=$(node -e "
    const yaml = require('js-yaml');
    const fs = require('fs');
    try {
      const doc = yaml.load(fs.readFileSync('$SMITHERY', 'utf8'));
      const missing = [];
      if (!doc.startCommand) missing.push('startCommand');
      else {
        if (!doc.startCommand.type) missing.push('startCommand.type');
        if (!doc.startCommand.commandFunction) missing.push('startCommand.commandFunction');
      }
      if (missing.length === 0) {
        console.log('VALID');
      } else {
        console.log('MISSING: ' + missing.join(', '));
      }
    } catch (e) {
      console.log('PARSE_ERROR: ' + e.message);
    }
  " 2>&1) || true

  if echo "$RESULT" | grep -q "^VALID$"; then
    pass "smithery.yaml parses as valid YAML with Smithery canonical structure (startCommand, type, commandFunction)"
  else
    fail "smithery.yaml validation failed: $RESULT"
  fi
fi

# ---------------------------------------------------------------------------
# 4. Validate llms.txt at repo root
# ---------------------------------------------------------------------------
LLMS_TXT="$REPO_ROOT/llms.txt"

if [ ! -f "$LLMS_TXT" ]; then
  fail "llms.txt not found at repo root"
else
  # Check H1 present and required sections exist
  RESULT=$(node -e "
    const fs = require('fs');
    const content = fs.readFileSync('$LLMS_TXT', 'utf8');
    const missing = [];
    if (!/^# /m.test(content)) missing.push('H1 heading');
    if (!/## Quick Start/m.test(content)) missing.push('Quick Start section');
    if (!/## Key Packages/m.test(content)) missing.push('Key Packages section');
    if (!/## Documentation/m.test(content)) missing.push('Documentation section');
    if (missing.length === 0) {
      console.log('VALID');
    } else {
      console.log('MISSING: ' + missing.join(', '));
    }
  " 2>&1) || true

  if echo "$RESULT" | grep -q "^VALID$"; then
    pass "llms.txt has H1 and required sections"
  else
    fail "llms.txt validation failed: $RESULT"
  fi
fi

# ---------------------------------------------------------------------------
# 5. Version consistency: server.json version matches package.json version
# ---------------------------------------------------------------------------
if [ -f "$SERVER_JSON" ] && [ -f "$PKG_JSON" ]; then
  SERVER_VER=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SERVER_JSON','utf8')).version)")
  PKG_VER=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$PKG_JSON','utf8')).version)")
  PKG_VER_IN_PACKAGES=$(node -e "
    const data = JSON.parse(require('fs').readFileSync('$SERVER_JSON','utf8'));
    const pkg = (data.packages || [])[0];
    console.log(pkg ? pkg.version : '');
  ")

  if [ "$SERVER_VER" = "$PKG_VER" ]; then
    pass "server.json version ($SERVER_VER) matches package.json version ($PKG_VER)"
  else
    fail "server.json version ($SERVER_VER) does not match package.json version ($PKG_VER)"
  fi

  if [ -n "$PKG_VER_IN_PACKAGES" ] && [ "$PKG_VER_IN_PACKAGES" = "$PKG_VER" ]; then
    pass "server.json packages[0].version ($PKG_VER_IN_PACKAGES) matches package.json version"
  elif [ -n "$PKG_VER_IN_PACKAGES" ]; then
    fail "server.json packages[0].version ($PKG_VER_IN_PACKAGES) does not match package.json version ($PKG_VER)"
  fi
fi

# ---------------------------------------------------------------------------
# 6. MCP server smoke test (npx @peac/mcp-server --help must exit 0)
# ---------------------------------------------------------------------------
# Only runs if the package is built (skips gracefully in pre-build CI steps)
MCP_CLI="$REPO_ROOT/packages/mcp-server/dist/cli.cjs"
if [ -f "$MCP_CLI" ]; then
  if node "$MCP_CLI" --help > /dev/null 2>&1; then
    pass "peac-mcp-server --help exits 0"
  else
    fail "peac-mcp-server --help failed (non-zero exit)"
  fi
else
  echo "SKIP: MCP server not built (dist/cli.cjs missing); skipping --help smoke test"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo -e "${GREEN}All distribution surface checks passed.${NC}"
  exit 0
else
  echo -e "${RED}$ERRORS distribution surface check(s) failed.${NC}"
  exit 1
fi
