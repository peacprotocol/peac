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
LEGACY_FIELD_FILES='^(ex/|profiles/|scripts/(guard\.sh|generate-bundle-vectors\.ts)|CHANGELOG\.md|docs/(migration/|MIGRATION_|PEAC_NORMATIVE_DECISIONS_LOG\.md|PEAC_v0\.9\.15_ACTUAL_SCOPE\.md|interop\.md|README_LONG\.md|specs/|compliance/|guides/)|specs/(wire/|conformance/|kernel/(errors\.json|snapshots/))|packages/(kernel/src/errors(\.generated)?\.ts|schema/(src/(evidence|validators|agent-identity|attribution|dispute|workflow)\.ts|__tests__/(agent-identity|dispute|workflow)\.test\.ts)|attribution/|audit/|cli/src/commands/bundle\.ts|mappings/ucp/)|examples/(agent-identity|ucp-webhook-express|workflow-correlation)/|sdks/(go|python)/)'
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
NPM_ALLOW='^(IMPLEMENTATION_STATUS\.md|README\.md|packages/.*/README\.md|(docs/)?RELEASING\.md|CHANGELOG\.md|docs/ROADMAP\.md|docs/maintainers/(RELEASING|NPM_PUBLISH).*\.md|docs/guides/edge/|docs/release/|scripts/(guard\.sh|pack-smoke\.mjs|pack-.*\.sh|otel-smoke\.sh|check-readme-consistency\.sh|publish-manifest\.json)|packages/net/node/scripts/test-pack-install\.mjs|packages/capture/core/scripts/test-exports\.mjs|\.github/workflows/(publish|promote-latest|publish-mcp-registry)\.yml|integrator-kits/|surfaces/distribution/|llms\.txt|examples/hello-world/)'
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
    echo "Unicode scan OK (GitHub diff bidi warning is cosmetic; repo runs fail-closed Trojan Source scan)"
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

echo "== dependency audit (via audit-gate.mjs) =="
# Deterministic audit gate: parses JSON, applies time-bounded allowlist,
# blocks on critical (always), blocks on high (strict mode only).
# See scripts/audit-gate.mjs and security/audit-allowlist.json.
if [ "${PEAC_FAST:-}" = "1" ]; then
  echo "SKIP (PEAC_FAST=1)"
else
  if node scripts/audit-gate.mjs; then
    :
  else
    bad=1
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

echo "== forbid duplicate JSON keys =="
if [ -f scripts/check-json-dupes.mjs ]; then
  if git ls-files -- '*.json' \
    | grep -vE '^(archive/|node_modules/)' \
    | node scripts/check-json-dupes.mjs --stdin 2>&1 | grep -v "No duplicate JSON"; then
    echo "FAIL: Found duplicate JSON keys"
    bad=1
  else
    echo "OK"
  fi
else
  echo "SKIP: scripts/check-json-dupes.mjs not found"
fi

echo "== forbid x403 typo (must be x402) =="
# x403 is a common typo for x402; catch it before it leaks into code or docs
if git grep -n 'x403' -- ':!node_modules' ':!archive/**' ':!scripts/guard.sh' ':!scripts/check-planning-leak.sh' ':!CHANGELOG.md' | grep .; then
  echo "FAIL: Found 'x403' -- did you mean 'x402'?"
  bad=1
else
  echo "OK"
fi

echo "== discovery surface drift =="
# Prevent protocol verifier code from bypassing peac-issuer.json and fetching JWKS directly.
# The canonical path is: peac-issuer.json -> jwks_uri -> JWKS (via jwks-resolver.ts).
# Two checks: (1) call-based: only jwks-resolver.ts may call fetchJWKSSafe(),
# (2) string heuristic: no direct well-known/jwks.json references in src/.
# Checking calls (not imports) avoids false positives from type-only imports
# and legitimate non-JWKS uses of ssrfSafeFetch (e.g., pointer-fetch.ts).
# Allow: jwks-resolver.ts (canonical resolver), ssrf-safe-fetch.ts (function definition).
FETCH_JWKS_CALL_ALLOW='^packages/protocol/src/(jwks-resolver|ssrf-safe-fetch)\.ts'
# Check 1: call-based (fetchJWKSSafe() called outside resolver or definition)
if git grep -nE 'fetchJWKSSafe\(' -- 'packages/protocol/src/*.ts' ':!node_modules' \
  | grep -vE "$FETCH_JWKS_CALL_ALLOW" | grep .; then
  echo "FAIL: fetchJWKSSafe() called outside jwks-resolver.ts - route through resolveJWKS()"
  bad=1
# Check 2: string heuristic (direct JWKS URL construction in src/)
elif git grep -n 'well-known/jwks\.json' -- 'packages/protocol/src/*.ts' ':!node_modules' | grep .; then
  echo "FAIL: Direct /.well-known/jwks.json in protocol verifier code - use jwks-resolver.ts"
  bad=1
else
  echo "OK"
fi

echo "== MCP distribution surfaces =="
# Validate server.json (MCP Registry schema), smithery.yaml, llms.txt existence
MCP_DIST_OK=1
if [ ! -f packages/mcp-server/server.json ]; then
  echo "FAIL: packages/mcp-server/server.json missing"
  MCP_DIST_OK=0
elif ! node -e "JSON.parse(require('fs').readFileSync('packages/mcp-server/server.json','utf8'))" 2>/dev/null; then
  echo "FAIL: packages/mcp-server/server.json is not valid JSON"
  MCP_DIST_OK=0
fi
if [ ! -f packages/mcp-server/smithery.yaml ]; then
  echo "FAIL: packages/mcp-server/smithery.yaml missing"
  MCP_DIST_OK=0
fi
if [ ! -f llms.txt ]; then
  echo "FAIL: llms.txt missing (repo root)"
  MCP_DIST_OK=0
fi
# Verify server.json version matches monorepo version
if [ -f packages/mcp-server/server.json ]; then
  SERVER_VER=$(node -e "console.log(JSON.parse(require('fs').readFileSync('packages/mcp-server/server.json','utf8')).version)")
  MONO_VER=$(node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)")
  if [ "$SERVER_VER" != "$MONO_VER" ]; then
    echo "FAIL: server.json version ($SERVER_VER) != monorepo version ($MONO_VER)"
    MCP_DIST_OK=0
  fi
fi
if [ "$MCP_DIST_OK" = "1" ]; then
  echo "OK"
else
  bad=1
fi

echo "== no-network guard (DD-55) =="
if [ -f scripts/check-no-network.mjs ]; then
  if node scripts/check-no-network.mjs > /dev/null 2>&1; then
    echo "OK"
  else
    node scripts/check-no-network.mjs 2>&1 | head -20
    bad=1
  fi
else
  echo "SKIP: scripts/check-no-network.mjs not found"
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

echo "== layer boundary enforcement =="
if bash scripts/check-layer-boundaries.sh >/dev/null 2>&1; then
  echo "OK"
else
  echo "FAIL: Layer boundary violation detected"
  bash scripts/check-layer-boundaries.sh 2>&1 | grep FAIL || true
  bad=1
fi

echo "== version coherence check =="
if bash scripts/check-version-coherence.sh >/dev/null 2>&1; then
  echo "OK"
else
  echo "FAIL: Version coherence violation detected"
  bash scripts/check-version-coherence.sh 2>&1 | grep FAIL || true
  bad=1
fi

echo "== Wire 0.2 isolation (DD-156) =="
# Wire02 types/constants must NOT appear in Wire 0.1 validators or attestation-receipt.
# Patterns anchored to imports, type references, and constant usage (not comments/docs).
if git grep -nE '(import.*Wire02|Wire02Claims|Wire02Kind|WIRE_02_|peac_version)' -- 'packages/schema/src/validators.ts' 'packages/schema/src/attestation-receipt.ts' | grep -v '^\S*:\s*//' | grep -v '^\S*:\s*\*' | grep .; then
  echo "FAIL: Wire 0.2 types leaked into Wire 0.1 code"
  bad=1
else
  echo "OK"
fi

echo "== forbid draft typ (DD-156) =="
# peac-receipt+jwt was never shipped; must not appear in code or string literals.
# Exclude comment-only lines to avoid false positives from historical context.
if git grep -n 'peac-receipt+jwt' -- '**/*.ts' ':!node_modules' ':!archive/**' | grep -v '^\S*:\s*//' | grep -v '^\S*:\s*\*' | grep .; then
  echo "FAIL: Draft typ peac-receipt+jwt found (use interaction-record+jwt)"
  bad=1
else
  echo "OK"
fi

echo "== forbid stale warning constant =="
# unknown_type_unvalidated_extensions was replaced by type_unregistered
if git grep -n 'unknown_type_unvalidated_extensions' -- '**/*.ts' ':!node_modules' ':!archive/**' | grep .; then
  echo "FAIL: Stale constant unknown_type_unvalidated_extensions found"
  bad=1
else
  echo "OK"
fi

echo "== no strictness in crypto (DD-156) =="
# Strictness belongs exclusively in @peac/protocol.verifyLocal()
# Exclude JSDoc/comment lines (lines starting with * or //)
if git grep -n 'strictness' -- 'packages/crypto/src/**' ':!node_modules' | grep -v '^\S*:\s*//' | grep -v '^\S*:\s*\*' | grep .; then
  echo "FAIL: strictness found in @peac/crypto (belongs in @peac/protocol only)"
  bad=1
else
  echo "OK"
fi

echo "== JOSE hardening present (DD-156) =="
# b64 and zip rejection must be present in jws.ts
if ! git grep -q 'b64' -- 'packages/crypto/src/jws.ts'; then
  echo "FAIL: b64 rejection not found in jws.ts"
  bad=1
elif ! git grep -q 'zip' -- 'packages/crypto/src/jws.ts'; then
  echo "FAIL: zip rejection not found in jws.ts"
  bad=1
else
  echo "OK"
fi

echo "== WIRE_01_JWS_TYP uniqueness =="
# WIRE_01_JWS_TYP must be defined (export const) exactly once in kernel constants
WIRE01_DEF_COUNT=$(git grep -c 'export const WIRE_01_JWS_TYP' -- 'packages/kernel/src/constants.ts' | cut -d: -f2)
if [ "${WIRE01_DEF_COUNT:-0}" -ne 1 ]; then
  echo "FAIL: WIRE_01_JWS_TYP defined ${WIRE01_DEF_COUNT:-0} times in kernel constants (expected exactly 1)"
  bad=1
else
  echo "OK"
fi

echo "== release-state-coherence (committed artifacts) =="
# Verify committed release manifest agrees with committed source-of-truth files.
# This section checks ONLY committed artifacts (CI-visible), not gitignored reference docs.
RELEASE_MANIFEST="docs/releases/current.json"
if [ -f "$RELEASE_MANIFEST" ]; then
  MANIFEST_VER=$(node -e "console.log(require('./$RELEASE_MANIFEST').version)")
  ROOT_VER=$(node -e "console.log(require('./package.json').version)")
  REG_VER=$(node -e "console.log(require('./specs/kernel/registries.json').version)")
  ERR_VER=$(node -e "console.log(require('./specs/kernel/errors.json').version)")
  MANIFEST_REG_VER=$(node -e "console.log(require('./$RELEASE_MANIFEST').registries_version)")
  MANIFEST_ERR_VER=$(node -e "console.log(require('./$RELEASE_MANIFEST').errors_version)")
  MANIFEST_WIRE_VER=$(node -e "console.log(require('./$RELEASE_MANIFEST').wire_format_version)")
  MANIFEST_DIST_TAG=$(node -e "console.log(require('./$RELEASE_MANIFEST').dist_tag)")

  coh_bad=0
  if [ "$MANIFEST_VER" != "$ROOT_VER" ]; then
    echo "  FAIL: manifest version ($MANIFEST_VER) != package.json ($ROOT_VER)"
    coh_bad=1
  fi
  if [ "$MANIFEST_REG_VER" != "$REG_VER" ]; then
    echo "  FAIL: manifest registries_version ($MANIFEST_REG_VER) != registries.json ($REG_VER)"
    coh_bad=1
  fi
  if [ "$MANIFEST_ERR_VER" != "$ERR_VER" ]; then
    echo "  FAIL: manifest errors_version ($MANIFEST_ERR_VER) != errors.json ($ERR_VER)"
    coh_bad=1
  fi
  # wire_format_version must be 0.1 or 0.2
  case "$MANIFEST_WIRE_VER" in
    0.1|0.2) ;;
    *) echo "  FAIL: manifest wire_format_version ($MANIFEST_WIRE_VER) not a known value (0.1, 0.2)"
       coh_bad=1 ;;
  esac
  # dist_tag must be a known npm dist-tag
  case "$MANIFEST_DIST_TAG" in
    latest|next|beta|alpha|rc) ;;
    *) echo "  FAIL: manifest dist_tag ($MANIFEST_DIST_TAG) not a known value (latest, next, beta, alpha, rc)"
       coh_bad=1 ;;
  esac
  if [ "$coh_bad" -eq 0 ]; then
    echo "OK"
  else
    bad=1
  fi
else
  echo "SKIP: $RELEASE_MANIFEST not found"
fi

exit $bad