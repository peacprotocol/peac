/**
 * Receipt URL Resolution Middleware
 *
 * Carrier-shaped factory: takes a PeacEvidenceCarrier and returns one
 * with receipt_jws populated (if receipt_url was present and resolvable).
 *
 * The returned carrier is a pure PeacEvidenceCarrier with no extra fields.
 * Retrieval metadata (retrieval metadata) is exposed via an optional onResolved callback.
 *
 * Wraps resolveReceiptUrl() and verifyReceiptRef() with concurrency
 * control and strict/non-strict modes.
 *
 * No negative caching (RURL-003): failed resolutions are never cached.
 *
 * @since v0.12.6
 */

import type { PeacEvidenceCarrier } from '@peac/schema';
import { resolveReceiptUrl, verifyReceiptRef } from './receipt-resolver.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Retrieval metadata recorded on successful resolution (retrieval metadata).
 *
 * Delivered via the onResolved callback, not on the carrier itself.
 */
export interface RetrievalMetadata {
  /** ISO 8601 timestamp when resolution completed */
  resolvedAt: string;
  /** Resolution latency in milliseconds */
  latencyMs: number;
  /** The receipt URL that was resolved */
  url: string;
}

/**
 * Options for creating a receipt URL resolver middleware.
 */
export interface ReceiptUrlResolverOptions {
  /** Request timeout in milliseconds. Default: 5000. */
  timeoutMs?: number;
  /** Maximum response body size in bytes. Default: 65536 (64 KB). */
  maxBytes?: number;
  /**
   * Maximum concurrent resolutions. Default: 4.
   * Must be a positive integer.
   */
  maxConcurrent?: number;
  /**
   * Strict mode: throw on resolution or ref verification failure
   * instead of returning the carrier unchanged. Default: false.
   */
  strict?: boolean;
  /**
   * Callback invoked on successful resolution with retrieval metadata (retrieval metadata).
   * Use this to record audit data without widening the carrier type.
   */
  onResolved?: (metadata: RetrievalMetadata) => void;
}

/**
 * Carrier middleware function returned by the factory.
 *
 * Takes a carrier and returns a pure PeacEvidenceCarrier with
 * receipt_jws populated (if receipt_url was resolved successfully).
 */
export type ReceiptUrlMiddleware = (carrier: PeacEvidenceCarrier) => Promise<PeacEvidenceCarrier>;

// ---------------------------------------------------------------------------
// Semaphore (simple counter + Promise queue)
// ---------------------------------------------------------------------------

class Semaphore {
  private current = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.current++;
        resolve();
      });
    });
  }

  release(): void {
    this.current--;
    const next = this.queue.shift();
    if (next) next();
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create carrier-shaped receipt_url resolution middleware.
 *
 * The returned function resolves `receipt_url` on carriers that have it
 * but lack `receipt_jws`. After fetching, it verifies
 * `sha256(jws) == receipt_ref` and populates `receipt_jws` on success.
 *
 * The returned carrier is always a pure PeacEvidenceCarrier.
 * Retrieval metadata (retrieval metadata) is delivered via the onResolved callback.
 *
 * Behavior:
 * - Carrier already has `receipt_jws` or lacks `receipt_url`: returned unchanged
 * - Resolution succeeds and ref matches: returned with `receipt_jws` populated
 * - Resolution fails or ref mismatch:
 *   - `strict: false` (default): returned unchanged
 *   - `strict: true`: throws
 *
 * No negative caching (RURL-003): every call goes through full
 * SSRF-hardened fetch. Failed resolutions are never cached.
 *
 * @param options - Resolver configuration
 * @returns Carrier middleware function
 * @throws Error if maxConcurrent is not a positive integer
 */
export function createReceiptUrlResolver(
  options?: ReceiptUrlResolverOptions
): ReceiptUrlMiddleware {
  const timeoutMs = options?.timeoutMs ?? 5000;
  const maxBytes = options?.maxBytes ?? 65536;
  const maxConcurrent = options?.maxConcurrent ?? 4;
  const strict = options?.strict ?? false;
  const onResolved = options?.onResolved;

  if (!Number.isInteger(maxConcurrent) || maxConcurrent <= 0) {
    throw new Error(`maxConcurrent must be a positive integer (got: ${maxConcurrent})`);
  }

  const semaphore = new Semaphore(maxConcurrent);

  return async (carrier: PeacEvidenceCarrier): Promise<PeacEvidenceCarrier> => {
    // No-op: carrier already has JWS or lacks receipt_url
    if (carrier.receipt_jws || !carrier.receipt_url) {
      return carrier;
    }

    await semaphore.acquire();
    const startMs = Date.now();

    try {
      const result = await resolveReceiptUrl(carrier.receipt_url, {
        timeoutMs,
        maxBytes,
      });

      if (!result.ok) {
        if (strict) {
          throw Object.assign(new Error(result.error), { code: result.code });
        }
        return carrier;
      }

      const latencyMs = Date.now() - startMs;
      const refVerified = verifyReceiptRef(result.jws, carrier.receipt_ref);

      if (!refVerified) {
        if (strict) {
          throw Object.assign(
            new Error(
              `Receipt ref verification failed: sha256(jws) does not match ${carrier.receipt_ref}`
            ),
            { code: 'E_RECEIPT_URL_REF_MISMATCH' }
          );
        }
        return carrier;
      }

      const resolved: PeacEvidenceCarrier = {
        ...carrier,
        receipt_jws: result.jws,
      };

      // onResolved is best-effort: callback failures must not revert
      // a successful resolution or trigger strict/non-strict behavior
      if (onResolved) {
        try {
          onResolved({
            resolvedAt: new Date().toISOString(),
            latencyMs,
            url: carrier.receipt_url!,
          });
        } catch {
          // swallow: audit/telemetry plumbing must not affect carrier result
        }
      }

      return resolved;
    } catch (e) {
      if (!strict) {
        return carrier;
      }
      throw e;
    } finally {
      semaphore.release();
    }
  };
}
