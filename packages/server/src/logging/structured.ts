import pino from 'pino';
import { randomBytes } from 'crypto';
import { WIRE_VERSION } from '@peacprotocol/schema';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.dpop',
  'req.headers["x-api-key"]',
  'req.headers["x-peac-agent-attestation"]',
  'req.body.password',
  'req.body.secret',
  'req.body.private_key',
  'req.body.access_token',
  'res.body.access_token',
  '*.password',
  '*.secret',
  '*.private_key',
  '*.privateKey',
  '*.access_token',
  '*.refresh_token',
];

export const logger = pino({
  name: 'peac-protocol',
  level: process.env.LOG_LEVEL || 'info',

  formatters: {
    bindings: (bindings) => ({
      pid: bindings.pid,
      hostname: bindings.hostname,
      service: 'peac-protocol',
      version: process.env.npm_package_version || WIRE_VERSION,
      environment: process.env.NODE_ENV || 'development',
    }),

    level: (label) => ({ level: label }),
  },

  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      trace_id: extractTraceId(req),
      user_agent: req.headers['user-agent'],
      remote_address: req.ip || req.connection?.remoteAddress,
    }),

    res: (res) => ({
      status: res.statusCode,
      duration_ms: res.responseTime,
    }),

    err: pino.stdSerializers.err,
  },

  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },

  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
});

export function extractTraceId(req: any): string {
  if (req.headers?.traceparent) {
    const parts = req.headers.traceparent.split('-');
    if (parts.length >= 2) {
      return parts[1];
    }
  }

  if (req.trace_id) {
    return req.trace_id;
  }

  const traceId = randomBytes(16).toString('hex');
  req.trace_id = traceId;
  return traceId;
}

export function requestLogger() {
  return (req: any, res: any, next: () => void) => {
    req.id = randomBytes(8).toString('hex');
    req.trace_id = extractTraceId(req);

    const startTime = Date.now();

    logger.info({ req }, 'Request received');

    const originalSend = res.send;
    res.send = function (data: any) {
      res.responseTime = Date.now() - startTime;

      logger.info(
        {
          req,
          res,
          duration_ms: res.responseTime,
        },
        'Request completed',
      );

      return originalSend.call(this, data);
    };

    next();
  };
}
