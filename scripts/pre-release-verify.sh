#!/usr/bin/env bash
set -euo pipefail

# PEAC Pre-Release Verification Script
# Run this before tagging any release to ensure wire protocol compliance
# Usage: ./scripts/pre-release-verify.sh

WIRE_VERSION="${WIRE_VERSION:-0.9}"
IMPLEMENTATION_VERSION="${IMPLEMENTATION_VERSION:-0.9.14}"

echo "PEAC Pre-Release Verification - v${IMPLEMENTATION_VERSION}"
echo "============================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track failures
FAILURES=0

# Helper to check test results
check_result() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[OK]${NC} $1"
    else
        echo -e "${RED}[FAIL]${NC} $1"
        FAILURES=$((FAILURES + 1))
    fi
}

# Build everything first
echo -e "\nBuilding packages..."
pnpm -w build && pnpm --filter ./apps/api build
check_result "Build completed"

# Kill any existing bridge
echo -e "\nCleaning up existing processes..."
lsof -ti:31415 | xargs kill -9 2>/dev/null || true
lsof -ti:31416 | xargs kill -9 2>/dev/null || true
sleep 1

# Start bridge with metrics
echo -e "\nStarting bridge with metrics..."
PEAC_ENABLE_METRICS=1 node packages/cli/bin/peac.js bridge start --mode=test --port=31415 &
BRIDGE_PID=$!
sleep 3

# Function to cleanup on exit
cleanup() {
    echo -e "\nCleaning up..."
    kill $BRIDGE_PID 2>/dev/null || true
    lsof -ti:31415 | xargs kill -9 2>/dev/null || true
    lsof -ti:31416 | xargs kill -9 2>/dev/null || true
}
trap cleanup EXIT

echo -e "\nWire Protocol Compliance Checks"
echo "-----------------------------------"

# 1. Headers & media types
echo -e "\n[1] Testing wire version headers..."
for endpoint in /health /ready; do
    curl -sI 127.0.0.1:31415$endpoint | grep -qi "peac-version: ${WIRE_VERSION}"
    check_result "GET $endpoint has peac-version: ${WIRE_VERSION}"
done

# 2. HEAD /health support
curl -sI -X HEAD 127.0.0.1:31415/health | grep -qi "peac-version: ${WIRE_VERSION}"
check_result "HEAD /health has peac-version: ${WIRE_VERSION}"

# 3. Enforce allow path
echo -e "\n[2] Testing enforce allow path..."
RESPONSE=$(curl -sD - 127.0.0.1:31415/enforce -H 'content-type: application/json' \
    --data '{"resource":"https://example.com/data","purpose":"read"}' -o /dev/null)

echo "$RESPONSE" | grep -qi 'content-type: application/peac+json'
check_result "Enforce success returns application/peac+json"

echo "$RESPONSE" | grep -qi '^PEAC-Receipt:'
check_result "Enforce success includes PEAC-Receipt header"

echo "$RESPONSE" | grep -qi 'cache-control: no-store'
check_result "Enforce success has cache-control: no-store"

# 4. Verify error handling
echo -e "\n[3] Testing verify error handling..."
VERIFY_RESPONSE=$(curl -sD - 127.0.0.1:31415/verify -H 'content-type: application/json' \
    --data '{"receipt":null,"resource":"https://example.com"}' -o /dev/null)

echo "$VERIFY_RESPONSE" | grep -qi 'HTTP/1.1 400'
check_result "Verify with null receipt returns 400"

echo "$VERIFY_RESPONSE" | grep -qi 'application/problem+json'
check_result "Verify error returns application/problem+json"

# 5. Metrics endpoint
echo -e "\n[4] Testing metrics endpoint..."
METRICS_HEADERS=$(curl -sD - 127.0.0.1:31416/metrics -o /dev/null)

echo "$METRICS_HEADERS" | grep -qi '^content-type: text/plain; version=0.0.4; charset=utf-8'
check_result "Metrics has correct content-type"

echo "$METRICS_HEADERS" | grep -qi "^peac-version: ${WIRE_VERSION}"
check_result "Metrics has peac-version header"

echo "$METRICS_HEADERS" | grep -qi '^cache-control: no-cache'
check_result "Metrics has cache-control: no-cache"

# Check metrics values
METRICS_DATA=$(curl -s 127.0.0.1:31416/metrics)
echo "$METRICS_DATA" | grep -q 'peac_enforce_requests_total'
check_result "Metrics includes enforce counter"

echo "$METRICS_DATA" | grep -q 'peac_verify_requests_total'
check_result "Metrics includes verify counter"

# 6. Readiness checks
echo -e "\n[5] Testing readiness endpoint..."
READY_RESPONSE=$(curl -s 127.0.0.1:31415/ready)

echo "$READY_RESPONSE" | jq -e '.checks.api_verifier_loaded' >/dev/null
check_result "Readiness includes api_verifier_loaded check"

echo "$READY_RESPONSE" | jq -e '.checks.core_loaded' >/dev/null
check_result "Readiness includes core_loaded check"

# 7. No legacy headers
echo -e "\n[6] Checking for legacy headers..."
! grep -r "X-PEAC-" apps/bridge/src --include="*.ts" 2>/dev/null
check_result "No X-PEAC-* headers in bridge source"

# Run smoke tests
echo -e "\n[7] Running smoke tests..."
node --test test/smoke/enforce.test.js 2>&1 | tail -n 10 | grep -q "# pass 7"
check_result "All 7 enforce smoke tests passing"

# Final summary
echo -e "\n======================================"
if [ $FAILURES -eq 0 ]; then
    echo -e "${GREEN}[OK] ALL CHECKS PASSED!${NC}"
    echo -e "Ready to tag and release v${IMPLEMENTATION_VERSION}"
    echo -e "\nNext steps:"
    echo "1. Commit all changes"
    echo "2. Push to remote: git push origin release/v${IMPLEMENTATION_VERSION}"
    echo "3. Create PR and merge to main"
    echo "4. Tag release: git tag -a v${IMPLEMENTATION_VERSION} -m \"PEAC Bridge v${IMPLEMENTATION_VERSION}\""
    echo "5. Push tag: git push origin v${IMPLEMENTATION_VERSION}"
else
    echo -e "${RED}[FAIL] FAILED: $FAILURES checks did not pass${NC}"
    echo -e "Please fix the issues above before releasing"
    exit 1
fi