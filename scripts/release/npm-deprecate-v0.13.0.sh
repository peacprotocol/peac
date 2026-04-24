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
# Dry run: NPM_DEPRECATE_DRY_RUN=1 ./scripts/release/npm-deprecate-v0.13.0.sh
#
# Requires: authenticated npm session with publish rights to the @peac scope
# (typically the release maintainer). CI does not run this; it is a manual
# post-promote step and should be documented in the release-flow checklist.

set -euo pipefail

if [ "${NPM_DEPRECATE_DRY_RUN:-0}" = "1" ]; then
  NPM="echo [DRY-RUN] npm"
else
  NPM="npm"
fi

echo "=== v0.13.0 npm deprecate dispatch (staged; execute only post-promote) ==="
echo

#
# @peac/pref: archived in v0.13.0; not published at 0.13.0 or later.
# Historical versions <=0.12.14 remain installable. Migration: @peac/mappings-content-signals.
#
echo "-- @peac/pref (archived; historical <=0.12.14 kept; not published 0.13.0+) --"
$NPM deprecate '@peac/pref@<=0.12.14' \
  'ARCHIVED in v0.13.0. Use @peac/mappings-content-signals directly for RFC 9651 Structured Fields content-signal parsing and resolution. See https://peacprotocol.org/docs/migration.'

#
# @peac/sdk (workspace stub `@peac/sdk-js`): archived prior to v0.13.0; no 0.13.0 publication.
# Historical versions remain installable.
#
echo
echo "-- @peac/sdk (workspace stub archived previously; no 0.13.0 publication) --"
$NPM deprecate '@peac/sdk@<=0.10.2' \
  'ARCHIVED. Use @peac/protocol (issue / verifyLocal / verify), @peac/schema (types), @peac/crypto (sign/verify), @peac/kernel (constants). See https://peacprotocol.org/docs/migration.'

#
# @peac/disc: one-release deprecated alias. PUBLISHED at 0.13.0 as a
# compatibility bridge so existing workspace consumers (@peac/cli, apps/api)
# keep publish closure. Historical versions <=0.12.14 deprecated; the
# 0.13.0 version is explicitly marked as a one-release bridge. External
# consumers upgrading to @peac/cli@0.13.0 will transitively install
# @peac/disc@0.13.0 and see a one-shot PEAC_DISC_DEPRECATED warning.
#
echo
echo "-- @peac/disc (one-release compatibility bridge; deprecate historical AND 0.13.0) --"
# Deprecation messages intentionally do NOT tell every caller to switch to
# loadPolicyDocument. @peac/policy-kit is the canonical replacement for
# policy-document parsing / validation, but @peac/disc.discover() (remote
# SSRF-aware fetch with byte cap / timeout / redirect policy) has no direct
# equivalent in @peac/policy-kit. Callers that need discover() should stay on
# @peac/disc@0.13.0 through the v0.13.0 release window.
$NPM deprecate '@peac/disc@<=0.12.14' \
  'Deprecated. Use @peac/policy-kit for policy-document parsing and validation (parsePolicyDocument, loadPolicyDocument, validatePolicy, serializePolicyYaml). Remote discovery remains compatibility-only in @peac/disc@0.13.0. See https://peacprotocol.org/docs/migration.'
$NPM deprecate '@peac/disc@0.13.0' \
  'One-release deprecated compatibility package. Prefer @peac/policy-kit for policy-document parsing and validation. See https://peacprotocol.org/docs/migration.'

#
# @peac/core: archive coupled with legacy /verify handler rewire. If that
# change ships in the same v0.13.0 release window, add the deprecate line
# below after it merges but before promote-latest. Left commented out as a
# staging marker.
#
# echo
# echo "-- @peac/core (archive; coupled with legacy /verify handler rewire) --"
# $NPM deprecate '@peac/core@<=0.9.14' \
#   'ARCHIVED in v0.13.0. Verify-only for historical 0.9-series receipt records. Use @peac/protocol + @peac/schema + @peac/crypto + @peac/kernel. See https://peacprotocol.org/docs/migration.'

echo
echo "=== complete ==="
