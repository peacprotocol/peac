#!/usr/bin/env bash
set -euo pipefail

echo "=== PEAC v0.9.15 Readiness Check ==="
echo ""

echo "== 1. Toolchain Verification =="
echo "Rust: $(rustc --version 2>/dev/null || echo '❌ MISSING')"
echo "wasm-pack: $(wasm-pack --version 2>/dev/null || echo '❌ MISSING')"
echo "Node.js: $(node -v)"
echo "pnpm: $(pnpm -v)"
echo "Bun: $(bun --version 2>/dev/null || echo '⚠️  MISSING (optional)')"
echo "Deno: $(deno --version 2>/dev/null | head -1 || echo '⚠️  MISSING (optional)')"

echo ""
echo "== 2. Bundle Size Baseline =="
if [ -d "packages/core/dist" ]; then
  echo "Core package build artifacts:"
  du -sh packages/core/dist/* 2>/dev/null | grep -E '\.(mjs|js|cjs)$' || echo "No JS bundles found"
else
  echo "⚠️  Core not built - building now..."
  (cd packages/core && pnpm build --silent)
  du -sh packages/core/dist/* 2>/dev/null | grep -E '\.(mjs|js|cjs)$'
fi

echo ""
echo "== 3. Performance Baseline (TS canonicalization) =="
node -e '
const runs = 20000;
const obj = {z: 1, a: 2, m: {c: 3, b: 4}};
const start = Date.now();
for(let i = 0; i < runs; i++) {
  JSON.stringify(obj);
}
const elapsed = Date.now() - start;
const perOp = (elapsed / runs).toFixed(4);
console.log(`TS JSON.stringify (${runs} ops): ${elapsed}ms total, ${perOp}ms per op`);
console.log(`Target for WASM: ≤${(perOp / 10).toFixed(5)}ms per op (10× faster)`);
'

echo ""
echo "== 4. Git State =="
echo "Branch: $(git branch --show-current)"
echo "Commit: $(git log --oneline -1)"

echo ""
echo "✓ Readiness check complete"
