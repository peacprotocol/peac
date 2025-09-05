import type { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { WIRE_VERSION } from '@peacprotocol/schema';

/**
 * Wire-level headers + version negotiation (v0.9.12+).
 * Policy:
 * - Use PEAC-Receipt header as primary (RFC compliance)
 * - NO x-peac-* headers supported (breaking change in v0.9.12)
 * - Version negotiation via standard Accept/Content-Type patterns
 * - RFC 7807 Problem Details for all errors
 */

const ECHO = WIRE_VERSION;
const SUPPORTED = [WIRE_VERSION];

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

  // v0.9.12: No x-peac-* headers allowed - use PEAC-Receipt standard
  (res as any).setHeader = (name: string, value: any) => {
    const lower = name.toLowerCase();

    // Block any x-peac-* headers (breaking change in v0.9.12)
    if (lower.startsWith('x-peac-')) {
      console.error(`v0.9.12 BREAKING: x-peac-* headers not supported: ${name}`);
      return; // Silently drop
    }
    return origSetHeader(name, value);
  };

  // v0.9.12: Use standard HTTP headers instead of x-peac-*
  res.setHeader('peac-version', ECHO);

  next();
}

// ---- version negotiation middleware ------------------------------------------

export function versionNegotiationMiddleware(req: Request, res: Response, next: NextFunction) {
  // v0.9.12: Check for proper PEAC headers, reject x-peac-*
  const legacyProtocol = req.get('x-peac-protocol-version') as string | undefined;
  const legacyVersion = req.get('x-peac-version') as string | undefined;
  const peacVersion = req.get('peac-version') as string | undefined;

  // Count legacy usage for metrics
  if (legacyProtocol || legacyVersion) legacyCounters.total += 1;

  // v0.9.12 BREAKING: No x-peac-* headers supported
  if (legacyProtocol || legacyVersion) {
    try {
      console.warn(
        JSON.stringify({
          level: 'warn',
          code: 'legacy-header-unsupported-v0912',
          message: 'x-peac-* headers removed in v0.9.12',
          header: legacyProtocol ? 'x-peac-protocol-version' : 'x-peac-version',
          recommendation: `Use peac-version: ${WIRE_VERSION}`,
        }),
      );
    } catch {
      // Intentionally empty - logging is non-critical
    }
    legacyCounters.hits += 1;

    res.setHeader('peac-version-supported', SUPPORTED.join(','));
    res.setHeader('content-type', 'application/problem+json');
    const body = {
      type: 'https://peacprotocol.org/problems/unsupported-version',
      title: 'Upgrade Required',
      status: 426,
      detail: 'x-peac-* headers removed in v0.9.12. Use peac-version header.',
      instance: ensureTrace(req, res),
    };
    res.status(426).end(JSON.stringify(body));
    return;
  }

  // No version header -> proceed with default
  if (!peacVersion) return next();

  // Strict parse 0.9.x (now checking peac-version instead)
  const m = String(peacVersion).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) {
    res.setHeader('peac-version-supported', SUPPORTED.join(','));
    res.setHeader('content-type', 'application/problem+json');
    const body = {
      type: 'https://peacprotocol.org/problems/unsupported-version',
      title: 'Upgrade Required',
      status: 426,
      detail: `Requested version ${peacVersion} is not supported`,
      instance: ensureTrace(req, res),
    };
    res.status(426).end(JSON.stringify(body));
    return;
  }

  const [, maj, min, patStr] = m;
  const patch = Number(patStr);

  // Accept exactly 0.9.12 (updated for current version)
  if (maj === '0' && min === '9' && patch >= 12) {
    res.setHeader('peac-version', ECHO);
    return next();
  }

  // Unsupported -> 426 problem details
  res.setHeader('peac-version-supported', SUPPORTED.join(','));
  res.setHeader('content-type', 'application/problem+json');
  const body = {
    type: 'https://peacprotocol.org/problems/unsupported-version',
    title: 'Upgrade Required',
    status: 426,
    detail: `Requested version ${peacVersion} is not supported`,
    instance: ensureTrace(req, res),
  };
  res.status(426).end(JSON.stringify(body));
}

export default {};
