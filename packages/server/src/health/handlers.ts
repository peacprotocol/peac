import { Request, Response } from 'express';
import { metrics } from '../metrics';
import { logger } from '../logging';
import { getTracingStats } from '../telemetry/tracing';

export async function handleLiveness(_req: Request, res: Response): Promise<void> {
  const tracingStats = getTracingStats();

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    tracing: tracingStats,
  });
}

export async function handleReadiness(_req: Request, res: Response): Promise<void> {
  const checks: Record<string, boolean> = {
    server: true,
  };

  // Add more readiness checks in future
  // e.g., database, redis, external services

  const allHealthy = Object.values(checks).every((v) => v);
  const status = allHealthy ? 200 : 503;

  res.status(status).json({
    status: allHealthy ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  });

  if (!allHealthy) {
    logger.warn({ checks }, 'Readiness check failed');
    metrics.readinessCheckFailures.inc();
  }
}
