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

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.failures >= 5 && Date.now() - this.lastFailTime < 30000) {
      throw new Error('Circuit breaker open');
    }
    try {
      const result = await fn();
      this.failures = 0;
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailTime = Date.now();
      throw error;
    }
  }
}

const breaker = new CircuitBreaker();

export async function peacFetch(
  input: RequestInfo | URL,
  init?: FetchOptions
): Promise<PEACResponse> {
  const maxRetries = init?.maxRetries ?? 3;
  const bridgeUrl = init?.bridgeUrl ?? 'http://127.0.0.1:31415';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const enforceResult = await breaker.execute(() =>
        fetch(`${bridgeUrl}/enforce`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resource: typeof input === 'string' ? input : input.toString(),
            purpose: 'ai-training',
          }),
        })
      );

      if (enforceResult.status === 402) {
        const problem = await enforceResult.json();
        throw new PEACPaymentRequired(problem);
      }
      if (!enforceResult.ok) throw new Error('Enforcement failed');

      const response = await fetch(input, init);
      const receipt = response.headers.get('PEAC-Receipt');
      let verified = false;

      if (receipt) {
        try {
          const verifyResult = await fetch(`${bridgeUrl}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ receipt }),
          });
          if (verifyResult.ok) {
            const result = await verifyResult.json();
            verified = result.valid === true;
          }
        } catch {
          // Verification failed, continue
        }
      }

      return { response, receipt: receipt || undefined, verified };
    } catch (error: any) {
      if (error instanceof PEACPaymentRequired) throw error;
      if (attempt >= maxRetries) throw error;
      await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
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
