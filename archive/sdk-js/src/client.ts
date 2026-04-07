/**
 * @peac/sdk/client - PEAC client with discover/verify functions
 * Integrates all PEAC packages into a cohesive SDK
 */

import type {
  ClientConfig,
  DiscoverOptions,
  VerifyLocalOptions,
  VerifyRemoteOptions,
  DiscoveryResult,
  VerificationResult,
  ClientError,
} from './types.js';

type PeacClientConfig = Required<Omit<ClientConfig, 'inject'>> & Pick<ClientConfig, 'inject'>;

export class PeacClient {
  private config: PeacClientConfig;
  private discoveryCache = new Map<string, { result: DiscoveryResult; expires: number }>();

  constructor(config: ClientConfig = {}) {
    this.config = {
      defaultKeys: config.defaultKeys || {},
      timeout: config.timeout || 10000,
      userAgent: config.userAgent || 'PEAC SDK/0.9.14',
      retries: config.retries || 2,
      inject: config.inject,
    };
  }

  async discover(origin: string, options: DiscoverOptions = {}): Promise<DiscoveryResult> {
    const cacheKey = origin;
    const cached = this.discoveryCache.get(cacheKey);

    if (cached && cached.expires > Date.now()) {
      return { ...cached.result, cached: true };
    }

    try {
      // Safe dynamic import using template literals to avoid Function constructor
      const moduleName = '@peac/disc';
      const discModule =
        this.config.inject?.disc ??
        (await import(/* webpackIgnore: true */ moduleName).catch(() => null));
      if (!discModule) {
        throw new Error('@peac/disc module not available');
      }

      const result = await Promise.race([
        discModule.discover(origin),
        this.timeoutPromise(options.timeout || this.config.timeout),
      ]);

      const discoveryResult: DiscoveryResult = {
        origin,
        valid: result.valid,
        discovery: result.data,
        errors: result.errors,
        cached: false,
      };

      // Cache successful discoveries for 5 minutes
      if (result.valid) {
        this.discoveryCache.set(cacheKey, {
          result: discoveryResult,
          expires: Date.now() + 300000,
        });
      }

      return discoveryResult;
    } catch (error) {
      throw this.createClientError('DISCOVER_FAILED', error);
    }
  }

  async verifyLocal(
    receipt: string,
    options: VerifyLocalOptions = {}
  ): Promise<VerificationResult> {
    try {
      const moduleName = '@peac/core';
      const coreModule =
        this.config.inject?.core ??
        (await import(/* webpackIgnore: true */ moduleName).catch(() => null));
      if (!coreModule) {
        throw new Error('@peac/core module not available');
      }

      const keys = options.keys || this.config.defaultKeys;

      if (Object.keys(keys).length === 0) {
        throw this.createClientError('NO_KEYS', 'No keys provided for local verification');
      }

      const result = await coreModule.verifyReceipt(receipt, keys);

      let aiprefStatus: 'valid' | 'invalid' | 'not_checked' = 'not_checked';
      if (options.validateAIPref && result.payload.subject?.uri) {
        try {
          const moduleName = '@peac/pref';
          const prefModule =
            this.config.inject?.pref ??
            (await import(/* webpackIgnore: true */ moduleName).catch(() => null));
          if (prefModule) {
            const aiprefResult = await prefModule.resolveAIPref(result.payload.subject.uri);
            aiprefStatus = aiprefResult.status === 'active' ? 'valid' : 'invalid';
          }
        } catch {
          aiprefStatus = 'invalid';
        }
      }

      return {
        valid: true,
        receipt: {
          header: result.header,
          payload: result.payload,
        },
        verification: {
          signature: 'valid',
          schema: 'valid',
          aipref: aiprefStatus,
          timestamp: new Date().toISOString(),
          key_id: result.header.kid,
        },
        remote: false,
      };
    } catch (error) {
      // Re-throw client errors without wrapping them
      if (error instanceof Error && error.name === 'PeacClientError') {
        throw error;
      }

      if (error instanceof Error && error.message?.includes('signature')) {
        return {
          valid: false,
          verification: {
            signature: 'invalid',
            schema: 'valid',
            timestamp: new Date().toISOString(),
          },
          errors: ['Signature verification failed'],
          remote: false,
        };
      }

      throw this.createClientError('VERIFY_LOCAL_FAILED', error);
    }
  }

  async verifyRemote(
    receipt: string,
    endpoint?: string,
    options: VerifyRemoteOptions = {}
  ): Promise<VerificationResult> {
    let verifyUrl = endpoint || options.endpoint;

    // Auto-discover verify endpoint if not provided
    if (!verifyUrl) {
      try {
        // Simple base64url decode without Buffer dependency
        const payload = receipt.split('.')[1];
        const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
        const parsedReceipt = JSON.parse(decoded);

        if (parsedReceipt.subject?.uri) {
          const url = new URL(parsedReceipt.subject.uri);
          const discovery = await this.discover(url.origin);

          if (discovery.valid && discovery.discovery?.verify) {
            verifyUrl = discovery.discovery.verify;
          }
        }
      } catch {
        // Continue with manual endpoint requirement
      }

      if (!verifyUrl) {
        throw this.createClientError(
          'NO_VERIFY_ENDPOINT',
          'No verify endpoint provided or discoverable'
        );
      }
    }

    try {
      const requestBody = {
        receipt,
        ...(options.keys && { keys: options.keys }),
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        options.timeout || this.config.timeout
      );

      const response = await fetch(verifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': this.config.userAgent,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const detail = typeof errorBody.detail === 'string' ? errorBody.detail : undefined;
        throw this.createClientError(
          'REMOTE_VERIFY_FAILED',
          `HTTP ${response.status}`,
          detail ? [detail] : undefined
        );
      }

      const result = (await response.json()) as {
        valid: boolean;
        receipt?: {
          header: Record<string, unknown>;
          payload: Record<string, unknown>;
        };
        verification?: {
          signature: 'valid' | 'invalid';
          schema: 'valid' | 'invalid';
          timestamp: string;
          key_id?: string;
        };
      };

      return {
        valid: result.valid,
        receipt: result.receipt,
        verification: result.verification
          ? {
              ...result.verification,
              aipref: 'not_checked' as const,
            }
          : undefined,
        remote: true,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createClientError('TIMEOUT', 'Verify request timed out');
      }

      throw this.createClientError('VERIFY_REMOTE_FAILED', error);
    }
  }

  // Convenience method that tries local first, then remote
  async verify(
    receipt: string,
    options: VerifyLocalOptions & VerifyRemoteOptions = {}
  ): Promise<VerificationResult> {
    const keys = options.keys || this.config.defaultKeys;

    // Try local verification if we have keys
    if (Object.keys(keys).length > 0) {
      try {
        return await this.verifyLocal(receipt, options);
      } catch (error) {
        // Fall through to remote verification
        console.debug(
          'Local verification failed, trying remote:',
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    // Fall back to remote verification
    return this.verifyRemote(receipt, options.endpoint, options);
  }

  private createClientError(code: string, error: unknown, details?: string[]): ClientError {
    const message = error instanceof Error ? error.message : String(error);
    const clientError = new Error(`${code}: ${message}`) as ClientError;
    clientError.name = 'PeacClientError';
    clientError.code = code;
    clientError.details = details;
    return clientError;
  }

  private timeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Operation timed out')), ms);
    });
  }

  clearCache(): void {
    this.discoveryCache.clear();
  }
}
