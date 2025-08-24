import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export const register = new Registry();

import { collectDefaultMetrics } from 'prom-client';
collectDefaultMetrics({ register });

export const httpRequestsTotal = new Counter({
  name: 'peac_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'peac_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

export const jwksRotationsTotal = new Counter({
  name: 'peac_jwks_rotations_total',
  help: 'Total number of JWKS rotations',
  registers: [register],
});

export const jwksActiveKeys = new Gauge({
  name: 'peac_jwks_active_keys',
  help: 'Number of active JWKS keys',
  registers: [register],
});

export const udaReplaysBlocked = new Counter({
  name: 'peac_uda_replays_blocked_total',
  help: 'Total number of UDA replays blocked',
  registers: [register],
});

export const dpopReplaysBlocked = new Counter({
  name: 'peac_dpop_replays_blocked_total',
  help: 'Total number of DPoP replays blocked',
  registers: [register],
});

export const errorsTotal = new Counter({
  name: 'peac_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'status'],
  registers: [register],
});

export function metricsMiddleware() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (req: any, res: any, next: () => void) => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = (Date.now() - startTime) / 1000;
      const labels = {
        method: req.method,
        path: req.route?.path || req.path,
        status: res.statusCode.toString(),
      };

      httpRequestsTotal.inc(labels);
      httpRequestDuration.observe(labels, duration);

      if (res.statusCode >= 400) {
        errorsTotal.inc({
          type: res.statusCode >= 500 ? 'server_error' : 'client_error',
          status: res.statusCode.toString(),
        });
      }
    });

    next();
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function metricsHandler(_req: any, res: any) {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
}
