/**
 * WASM vs TypeScript Performance Benchmark
 *
 * Measures per-operation latency with proper warmup
 * Run across Node, Bun, Deno, Cloudflare Workers
 */

import { performance } from 'node:perf_hooks';
import * as ts from './ts-baseline.mjs';
import * as wasm from '../../core/src/wasm.ts';

const N = 50_000;
const WARMUP = 10_000;

// Test data
const obj = { z: 1, a: 2, arr: [3, 1, 2], nested: { b: 2, a: 1 } };
const url = 'HTTP://ExAmPlE.com:80/../a/./b/?y=2&x=1#frag';
const selector = '  div [data-X="Y" ] //a[ 2 ] ';

function warmup(fn) {
  for (let i = 0; i < WARMUP; i++) fn();
}

function bench(label, fn) {
  warmup(fn);
  const t0 = performance.now();
  for (let i = 0; i < N; i++) fn();
  const t1 = performance.now();
  const perOp = ((t1 - t0) / N).toFixed(6);
  return { label, perOp: parseFloat(perOp) };
}

async function benchAsync(label, fn) {
  // Warmup
  for (let i = 0; i < WARMUP; i++) await fn();

  const t0 = performance.now();
  for (let i = 0; i < N; i++) await fn();
  const t1 = performance.now();
  const perOp = ((t1 - t0) / N).toFixed(6);
  return { label, perOp: parseFloat(perOp) };
}

async function main() {
  console.log('=== WASM vs TypeScript Benchmark ===');
  console.log(`Runtime: Node.js ${process.version}`);
  console.log(`Iterations: ${N.toLocaleString()} (after ${WARMUP.toLocaleString()} warmup)`);
  console.log('');

  // Initialize WASM
  await wasm.initWasm();
  console.log('WASM initialized\n');

  const results = [];

  // canonicalize_json
  console.log('## canonicalize_json');
  const tsCanon = bench('TS canonicalize_json', () => ts.canonicalize_json(obj));
  const wasmCanon = await benchAsync('WASM canonicalize_json', () =>
    wasm.canonicalizeJson(obj)
  );
  const canonSpeedup = (tsCanon.perOp / wasmCanon.perOp).toFixed(2);
  console.log(
    `${tsCanon.label.padEnd(28)} ${tsCanon.perOp.toFixed(6)} ms/op`
  );
  console.log(
    `${wasmCanon.label.padEnd(28)} ${wasmCanon.perOp.toFixed(6)} ms/op (${canonSpeedup}× faster)`
  );
  console.log('');
  results.push({ op: 'canonicalize_json', ts: tsCanon.perOp, wasm: wasmCanon.perOp, speedup: canonSpeedup });

  // normalize_url
  console.log('## normalize_url');
  const tsUrl = bench('TS normalize_url', () => ts.normalize_url(url));
  const wasmUrl = await benchAsync('WASM normalize_url', () => wasm.normalizeUrl(url));
  const urlSpeedup = (tsUrl.perOp / wasmUrl.perOp).toFixed(2);
  console.log(`${tsUrl.label.padEnd(28)} ${tsUrl.perOp.toFixed(6)} ms/op`);
  console.log(
    `${wasmUrl.label.padEnd(28)} ${wasmUrl.perOp.toFixed(6)} ms/op (${urlSpeedup}× faster)`
  );
  console.log('');
  results.push({ op: 'normalize_url', ts: tsUrl.perOp, wasm: wasmUrl.perOp, speedup: urlSpeedup });

  // normalize_selector
  console.log('## normalize_selector');
  const tsSelector = bench('TS normalize_selector', () => ts.normalize_selector(selector));
  const wasmSelector = await benchAsync('WASM normalize_selector', () =>
    wasm.normalizeSelector(selector)
  );
  const selectorSpeedup = (tsSelector.perOp / wasmSelector.perOp).toFixed(2);
  console.log(
    `${tsSelector.label.padEnd(28)} ${tsSelector.perOp.toFixed(6)} ms/op`
  );
  console.log(
    `${wasmSelector.label.padEnd(28)} ${wasmSelector.perOp.toFixed(6)} ms/op (${selectorSpeedup}× faster)`
  );
  console.log('');
  results.push({ op: 'normalize_selector', ts: tsSelector.perOp, wasm: wasmSelector.perOp, speedup: selectorSpeedup });

  // jcs_sha256
  console.log('## jcs_sha256');
  const tsHash = bench('TS jcs_sha256', () => ts.jcs_sha256(obj));
  const wasmHash = await benchAsync('WASM jcs_sha256', () => wasm.jcsSha256(obj));
  const hashSpeedup = (tsHash.perOp / wasmHash.perOp).toFixed(2);
  console.log(`${tsHash.label.padEnd(28)} ${tsHash.perOp.toFixed(6)} ms/op`);
  console.log(
    `${wasmHash.label.padEnd(28)} ${wasmHash.perOp.toFixed(6)} ms/op (${hashSpeedup}× faster)`
  );
  console.log('');
  results.push({ op: 'jcs_sha256', ts: tsHash.perOp, wasm: wasmHash.perOp, speedup: hashSpeedup });

  // Summary
  console.log('=== Summary ===');
  console.log('');
  console.log('| Operation          | TS (ms/op) | WASM (ms/op) | Speedup |');
  console.log('|--------------------|------------|--------------|---------|');
  results.forEach((r) => {
    console.log(
      `| ${r.op.padEnd(18)} | ${r.ts.toFixed(6).padStart(10)} | ${r.wasm.toFixed(6).padStart(12)} | ${r.speedup.padStart(7)}× |`
    );
  });
  console.log('');

  // Check for 10× target
  const allAbove10x = results.every((r) => parseFloat(r.speedup) >= 10);
  console.log(`Target (≥10× faster): ${allAbove10x ? '✓ PASS' : '✗ FAIL'}`);
  console.log('');

  process.exit(allAbove10x ? 0 : 1);
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
