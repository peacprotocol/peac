#!/usr/bin/env bash
# Guard script for PEAC protocol safety checks
set -euo pipefail
export LC_ALL=C
bad=0

# Detect PCRE support for git grep (-P).
# (?!) is a zero-width negative lookahead that always fails to match.
# Exit 1 = "no matches" (PCRE works), exit 2+ = error (no PCRE).
_pcre_rc=0
git grep -qP '(?!)' -- README.md 2>/dev/null || _pcre_rc=$?
case $_pcre_rc in
  1) _PCRE=1 ;;
  *) _PCRE=0; echo "NOTE: git lacks PCRE (-P); word-boundary guards use ERE fallback" ;;
esac

# git grep with word-boundary support (PCRE primary, ERE fallback).
# Usage: gg_wb <base_flags> <pcre_pattern> <ere_pattern> [-- pathspecs...]
gg_wb() {
  local f="$1" p="$2" e="$3"; shift 3
  if [ "$_PCRE" = 1 ]; then
    git grep "-${f}P" "$p" "$@"
  else
    git grep "-${f}E" "$e" "$@"
  fi
}

echo "== forbid dist imports =="
# Allow dist imports in scripts/ (benchmarks run after build) and nightly workflow
if git grep -n "packages/.*/dist" -- ':!node_modules' ':!scripts/**' ':!archive/**' \
  | grep -vE '^(\.github/workflows/nightly\.yml)' | grep .; then
  bad=1
else
  echo "OK"
fi

echo "== forbid .ts in ESM imports =="
git grep -nE "from ['\"][^'\"]+\.ts['\"]" -- 'packages/**/*.ts' ':!node_modules' && bad=1 || echo "OK"

echo "== forbid v0914 fragments =="
git ls-files | grep -E 'v0?914|v0914' && bad=1 || echo "OK"

echo "== header & typ must be new =="
git grep -nE "peac-version|application/peac-receipt\+jws" -- '**/*.{md,ts,js,json,yml}' ':!node_modules' ':!archive/**' \
  && bad=1 || echo "OK"

echo "== forbid peac.dev domain =="
# Fail if any peac.dev reference appears outside allowed migration docs
DOCS_MIGRATION_ALLOW='^(docs/migration|CHANGELOG\.md)'
if gg_wb n 'https?://([a-z0-9.-]*\.)?peac\.dev\b' 'https?://([a-z0-9.-]*\.)?peac\.dev([^[:alnum:]_]|$)' -- ':!node_modules' ':!archive/**' \
  | grep -vE "$DOCS_MIGRATION_ALLOW" | grep .; then
  bad=1
else
  echo "OK"
fi

# Require https for www.peacprotocol.org (and bare peacprotocol.org)
echo "== peacprotocol.org must be https =="
if gg_wb n 'http://(www\.)?peacprotocol\.org\b' 'http://(www\.)?peacprotocol\.org([^[:alnum:]_]|$)' -- ':!node_modules' ':!archive/**' | grep .; then
  bad=1
else
  echo "OK"
fi

echo "== field regressions (typos) =="
# Catch common misspellings of 'receipt' and legacy field names (intentionally spelled wrong below)
# Note: issued_at is valid for Attestation type (v0.9.21+), AgentIdentityAttestation (v0.9.25+), Attribution (v0.9.26+), DisputeAttestation (v0.9.27+), DisputeBundle (v0.9.30+), UCP evidence (v0.9.31+), and WorkflowSummaryAttestation (v0.10.2+)
LEGACY_FIELD_FILES='^(ex/|profiles/|scripts/(guard\.sh|generate-bundle-vectors\.ts)|CHANGELOG\.md|docs/(migration/|MIGRATION_|PEAC_NORMATIVE_DECISIONS_LOG\.md|PEAC_v0\.9\.15_ACTUAL_SCOPE\.md|interop\.md|README_LONG\.md|specs/|compliance/|guides/)|specs/(wire/|conformance/|kernel/errors\.json)|packages/(kernel/src/errors(\.generated)?\.ts|schema/(src/(evidence|validators|agent-identity|attribution|dispute|workflow)\.ts|__tests__/(agent-identity|dispute|workflow)\.test\.ts)|attribution/|audit/|cli/src/commands/bundle\.ts|mappings/ucp/)|examples/(agent-identity|ucp-webhook-express|workflow-correlation)/|sdks/(go|python)/)'
if gg_wb nI '\bissued_at\b|payment\.scheme|peacrece?i?e?pt(s)?\b' '(^|[^[:alnum:]_])issued_at([^[:alnum:]_]|$)|payment\.scheme|peacrece?i?e?pt(s)?([^[:alnum:]_]|$)' -- ':!node_modules' ':!archive/**' \
  | grep -vE "$LEGACY_FIELD_FILES" | grep .; then
  bad=1
else
  echo "OK"
fi

echo "== forbid internal notes =="
# Allow TODO/FIXME in: PEIP templates, guard script itself, docs-quality workflow (checks FOR them), NPM policy (example commands)
DOCS_ALLOW='^(docs/peip/|docs/peips\.md|pnpm-lock\.yaml|scripts/guard\.sh|\.github/workflows/docs-quality\.yml|docs/maintainers/NPM_PUBLISH_POLICY\.md)'
if git grep -nE 'TODO|FIXME|HACK|XXX|@ts-ignore' -- ':!node_modules' ':!archive/**' \
  | grep -vE "$DOCS_ALLOW" | grep .; then
  bad=1
else
  echo "OK"
fi

echo "== forbid disabled typechecks =="
if git grep -nE '"typecheck":\s*"echo .*temporarily disabled' -- 'apps/**/package.json' 'packages/**/package.json' | grep .; then
  bad=1
else
  echo "OK"
fi

echo "== forbid legacy media type =="
if git grep -n 'application/peac-receipt+jws' -- ':!node_modules' ':!scripts/guard.sh' | grep -vE '^archive/'; then
  bad=1
else
  echo "OK"
fi

echo "== forbid empty smoke tests =="
if grep -RIl "Zero-BC v0.9.14: Test disabled" test/ tests/ 2>/dev/null | grep .; then
  echo "FAIL: Found disabled smoke tests - archive them properly"
  bad=1
else
  echo "OK"
fi

echo "== forbid X-PEAC headers (RFC 6648) =="
# Strict repo-wide check: X-PEAC-* headers are forbidden everywhere
# Use [Xx] pattern to avoid self-matching in this script
# Exclude: archive (legacy), scripts that check FOR violations, CI that checks FOR violations
XPEAC_ALLOW='^(archive/|CHANGELOG\.md|scripts/(guard\.sh|verify-protocol-strings\.mjs|verify-spec-drift\.mjs|pre-release-verify\.sh)|\.github/workflows/ci\.yml)'
if git grep -nE '[Xx]-PEAC-' -- ':!node_modules' \
  | grep -vE "$XPEAC_ALLOW" | grep .; then
  echo "FAIL: Found X-PEAC headers - use PEAC-* instead (RFC 6648)"
  bad=1
else
  echo "OK"
fi

echo "== forbid imports from archive =="
if git grep -nE "from ['\"]/.*archive/|require\(['\"]/.*archive/" -- ':!node_modules' | grep .; then
  bad=1
else
  echo "OK"
fi

echo "== forbid relative imports to dist =="
if git grep -nE "\.\./\.\./packages/.*/dist/" -- ':!node_modules' ':!archive/**' | grep .; then
  bad=1
else
  echo "OK"
fi

echo "== forbid npm invocations =="
# Allow npm in: README (end-user install), RELEASING (what NOT to do), CHANGELOG (release notes),
# NPM_PUBLISH docs (policy), edge guides (CLI install), pack scripts (consumer-reality smoke tests),
# net-node test-pack-install (tests published package in clean npm project),
# capture-core test-exports (tests consumer exports resolution),
# publish workflow (npm install for OIDC), docs/release (npm publish docs), publish-manifest (description)
NPM_ALLOW='^(IMPLEMENTATION_STATUS\.md|README\.md|RELEASING\.md|CHANGELOG\.md|docs/ROADMAP\.md|docs/maintainers/(RELEASING|NPM_PUBLISH).*\.md|docs/guides/edge/|docs/release/|scripts/(guard\.sh|pack-smoke\.mjs|pack-.*\.sh|check-readme-consistency\.sh|publish-manifest\.json)|packages/net/node/scripts/test-pack-install\.mjs|packages/capture/core/scripts/test-exports\.mjs|\.github/workflows/publish\.yml)'
if gg_wb n '\bnpm (run|ci|install|pack|publish)\b' '(^|[^[:alnum:]_])npm (run|ci|install|pack|publish)([^[:alnum:]_]|$)' -- ':!node_modules' ':!archive/**' | grep -vE "$NPM_ALLOW" | grep .; then
  bad=1
else
  echo "OK"
fi

echo "== forbid foreign lockfiles =="
if [ -f package-lock.json ] || [ -f yarn.lock ]; then
  echo "FAIL: found non-pnpm lockfile"; bad=1
else
  echo "OK"
fi

echo "== forbid invisible/bidi Unicode (Trojan Source) =="
if [ -f scripts/find-invisible-unicode.mjs ]; then
  # Scan all tracked text files for dangerous Unicode
  if git ls-files -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.json' '*.md' '*.yaml' '*.yml' \
    | grep -vE '^(archive/|node_modules/)' \
    | node scripts/find-invisible-unicode.mjs --stdin 2>&1 | grep -v "No dangerous Unicode"; then
    echo "FAIL: Found dangerous invisible/bidi Unicode characters"
    bad=1
  else
    echo "OK"
  fi
else
  echo "FAIL: scripts/find-invisible-unicode.mjs not found (required for Trojan Source detection)"
  bad=1
fi

echo "== forbid header casing drift (Peac-Receipt) =="
# PEAC-Receipt is canonical; Peac-Receipt is incorrect casing
# Allow in guard/verification scripts (they check FOR this pattern) and CHANGELOG (historical)
if git grep -n 'Peac-Receipt' -- ':!node_modules' ':!archive/**' ':!dist/**' ':!scripts/*.sh' ':!scripts/*.mjs' ':!CHANGELOG.md' | grep .; then
  echo "FAIL: Found incorrect header casing 'Peac-Receipt' - use 'PEAC-Receipt'"
  bad=1
else
  echo "OK"
fi

echo "== forbid legacy wire format IDs (v0.10.0 break) =="
# These old format IDs were replaced in v0.10.0 wire normalization
# peac.receipt/0.9 -> peac-receipt/0.1
# peac.dispute-bundle/0.1 -> peac-bundle/0.1
# wire/0.9/ -> wire/0.1/
# Allow in: CHANGELOG, guard script, migration docs, versioning doctrine (historical), deprecated packages, tests pending migration, Go SDK
LEGACY_WIRE_ALLOW='^(CHANGELOG\.md|scripts/(guard\.sh|lint-schemas\.mjs)|docs/(migration/|specs/VERSIONING\.md)|packages/(core|sdk-js)/|packages/(crypto|protocol|schema)/(tests|openapi|src/(index|types|envelope))|tests/(golden|vectors)/|specs/(kernel/README|conformance/fixtures/bundle/invalid)|sdks/go/|examples/x402-node-server/)'
if git grep -nE 'peac\.receipt/0\.9|peac\.dispute-bundle|wire/0\.9/|PEAC-RECEIPT-SCHEMA-v0\.9' -- ':!node_modules' ':!archive/**' \
  | grep -vE "$LEGACY_WIRE_ALLOW" | grep .; then
  echo "FAIL: Found legacy wire format IDs - use normalized 0.1 versions"
  bad=1
else
  echo "OK"
fi

echo "== dependency audit (critical = blocking, high = warning) =="
# Two-tier policy:
#   critical -> blocks release (sets bad=1)
#   high     -> warning only (does not block)
# To allowlist a known advisory, add it to security/audit-allowlist.json
# with an expires_at date. Expired entries are treated as active again.
if [ "${PEAC_FAST:-}" = "1" ]; then
  echo "SKIP (PEAC_FAST=1)"
else
  _audit_critical=0
  pnpm audit --audit-level=critical 2>/dev/null || _audit_critical=$?
  if [ "$_audit_critical" -ne 0 ]; then
    echo "FAIL: pnpm audit found critical vulnerabilities -- must fix before release"
    bad=1
  else
    _audit_high=0
    pnpm audit --audit-level=high 2>/dev/null || _audit_high=$?
    if [ "$_audit_high" -ne 0 ]; then
      echo "WARNING: pnpm audit found high-severity vulnerabilities -- review before release"
    else
      echo "OK"
    fi
  fi
fi

echo "== lockfile drift check =="
# Verify pnpm-lock.yaml is consistent with package.json manifests.
# A frozen install that succeeds means no drift; if it fails, lockfile
# doesn't match declared dependencies.
if [ "${PEAC_FAST:-}" = "1" ]; then
  echo "SKIP (PEAC_FAST=1)"
else
  if pnpm install --frozen-lockfile --prefer-offline 2>/dev/null; then
    echo "OK"
  else
    echo "FAIL: pnpm-lock.yaml drift detected -- run 'pnpm install' and commit the lockfile"
    bad=1
  fi
  # Also verify no uncommitted lockfile changes (catches tooling mutations)
  if git diff --quiet pnpm-lock.yaml 2>/dev/null; then
    :
  else
    echo "FAIL: pnpm-lock.yaml has uncommitted changes"
    bad=1
  fi
fi

echo "== forbid stale generated artifacts in src/ =="
stale=$(find packages -path "*/src/*" \
  -not -path "*/dist/*" -not -path "*/node_modules/*" \( \
  -name "*.generated.js" -o -name "*.generated.js.map" \
  -o -name "*.generated.d.ts" -o -name "*.generated.d.ts.map" \
\) -print 2>/dev/null)
if [ -n "$stale" ]; then
  echo "FAIL: Generated build artifacts found under src/ (shadow TS resolution):"
  echo "$stale"
  echo "Fix: rm -f $stale"
  bad=1
else
  echo "OK"
fi

exit $bad