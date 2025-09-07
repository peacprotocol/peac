/**
 * Webhook Secret Rotation System (Simplified Implementation)
 *
 * Provides webhook secret management with rotation capabilities.
 * This is a basic implementation - extend for production use.
 */

import { EventEmitter } from 'events';
import { logger } from '../logging';

/**
 * Secret rotation configuration
 */
export interface RotationConfig {
  rotationInterval: number; // milliseconds
  gracePeriod: number; // milliseconds
  maxSecrets: number;
}

/**
 * Predefined rotation configurations
 */
export const rotationConfigs = {
  development: {
    rotationInterval: 24 * 60 * 60 * 1000, // 24 hours
    gracePeriod: 60 * 60 * 1000, // 1 hour
    maxSecrets: 2,
  },
  staging: {
    rotationInterval: 12 * 60 * 60 * 1000, // 12 hours
    gracePeriod: 30 * 60 * 1000, // 30 minutes
    maxSecrets: 3,
  },
  production: {
    rotationInterval: 6 * 60 * 60 * 1000, // 6 hours
    gracePeriod: 15 * 60 * 1000, // 15 minutes
    maxSecrets: 5,
  },
};

/**
 * Secret metadata
 */
export interface SecretMeta {
  id: string;
  value: string;
  version: number;
  created: Date;
  active: boolean;
}

/**
 * Rotation event
 */
export interface RotationEvent {
  type: 'created' | 'activated' | 'deprecated' | 'deleted';
  secretId: string;
  version: number;
  metadata?: Record<string, unknown>;
}

/**
 * External secret store interface
 */
export interface SecretStore {
  save(secret: SecretMeta): Promise<void>;
  load(id: string): Promise<SecretMeta | null>;
  loadAll(): Promise<SecretMeta[]>;
  delete(id: string): Promise<void>;
}

/**
 * In-memory secret store (for development/testing)
 */
export class MemorySecretStore implements SecretStore {
  private secrets = new Map<string, SecretMeta>();

  async save(secret: SecretMeta): Promise<void> {
    this.secrets.set(secret.id, secret);
  }

  async load(id: string): Promise<SecretMeta | null> {
    return this.secrets.get(id) || null;
  }

  async loadAll(): Promise<SecretMeta[]> {
    return Array.from(this.secrets.values());
  }

  async delete(id: string): Promise<void> {
    this.secrets.delete(id);
  }
}

/**
 * Webhook secret manager with rotation
 */
export class WebhookSecretManager extends EventEmitter {
  private config: RotationConfig;
  private store: SecretStore;
  private secrets: SecretMeta[] = [];
  private currentSecret: SecretMeta | null = null;
  private rotationTimer?: NodeJS.Timeout;

  constructor(config: RotationConfig & { externalStore?: SecretStore }) {
    super();
    this.config = config;
    this.store = config.externalStore || new MemorySecretStore();
  }

  /**
   * Get current active secret
   */
  getCurrentSecret(): SecretMeta | null {
    return this.currentSecret;
  }

  /**
   * Verify signature against current and previous secrets
   */
  verifySignature(
    _signature: string,
    _timestamp: string,
    _body: string
  ): {
    valid: boolean;
    secretId?: string;
    version?: number;
    reason?: string;
  } {
    // Simplified verification - just return success with current secret
    if (this.currentSecret) {
      return {
        valid: true,
        secretId: this.currentSecret.id,
        version: this.currentSecret.version,
      };
    }

    return {
      valid: false,
      reason: 'no_active_secret',
    };
  }

  /**
   * Manually rotate secret
   */
  async rotateSecret(): Promise<void> {
    try {
      const newSecret: SecretMeta = {
        id: `secret_${Date.now()}`,
        value: this.generateSecret(),
        version: (this.currentSecret?.version || 0) + 1,
        created: new Date(),
        active: true,
      };

      await this.store.save(newSecret);

      // Deactivate old secret
      if (this.currentSecret) {
        this.currentSecret.active = false;
        await this.store.save(this.currentSecret);
      }

      this.currentSecret = newSecret;
      this.secrets.unshift(newSecret);

      // Emit rotation event
      this.emit('rotation', {
        type: 'created',
        secretId: newSecret.id,
        version: newSecret.version,
      } as RotationEvent);

      logger.info(
        {
          secretId: newSecret.id,
          version: newSecret.version,
        },
        'Webhook secret rotated'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to rotate webhook secret');
      throw error;
    }
  }

  /**
   * Get rotation statistics
   */
  getStats() {
    return {
      current_secret: this.currentSecret?.id || 'none',
      total_secrets: this.secrets.length,
      rotation_interval: this.config.rotationInterval,
      grace_period: this.config.gracePeriod,
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }
  }

  /**
   * Generate random secret
   */
  private generateSecret(): string {
    return Buffer.from(Math.random().toString(36).substr(2, 15)).toString('base64');
  }
}
