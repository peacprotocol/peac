import { Request, Response, NextFunction } from 'express';
import { logger } from '../logging';

// v0.9.12: GREASE reserved headers (no x-peac-* support)
const GREASE_HEADERS = new Set([
  'peac-reserved-1',
  'peac-reserved-2',
  'peac-reserved-3',
  'peac-grease-test',
]);

const GREASE_FIELDS = new Set(['_reserved_1', '_reserved_2', '_grease_test', '_extension_probe']);

export class GreaseHandler {
  /**
   * Middleware to handle GREASE headers (tolerant reader)
   */
  middleware() {
    return (req: Request, _res: Response, next: NextFunction) => {
      // v0.9.12: Extract peac-* headers (no x-peac-* support)
      const peacHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (key.toLowerCase().startsWith('peac-')) {
          const normalizedKey = key.toLowerCase();
          if (!GREASE_HEADERS.has(normalizedKey)) {
            peacHeaders[normalizedKey] = String(value);
          } else {
            logger.debug({ header: key, value }, 'Ignoring GREASE header');
          }
        }
        // Block and warn about legacy x-peac-* headers
        if (key.toLowerCase().startsWith('x-peac-')) {
          logger.warn({ header: key }, 'v0.9.12: x-peac-* headers no longer supported');
        }
      }

      req.peacHeaders = peacHeaders;
      next();
    };
  }

  /**
   * Clean GREASE fields from objects (tolerant reader)
   */
  cleanObject<T extends Record<string, unknown>>(obj: T): T {
    const cleaned = { ...obj };
    for (const key of Object.keys(cleaned)) {
      if (GREASE_FIELDS.has(key) || key.startsWith('_grease_')) {
        delete cleaned[key];
        logger.debug({ field: key }, 'Removed GREASE field');
      }
    }
    return cleaned;
  }

  /**
   * Add GREASE fields for testing ossification resistance
   */
  addGreaseFields(obj: Record<string, unknown>): Record<string, unknown> {
    if (process.env.PEAC_GREASE_ENABLED === 'true') {
      return {
        ...obj,
        _grease_test: Math.random().toString(36).substring(7),
      };
    }
    return obj;
  }
}

export const greaseHandler = new GreaseHandler();

// Extend Express Request type
declare module 'express-serve-static-core' {
  interface Request {
    peacHeaders?: Record<string, string>;
  }
}
