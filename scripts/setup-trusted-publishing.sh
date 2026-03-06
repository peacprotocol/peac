#!/usr/bin/env bash
set -euo pipefail

# Setup npm Trusted Publishing (OIDC) for PEAC packages.
#
# Reads pending packages from scripts/publish-manifest.json and configures
# each one via `npm trust` CLI. Requires npm >= 11.5.1 and an active npm
# session with 2FA.
#
# Usage:
#   bash scripts/setup-trusted-publishing.sh              # configure all pending
#   bash scripts/setup-trusted-publishing.sh --dry-run     # show what would run
#   bash scripts/setup-trusted-publishing.sh @peac/kernel  # configure one package

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$REPO_ROOT/scripts/publish-manifest.json"

DRY_RUN=false
SINGLE_PKG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    @peac/*)
      SINGLE_PKG="$1"
      shift
      ;;
    *)
      echo "Usage: $0 [--dry-run] [@peac/<name>]" >&2
      exit 1
      ;;
  esac
done

if [ ! -f "$MANIFEST" ]; then
  echo "ERROR: $MANIFEST not found" >&2
  exit 1
fi

# Read trusted publisher config from manifest
REPO=$(node -p "require('$MANIFEST').trustedPublisher.repository")
WORKFLOW=$(node -p "require('$MANIFEST').trustedPublisher.workflow")
ENVIRONMENT=$(node -p "require('$MANIFEST').trustedPublisher.environment")

configure_package() {
  local pkg="$1"
  local cmd="npm trust add --registry https://registry.npmjs.org/ --provider github --repository $REPO --workflow $WORKFLOW --environment $ENVIRONMENT $pkg"

  if $DRY_RUN; then
    echo "  [dry-run] $cmd"
  else
    echo "  Configuring $pkg..."
    eval "$cmd" || echo "  WARNING: Failed to configure $pkg (may already be configured)"
  fi
}

if [ -n "$SINGLE_PKG" ]; then
  echo "Configuring single package: $SINGLE_PKG"
  configure_package "$SINGLE_PKG"
  exit 0
fi

# Configure all pending packages
PENDING=$(node -p "require('$MANIFEST').pendingTrustedPublishing.join('\n')")

if [ -z "$PENDING" ]; then
  echo "No packages pending Trusted Publishing configuration."
  exit 0
fi

COUNT=$(echo "$PENDING" | wc -l | tr -d ' ')
echo "Configuring $COUNT pending packages for Trusted Publishing..."
echo "  Repository: $REPO"
echo "  Workflow: $WORKFLOW"
echo "  Environment: $ENVIRONMENT"
echo ""

while IFS= read -r pkg; do
  [ -z "$pkg" ] && continue
  configure_package "$pkg"
done <<< "$PENDING"

echo ""
echo "Done. Move configured packages from pendingTrustedPublishing to packages in:"
echo "  $MANIFEST"
