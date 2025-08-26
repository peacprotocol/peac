import type { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { WIRE_VERSION } from '@peacprotocol/schema';

/**
 * Wire-level headers + version negotiation (strict, pre-1.0).
 * Policy:
 * - Echo x-peac-protocol-version: 0.9.8 on all responses.
 * - Accept ONLY 0.9.8.
 * - Legacy header name x-peac-version is NOT supported (return 426).
 * - For unsupported/invalid versions, return 426 with RFC7807 payload
 *   and include x-peac-protocol-version-supported: 0.9.8.
 * - Staging canary: error-log if any X-PEAC-* header is emitted with uppercase chars.
 */

const ECHO = WIRE_VERSION;
const SUPPORTED = [WIRE_VERSION];
const MIN_SUPPORTED_PATCH = 8;

// ---- utils --------------------------------------------------------------------

function cryptoHex(n: number): string {
  return crypto.randomBytes(n).toString('hex');
}

function ensureTrace(req: Request, res: Response): string {
  let tp = (req.headers['traceparent'] as string | undefined) || '';
  let traceId = '';
  if (tp) {
    const parts = String(tp).split('-');
    if (parts.length >= 2) traceId = parts[1];
  }
  if (!traceId) {
    const b = cryptoHex(16);
    const span = cryptoHex(8);
    tp = `00-${b}-${span}-01`;
    traceId = b;
  }
  res.setHeader('traceparent', tp);
  return `urn:trace:${traceId}`;
}

// Process-wide counters (intentionally global so tests can read the same object)
const legacyCounters: { hits: number; total: number } =
  (globalThis as any).__peacLegacyHeaderCounters__ ||
  ((globalThis as any).__peacLegacyHeaderCounters__ = { hits: 0, total: 0 });

export function getLegacyHeaderMetrics() {
  return { ...legacyCounters };
}

// ---- header normalization middleware -----------------------------------------

export function headerMiddleware(_req: Request, res: Response, next: NextFunction) {
  const origSetHeader = res.setHeader.bind(res);

  // Lower-case enforcement for X-PEAC-* + staging canary.
  (res as any).setHeader = (name: string, value: any) => {
    const lower = name.toLowerCase();

    if (lower.startsWith('x-peac-')) {
      if (process.env.NODE_ENV === 'staging' && /[A-Z]/.test(name)) {
        console.error(`CANARY: Uppercase header emission detected: ${name}`);
      }
      return origSetHeader(lower, value);
    }
    return origSetHeader(name, value);
  };

  // Always echo the current protocol version on successful responses.
  res.setHeader('x-peac-protocol', ECHO);

  next();
}

// ---- version negotiation middleware ------------------------------------------

export function versionNegotiationMiddleware(req: Request, res: Response, next: NextFunction) {
  const currentHdr = req.get('x-peac-protocol') as string | undefined;
  const legacyHdr = req.get('x-peac-version') as string | undefined;

  // Count every time a caller sends *any* version header.
  if (currentHdr || legacyHdr) legacyCounters.total += 1;

  // Legacy header name is not supported at all (pre-1.0: no backward compat)
  if (legacyHdr) {
    try {
      console.warn(
        JSON.stringify({
          level: 'warn',
          code: 'legacy-header-unsupported',
          message: 'Header x-peac-version is not supported',
          header: 'x-peac-version',
          recommendation: 'Send x-peac-protocol-version: 0.9.8',
        }),
      );
    } catch {
      // Intentionally empty - logging is non-critical
    }
    legacyCounters.hits += 1;

    res.setHeader('x-peac-protocol-version-supported', SUPPORTED.join(','));
    res.setHeader('content-type', 'application/problem+json');
    const body = {
      type: 'https://peacprotocol.org/problems/unsupported-version',
      title: 'Upgrade Required',
      status: 426,
      detail: 'Legacy header x-peac-version is not supported',
      instance: ensureTrace(req, res),
    };
    res.status(426).end(JSON.stringify(body));
    return;
  }

  // No requested version -> proceed; echo header already set by headerMiddleware.
  if (!currentHdr) return next();

  // Strict parse 0.9.x
  const m = String(currentHdr).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) {
    res.setHeader('x-peac-protocol-version-supported', SUPPORTED.join(','));
    res.setHeader('content-type', 'application/problem+json');
    const body = {
      type: 'https://peacprotocol.org/problems/unsupported-version',
      title: 'Upgrade Required',
      status: 426,
      detail: `Requested version ${currentHdr} is not supported`,
      instance: ensureTrace(req, res),
    };
    res.status(426).end(JSON.stringify(body));
    return;
  }

  const [, maj, min, patStr] = m;
  const patch = Number(patStr);

  // Accept exactly 0.9.8; normalize to ECHO (0.9.8)
  if (maj === '0' && min === '9' && patch === MIN_SUPPORTED_PATCH) {
    res.setHeader('x-peac-protocol', ECHO);
    return next();
  }

  // Unsupported -> 426 problem details
  res.setHeader('x-peac-protocol-version-supported', SUPPORTED.join(','));
  res.setHeader('content-type', 'application/problem+json');
  const body = {
    type: 'https://peacprotocol.org/problems/unsupported-version',
    title: 'Upgrade Required',
    status: 426,
    detail: `Requested version ${currentHdr} is not supported`,
    instance: ensureTrace(req, res),
  };
  res.status(426).end(JSON.stringify(body));
}

export default {};
