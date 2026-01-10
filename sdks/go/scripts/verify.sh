#!/bin/bash
# verify.sh - Run all CI checks locally before pushing
#
# Usage: ./scripts/verify.sh
#
# This script runs the same checks as CI to catch issues before push.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Go SDK Local Verification ==="
echo ""

# Format check
echo "Checking format..."
cd "$SDK_DIR"
if [ -n "$(gofmt -l .)" ]; then
    echo "FAIL: The following files are not formatted:"
    gofmt -l .
    echo ""
    echo "Run: gofmt -w ."
    exit 1
fi
echo "OK: Format check passed"
echo ""

# Build core
echo "Building core module..."
go build ./...
echo "OK: Core build passed"
echo ""

# Test core
echo "Testing core module..."
go test ./... -count=1
echo "OK: Core tests passed"
echo ""

# Race detection
echo "Running race detector..."
go test -race ./... -count=1
echo "OK: Race detection passed"
echo ""

# Build and test middleware/chi (using workspace)
if [ -d "$SDK_DIR/middleware/chi" ]; then
    echo "Building middleware/chi..."
    cd "$SDK_DIR/middleware/chi"
    GOWORK="$SDK_DIR/go.work" go build ./...
    GOWORK="$SDK_DIR/go.work" go test ./... -count=1
    echo "OK: middleware/chi passed"
    echo ""
fi

# Build and test middleware/gin (using workspace)
if [ -d "$SDK_DIR/middleware/gin" ]; then
    echo "Building middleware/gin..."
    cd "$SDK_DIR/middleware/gin"
    GOWORK="$SDK_DIR/go.work" go build ./...
    GOWORK="$SDK_DIR/go.work" go test ./... -count=1
    echo "OK: middleware/gin passed"
    echo ""
fi

# Fuzz test (quick)
echo "Running fuzz test (10s)..."
cd "$SDK_DIR"
go test ./evidence -run=^$ -fuzz=^FuzzValidate$ -fuzztime=10s
echo "OK: Fuzz test passed"
echo ""

echo "=== All checks passed ==="
