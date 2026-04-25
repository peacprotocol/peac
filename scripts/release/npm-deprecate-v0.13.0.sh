#!/usr/bin/env bash
#
# npm-deprecate-v0.13.0.sh
#
# Staged for v0.13.0 release prep. Executed after `promote-latest` completes
# (never before, to avoid confusing promote-latest's package inspection pass).
#
# Deprecate-then-remove discipline: this script marks packages deprecated on
# the npm registry. It does NOT call `npm unpublish` against any historical
# tarball. Consumers who pin to historical versions retain installability.
#
# How it works:
#   For every (package, version-range) pair, the script first asks the
#   registry for the actual published versions of the package. It then
#   deprecates only the versions that satisfy the range AND are actually
#   published. This avoids broad-range 404s and produces a clean audit log.
#
# Dry run:   NPM_DEPRECATE_DRY_RUN=1 ./scripts/release/npm-deprecate-v0.13.0.sh
# Strict:    NPM_DEPRECATE_FAIL_ON_NETWORK=1 forces a non-zero exit if any
#            registry call fails (default: continue and report at the end).
#
# Requires: authenticated npm session with publish rights to the @peac scope.
# CI does not run this; it is a manual post-promote step and should be
# documented in the release-flow checklist.

set -uo pipefail

DRY_RUN="${NPM_DEPRECATE_DRY_RUN:-0}"
FAIL_ON_NETWORK="${NPM_DEPRECATE_FAIL_ON_NETWORK:-0}"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is required (used to filter versions against semver ranges)" >&2
  exit 2
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is required" >&2
  exit 2
fi

# Authentication preflight (skipped in dry-run because dry-run does not
# call the registry write paths). A failed `npm whoami` against the public
# registry exits non-zero with a clear message so the script is not silently
# misclassified as "succeeded".
if [ "$DRY_RUN" != "1" ]; then
  if ! npm whoami --registry=https://registry.npmjs.org/ >/dev/null 2>&1; then
    cat >&2 <<'EOF'
ERROR: not authenticated to https://registry.npmjs.org/.

Run `npm login` (or restore your existing npm session) and re-run this
script. `npm deprecate` requires write access to the @peac scope.

To preview without authenticating, run with NPM_DEPRECATE_DRY_RUN=1.
EOF
    exit 3
  fi
fi

ATTEMPTED=0
SUCCEEDED=0
SKIPPED_MISSING=0
FAILED=0
FAILED_LINES=()

# Resolve published versions of $1 that satisfy semver range $2.
# Echoes one version per line (sorted by semver).
# Returns non-zero on registry failure.
resolve_versions() {
  local pkg="$1"
  local range="$2"
  local raw

  raw="$(npm view "$pkg" versions --json 2>/dev/null || true)"
  if [ -z "$raw" ]; then
    return 1
  fi

  PKG="$pkg" RANGE="$range" RAW="$raw" node -e '
    let semver;
    try {
      semver = require("semver");
    } catch (err) {
      console.error("ERROR: the `semver` package is required for version filtering.");
      console.error("Install it (root devDependency) and re-run.");
      process.exit(2);
    }
    const raw = process.env.RAW;
    let arr;
    try {
      const parsed = JSON.parse(raw);
      arr = Array.isArray(parsed) ? parsed : [parsed];
    } catch (err) {
      console.error(err.message);
      process.exit(2);
    }
    const range = process.env.RANGE;
    const matches = arr.filter(v => semver.satisfies(v, range, { includePrerelease: true }));
    matches.sort(semver.compare);
    for (const v of matches) console.log(v);
  '
}

deprecate_one() {
  local pkg="$1"
  local version="$2"
  local message="$3"
  local spec="${pkg}@${version}"

  ATTEMPTED=$((ATTEMPTED + 1))

  if [ "$DRY_RUN" = "1" ]; then
    echo "  [DRY-RUN] npm deprecate ${spec}"
    SUCCEEDED=$((SUCCEEDED + 1))
    return 0
  fi

  local out rc
  out="$(npm deprecate "$spec" "$message" 2>&1)"
  rc=$?
  if [ $rc -eq 0 ]; then
    echo "  ok        ${spec}"
    SUCCEEDED=$((SUCCEEDED + 1))
  else
    echo "  FAILED    ${spec}"
    echo "$out" | sed 's/^/      /'
    FAILED=$((FAILED + 1))
    FAILED_LINES+=("${spec}")
  fi
  return 0
}

deprecate_range() {
  local pkg="$1"
  local range="$2"
  local message="$3"

  echo
  echo "-- ${pkg} (range ${range}) --"

  local versions
  versions="$(resolve_versions "$pkg" "$range")"
  local resolve_rc=$?

  if [ $resolve_rc -ne 0 ]; then
    echo "  WARN      could not list published versions of ${pkg} (network or 404)"
    if [ "$FAIL_ON_NETWORK" = "1" ]; then
      FAILED=$((FAILED + 1))
      FAILED_LINES+=("${pkg} (resolve failed; FAIL_ON_NETWORK=1)")
    fi
    return 0
  fi

  if [ -z "$versions" ]; then
    echo "  skipped   no published versions of ${pkg} satisfy ${range}"
    SKIPPED_MISSING=$((SKIPPED_MISSING + 1))
    return 0
  fi

  while IFS= read -r v; do
    [ -z "$v" ] && continue
    deprecate_one "$pkg" "$v" "$message"
  done <<<"$versions"
}

echo "=== v0.13.0 npm deprecate dispatch ==="
if [ "$DRY_RUN" = "1" ]; then
  echo "    mode: DRY RUN (no registry writes)"
else
  echo "    mode: live (writes to npm)"
fi
echo

# Range is "<0.13.0" rather than the previously-pinned upper bound. Pinned
# bounds reflected the in-source archive cutover and could miss intermediate
# versions that were published between cutover and rollout. Because each
# range is resolved against `npm view <pkg> versions` first, "<0.13.0" only
# acts on versions that are actually published, while staying forward-safe
# if a previously-overlooked version surfaces.

# @peac/pref: archived in v0.13.0 and absent from the v0.13.0 active publish manifest.
# Migration: @peac/mappings-content-signals.
deprecate_range '@peac/pref' '<0.13.0' \
  'ARCHIVED in v0.13.0. Use @peac/mappings-content-signals directly for RFC 9651 Structured Fields content-signal parsing and resolution. See https://peacprotocol.org/docs/migration.'

# @peac/sdk (workspace stub `@peac/sdk-js`): archived prior to v0.13.0 and absent from
# the v0.13.0 active publish manifest.
deprecate_range '@peac/sdk' '<0.13.0' \
  'ARCHIVED. Use @peac/protocol (issue / verifyLocal / verify), @peac/schema (types), @peac/crypto (sign/verify), @peac/kernel (constants). See https://peacprotocol.org/docs/migration.'

# @peac/disc: one-release deprecated alias. PUBLISHED at 0.13.0 as a
# compatibility bridge so existing workspace consumers keep publish closure.
# Historical versions deprecated; the 0.13.0 version is explicitly marked as
# a one-release bridge. Deprecation messages intentionally do NOT tell every
# caller to switch to loadPolicyDocument: @peac/policy-kit is the canonical
# replacement for policy-document parsing / validation, but the discover()
# remote-fetch helper has no direct equivalent. Callers that need discover()
# should stay on @peac/disc through the v0.13.0 release window.
deprecate_range '@peac/disc' '<0.13.0' \
  'Deprecated. Use @peac/policy-kit for policy-document parsing and validation (parsePolicyDocument, loadPolicyDocument, validatePolicy, serializePolicyYaml). Remote discovery remains compatibility-only in @peac/disc@0.13.0. See https://peacprotocol.org/docs/migration.'
deprecate_range '@peac/disc' '=0.13.0' \
  'One-release deprecated compatibility package. Prefer @peac/policy-kit for policy-document parsing and validation. See https://peacprotocol.org/docs/migration.'

# @peac/core: archived in v0.13.0. Historical verify-only implementation;
# absent from the v0.13.0 active publish manifest.
deprecate_range '@peac/core' '<0.13.0' \
  'ARCHIVED in v0.13.0. Verify-only for historical receipt records. Use @peac/protocol + @peac/schema + @peac/crypto + @peac/kernel. See https://peacprotocol.org/docs/migration.'

echo
echo "=== summary ==="
printf "  attempted:        %d\n" "$ATTEMPTED"
printf "  succeeded:        %d\n" "$SUCCEEDED"
printf "  skipped (missing):%d\n" "$SKIPPED_MISSING"
printf "  failed:           %d\n" "$FAILED"

if [ $FAILED -gt 0 ]; then
  echo
  echo "Failed entries:"
  for line in "${FAILED_LINES[@]}"; do
    echo "  - ${line}"
  done
  exit 1
fi

echo
echo "complete."
