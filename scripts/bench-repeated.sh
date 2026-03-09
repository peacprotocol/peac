#!/usr/bin/env bash
set -euo pipefail

# Repeated-run benchmark aggregation (DD-159 follow-up)
#
# Runs the Wire 0.2 SLO gate N times (default 5), collects JSON metrics
# from each run, and aggregates cross-run statistics (median, min, max p95).
#
# Output: writes aggregated results to tests/perf/repeated-results.json
# (or the path specified by --output).
#
# Usage:
#   bash scripts/bench-repeated.sh
#   bash scripts/bench-repeated.sh --runs 10
#   bash scripts/bench-repeated.sh --output /tmp/bench.json
#
# Flags:
#   --runs <N>       Number of runs (default: 5)
#   --output <path>  Output file path (default: tests/perf/repeated-results.json)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

RUNS=5
OUTPUT="tests/perf/repeated-results.json"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --runs)
      RUNS="$2"
      shift 2
      ;;
    --output)
      OUTPUT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--runs <N>] [--output <path>]" >&2
      exit 1
      ;;
  esac
done

TEMP_DIR=$(mktemp -d)
cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

echo "=== Repeated Benchmark Run ==="
echo "  Runs: $RUNS"
echo "  Output: $OUTPUT"
echo ""

FAILED_RUNS=0

for i in $(seq 1 "$RUNS"); do
  JSON_FILE="$TEMP_DIR/run-${i}.json"
  echo -n "  Run $i/$RUNS... "
  if PEAC_BENCH_JSON="$JSON_FILE" pnpm exec vitest run tests/perf/wire02-slo.test.ts --reporter=dot > /dev/null 2>&1; then
    if [ -f "$JSON_FILE" ]; then
      echo "OK"
    else
      echo "PASS (no JSON output)"
      FAILED_RUNS=$((FAILED_RUNS + 1))
    fi
  else
    echo "FAIL (SLO gate failed)"
    FAILED_RUNS=$((FAILED_RUNS + 1))
  fi
done

echo ""

if [ "$FAILED_RUNS" -eq "$RUNS" ]; then
  echo "ERROR: All $RUNS runs failed. No results to aggregate."
  exit 1
fi

# Aggregate results
node -e '
  const fs = require("fs");
  const path = require("path");
  const os = require("os");

  const tempDir = process.argv[1];
  const runs = parseInt(process.argv[2], 10);
  const outputPath = process.argv[3];

  const results = [];
  for (let i = 1; i <= runs; i++) {
    const file = path.join(tempDir, `run-${i}.json`);
    if (fs.existsSync(file)) {
      results.push(JSON.parse(fs.readFileSync(file, "utf-8")));
    }
  }

  if (results.length === 0) {
    console.error("No valid run results found.");
    process.exit(1);
  }

  function median(arr) {
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
  }

  function aggregate(key) {
    const values = results
      .filter(r => r.metrics && r.metrics[key])
      .map(r => r.metrics[key]);
    if (values.length === 0) return null;
    const p95s = values.map(v => v.p95_ms);
    const p50s = values.map(v => v.p50_ms);
    const means = values.map(v => v.mean_ms);
    return {
      runs: values.length,
      iterations_per_run: values[0].iterations,
      p95_ms: {
        median: +median(p95s).toFixed(4),
        min: +Math.min(...p95s).toFixed(4),
        max: +Math.max(...p95s).toFixed(4),
        values: p95s.map(v => +v.toFixed(4)),
      },
      p50_ms: {
        median: +median(p50s).toFixed(4),
        min: +Math.min(...p50s).toFixed(4),
        max: +Math.max(...p50s).toFixed(4),
      },
      mean_ms: {
        median: +median(means).toFixed(4),
        min: +Math.min(...means).toFixed(4),
        max: +Math.max(...means).toFixed(4),
      },
    };
  }

  const output = {
    timestamp: new Date().toISOString(),
    node_version: process.version,
    platform: `${process.platform}-${process.arch}`,
    cpu: os.cpus()[0] ? os.cpus()[0].model : "unknown",
    total_runs: runs,
    successful_runs: results.length,
    git_ref: "unknown",
    peac_version: "unknown",
    verifyLocal: aggregate("verifyLocal"),
    issueWire02: aggregate("issueWire02"),
  };

  // Try to fill in git ref and version
  try {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
    output.peac_version = pkg.version || "unknown";
  } catch {}
  try {
    const { execSync } = require("child_process");
    output.git_ref = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {}

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n");
  console.log("--- Aggregated Results ---");
  if (output.verifyLocal) {
    console.log(`  verifyLocal p95: median=${output.verifyLocal.p95_ms.median}ms, range=[${output.verifyLocal.p95_ms.min}, ${output.verifyLocal.p95_ms.max}]ms (${output.verifyLocal.runs} runs)`);
  }
  if (output.issueWire02) {
    console.log(`  issueWire02 p95: median=${output.issueWire02.p95_ms.median}ms, range=[${output.issueWire02.p95_ms.min}, ${output.issueWire02.p95_ms.max}]ms (${output.issueWire02.runs} runs)`);
  }
  console.log(`  Output: ${outputPath}`);
' "$TEMP_DIR" "$RUNS" "$OUTPUT"

echo ""
echo "=== Repeated Benchmark Complete ==="
