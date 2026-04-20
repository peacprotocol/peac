#!/usr/bin/env bash
# Verify that a pull request only touches release-state stamping artifacts.
#
# The reduced stamp-PR CI profile skips the full core-runtime matrix for
# PRs that only change release-state stamps. This guard enforces the
# allowlist so stamp-profile runs never execute against PRs that also
# touch source, docs, specs, or any other path.
#
# Usage:
#   scripts/ci/check-stamp-only-pr.sh <base-ref> <head-ref>
#
# Inputs:
#   base-ref   Git ref for the PR base (e.g., origin/main).
#   head-ref   Git ref for the PR head (e.g., HEAD).
#
# Exit codes:
#   0  All changed files are in the stamp-only allowlist.
#   1  At least one changed file is outside the allowlist.
#   2  Usage error.

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <base-ref> <head-ref>" >&2
  exit 2
fi

base="$1"
head="$2"

# Allowlist: release-state stamp artifacts that the stamp-PR CI profile
# is allowed to touch. Any other tracked path forces the PR into the full
# CI profile.
allowed=(
  "docs/releases/facts.json"
  "docs/releases/current.json"
  "REPO_SURFACE_STATUS.json"
  "docs/SURFACE_STATUS.md"
  "docs/PACKAGE_STATUS.md"
)

# Pre-compute the allowlist pattern for quick membership.
is_allowed() {
  local file="$1"
  for ok in "${allowed[@]}"; do
    if [ "$file" = "$ok" ]; then
      return 0
    fi
  done
  return 1
}

# Compute changed paths. `git diff --name-only` lists both sides of the
# range so deletes and adds both appear.
changed=$(git diff --name-only "$base...$head")

if [ -z "$changed" ]; then
  echo "No changed files in range $base...$head; stamp-only profile not applicable." >&2
  exit 1
fi

bad=""
while IFS= read -r file; do
  [ -z "$file" ] && continue
  if ! is_allowed "$file"; then
    bad="$bad  $file
"
  fi
done <<< "$changed"

if [ -n "$bad" ]; then
  echo "stamp-only profile denied: the following paths are outside the allowlist:" >&2
  printf '%b' "$bad" >&2
  echo "" >&2
  echo "Allowed paths (stamp-only):" >&2
  for ok in "${allowed[@]}"; do
    echo "  $ok" >&2
  done
  exit 1
fi

echo "stamp-only profile ok: $(echo "$changed" | wc -l | tr -d ' ') change(s) inside the allowlist"
exit 0
