/* istanbul ignore file */
import { AsyncLocalStorage } from "node:async_hooks";
import pino from "pino";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export const correlationStore = new AsyncLocalStorage<{ requestId: string }>();

export const logger = pino({
  name: "peac-protocol",
  level: process.env["LOG_LEVEL"] || "info",
  redact: {
    paths: [
      // Headers in common shapes
      "req.headers.authorization",
      "headers.authorization",
      'req.headers["x-payment-signature"]',
      'headers["x-payment-signature"]',

      // Occasionally-logged top-level keys
      "authorization",
      "dpop",

      // Generic secret fields anywhere in objects we log
      "*.privateKey",
      "*.sessionToken",
      "*.password",
      "*.secret",
      "*.apiKey",
    ],
    censor: "[REDACTED]",
  },
  mixin() {
    const store = correlationStore.getStore();
    return store ? { requestId: store.requestId } : {};
  },
});

export function correlationMiddleware(
  req: Request & { id?: string },
  res: Response,
  next: NextFunction,
) {
  const ridHeader = req.headers["x-request-id"];
  const requestId = Array.isArray(ridHeader)
    ? ridHeader[0]
    : ridHeader || randomUUID();
  req.id = requestId;
  res.setHeader("x-request-id", requestId);
  correlationStore.run({ requestId }, () => next());
}
