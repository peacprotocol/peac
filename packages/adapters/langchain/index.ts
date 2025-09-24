// SPDX-License-Identifier: Apache-2.0
import { Problems } from '@peac/core/problems';

interface PEACResponse {
  response: Response;
  receipt?: string;
  verified?: boolean;
}

interface FetchOptions extends RequestInit {
  maxRetries?: number;
  bridgeUrl?: string;
}

class CircuitBreaker {
  private failures = 0;
  private lastFailTime = 0;
  private readonly threshold = 5;
  private readonly timeout = 30000; // 30s

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error('Circuit breaker open');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private isOpen(): boolean {
    return this.failures >= this.threshold &&
           Date.now() - this.lastFailTime < this.timeout;
  }

  private onSuccess(): void {
    this.failures = 0;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailTime = Date.now();
  }
}

const breaker = new CircuitBreaker();

export async function peacFetch(
  input: RequestInfo | URL,
  init?: FetchOptions
): Promise<PEACResponse> {
  const maxRetries = init?.maxRetries ?? 3;
  const bridgeUrl = init?.bridgeUrl ?? 'http://127.0.0.1:31415';

  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      // Pre-enforce via bridge
      const enforceResult = await breaker.execute(() =>
        fetch(`${bridgeUrl}/enforce`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resource: typeof input === 'string' ? input : input.toString(),
            purpose: 'ai-training'
          })
        })
      );

      if (enforceResult.status === 402) {
        const problem = await enforceResult.json();
        throw new PEACPaymentRequired(problem);
      }

      if (!enforceResult.ok) {
        const problem = await enforceResult.json();
        throw new Error(problem.detail || 'Enforcement failed');
      }

      // Make actual request
      const response = await fetch(input, init);

      // Extract receipt
      const receipt = response.headers.get('PEAC-Receipt');
      let verified = false;

      if (receipt) {
        try {
          const verifyResult = await fetch(`${bridgeUrl}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ receipt })
          });

          if (verifyResult.ok) {
            const result = await verifyResult.json();
            verified = result.valid === true;
          }
        } catch {
          // Verification failed, but don't block
        }
      }

      return { response, receipt: receipt || undefined, verified };

    } catch (error: any) {
      if (error instanceof PEACPaymentRequired) {
        throw error; // Don't retry payment errors
      }

      if (attempt >= maxRetries) {
        throw error;
      }

      // Exponential backoff for transient errors
      await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
      attempt++;
    }
  }

  throw new Error('Max retries exceeded');
}

export class PEACPaymentRequired extends Error {
  constructor(public problem: any) {
    super(problem.detail || 'Payment required');
    this.name = 'PEACPaymentRequired';
  }
}