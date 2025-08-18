/* istanbul ignore file */
import type { Request, Response, NextFunction } from 'express';
import { checkRateLimit } from '../rate/limits';

function computeKey(resource: string, req: Request): string {
  const ip = (req.ip || req.socket.remoteAddress || '0.0.0.0').toString();
  const agentId =
    (req.body && (req.body.agentId || req.body?.agentDescriptor?.id)) ||
    (req.headers['x-agent-id'] as string) ||
    'unknown';
  return `${resource}:${agentId}@${ip}`;
}

export function rateLimitMiddleware(resource: string, capacity = 50, refillPerSec = 5) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = computeKey(resource, req);
      const ok = await checkRateLimit(resource, key, capacity, refillPerSec);
      if (!ok) {
        return void res.status(429).json({ ok: false, error: 'rate_limited' });
      }
      return next();
    } catch (e) {
      // Fail-open on limiter error to avoid blocking the API due to Redis issues.
      return next();
    }
  };
}
