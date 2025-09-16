/**
 * /health endpoint - Basic health check
 */

import { Context } from 'hono';
import { peacHeaders } from '../util/http.js';

export async function healthRoute(c: Context) {
  const startTime = performance.now();

  try {
    const checks = {
      bridge: true,
      core_package: true,
      memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      uptime_seconds: Math.round(process.uptime()),
    };

    const elapsed = performance.now() - startTime;

    const responseBody = JSON.stringify({
      ok: true,
      version: '0.9.13.2',
      wire_version: '0.9.13',
      uptime: checks.uptime_seconds,
      pid: process.pid,
      memory_mb: checks.memory_mb,
      response_time_ms: elapsed,
      timestamp: new Date().toISOString(),
      checks,
    });

    return c.newResponse(
      responseBody,
      200,
      peacHeaders({
        'Content-Type': 'application/peac+json',
        'X-Request-ID': c.get('requestId'),
      })
    );
  } catch (error) {
    const elapsed = performance.now() - startTime;

    const errorBody = JSON.stringify({
      ok: false,
      version: '0.9.13.2',
      wire_version: '0.9.13',
      error: error instanceof Error ? error.message : String(error),
      response_time_ms: elapsed,
      timestamp: new Date().toISOString(),
    });

    return c.newResponse(
      errorBody,
      503,
      peacHeaders({
        'Content-Type': 'application/peac+json',
        'X-Request-ID': c.get('requestId'),
      })
    );
  }
}
