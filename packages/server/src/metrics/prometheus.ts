import { Request, Response, NextFunction } from 'express';
import { Counter, Histogram, register } from 'prom-client';

export const udaReplaysBlocked = new Counter({
  name: 'peac_uda_replays_blocked_total',
  help: 'Total UDA replay attacks blocked',
  registers: [register],
});

export const dpopReplaysBlocked = new Counter({
  name: 'peac_dpop_replays_blocked_total',
  help: 'Total DPoP replay attacks blocked',
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'peac_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export function metricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      httpRequestDuration
        .labels(req.method, req.route?.path || req.path, res.statusCode.toString())
        .observe(duration);
    });

    next();
  };
}

export function metricsHandler(_req: Request, res: Response) {
  res.set('Content-Type', register.contentType);
  register
    .metrics()
    .then((metrics) => {
      res.send(metrics);
    })
    .catch((_err) => {
      res.status(500).send('Error generating metrics');
    });
}
