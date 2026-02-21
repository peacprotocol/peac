#!/usr/bin/env bash
set -euo pipefail

# Forbid certain strings in tracked files
# This script is called by CI to enforce repo-wide rules
#
# HARD FAILURES (exit 1):
#   - Literal "IETF" in tracked files (except CLAUDE.md which documents the rule)
#   - RFC aspiration patterns: RFC-ready, RFC ready, RFC milestone, RFC target, RFC submission
#   - Any emojis (warning, checkmark, rocket, fire, robot, bullseye, star, etc.)
#   - Em dashes (use -- or - instead)
#   - @peac/declare (use @peac/policy-kit)
#   - x-peac headers (use PEAC-Receipt)
#
# ALLOWED:
#   - External RFC references: "RFC 8032", "RFC 9457", "RFC 2119", etc.

echo "Checking for forbidden strings in tracked files..."

failed=0

# Get list of tracked files (excluding archive, node_modules, and binary files)
get_tracked_files() {
  git ls-files | grep -v '^archive/' | grep -v 'node_modules' | grep -v '\.png$' | grep -v '\.jpg$' | grep -v '\.gif$' | grep -v '\.ico$' | grep -v '\.woff' | grep -v '\.ttf$' | grep -v '\.eot$'
}

# =============================================================================
# CHECK 1: IETF mentions (HARD FAILURE)
# =============================================================================
# Block "IETF" as internal goal language, but allow in URLs (external RFC refs)
# CLAUDE.md is allowed because it documents this rule
echo "Checking for IETF mentions..."
# First find files with IETF
ietf_files=$(get_tracked_files | xargs grep -il 'IETF' 2>/dev/null || true)
if [ -n "$ietf_files" ]; then
  for file in $ietf_files; do
    # Skip allowed files
    if [[ "$file" == *"CLAUDE.md"* ]] || [[ "$file" == *"forbid-strings.sh"* ]]; then
      continue
    fi
    # Check if IETF appears outside of URLs or as a legitimate standard reference.
    # Allowed: datatracker/doc/rfc-editor URLs; IETF AIPREF (external standard we map);
    # IETF-aligned / IETF draft (technical descriptions); IETF protocol (e.g. protocol
    # assignments in network code); RFC/IETF conventions (comment describing error codes).
    non_url_ietf=$(grep -i 'IETF' "$file" 2>/dev/null \
      | grep -v 'datatracker\.ietf\.org' \
      | grep -v 'ietf\.org/doc' \
      | grep -v 'rfc-editor\.org' \
      | grep -iv 'IETF AIPREF' \
      | grep -iv 'IETF-aligned\|IETF aligned' \
      | grep -iv 'IETF draft\|IETF protocol\|RFC/IETF\|RFC\/IETF\|IETF [Nn]ormative' \
      || true)
    if [ -n "$non_url_ietf" ]; then
      echo "ERROR: Found 'IETF' (non-URL, non-standard-ref) in tracked file: $file"
      echo "$non_url_ietf"
      failed=1
    fi
  done
fi

# =============================================================================
# CHECK 2: RFC aspiration patterns (HARD FAILURE)
# =============================================================================
# Block phrases that treat RFC as an internal milestone
# External RFC references like "RFC 8032" are allowed
echo "Checking for RFC aspiration patterns..."
RFC_ASPIRATION_PATTERNS=(
  "RFC-ready"
  "RFC ready"
  "RFC-track"
  "RFC track"
  "RFC milestone"
  "RFC target"
  "RFC submission"
)
for pattern in "${RFC_ASPIRATION_PATTERNS[@]}"; do
  matches=$(get_tracked_files | xargs grep -il "$pattern" 2>/dev/null || true)
  if [ -n "$matches" ]; then
    filtered=$(echo "$matches" | grep -v 'CLAUDE.md' | grep -v 'forbid-strings.sh' || true)
    if [ -n "$filtered" ]; then
      echo "ERROR: Found RFC aspiration '$pattern' in tracked files:"
      echo "$filtered"
      failed=1
    fi
  fi
done

# =============================================================================
# CHECK 3: Emojis (HARD FAILURE)
# =============================================================================
# Block all common emojis - no emojis allowed in committed files
echo "Checking for emojis..."

# Files that legitimately contain emoji as test data (Unicode boundary tests,
# JSON canonicalization vectors). Do NOT add source files here.
EMOJI_TEST_ALLOWLIST='jcs-golden-vectors\.json\|verify\.test\.ts'

# Check each emoji pattern separately
check_emoji() {
  local emoji_bytes="$1"
  local emoji_name="$2"
  local matches
  matches=$(get_tracked_files | xargs grep -l "$emoji_bytes" 2>/dev/null \
    | grep -v "$EMOJI_TEST_ALLOWLIST" || true)
  if [ -n "$matches" ]; then
    echo "ERROR: Found emoji ($emoji_name) in tracked files:"
    echo "$matches"
    failed=1
  fi
}

# Warning sign
check_emoji $'\xe2\x9a\xa0' "warning sign"
# Check mark
check_emoji $'\xe2\x9c\x85' "check mark"
# Rocket
check_emoji $'\xf0\x9f\x9a\x80' "rocket"
# Fire
check_emoji $'\xf0\x9f\x94\xa5' "fire"
# Robot
check_emoji $'\xf0\x9f\xa4\x96' "robot"
# Bullseye
check_emoji $'\xf0\x9f\x8e\xaf' "bullseye"
# Star
check_emoji $'\xe2\xad\x90' "star"
# Soon arrow
check_emoji $'\xf0\x9f\x94\x9c' "soon arrow"
# Clipboard
check_emoji $'\xf0\x9f\x93\x8b' "clipboard"
# Link
check_emoji $'\xf0\x9f\x94\x97' "link"
# Shield
check_emoji $'\xf0\x9f\x9b\xa1' "shield"
# Pushpin
check_emoji $'\xf0\x9f\x94\x8c' "pushpin"
# Palette
check_emoji $'\xf0\x9f\x8e\xa8' "palette"
# Sparkles
check_emoji $'\xe2\x9c\xa8' "sparkles"
# Party popper
check_emoji $'\xf0\x9f\x8e\x89' "party popper"
# Thumbs up
check_emoji $'\xf0\x9f\x91\x8d' "thumbs up"
# Red X
check_emoji $'\xe2\x9d\x8c' "red X"
# Green check
check_emoji $'\xe2\x9c\x94' "green check"
# Arrow right
check_emoji $'\xe2\x9e\xa1' "arrow right"
# Lightning
check_emoji $'\xe2\x9a\xa1' "lightning"
# Package
check_emoji $'\xf0\x9f\x93\xa6' "package"
# Wrench
check_emoji $'\xf0\x9f\x94\xa7' "wrench"
# Gear
check_emoji $'\xe2\x9a\x99' "gear"
# Lock
check_emoji $'\xf0\x9f\x94\x92' "lock"
# Key
check_emoji $'\xf0\x9f\x94\x91' "key"
# Eyes
check_emoji $'\xf0\x9f\x91\x80' "eyes"
# Light bulb
check_emoji $'\xf0\x9f\x92\xa1' "light bulb"

# =============================================================================
# CHECK 4: Em dashes (HARD FAILURE)
# =============================================================================
# Block Unicode em dash - use -- or - instead
echo "Checking for em dashes..."
EM_DASH=$'\xe2\x80\x94'
matches=$(get_tracked_files | xargs grep -l "$EM_DASH" 2>/dev/null || true)
if [ -n "$matches" ]; then
  # Allow in CHANGELOG and LICENSE (may have imported content)
  filtered=$(echo "$matches" | grep -v 'CHANGELOG' | grep -v 'LICENSE' || true)
  if [ -n "$filtered" ]; then
    echo "ERROR: Found em dashes in tracked files (use -- or - instead):"
    echo "$filtered"
    failed=1
  fi
fi

# =============================================================================
# CHECK 5: @peac/declare (HARD FAILURE)
# =============================================================================
# Block deprecated package name - use @peac/policy-kit
echo "Checking for deprecated @peac/declare..."
matches=$(get_tracked_files | grep -v 'forbid-strings\.sh' | xargs grep -l '@peac/declare' 2>/dev/null || true)
if [ -n "$matches" ]; then
  echo "ERROR: Found @peac/declare in tracked files (use @peac/policy-kit instead):"
  echo "$matches"
  failed=1
fi

# =============================================================================
# CHECK 6: x-peac headers (HARD FAILURE)
# =============================================================================
# Block legacy x-peac headers - use PEAC-Receipt
echo "Checking for legacy x-peac headers..."
matches=$(get_tracked_files | grep -E '\.(ts|js|tsx|jsx)$' | xargs grep -il 'x-peac' 2>/dev/null || true)
if [ -n "$matches" ]; then
  echo "ERROR: Found x-peac headers in source files (use PEAC-Receipt instead):"
  echo "$matches"
  failed=1
fi

# =============================================================================
# FINAL RESULT
# =============================================================================
if [ "$failed" -eq 1 ]; then
  echo ""
  echo "FAIL: Forbidden strings detected. Fix the issues above before committing."
  exit 1
fi

echo "OK: No forbidden strings detected."
