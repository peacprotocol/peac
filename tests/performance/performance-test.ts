/**
 * @peac/core v0.9.12.1 - Performance validation suite
 * Validates against SLOs: sign p95≤3ms, verify p95≤1ms, throughput≥1000 rps
 *
 * @deprecated Legacy performance test with stale imports. See v0.9.15+ tests.
 */

// @ts-expect-error Legacy path - pkgs renamed to packages
import { signReceipt, verifyReceipt } from '../../pkgs/core/src/sign.js';
// @ts-expect-error Legacy path - fixtures moved
import { generateTestKey, createTestReceipt } from '../fixtures/test-utils.js';
// @ts-expect-error Legacy path - pkgs renamed to packages
import { SLO_TARGETS } from '../../pkgs/core/src/config.js';
// @ts-expect-error Legacy path - pkgs renamed to packages
import { metricsCollector } from '../../pkgs/core/src/observability.js';

interface PerformanceResults {
  operation: string;
  iterations: number;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  min_ms: number;
  max_ms: number;
  throughput_ops_per_sec: number;
  memory_mb: number;
  meets_slo: boolean;
  slo_target_ms: number;
}

interface PerformanceReport {
  timestamp: string;
  environment: {
    node_version: string;
    platform: string;
    arch: string;
    memory_total_gb: number;
  };
  results: PerformanceResults[];
  overall_status: 'PASS' | 'FAIL' | 'WARNING';
  failures: string[];
}

async function measurePerformance(
  operation: string,
  fn: () => Promise<any>,
  iterations = 1000,
  slo_target_ms?: number
): Promise<PerformanceResults> {
  const timings: number[] = [];
  const start_memory = process.memoryUsage().rss;
  const start_time = performance.now();

  // Warm up (10% of iterations)
  const warmup = Math.floor(iterations * 0.1);
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  // Actual measurement
  for (let i = 0; i < iterations; i++) {
    const operation_start = performance.now();
    await fn();
    const operation_end = performance.now();
    timings.push(operation_end - operation_start);
  }

  const total_time = performance.now() - start_time;
  const end_memory = process.memoryUsage().rss;

  // Calculate statistics
  timings.sort((a, b) => a - b);
  const avg_ms = timings.reduce((sum, t) => sum + t, 0) / timings.length;
  const p50_ms = timings[Math.floor(timings.length * 0.5)];
  const p95_ms = timings[Math.floor(timings.length * 0.95)];
  const p99_ms = timings[Math.floor(timings.length * 0.99)];
  const min_ms = timings[0];
  const max_ms = timings[timings.length - 1];
  const throughput_ops_per_sec = (iterations / total_time) * 1000;
  const memory_mb = Math.round((end_memory - start_memory) / 1024 / 1024);

  return {
    operation,
    iterations,
    avg_ms: Math.round(avg_ms * 1000) / 1000,
    p50_ms: Math.round(p50_ms * 1000) / 1000,
    p95_ms: Math.round(p95_ms * 1000) / 1000,
    p99_ms: Math.round(p99_ms * 1000) / 1000,
    min_ms: Math.round(min_ms * 1000) / 1000,
    max_ms: Math.round(max_ms * 1000) / 1000,
    throughput_ops_per_sec: Math.round(throughput_ops_per_sec),
    memory_mb,
    meets_slo: slo_target_ms ? p95_ms <= slo_target_ms : true,
    slo_target_ms: slo_target_ms || 0,
  };
}

async function runPerformanceTests(): Promise<PerformanceReport> {
  console.log('Starting PEAC v0.9.12.1 Performance Validation');
  console.log(
    `Target SLOs: sign p95≤${SLO_TARGETS.sign_p95_ms}ms, verify p95≤${SLO_TARGETS.verify_p95_ms}ms`
  );

  // Reset metrics
  metricsCollector.reset();

  // Generate test data
  const keyPair = await generateTestKey();
  const testReceipt = createTestReceipt();

  const results: PerformanceResults[] = [];
  const failures: string[] = [];

  try {
    // Test 1: Sign operation performance
    console.log('\nTesting sign operation...');
    const signResult = await measurePerformance(
      'sign',
      async () => {
        return await signReceipt(testReceipt, {
          kid: keyPair.kid,
          privateKey: keyPair.privateKey,
        });
      },
      1000,
      SLO_TARGETS.sign_p95_ms
    );

    results.push(signResult);
    console.log(
      `   Sign p95: ${signResult.p95_ms}ms (target: ≤${SLO_TARGETS.sign_p95_ms}ms) ${signResult.meets_slo ? '[OK]' : '[FAIL]'}`
    );

    if (!signResult.meets_slo) {
      failures.push(`Sign p95 ${signResult.p95_ms}ms exceeds target ${SLO_TARGETS.sign_p95_ms}ms`);
    }

    // Test 2: Verify operation performance
    console.log('\nTesting verify operation...');
    const signedReceipt = await signReceipt(testReceipt, {
      kid: keyPair.kid,
      privateKey: keyPair.privateKey,
    });

    const verifyResult = await measurePerformance(
      'verify',
      async () => {
        return await verifyReceipt(signedReceipt, {
          [keyPair.kid]: keyPair.publicKey,
        });
      },
      1000,
      SLO_TARGETS.verify_p95_ms
    );

    results.push(verifyResult);
    console.log(
      `   Verify p95: ${verifyResult.p95_ms}ms (target: ≤${SLO_TARGETS.verify_p95_ms}ms) ${verifyResult.meets_slo ? '[OK]' : '[FAIL]'}`
    );

    if (!verifyResult.meets_slo) {
      failures.push(
        `Verify p95 ${verifyResult.p95_ms}ms exceeds target ${SLO_TARGETS.verify_p95_ms}ms`
      );
    }

    // Test 3: Memory efficiency
    console.log('\nTesting memory efficiency...');
    const memoryTest = await measurePerformance(
      'memory_test',
      async () => {
        const signed = await signReceipt(testReceipt, {
          kid: keyPair.kid,
          privateKey: keyPair.privateKey,
        });
        return await verifyReceipt(signed, {
          [keyPair.kid]: keyPair.publicKey,
        });
      },
      100, // Fewer iterations for memory test
      undefined
    );

    results.push(memoryTest);
    const memory_per_op_kb = (memoryTest.memory_mb * 1024) / memoryTest.iterations;
    console.log(
      `   Memory per operation: ${memory_per_op_kb.toFixed(2)}KB (target: ≤${SLO_TARGETS.memory_per_receipt_kb}KB)`
    );

    if (memory_per_op_kb > SLO_TARGETS.memory_per_receipt_kb) {
      failures.push(
        `Memory usage ${memory_per_op_kb.toFixed(2)}KB exceeds target ${SLO_TARGETS.memory_per_receipt_kb}KB`
      );
    }

    // Test 4: Bulk verify performance (if enabled)
    console.log('\nTesting bulk verification...');
    const receipts: string[] = [];
    for (let i = 0; i < 100; i++) {
      receipts.push(
        await signReceipt(
          {
            ...testReceipt,
            subject: `${testReceipt.subject}/${i}`,
          },
          {
            kid: keyPair.kid,
            privateKey: keyPair.privateKey,
          }
        )
      );
    }

    const bulkResult = await measurePerformance(
      'bulk_verify',
      async () => {
        // Simulate bulk verification
        const keys = { [keyPair.kid]: keyPair.publicKey };
        const results = await Promise.all(
          receipts.slice(0, 10).map((jws) => verifyReceipt(jws, keys))
        );
        return results;
      },
      50, // Fewer iterations for bulk test
      SLO_TARGETS.bulk_verify_10k_ms / 100 // Scale down for 10 receipts
    );

    results.push(bulkResult);
    console.log(`   Bulk verify (10x): ${bulkResult.p95_ms}ms`);
  } catch (error) {
    failures.push(`Performance test error: ${(error as Error).message}`);
    console.error('[FAIL] Performance test failed:', error);
  }

  // Generate report
  const overall_status =
    failures.length === 0
      ? 'PASS'
      : failures.some((f) => f.includes('exceeds target'))
        ? 'FAIL'
        : 'WARNING';

  const report: PerformanceReport = {
    timestamp: new Date().toISOString(),
    environment: {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      memory_total_gb: Math.round(require('os').totalmem() / 1024 / 1024 / 1024),
    },
    results,
    overall_status,
    failures,
  };

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('PERFORMANCE VALIDATION SUMMARY');
  console.log('='.repeat(60));

  for (const result of results) {
    console.log(
      `${result.operation.toUpperCase()}: p95=${result.p95_ms}ms, throughput=${result.throughput_ops_per_sec}ops/s ${result.meets_slo ? '[OK]' : '[FAIL]'}`
    );
  }

  console.log(
    '\n' +
      (overall_status === 'PASS'
        ? '[OK] ALL SLOS MET'
        : overall_status === 'FAIL'
          ? '[FAIL] SLO VIOLATIONS DETECTED'
          : '[WARN]  PERFORMANCE WARNINGS')
  );

  if (failures.length > 0) {
    console.log('\nIssues:');
    failures.forEach((failure) => console.log(`   • ${failure}`));
  }

  console.log('\nDetailed Metrics:');
  console.log(`   Current sign p95: ${metricsCollector.getPercentile('sign', 95).toFixed(3)}ms`);
  console.log(
    `   Current verify p95: ${metricsCollector.getPercentile('verify', 95).toFixed(3)}ms`
  );
  console.log(`   Total receipts issued: ${metricsCollector.getCounter('receipts_issued')}`);
  console.log(`   Total receipts verified: ${metricsCollector.getCounter('receipts_verified')}`);

  return report;
}

// Stress test function
export async function runStressTest(duration_seconds = 60): Promise<void> {
  console.log(`\nRunning ${duration_seconds}s stress test...`);

  const keyPair = await generateTestKey();
  const testReceipt = createTestReceipt();

  const start_time = Date.now();
  const end_time = start_time + duration_seconds * 1000;

  let operations = 0;
  let errors = 0;

  while (Date.now() < end_time) {
    try {
      const signed = await signReceipt(testReceipt, {
        kid: keyPair.kid,
        privateKey: keyPair.privateKey,
      });

      await verifyReceipt(signed, {
        [keyPair.kid]: keyPair.publicKey,
      });

      operations++;

      if (operations % 100 === 0) {
        const elapsed = (Date.now() - start_time) / 1000;
        const ops_per_sec = operations / elapsed;
        console.log(`   ${operations} ops, ${ops_per_sec.toFixed(1)} ops/s`);
      }
    } catch (error) {
      errors++;
    }
  }

  const total_time = (Date.now() - start_time) / 1000;
  const ops_per_sec = operations / total_time;

  console.log(`\nStress Test Results:`);
  console.log(`   Duration: ${total_time.toFixed(1)}s`);
  console.log(`   Operations: ${operations}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Throughput: ${ops_per_sec.toFixed(1)} ops/s`);
  console.log(`   Error rate: ${((errors / operations) * 100).toFixed(2)}%`);
}

// Export for use in tests
export { runPerformanceTests, PerformanceResults, PerformanceReport };

// CLI interface (ESM only - requires module: esnext)
// @ts-expect-error import.meta requires ESM module setting
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  if (command === 'stress') {
    const duration = parseInt(process.argv[3]) || 60;
    // @ts-expect-error top-level await requires ESM module setting
    await runStressTest(duration);
  } else {
    // @ts-expect-error top-level await requires ESM module setting
    const report = await runPerformanceTests();

    // Exit with non-zero code if SLOs not met
    if (report.overall_status === 'FAIL') {
      process.exit(1);
    }
  }
}
