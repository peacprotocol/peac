#!/usr/bin/env node

/**
 * Bridge Performance Validation Script
 * Validates that bridge endpoints meet p95 < 5ms target
 */

const { performance } = require('perf_hooks');
const { spawn } = require('child_process');
const { join } = require('path');

const BRIDGE_PORT = 31415;
const METRICS_PORT = 31416;
const TARGET_P95_MS = 5;
const TEST_REQUESTS = 100;
const WARMUP_REQUESTS = 10;

class PerformanceValidator {
  constructor() {
    this.bridgeProcess = null;
    this.results = {
      health: [],
      ready: [],
      enforce: [],
      verify: [],
      metrics: [],
    };
  }

  async startBridge() {
    console.log('🚀 Starting bridge for performance testing...');

    const cliPath = join(__dirname, '../../../packages/cli/bin/peac.js');
    this.bridgeProcess = spawn('node', [cliPath, 'bridge', 'start', '--port', BRIDGE_PORT], {
      stdio: 'pipe',
      env: { ...process.env, PEAC_ENABLE_METRICS: '1' },
    });

    // Wait for bridge to start
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Verify bridge is running
    try {
      const response = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/health`);
      if (!response.ok) {
        throw new Error(`Bridge health check failed: ${response.status}`);
      }
      console.log('✅ Bridge started successfully');
    } catch (error) {
      throw new Error(`Failed to start bridge: ${error.message}`);
    }
  }

  async stopBridge() {
    if (this.bridgeProcess) {
      console.log('🛑 Stopping bridge...');
      this.bridgeProcess.kill('SIGTERM');

      // Wait for graceful shutdown
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Force kill if still running
      try {
        this.bridgeProcess.kill('SIGKILL');
      } catch {
        // Process already stopped
      }

      this.bridgeProcess = null;
    }
  }

  async measureEndpoint(name, url, options = {}) {
    console.log(`📊 Testing ${name} endpoint...`);

    const timings = [];

    // Warmup
    for (let i = 0; i < WARMUP_REQUESTS; i++) {
      try {
        await fetch(url, options);
      } catch {
        // Ignore warmup errors
      }
    }

    // Actual measurements
    for (let i = 0; i < TEST_REQUESTS; i++) {
      const start = performance.now();

      try {
        const response = await fetch(url, options);
        const duration = performance.now() - start;

        if (response.ok) {
          timings.push(duration);
        } else {
          console.warn(`Request ${i + 1} failed: ${response.status}`);
        }
      } catch (error) {
        console.warn(`Request ${i + 1} error: ${error.message}`);
      }

      // Small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    if (timings.length === 0) {
      throw new Error(`No successful requests for ${name}`);
    }

    this.results[name] = timings;
    return this.calculateStats(timings);
  }

  calculateStats(timings) {
    const sorted = [...timings].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      count: len,
      min: sorted[0],
      max: sorted[len - 1],
      avg: timings.reduce((a, b) => a + b, 0) / len,
      p50: sorted[Math.floor(len * 0.5)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)],
    };
  }

  async runTests() {
    try {
      await this.startBridge();

      // Test health endpoint
      const healthStats = await this.measureEndpoint(
        'health',
        `http://127.0.0.1:${BRIDGE_PORT}/health`
      );

      // Test readiness endpoint
      const readyStats = await this.measureEndpoint(
        'ready',
        `http://127.0.0.1:${BRIDGE_PORT}/ready`,
        {
          headers: { Accept: 'application/peac+json' },
        }
      );

      // Test enforce endpoint
      const enforceStats = await this.measureEndpoint(
        'enforce',
        `http://127.0.0.1:${BRIDGE_PORT}/enforce`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resource: 'https://example.com',
            context: { agent: 'test' },
          }),
        }
      );

      // Test verify endpoint
      const verifyStats = await this.measureEndpoint(
        'verify',
        `http://127.0.0.1:${BRIDGE_PORT}/verify`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/peac+json',
          },
          body: JSON.stringify({
            receipt: 'test.receipt.jws',
            resource: 'https://example.com',
          }),
        }
      );

      // Test metrics endpoint
      const metricsStats = await this.measureEndpoint(
        'metrics',
        `http://127.0.0.1:${METRICS_PORT}/metrics`
      );

      // Report results
      this.reportResults({
        health: healthStats,
        ready: readyStats,
        enforce: enforceStats,
        verify: verifyStats,
        metrics: metricsStats,
      });
    } finally {
      await this.stopBridge();
    }
  }

  reportResults(stats) {
    console.log('\n📈 Performance Test Results');
    console.log('================================');

    let allPassed = true;

    Object.entries(stats).forEach(([endpoint, stat]) => {
      const passed = stat.p95 < TARGET_P95_MS;
      allPassed = allPassed && passed;

      console.log(`\n${endpoint.toUpperCase()} endpoint:`);
      console.log(`  Requests: ${stat.count}/${TEST_REQUESTS}`);
      console.log(`  Min:      ${stat.min.toFixed(2)} ms`);
      console.log(`  Avg:      ${stat.avg.toFixed(2)} ms`);
      console.log(`  P50:      ${stat.p50.toFixed(2)} ms`);
      console.log(`  P95:      ${stat.p95.toFixed(2)} ms (target: <${TARGET_P95_MS}ms)`);
      console.log(`  P99:      ${stat.p99.toFixed(2)} ms`);
      console.log(`  Max:      ${stat.max.toFixed(2)} ms`);
      console.log(`  Status:   ${passed ? '✅ PASS' : '❌ FAIL'}`);
    });

    console.log('\n================================');
    if (allPassed) {
      console.log('🎉 All performance targets met!');
      console.log(`✅ All endpoints p95 < ${TARGET_P95_MS}ms`);
      process.exit(0);
    } else {
      console.log('❌ Performance targets not met');
      console.log(`Some endpoints exceeded p95 target of ${TARGET_P95_MS}ms`);
      process.exit(1);
    }
  }
}

// CLI usage
if (require.main === module) {
  const validator = new PerformanceValidator();

  validator.runTests().catch((error) => {
    console.error('❌ Performance test failed:', error);
    validator.stopBridge().finally(() => {
      process.exit(1);
    });
  });

  // Handle cleanup on exit
  process.on('SIGINT', () => {
    console.log('\n🛑 Cleaning up...');
    validator.stopBridge().finally(() => {
      process.exit(130);
    });
  });
}

module.exports = PerformanceValidator;
