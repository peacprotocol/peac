import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { VerifierV13 } from '../apps/api/src/verifier.js';

function p95(nums: number[]) {
  const i = Math.floor(nums.length * 0.95);
  return nums.sort((a, b) => a - b)[i];
}

async function main() {
  const dir = 'tests/golden/receipt-vectors';
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'jwks.json')
    .map((f) => path.join(dir, f));

  if (files.length < 100) {
    console.error(`Need ≥100 vectors, have ${files.length}`);
    process.exit(1);
  }

  const verifier = new VerifierV13();

  const times: number[] = [];
  let ok = 0;

  for (const f of files) {
    const v = JSON.parse(fs.readFileSync(f, 'utf8'));
    const t0 = performance.now();
    const res = await verifier.verify({ receipt: v.jws });
    const t1 = performance.now();

    times.push(t1 - t0);
    if (res && res.status === 200) ok++;
  }

  const p95ms = p95(times);
  const throughput = Math.floor(ok / (times.reduce((a, b) => a + b, 0) / 1000));

  const fails: string[] = [];
  if (p95ms >= 5) fails.push(`verify p95 ${p95ms.toFixed(2)}ms ≥ 5ms`);
  if (throughput < 1000) fails.push(`throughput ${throughput} < 1000 rps`);

  if (fails.length) {
    console.error('Perf violations:\n- ' + fails.join('\n- '));
    process.exit(1);
  }

  console.log(
    `verify p95=${p95ms.toFixed(2)}ms, throughput=${throughput}/s, ok=${ok}/${files.length}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
