#!/usr/bin/env bash
# scripts/ci/scope-guard.sh
# PR Scope Guard: hard-fail when changed files exceed the PR's declared scope.
#
# Reads the PR's labels to determine allowed file paths. If a `scope:*` label
# is present, only files matching the corresponding allowlist may be modified.
# If NO scope label is present, the check is skipped (opt-in).
#
# Labels and their allowed paths:
#   scope:docs       -> docs/, *.md (not specs/)
#   scope:specs      -> docs/specs/, specs/
#   scope:schema     -> packages/schema/, specs/conformance/
#   scope:kernel     -> packages/kernel/, specs/kernel/
#   scope:protocol   -> packages/protocol/
#   scope:cli        -> packages/cli/
#   scope:examples   -> examples/
#   scope:ci         -> .github/, scripts/, .githooks/, security/, package.json, pnpm-lock.yaml, eslint.config.mjs, .prettierignore
#   scope:surfaces   -> surfaces/
#   scope:adapters   -> packages/adapters/
#   scope:mappings   -> packages/mappings/
#   scope:governance -> docs/governance/, docs/STANDARDS.md, docs/VERSIONING.md
#
# Multiple scope labels can be combined (union of allowlists).
# Every scope implicitly allows: CHANGELOG.md, pnpm-lock.yaml (lockfile drift).
#
# Usage:
#   PR_NUMBER=437 bash scripts/ci/scope-guard.sh
#   (or in CI, where GITHUB_EVENT provides the PR number)

set -euo pipefail

# Resolve PR number from env or GitHub event
PR_NUMBER="${PR_NUMBER:-}"
if [ -z "$PR_NUMBER" ] && [ -f "${GITHUB_EVENT_PATH:-/dev/null}" ]; then
  PR_NUMBER=$(jq -r '.pull_request.number // empty' "$GITHUB_EVENT_PATH" 2>/dev/null || true)
fi

if [ -z "$PR_NUMBER" ]; then
  echo "[scope-guard] No PR number found. Skipping (not a PR context)."
  exit 0
fi

echo "[scope-guard] Checking PR #$PR_NUMBER"

# Get labels
LABELS=$(gh pr view "$PR_NUMBER" --json labels --jq '[.labels[].name] | join(",")' 2>/dev/null || true)
echo "[scope-guard] Labels: ${LABELS:-none}"

# Extract scope labels
SCOPE_LABELS=$(echo "$LABELS" | tr ',' '\n' | grep '^scope:' || true)

if [ -z "$SCOPE_LABELS" ]; then
  echo "[scope-guard] No scope:* labels found. Skipping (opt-in mode)."
  exit 0
fi

echo "[scope-guard] Active scopes: $(echo "$SCOPE_LABELS" | tr '\n' ' ')"

# Build combined regex from scope labels
# Each scope maps to a regex pattern of allowed paths
ALLOWED_PATTERNS=""

add_pattern() {
  if [ -n "$ALLOWED_PATTERNS" ]; then
    ALLOWED_PATTERNS="$ALLOWED_PATTERNS|$1"
  else
    ALLOWED_PATTERNS="$1"
  fi
}

# Always-allowed files (any scope)
add_pattern '^CHANGELOG\.md$'
add_pattern '^pnpm-lock\.yaml$'

for scope in $SCOPE_LABELS; do
  case "$scope" in
    scope:docs)
      add_pattern '^docs/'
      add_pattern '\.md$'
      # But NOT specs/ (that requires scope:specs)
      ;;
    scope:specs)
      add_pattern '^docs/specs/'
      add_pattern '^specs/'
      ;;
    scope:schema)
      add_pattern '^packages/schema/'
      add_pattern '^specs/conformance/'
      ;;
    scope:kernel)
      add_pattern '^packages/kernel/'
      add_pattern '^specs/kernel/'
      ;;
    scope:protocol)
      add_pattern '^packages/protocol/'
      ;;
    scope:cli)
      add_pattern '^packages/cli/'
      ;;
    scope:examples)
      add_pattern '^examples/'
      ;;
    scope:ci)
      add_pattern '^\.github/'
      add_pattern '^\.githooks/'
      add_pattern '^scripts/'
      add_pattern '^security/'
      add_pattern '^package\.json$'
      add_pattern '^pnpm-lock\.yaml$'
      add_pattern '^eslint\.config\.mjs$'
      add_pattern '^\.prettierignore$'
      ;;
    scope:surfaces)
      add_pattern '^surfaces/'
      ;;
    scope:adapters)
      add_pattern '^packages/adapters/'
      ;;
    scope:mappings)
      add_pattern '^packages/mappings/'
      ;;
    scope:governance)
      add_pattern '^docs/governance/'
      add_pattern '^docs/STANDARDS\.md$'
      add_pattern '^docs/VERSIONING\.md$'
      ;;
    *)
      echo "[scope-guard] WARNING: Unknown scope label '$scope', ignoring."
      ;;
  esac
done

echo "[scope-guard] Allowed pattern: $ALLOWED_PATTERNS"

# Get changed files
CHANGED_FILES=$(gh pr diff "$PR_NUMBER" --name-only 2>/dev/null || true)

if [ -z "$CHANGED_FILES" ]; then
  echo "[scope-guard] No changed files detected. OK."
  exit 0
fi

# Check each file against allowlist
VIOLATIONS=""
VIOLATION_COUNT=0

while IFS= read -r file; do
  if ! echo "$file" | grep -qE "$ALLOWED_PATTERNS"; then
    VIOLATIONS="${VIOLATIONS}  - ${file}\n"
    VIOLATION_COUNT=$((VIOLATION_COUNT + 1))
  fi
done <<< "$CHANGED_FILES"

if [ "$VIOLATION_COUNT" -gt 0 ]; then
  echo ""
  echo "[scope-guard] FAIL: $VIOLATION_COUNT file(s) outside declared scope"
  echo ""
  echo "Files outside scope:"
  echo -e "$VIOLATIONS"
  echo ""
  echo "Either:"
  echo "  1. Add the appropriate scope:* label to cover these files"
  echo "  2. Remove these files from the PR (they belong in a separate PR)"
  echo ""
  echo "Available scope labels: scope:docs, scope:specs, scope:schema, scope:kernel,"
  echo "  scope:protocol, scope:cli, scope:examples, scope:ci, scope:surfaces,"
  echo "  scope:adapters, scope:mappings, scope:governance"
  exit 1
else
  total=$(echo "$CHANGED_FILES" | wc -l | tr -d ' ')
  echo "[scope-guard] OK: All $total changed files are within declared scope."
fi
