import { Request } from 'express';
import { parseWebBotAuthHeaders, hasRequiredWebBotAuthHeaders } from './parse';
import { fetchAndVerifyDir, validateSignatureAgentUrl } from './directory';
import { directoryCache } from './cache';
import { verifySignature } from './signature';
import { telemetry } from '../../telemetry/log';
import { logger } from '../../logging';
import { metrics } from '../../metrics';

export type VerifyFailure =
  | 'no_headers'
  | 'bad_signature_agent'
  | 'dir_negative_cache'
  | 'dir_fetch'
  | 'dir_media'
  | 'dir_sig_invalid'
  | 'no_matching_key'
  | 'req_sig_invalid'
  | 'stale'
  | 'future'
  | 'component_missing'
  | 'verifier_busy';

export interface VerifyResult {
  ok: boolean;
  tierHint?: 'verified';
  thumb?: string;
  failure?: VerifyFailure;
  agentOrigin?: string;
}

export interface VerifyOptions {
  fetchFn?: typeof fetch;
  now?: () => number;
  skewSec?: number;
  dirTtlSec?: number;
  timeoutMs?: number;
}

const DEFAULT_VERIFY_OPTIONS = {
  fetchFn: fetch,
  now: () => Date.now(),
  skewSec: 120,
  dirTtlSec: 86400,
  timeoutMs: 2000,
};

let currentInflight = 0;
const MAX_INFLIGHT = 128;

export async function verifyWebBotAuth(
  req: Request,
  options: VerifyOptions = {},
): Promise<VerifyResult> {
  const opts = { ...DEFAULT_VERIFY_OPTIONS, ...options };
  const now = opts.now();

  if (currentInflight >= MAX_INFLIGHT) {
    metrics.webBotAuthVerifyAttempts?.inc({ result: 'busy' });
    return { ok: false, failure: 'verifier_busy' };
  }

  const headers = parseWebBotAuthHeaders(req.headers);

  if (!hasRequiredWebBotAuthHeaders(headers)) {
    return { ok: false, failure: 'no_headers' };
  }

  const signatureAgent = headers.signatureAgent!;
  const signature = headers.signature!;
  const signatureInput = headers.signatureInput!;

  if (!validateSignatureAgentUrl(signatureAgent)) {
    metrics.webBotAuthVerifyAttempts?.inc({ result: 'invalid_url' });
    return { ok: false, failure: 'bad_signature_agent' };
  }

  const origin = new URL(signatureAgent).origin;

  currentInflight++;
  const startTime = Date.now();

  try {
    // Try to get cached directory first
    let directory = directoryCache.get(origin);

    if (!directory) {
      // Check negative cache
      const negativeUntil = directoryCache.getNegative(origin);
      if (negativeUntil && negativeUntil > now) {
        metrics.webBotAuthVerifyAttempts?.inc({ result: 'negative_cached' });
        return { ok: false, failure: 'dir_negative_cache' };
      }

      // Fetch and verify directory
      try {
        const result = await fetchAndVerifyDir(origin, {
          fetchFn: opts.fetchFn,
          now: opts.now,
          ttlCapSec: opts.dirTtlSec,
          timeoutMs: opts.timeoutMs,
        });
        directory = result.record;
      } catch (error) {
        let failure: VerifyFailure = 'dir_fetch';
        if (error instanceof Error) {
          if (error.message.includes('dir_media')) {
            failure = 'dir_media';
          } else if (error.message.includes('dir_sig_invalid')) {
            failure = 'dir_sig_invalid';
          } else if (error.message.includes('dir_negative_cache')) {
            failure = 'dir_negative_cache';
          }
        }

        const latency = Date.now() - startTime;
        metrics.webBotAuthVerifyLatency?.observe(latency);
        metrics.webBotAuthVerifyAttempts?.inc({ result: 'dir_failure', reason: failure });

        logger.warn(
          {
            agentOrigin: origin,
            error: error instanceof Error ? error.message : String(error),
            failure,
            latency,
          },
          'Directory fetch failed',
        );

        return { ok: false, failure };
      }
    }

    // Verify request signature using directory keys
    for (const keyEntry of directory.keys) {
      const verifyResult = await verifySignature(
        signature,
        signatureInput,
        req,
        keyEntry.jwk as unknown as Record<string, unknown>,
        now,
        opts.skewSec,
      );

      if (verifyResult.ok && verifyResult.keyid === keyEntry.thumbprint) {
        const latency = Date.now() - startTime;
        metrics.webBotAuthVerifyLatency?.observe(latency);
        metrics.webBotAuthVerifyAttempts?.inc({ result: 'success' });

        logger.info(
          {
            agentOrigin: origin,
            thumbprint: keyEntry.thumbprint,
            latency,
          },
          'Web Bot Auth request verified',
        );

        telemetry.logWBAVerify(req, {
          ok: true,
          thumb: keyEntry.thumbprint,
          dur_ms: latency,
        });

        return {
          ok: true,
          tierHint: 'verified',
          thumb: keyEntry.thumbprint,
          agentOrigin: origin,
        };
      }
    }

    // No matching key found
    const latency = Date.now() - startTime;
    metrics.webBotAuthVerifyLatency?.observe(latency);
    metrics.webBotAuthVerifyAttempts?.inc({ result: 'no_matching_key' });

    logger.warn(
      {
        agentOrigin: origin,
        keyCount: directory.keys.length,
        latency,
      },
      'No matching key for request signature',
    );

    return { ok: false, failure: 'no_matching_key' };
  } catch (error) {
    const latency = Date.now() - startTime;
    metrics.webBotAuthVerifyLatency?.observe(latency);

    let failure: VerifyFailure = 'req_sig_invalid';
    if (error instanceof Error) {
      if (error.message.includes('stale')) {
        failure = 'stale';
      } else if (error.message.includes('future')) {
        failure = 'future';
      } else if (error.message.includes('component_missing')) {
        failure = 'component_missing';
      }
    }

    metrics.webBotAuthVerifyAttempts?.inc({ result: 'req_failure', reason: failure });

    logger.warn(
      {
        agentOrigin: origin,
        error: error instanceof Error ? error.message : String(error),
        failure,
        latency,
      },
      'Request signature verification failed',
    );

    return { ok: false, failure };
  } finally {
    currentInflight--;
  }
}

export function clearDirectoryCache(): void {
  directoryCache.clear();
}
