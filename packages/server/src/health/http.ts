import { Request, Response } from 'express';
import { storeManager } from '../config/stores';
import { getRedis } from '../utils/redis-pool';
import { logger } from '../logging';

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail';
  details?: Record<string, unknown>;
  duration_ms?: number;
}

export interface HealthResponse {
  status: 'pass' | 'fail';
  checks: HealthCheck[];
  timestamp: string;
  uptime_seconds: number;
}

class HealthChecker {
  private startTime = Date.now();

  async checkRedis(): Promise<HealthCheck> {
    const start = Date.now();

    try {
      const redis = getRedis();
      const pong = await redis.ping();

      if (pong === 'PONG') {
        return {
          name: 'redis',
          status: 'pass',
          duration_ms: Date.now() - start,
        };
      } else {
        return {
          name: 'redis',
          status: 'fail',
          details: { error: 'Unexpected ping response', response: pong },
          duration_ms: Date.now() - start,
        };
      }
    } catch (error) {
      return {
        name: 'redis',
        status: 'fail',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        duration_ms: Date.now() - start,
      };
    }
  }

  async checkStores(): Promise<HealthCheck> {
    const start = Date.now();

    try {
      const paymentStore = storeManager.getPaymentStore();
      const negotiationStore = storeManager.getNegotiationStore();

      // Test basic store operations
      const testPayment = await paymentStore.create({
        rail: 'credits',
        amount: 1,
        currency: 'USD',
        status: 'pending',
      });

      const retrievedPayment = await paymentStore.get(testPayment.id);
      if (!retrievedPayment || retrievedPayment.id !== testPayment.id) {
        throw new Error('Payment store read/write test failed');
      }

      const testNegotiation = await negotiationStore.create({
        state: 'proposed',
        terms: { test: true },
      });

      const retrievedNegotiation = await negotiationStore.get(testNegotiation.id);
      if (!retrievedNegotiation || retrievedNegotiation.id !== testNegotiation.id) {
        throw new Error('Negotiation store read/write test failed');
      }

      return {
        name: 'stores',
        status: 'pass',
        details: {
          backend: storeManager.getConfig().backend,
          test_payment_id: testPayment.id,
          test_negotiation_id: testNegotiation.id,
        },
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      return {
        name: 'stores',
        status: 'fail',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          backend: storeManager.getConfig().backend,
        },
        duration_ms: Date.now() - start,
      };
    }
  }

  async checkMemory(): Promise<HealthCheck> {
    const start = Date.now();

    try {
      const usage = process.memoryUsage();
      const totalMB = Math.round(usage.heapTotal / 1024 / 1024);
      const usedMB = Math.round(usage.heapUsed / 1024 / 1024);
      const externalMB = Math.round(usage.external / 1024 / 1024);

      // Simple memory pressure check (>90% heap usage)
      const heapUsagePercent = (usage.heapUsed / usage.heapTotal) * 100;
      const status = heapUsagePercent > 90 ? 'fail' : 'pass';

      return {
        name: 'memory',
        status,
        details: {
          heap_total_mb: totalMB,
          heap_used_mb: usedMB,
          heap_usage_percent: Math.round(heapUsagePercent),
          external_mb: externalMB,
        },
        duration_ms: Date.now() - start,
      };
    } catch (error) {
      return {
        name: 'memory',
        status: 'fail',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        duration_ms: Date.now() - start,
      };
    }
  }

  getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }
}

const healthChecker = new HealthChecker();

export async function handleLiveness(_req: Request, res: Response): Promise<void> {
  // Liveness check - just verify process is alive
  const response: HealthResponse = {
    status: 'pass',
    checks: [
      {
        name: 'process',
        status: 'pass',
        details: {
          pid: process.pid,
          node_version: process.version,
        },
      },
    ],
    timestamp: new Date().toISOString(),
    uptime_seconds: healthChecker.getUptimeSeconds(),
  };

  res.json(response);
}

export async function handleReadiness(_req: Request, res: Response): Promise<void> {
  try {
    const checks: HealthCheck[] = [];

    // Always check stores
    checks.push(await healthChecker.checkStores());

    // Check Redis if configured
    const backend = storeManager.getConfig().backend;
    if (backend === 'redis') {
      checks.push(await healthChecker.checkRedis());
    }

    // Check memory
    checks.push(await healthChecker.checkMemory());

    // Determine overall status
    const overallStatus = checks.every((check) => check.status === 'pass') ? 'pass' : 'fail';

    const response: HealthResponse = {
      status: overallStatus,
      checks,
      timestamp: new Date().toISOString(),
      uptime_seconds: healthChecker.getUptimeSeconds(),
    };

    const statusCode = overallStatus === 'pass' ? 200 : 503;
    res.status(statusCode).json(response);

    if (overallStatus === 'fail') {
      logger.warn({ checks }, 'Readiness check failed');
    }
  } catch (error) {
    logger.error({ error }, 'Readiness check error');

    const response: HealthResponse = {
      status: 'fail',
      checks: [
        {
          name: 'readiness_check',
          status: 'fail',
          details: { error: error instanceof Error ? error.message : 'Unknown error' },
        },
      ],
      timestamp: new Date().toISOString(),
      uptime_seconds: healthChecker.getUptimeSeconds(),
    };

    res.status(503).json(response);
  }
}
