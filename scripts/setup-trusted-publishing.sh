#!/usr/bin/env bash
set -euo pipefail

# Setup npm Trusted Publishing (OIDC) for PEAC packages.
#
# Reads pending packages from scripts/publish-manifest.json and configures
# each one via `npm trust github` CLI.
#
# Prerequisites:
#   - npm >= 11.10.0 (for `npm trust` command)
#   - Interactive npm web login (`npm login`): granular tokens and
#     bypass-2FA tokens are NOT supported for trust commands
#   - 2FA enabled on npm account (security key / WebAuthn recommended)
#   - npm org admin or package owner role
#   - The first `npm trust` call requires interactive browser/WebAuthn approval;
#     choose "skip 2FA for 5 minutes" to batch the remaining packages
#
# npm supports only ONE trust configuration per package. If a trust
# relationship already exists, use `npm trust list <pkg>` to inspect it
# and `npm trust revoke` to remove it before re-creating.
#
# Usage:
#   bash scripts/setup-trusted-publishing.sh              # configure all pending
#   bash scripts/setup-trusted-publishing.sh --dry-run     # show what would run
#   bash scripts/setup-trusted-publishing.sh --start-from @peac/receipts  # resume from a package
#   bash scripts/setup-trusted-publishing.sh @peac/kernel  # configure one package

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$REPO_ROOT/scripts/publish-manifest.json"

DRY_RUN=false
SINGLE_PKG=""
START_FROM=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --start-from)
      START_FROM="$2"
      shift 2
      ;;
    @peac/*)
      SINGLE_PKG="$1"
      shift
      ;;
    *)
      echo "Usage: $0 [--dry-run] [--start-from @peac/<name>] [@peac/<name>]" >&2
      exit 1
      ;;
  esac
done

# --- Preflight checks ---

if [ ! -f "$MANIFEST" ]; then
  echo "ERROR: $MANIFEST not found" >&2
  exit 1
fi

# Check npm version
NPM_VER=$(npm --version 2>/dev/null || echo "0.0.0")
REQUIRED_VER="11.10.0"
if [ "$(printf '%s\n' "$REQUIRED_VER" "$NPM_VER" | sort -V | head -n1)" != "$REQUIRED_VER" ]; then
  echo "ERROR: npm $NPM_VER < $REQUIRED_VER (required for npm trust)" >&2
  echo "  Fix: npm install -g npm@latest" >&2
  exit 1
fi

# Check npm trust command exists
if ! npm trust --help >/dev/null 2>&1; then
  echo "ERROR: npm trust command not available (requires npm >= 11.10.0)" >&2
  echo "  Fix: npm install -g npm@latest" >&2
  exit 1
fi

# Check npm auth (must be interactive web login, not token)
NPM_USER=$(npm whoami 2>/dev/null || echo "")
if [ -z "$NPM_USER" ]; then
  echo "ERROR: Not logged in to npm." >&2
  echo "" >&2
  echo "  npm trust requires interactive web login (not a token)." >&2
  echo "  Granular tokens with bypass-2FA are NOT supported for trust commands." >&2
  echo "" >&2
  echo "  Run: npm login" >&2
  echo "  Then re-run this script." >&2
  exit 1
fi
echo "Authenticated as: $NPM_USER"
echo "npm version: $NPM_VER"

# Read trusted publisher config from manifest
REPO=$(node -p "require('$MANIFEST').trustedPublisher.repository")
WORKFLOW=$(node -p "require('$MANIFEST').trustedPublisher.workflow")
ENVIRONMENT=$(node -p "require('$MANIFEST').trustedPublisher.environment")

configure_package() {
  local pkg="$1"
  local cmd="npm trust github $pkg --file $WORKFLOW --repository $REPO --environment $ENVIRONMENT --yes"

  if $DRY_RUN; then
    echo "  [dry-run] $cmd"
  else
    echo "  Configuring $pkg..."
    if $cmd; then
      echo "  OK: $pkg"
    else
      local exit_code=$?
      echo "  FAIL: $pkg (exit $exit_code)" >&2
      echo "    If trust already exists, check: npm trust list $pkg" >&2
      echo "    To replace: npm trust revoke <id>, then re-run" >&2
      return 1
    fi
  fi
}

# --- Single package mode ---

if [ -n "$SINGLE_PKG" ]; then
  echo "Configuring single package: $SINGLE_PKG"
  echo "  Repository: $REPO"
  echo "  Workflow: $WORKFLOW"
  echo "  Environment: $ENVIRONMENT"
  echo ""
  configure_package "$SINGLE_PKG"
  exit $?
fi

# --- Batch mode: configure all pending packages ---

PENDING=$(node -p "require('$MANIFEST').pendingTrustedPublishing.join('\n')")

if [ -z "$PENDING" ]; then
  echo "No packages pending Trusted Publishing configuration."
  exit 0
fi

COUNT=$(echo "$PENDING" | wc -l | tr -d ' ')
echo ""
echo "Configuring $COUNT pending packages for Trusted Publishing..."
echo "  Repository: $REPO"
echo "  Workflow: $WORKFLOW"
echo "  Environment: $ENVIRONMENT"
echo ""
echo "NOTE: The first package requires browser/WebAuthn approval."
echo "      Use your security key, then choose 'skip 2FA for 5 minutes'."
echo "      A 2-second sleep is added between calls per npm guidance."
echo "      Up to ~80 packages can be batched in the 5-minute window."
echo ""

if ! $DRY_RUN; then
  echo "Press Enter to start (or Ctrl+C to abort)..."
  read -r
fi

ok=0
fail=0
skipping=true
if [ -z "$START_FROM" ]; then
  skipping=false
fi

while IFS= read -r pkg; do
  [ -z "$pkg" ] && continue

  # Handle --start-from: skip packages until we reach the target
  if $skipping; then
    if [ "$pkg" = "$START_FROM" ]; then
      skipping=false
    else
      echo "  [skip] $pkg (before --start-from)"
      continue
    fi
  fi

  if configure_package "$pkg"; then
    ok=$((ok + 1))
  else
    fail=$((fail + 1))
  fi

  # Sleep between calls to avoid rate limiting (npm docs recommend 2s)
  if ! $DRY_RUN; then
    sleep 2
  fi
done <<< "$PENDING"

echo ""
echo "Results: $ok configured, $fail failed (of $COUNT total)"

if [ "$fail" -gt 0 ]; then
  echo ""
  echo "Some packages failed. If the 5-minute 2FA window expired, re-run with:"
  echo "  bash scripts/setup-trusted-publishing.sh --start-from <first-failed-package>"
  exit 1
fi

echo ""
echo "All packages configured. Next steps:"
echo "  1. Update scripts/publish-manifest.json: move packages from pendingTrustedPublishing to packages"
echo "  2. Verify: node -e \"const m=require('./scripts/publish-manifest.json'); console.assert(m.pendingTrustedPublishing.length===0, 'OIDC incomplete')\""
echo "  3. Run stable gates: bash scripts/release/run-gates.sh"
