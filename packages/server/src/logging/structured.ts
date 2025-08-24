import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import pino from 'pino';

const logger = pino({ name: 'request' });

export function requestLogger() {
  return (req: Request & { id?: string }, res: Response, next: NextFunction) => {
    const start = Date.now();
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();

    req.id = requestId;
    res.setHeader('x-request-id', requestId);

    logger.info(
      {
        req: {
          method: req.method,
          url: req.url,
          headers: req.headers,
          remoteAddress: req.ip,
        },
        requestId,
      },
      'Request started',
    );

    res.on('finish', () => {
      const duration = Date.now() - start;

      logger.info(
        {
          req: {
            method: req.method,
            url: req.url,
          },
          res: {
            statusCode: res.statusCode,
            headers: res.getHeaders(),
          },
          duration,
          requestId,
        },
        'Request completed',
      );
    });

    next();
  };
}
