import { RateLimitHint } from './types.js';

export function parseRateLimit(response: Response): RateLimitHint {
  const hint: RateLimitHint = {};

  // Parse RFC 9457 RateLimit headers
  const limitHeader = response.headers.get('ratelimit-limit');
  if (limitHeader) {
    const limit = parseInt(limitHeader, 10);
    if (!isNaN(limit) && limit >= 0) {
      hint.limit = limit;
    }
  }

  const remainingHeader = response.headers.get('ratelimit-remaining');
  if (remainingHeader) {
    const remaining = parseInt(remainingHeader, 10);
    if (!isNaN(remaining) && remaining >= 0) {
      hint.remaining = remaining;
    }
  }

  const resetHeader = response.headers.get('ratelimit-reset');
  if (resetHeader) {
    const reset = parseInt(resetHeader, 10);
    if (!isNaN(reset) && reset > 0) {
      hint.reset = reset;
    }
  }

  return hint;
}

export function calculateBackoffDelay(hint: RateLimitHint): number | null {
  if (hint.remaining !== undefined && hint.remaining > 0) {
    return null; // No backoff needed
  }

  if (hint.reset !== undefined) {
    const now = Math.floor(Date.now() / 1000);
    const delay = hint.reset - now;
    return delay > 0 ? delay * 1000 : null; // Convert to milliseconds
  }

  if (hint.limit !== undefined) {
    // Fallback: assume 1-minute window
    return 60 * 1000;
  }

  return null;
}

export function shouldRetryAfter(hint: RateLimitHint, maxDelayMs: number = 300000): boolean {
  const delay = calculateBackoffDelay(hint);
  return delay !== null && delay <= maxDelayMs;
}

export interface RetryOptions {
  maxAttempts?: number;
  maxDelayMs?: number;
  baseDelayMs?: number;
  jitter?: boolean;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  maxDelayMs: 300000, // 5 minutes
  baseDelayMs: 1000,
  jitter: true,
};

export async function withRateLimitRetry<T>(
  fn: () => Promise<{ response: Response; data: T }>,
  options: RetryOptions = {},
): Promise<{ response: Response; data: T }> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let attempt = 0;

  while (attempt < opts.maxAttempts) {
    try {
      const result = await fn();

      // Check for rate limiting
      const hint = parseRateLimit(result.response);
      if (
        result.response.status === 429 ||
        (hint.remaining !== undefined && hint.remaining === 0)
      ) {
        if (attempt === opts.maxAttempts - 1) {
          // Last attempt, return anyway
          return result;
        }

        const delay = calculateBackoffDelay(hint);
        if (delay !== null && delay <= opts.maxDelayMs) {
          // Add jitter to prevent thundering herd
          const finalDelay = opts.jitter
            ? delay + Math.random() * Math.min(delay * 0.1, 1000)
            : delay;

          await new Promise((resolve) => setTimeout(resolve, finalDelay));
          attempt++;
          continue;
        }
      }

      return result;
    } catch (error) {
      if (attempt === opts.maxAttempts - 1) {
        throw error;
      }

      // Exponential backoff for other errors
      const delay = opts.baseDelayMs * Math.pow(2, attempt);
      const finalDelay = opts.jitter ? delay + Math.random() * delay * 0.1 : delay;

      await new Promise((resolve) => setTimeout(resolve, Math.min(finalDelay, opts.maxDelayMs)));
      attempt++;
    }
  }

  throw new Error('Max retry attempts exceeded');
}
