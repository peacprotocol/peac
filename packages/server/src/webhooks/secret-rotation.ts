/**
 * PEAC Protocol v0.9.6 Webhook Secret Rotation
 *
 * Enterprise-grade webhook secret rotation with:
 * - Versioned secret management with seamless rotation
 * - Configurable grace periods for gradual rollover
 * - Automatic fallback verification during rotation
 * - Comprehensive monitoring and alerting
 * - Secret validation and entropy checking
 * - Integration with external secret stores
 * - Audit logging for compliance
 */

import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { EventEmitter } from 'events';
import { logger } from '../logging';
import { prometheus } from '../metrics/prom';

export interface WebhookSecret {
  id: string;
  value: string;
  version: number;
  createdAt: Date;
  activatedAt?: Date;
  deprecatedAt?: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface SecretRotationConfig {
  name: string;
  rotationIntervalMs: number; // How often to rotate (e.g., 30 days)
  gracePeriodMs: number; // How long old secrets remain valid
  preActivationMs: number; // How long before activation to create secret
  maxActiveSecrets: number; // Maximum number of active secrets
  entropyMinBits: number; // Minimum entropy for generated secrets
  secretLength: number; // Length of generated secrets in bytes
  enableAuditLogging: boolean;
  externalStore?: SecretStore;
}

export interface SecretStore {
  get(secretId: string): Promise<WebhookSecret | null>;
  set(secret: WebhookSecret): Promise<void>;
  list(activeOnly?: boolean): Promise<WebhookSecret[]>;
  delete(secretId: string): Promise<void>;
}

export interface RotationEvent {
  type:
    | 'secret_created'
    | 'secret_activated'
    | 'secret_deprecated'
    | 'secret_expired'
    | 'rotation_failed';
  secretId: string;
  version: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export class WebhookSecretManager extends EventEmitter {
  private secrets: Map<string, WebhookSecret> = new Map();
  private rotationTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private rotationInProgress: boolean = false;
  private stats = {
    totalRotations: 0,
    successfulRotations: 0,
    failedRotations: 0,
    activeSecrets: 0,
    lastRotation: null as Date | null,
    nextRotation: null as Date | null,
  };

  constructor(private config: SecretRotationConfig) {
    super();
    this.setupMetrics();
    this.loadExistingSecrets();
    this.scheduleRotation();
    this.scheduleCleanup();
  }

  /**
   * Get current active secret for signing
   */
  getCurrentSecret(): WebhookSecret | null {
    const activeSecrets = Array.from(this.secrets.values())
      .filter((s) => this.isSecretActive(s))
      .sort((a, b) => b.version - a.version);

    return activeSecrets[0] || null;
  }

  /**
   * Get all secrets valid for verification (including grace period)
   */
  getValidSecrets(): WebhookSecret[] {
    return Array.from(this.secrets.values())
      .filter((s) => this.isSecretValidForVerification(s))
      .sort((a, b) => b.version - a.version);
  }

  /**
   * Verify signature against all valid secrets
   */
  verifySignature(
    signature: string,
    timestamp: string,
    rawBody: string,
  ): {
    valid: boolean;
    secretId?: string;
    version?: number;
    reason?: string;
  } {
    const validSecrets = this.getValidSecrets();

    if (validSecrets.length === 0) {
      return { valid: false, reason: 'no_valid_secrets' };
    }

    // Try each secret in order (newest first)
    for (const secret of validSecrets) {
      try {
        const computedSig = this.createSignature(secret.value, timestamp, rawBody);

        if (
          computedSig.length === signature.length &&
          timingSafeEqual(Buffer.from(computedSig, 'hex'), Buffer.from(signature, 'hex'))
        ) {
          // Record usage metrics
          this.recordSecretUsage(secret);

          return {
            valid: true,
            secretId: secret.id,
            version: secret.version,
          };
        }
      } catch (error) {
        logger.warn(
          {
            secretId: secret.id,
            version: secret.version,
            error: (error as Error).message,
          },
          'Error verifying signature with secret',
        );
      }
    }

    return { valid: false, reason: 'signature_mismatch' };
  }

  /**
   * Create signature with given secret
   */
  createSignature(secret: string, timestamp: string, rawBody: string): string {
    const payload = `${timestamp}.${rawBody}`;
    return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  }

  /**
   * Manually trigger secret rotation
   */
  async rotateSecret(): Promise<WebhookSecret> {
    if (this.rotationInProgress) {
      throw new Error('Secret rotation already in progress');
    }

    this.rotationInProgress = true;
    const startTime = Date.now();

    try {
      logger.info(
        {
          rotationConfig: this.config.name,
          currentSecrets: this.secrets.size,
        },
        'Starting webhook secret rotation',
      );

      // Generate new secret
      const newSecret = await this.generateSecret();

      // Pre-activation period
      await this.scheduleSecretActivation(newSecret);

      // Store secret
      await this.storeSecret(newSecret);

      // Update metrics
      this.stats.totalRotations++;
      this.stats.successfulRotations++;
      this.stats.lastRotation = new Date();
      this.updateRotationMetrics();

      // Emit event
      const event: RotationEvent = {
        type: 'secret_created',
        secretId: newSecret.id,
        version: newSecret.version,
        timestamp: new Date(),
        metadata: { rotationDurationMs: Date.now() - startTime },
      };
      this.emit('rotation', event);

      if (this.config.enableAuditLogging) {
        logger.info(
          {
            event: 'webhook_secret_created',
            secretId: newSecret.id,
            version: newSecret.version,
            rotationConfig: this.config.name,
            duration: Date.now() - startTime,
          },
          'Webhook secret created',
        );
      }

      return newSecret;
    } catch (error) {
      this.stats.failedRotations++;
      this.updateRotationMetrics();

      const event: RotationEvent = {
        type: 'rotation_failed',
        secretId: '',
        version: 0,
        timestamp: new Date(),
        metadata: {
          error: (error as Error).message,
          rotationDurationMs: Date.now() - startTime,
        },
      };
      this.emit('rotation', event);

      logger.error(
        {
          error: (error as Error).message,
          rotationConfig: this.config.name,
          duration: Date.now() - startTime,
        },
        'Webhook secret rotation failed',
      );

      throw error;
    } finally {
      this.rotationInProgress = false;
    }
  }

  /**
   * Generate cryptographically secure secret
   */
  private async generateSecret(): Promise<WebhookSecret> {
    const secretBytes = randomBytes(this.config.secretLength);
    const secretValue = secretBytes.toString('base64url');

    // Validate entropy
    const entropy = this.calculateEntropy(secretValue);
    if (entropy < this.config.entropyMinBits) {
      throw new Error(
        `Generated secret has insufficient entropy: ${entropy} bits (minimum: ${this.config.entropyMinBits})`,
      );
    }

    const currentVersion = Math.max(0, ...Array.from(this.secrets.values()).map((s) => s.version));
    const now = new Date();

    return {
      id: `whsec_${Date.now()}_${randomBytes(8).toString('hex')}`,
      value: secretValue,
      version: currentVersion + 1,
      createdAt: now,
      activatedAt: new Date(now.getTime() + this.config.preActivationMs),
      expiresAt: new Date(
        now.getTime() + this.config.rotationIntervalMs + this.config.gracePeriodMs,
      ),
      metadata: {
        entropyBits: entropy,
        generator: 'peac-webhook-rotation',
      },
    };
  }

  /**
   * Calculate Shannon entropy of a string
   */
  private calculateEntropy(str: string): number {
    const len = str.length;
    const frequencies: Record<string, number> = {};

    // Count character frequencies
    for (const char of str) {
      frequencies[char] = (frequencies[char] || 0) + 1;
    }

    // Calculate Shannon entropy
    let entropy = 0;
    for (const freq of Object.values(frequencies)) {
      const probability = freq / len;
      entropy -= probability * Math.log2(probability);
    }

    return entropy * len; // Return total entropy in bits
  }

  /**
   * Schedule secret activation
   */
  private async scheduleSecretActivation(secret: WebhookSecret): Promise<void> {
    if (!secret.activatedAt) return;

    const delay = secret.activatedAt.getTime() - Date.now();
    if (delay <= 0) {
      // Activate immediately
      secret.activatedAt = new Date();
      return;
    }

    // Schedule activation
    setTimeout(async () => {
      try {
        await this.activateSecret(secret.id);
      } catch (error) {
        logger.error(
          {
            secretId: secret.id,
            error: (error as Error).message,
          },
          'Failed to activate scheduled secret',
        );
      }
    }, delay);
  }

  /**
   * Activate a secret
   */
  private async activateSecret(secretId: string): Promise<void> {
    const secret = this.secrets.get(secretId);
    if (!secret) {
      throw new Error(`Secret not found: ${secretId}`);
    }

    secret.activatedAt = new Date();
    await this.storeSecret(secret);

    // Deprecate old secrets if we exceed max active
    await this.enforceMaxActiveSecrets();

    const event: RotationEvent = {
      type: 'secret_activated',
      secretId: secret.id,
      version: secret.version,
      timestamp: new Date(),
    };
    this.emit('rotation', event);

    if (this.config.enableAuditLogging) {
      logger.info(
        {
          event: 'webhook_secret_activated',
          secretId: secret.id,
          version: secret.version,
          rotationConfig: this.config.name,
        },
        'Webhook secret activated',
      );
    }
  }

  /**
   * Enforce maximum active secrets policy
   */
  private async enforceMaxActiveSecrets(): Promise<void> {
    const activeSecrets = Array.from(this.secrets.values())
      .filter((s) => this.isSecretActive(s))
      .sort((a, b) => a.version - b.version); // Oldest first

    while (activeSecrets.length > this.config.maxActiveSecrets) {
      const oldestSecret = activeSecrets.shift()!;
      await this.deprecateSecret(oldestSecret.id);
    }
  }

  /**
   * Deprecate a secret
   */
  private async deprecateSecret(secretId: string): Promise<void> {
    const secret = this.secrets.get(secretId);
    if (!secret) return;

    secret.deprecatedAt = new Date();
    secret.expiresAt = new Date(Date.now() + this.config.gracePeriodMs);
    await this.storeSecret(secret);

    const event: RotationEvent = {
      type: 'secret_deprecated',
      secretId: secret.id,
      version: secret.version,
      timestamp: new Date(),
    };
    this.emit('rotation', event);

    if (this.config.enableAuditLogging) {
      logger.info(
        {
          event: 'webhook_secret_deprecated',
          secretId: secret.id,
          version: secret.version,
          rotationConfig: this.config.name,
        },
        'Webhook secret deprecated',
      );
    }
  }

  /**
   * Store secret (local + external)
   */
  private async storeSecret(secret: WebhookSecret): Promise<void> {
    // Store locally
    this.secrets.set(secret.id, secret);

    // Store in external store if configured
    if (this.config.externalStore) {
      await this.config.externalStore.set(secret);
    }

    this.updateSecretCountMetrics();
  }

  /**
   * Load existing secrets from external store
   */
  private async loadExistingSecrets(): Promise<void> {
    if (!this.config.externalStore) return;

    try {
      const existingSecrets = await this.config.externalStore.list(true);
      for (const secret of existingSecrets) {
        this.secrets.set(secret.id, secret);
      }

      logger.info(
        {
          rotationConfig: this.config.name,
          secretsLoaded: existingSecrets.length,
        },
        'Loaded existing webhook secrets',
      );
    } catch (error) {
      logger.warn(
        {
          rotationConfig: this.config.name,
          error: (error as Error).message,
        },
        'Failed to load existing secrets from external store',
      );
    }
  }

  /**
   * Check if secret is currently active
   */
  private isSecretActive(secret: WebhookSecret): boolean {
    const now = new Date();
    return !!(
      secret.activatedAt &&
      secret.activatedAt <= now &&
      !secret.deprecatedAt &&
      (!secret.expiresAt || secret.expiresAt > now)
    );
  }

  /**
   * Check if secret is valid for verification (includes grace period)
   */
  private isSecretValidForVerification(secret: WebhookSecret): boolean {
    const now = new Date();
    return !!(
      secret.activatedAt &&
      secret.activatedAt <= now &&
      (!secret.expiresAt || secret.expiresAt > now)
    );
  }

  /**
   * Record secret usage metrics
   */
  private recordSecretUsage(secret: WebhookSecret): void {
    prometheus.incrementCounter('webhook_secret_verifications_total', {
      rotation_config: this.config.name,
      secret_version: secret.version.toString(),
      secret_id: secret.id,
    });

    // Check if using deprecated secret
    if (secret.deprecatedAt) {
      prometheus.incrementCounter('webhook_deprecated_secret_usage_total', {
        rotation_config: this.config.name,
        secret_version: secret.version.toString(),
      });
    }
  }

  /**
   * Schedule automatic rotation
   */
  private scheduleRotation(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }

    this.rotationTimer = setInterval(async () => {
      try {
        await this.rotateSecret();
      } catch (error) {
        logger.error(
          {
            rotationConfig: this.config.name,
            error: (error as Error).message,
          },
          'Scheduled secret rotation failed',
        );
      }
    }, this.config.rotationIntervalMs);

    // Calculate next rotation time
    this.stats.nextRotation = new Date(Date.now() + this.config.rotationIntervalMs);

    logger.info(
      {
        rotationConfig: this.config.name,
        rotationInterval: this.config.rotationIntervalMs,
        nextRotation: this.stats.nextRotation,
      },
      'Webhook secret rotation scheduled',
    );
  }

  /**
   * Schedule cleanup of expired secrets
   */
  private scheduleCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Run cleanup every hour
    this.cleanupTimer = setInterval(
      async () => {
        await this.cleanupExpiredSecrets();
      },
      60 * 60 * 1000,
    );
  }

  /**
   * Clean up expired secrets
   */
  private async cleanupExpiredSecrets(): Promise<void> {
    const now = new Date();
    const expiredSecrets = Array.from(this.secrets.values()).filter(
      (s) => s.expiresAt && s.expiresAt <= now,
    );

    for (const secret of expiredSecrets) {
      try {
        // Remove from local store
        this.secrets.delete(secret.id);

        // Remove from external store
        if (this.config.externalStore) {
          await this.config.externalStore.delete(secret.id);
        }

        const event: RotationEvent = {
          type: 'secret_expired',
          secretId: secret.id,
          version: secret.version,
          timestamp: new Date(),
        };
        this.emit('rotation', event);

        if (this.config.enableAuditLogging) {
          logger.info(
            {
              event: 'webhook_secret_expired',
              secretId: secret.id,
              version: secret.version,
              rotationConfig: this.config.name,
            },
            'Webhook secret expired and removed',
          );
        }
      } catch (error) {
        logger.error(
          {
            secretId: secret.id,
            error: (error as Error).message,
          },
          'Failed to clean up expired secret',
        );
      }
    }

    if (expiredSecrets.length > 0) {
      this.updateSecretCountMetrics();
      logger.debug(
        {
          rotationConfig: this.config.name,
          cleanedSecrets: expiredSecrets.length,
        },
        'Cleaned up expired webhook secrets',
      );
    }
  }

  /**
   * Get current statistics
   */
  getStats() {
    this.stats.activeSecrets = Array.from(this.secrets.values()).filter((s) =>
      this.isSecretActive(s),
    ).length;

    return {
      ...this.stats,
      totalSecrets: this.secrets.size,
      validSecrets: this.getValidSecrets().length,
      config: {
        name: this.config.name,
        rotationIntervalMs: this.config.rotationIntervalMs,
        gracePeriodMs: this.config.gracePeriodMs,
        maxActiveSecrets: this.config.maxActiveSecrets,
      },
    };
  }

  /**
   * Setup Prometheus metrics
   */
  private setupMetrics(): void {
    prometheus.setGauge(
      'webhook_rotation_interval_seconds',
      { rotation_config: this.config.name },
      this.config.rotationIntervalMs / 1000,
    );

    prometheus.setGauge(
      'webhook_grace_period_seconds',
      { rotation_config: this.config.name },
      this.config.gracePeriodMs / 1000,
    );
  }

  /**
   * Update rotation metrics
   */
  private updateRotationMetrics(): void {
    prometheus.setGauge(
      'webhook_rotation_total',
      { rotation_config: this.config.name },
      this.stats.totalRotations,
    );

    prometheus.setGauge(
      'webhook_rotation_success_total',
      { rotation_config: this.config.name },
      this.stats.successfulRotations,
    );

    prometheus.setGauge(
      'webhook_rotation_failures_total',
      { rotation_config: this.config.name },
      this.stats.failedRotations,
    );

    if (this.stats.lastRotation) {
      prometheus.setGauge(
        'webhook_last_rotation_timestamp',
        { rotation_config: this.config.name },
        this.stats.lastRotation.getTime() / 1000,
      );
    }
  }

  /**
   * Update secret count metrics
   */
  private updateSecretCountMetrics(): void {
    const activeSecrets = Array.from(this.secrets.values()).filter((s) => this.isSecretActive(s));
    const validSecrets = this.getValidSecrets();

    prometheus.setGauge(
      'webhook_secrets_active_total',
      { rotation_config: this.config.name },
      activeSecrets.length,
    );

    prometheus.setGauge(
      'webhook_secrets_valid_total',
      { rotation_config: this.config.name },
      validSecrets.length,
    );

    prometheus.setGauge(
      'webhook_secrets_total',
      { rotation_config: this.config.name },
      this.secrets.size,
    );
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info(
      {
        rotationConfig: this.config.name,
      },
      'Shutting down webhook secret manager',
    );

    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = undefined;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Wait for any in-progress rotation to complete
    let retries = 0;
    while (this.rotationInProgress && retries < 30) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      retries++;
    }

    this.removeAllListeners();
  }
}

/**
 * In-memory secret store implementation
 */
export class MemorySecretStore implements SecretStore {
  private secrets: Map<string, WebhookSecret> = new Map();

  async get(secretId: string): Promise<WebhookSecret | null> {
    return this.secrets.get(secretId) || null;
  }

  async set(secret: WebhookSecret): Promise<void> {
    this.secrets.set(secret.id, { ...secret });
  }

  async list(activeOnly = false): Promise<WebhookSecret[]> {
    const secrets = Array.from(this.secrets.values());
    if (!activeOnly) return secrets;

    const now = new Date();
    return secrets.filter(
      (s) => s.activatedAt && s.activatedAt <= now && (!s.expiresAt || s.expiresAt > now),
    );
  }

  async delete(secretId: string): Promise<void> {
    this.secrets.delete(secretId);
  }
}

/**
 * Default configurations for different environments
 */
export const rotationConfigs = {
  production: {
    name: 'production',
    rotationIntervalMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    gracePeriodMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    preActivationMs: 24 * 60 * 60 * 1000, // 1 day
    maxActiveSecrets: 2,
    entropyMinBits: 256,
    secretLength: 32,
    enableAuditLogging: true,
  },

  staging: {
    name: 'staging',
    rotationIntervalMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    gracePeriodMs: 2 * 24 * 60 * 60 * 1000, // 2 days
    preActivationMs: 4 * 60 * 60 * 1000, // 4 hours
    maxActiveSecrets: 2,
    entropyMinBits: 256,
    secretLength: 32,
    enableAuditLogging: true,
  },

  development: {
    name: 'development',
    rotationIntervalMs: 60 * 60 * 1000, // 1 hour
    gracePeriodMs: 30 * 60 * 1000, // 30 minutes
    preActivationMs: 5 * 60 * 1000, // 5 minutes
    maxActiveSecrets: 3,
    entropyMinBits: 128,
    secretLength: 24,
    enableAuditLogging: false,
  },
};
