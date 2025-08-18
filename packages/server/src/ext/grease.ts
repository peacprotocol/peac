import { Request, Response, NextFunction } from "express";
import { logger } from "../logging";

// GREASE reserved headers and fields to ignore
const GREASE_HEADERS = new Set([
  "x-peac-reserved-1",
  "x-peac-reserved-2",
  "x-peac-reserved-3",
  "x-peac-grease-test",
]);

const GREASE_FIELDS = new Set([
  "_reserved_1",
  "_reserved_2",
  "_grease_test",
  "_extension_probe",
]);

export class GreaseHandler {
  /**
   * Middleware to handle GREASE headers (tolerant reader)
   */
  middleware() {
    return (req: Request, _res: Response, next: NextFunction) => {
      // Extract and log any x-peac-* headers
      const peacHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (key.toLowerCase().startsWith("x-peac-")) {
          const normalizedKey = key.toLowerCase();
          if (!GREASE_HEADERS.has(normalizedKey)) {
            peacHeaders[normalizedKey] = String(value);
          } else {
            logger.debug(
              { header: key, value },
              "Ignoring GREASE header"
            );
          }
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
      if (GREASE_FIELDS.has(key) || key.startsWith("_grease_")) {
        delete cleaned[key];
        logger.debug({ field: key }, "Removed GREASE field");
      }
    }
    return cleaned;
  }

  /**
   * Add GREASE fields for testing ossification resistance
   */
  addGreaseFields(obj: Record<string, unknown>): Record<string, unknown> {
    if (process.env.PEAC_GREASE_ENABLED === "true") {
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
declare module "express-serve-static-core" {
  interface Request {
    peacHeaders?: Record<string, string>;
  }
}