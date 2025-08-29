import { logger } from '../logging';
import crypto from 'crypto';

export interface TelemetryEvent {
  event: string;
  correlation_id: string;
  timestamp: number;
  data?: Record<string, string | number | boolean>;
}

export interface WBAVerifyEvent {
  ok: boolean;
  reason?: string;
  thumb?: string;
  dur_ms: number;
}

export interface DirFetchEvent {
  ok: boolean;
  status?: number;
  dur_ms: number;
  etag?: string;
  expires_at?: number;
}

export interface ReceiptEmitEvent {
  jti: string;
  kid: string;
  tier: string;
}

export interface RateLimitEvent {
  tier: string;
  keying: string;
  remaining: number;
}

export interface ErrorEvent {
  where: string;
  code: string;
}

class TelemetryLogger {
  private correlationStore = new WeakMap<object, string>();

  getCorrelationId(req: object): string {
    let correlationId = this.correlationStore.get(req);
    if (!correlationId) {
      correlationId = crypto.randomBytes(8).toString('hex');
      this.correlationStore.set(req, correlationId);
    }
    return correlationId;
  }

  logWBAVerify(req: object, event: WBAVerifyEvent): void {
    this.logEvent('wba_verify', req, {
      ok: event.ok,
      reason: event.reason,
      thumb: event.thumb,
      dur_ms: event.dur_ms,
    });
  }

  logDirFetch(req: object, event: DirFetchEvent): void {
    this.logEvent('dir_fetch', req, {
      ok: event.ok,
      status: event.status,
      dur_ms: event.dur_ms,
      etag: event.etag,
      expires_at: event.expires_at,
    });
  }

  logReceiptEmit(req: object, event: ReceiptEmitEvent): void {
    this.logEvent('receipt_emit', req, {
      jti: event.jti,
      kid: event.kid,
      tier: event.tier,
    });
  }

  logRateLimit(req: object, event: RateLimitEvent): void {
    this.logEvent('rate_limit', req, {
      tier: event.tier,
      keying: event.keying,
      remaining: event.remaining,
    });
  }

  logError(req: object, event: ErrorEvent): void {
    this.logEvent('error', req, {
      where: event.where,
      code: event.code,
    });
  }

  private logEvent(event: string, req: object, data: Record<string, unknown>): void {
    const telemetryEvent: TelemetryEvent = {
      event,
      correlation_id: this.getCorrelationId(req),
      timestamp: Date.now(),
      data: this.sanitizeData(data),
    };

    logger.info(telemetryEvent, `telemetry.${event}`);
  }

  private sanitizeData(data: Record<string, unknown>): Record<string, string | number | boolean> {
    const sanitized: Record<string, string | number | boolean> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) {
        continue;
      }

      if (typeof value === 'string') {
        // Hash paths to avoid PII
        if (key === 'path' && value.length > 0) {
          sanitized[`${key}_hash`] = crypto
            .createHash('sha256')
            .update(value)
            .digest('hex')
            .substring(0, 16);
        } else if (key.toLowerCase().includes('ip')) {
          // Never log raw IPs - hash them
          sanitized[`${key}_hash`] = crypto
            .createHash('sha256')
            .update(value)
            .digest('hex')
            .substring(0, 16);
        } else {
          // Limit string length to prevent log bombing
          sanitized[key] = value.length > 100 ? value.substring(0, 100) + '...' : value;
        }
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

export const telemetry = new TelemetryLogger();
