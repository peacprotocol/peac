import { logger } from '../logging';
import { metrics } from '../metrics';

export type PaymentMode = 'test' | 'staging' | 'live';
export type PaymentEnvironment = 'test' | 'live';

export interface PaymentGuardConfig {
  mode: PaymentMode;
  x402: {
    enabled: boolean;
    rpcUrl?: string;
    privateKey?: string;
  };
  stripe: {
    enabled: boolean;
    secretKey?: string;
    publishableKey?: string;
  };
  credits: {
    enabled: boolean;
  };
}

export class PaymentGuards {
  private config: PaymentGuardConfig;
  private healthy: boolean = false;
  private lastWarning: number = 0;
  private warningThrottleMs: number = 60000; // 1 minute

  constructor() {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  private loadConfig(): PaymentGuardConfig {
    const mode = (process.env.PEAC_PAYMENTS_MODE || 'test') as PaymentMode;

    return {
      mode,
      x402: {
        enabled: process.env.PEAC_X402_ENABLED === 'true',
        rpcUrl: process.env.PEAC_X402_RPC_URL,
        privateKey: process.env.PEAC_X402_PRIVATE_KEY,
      },
      stripe: {
        enabled: process.env.PEAC_STRIPE_ENABLED === 'true',
        secretKey: process.env.STRIPE_SECRET_KEY,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      },
      credits: {
        enabled: true, // Always enabled for testnet
      },
    };
  }

  private validateConfig(): void {
    logger.info({ mode: this.config.mode }, 'Validating payment configuration');

    if (this.config.mode === 'live') {
      const missingSecrets: string[] = [];

      if (this.config.x402.enabled) {
        if (!this.config.x402.rpcUrl) missingSecrets.push('PEAC_X402_RPC_URL');
        if (!this.config.x402.privateKey) missingSecrets.push('PEAC_X402_PRIVATE_KEY');
      }

      if (this.config.stripe.enabled) {
        if (!this.config.stripe.secretKey) missingSecrets.push('STRIPE_SECRET_KEY');
        if (!this.config.stripe.publishableKey) missingSecrets.push('STRIPE_PUBLISHABLE_KEY');
      }

      if (missingSecrets.length > 0) {
        const error = `Live payment mode requires secrets: ${missingSecrets.join(', ')}`;
        logger.fatal({ missingSecrets, mode: this.config.mode }, error);
        throw new Error(error);
      }

      this.healthy = true;
      logger.info('Live payment mode validated successfully');
    } else {
      // Test/staging mode - always disable payments
      this.healthy = false;
      logger.warn({ mode: this.config.mode }, 'Payment processing disabled in non-live mode');
    }
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  getMode(): PaymentMode {
    return this.config.mode;
  }

  getEnvironment(): PaymentEnvironment {
    return this.config.mode === 'live' ? 'live' : 'test';
  }

  canProcessPayments(): boolean {
    // Only allow payments in live mode with healthy config
    return this.config.mode === 'live' && this.healthy;
  }

  validatePaymentAttempt(provider: string, amount: number): void {
    // Special bypass for unit tests that need to test payment flow
    // This allows unit tests to test payment processing mechanics
    // while conformance tests verify payment blocking in non-live mode
    if (provider === 'mock' && process.env.PEAC_UNIT_TEST_BYPASS === 'true') {
      return; // Allow mock payments in specific unit tests
    }

    // Use the same logic as canProcessPayments for consistency
    const canProcess = this.canProcessPayments();

    if (!canProcess) {
      // Throttled warning to avoid log spam
      const now = Date.now();
      if (now - this.lastWarning > this.warningThrottleMs) {
        logger.warn(
          {
            provider,
            amount,
            mode: this.config.mode,
            healthy: this.healthy,
          },
          'Payment attempt blocked - not in live mode or unhealthy'
        );
        this.lastWarning = now;
      }

      metrics.paymentAttempt.inc({
        provider,
        outcome: 'blocked_non_live',
      });

      const env = this.getEnvironment();
      // Tests expect this exact pattern:
      // /Payment processing disabled in.*mode/
      throw new Error(`Payment processing disabled in ${env} mode`);
    }
  }

  createReceiptEnvironmentTag(): { environment: PaymentEnvironment } {
    return { environment: this.getEnvironment() };
  }

  getStatus() {
    return {
      mode: this.config.mode,
      environment: this.getEnvironment(),
      healthy: this.healthy,
      providers: {
        credits: { enabled: this.config.credits.enabled, status: 'live' },
        x402: {
          enabled: this.config.x402.enabled,
          status: this.config.mode === 'live' ? 'live' : 'simulation',
        },
        stripe: {
          enabled: this.config.stripe.enabled,
          status: this.config.mode === 'live' ? 'live' : 'simulation',
        },
      },
    };
  }
}

// Singleton instance - initialized at startup
export const paymentGuards = new PaymentGuards();
