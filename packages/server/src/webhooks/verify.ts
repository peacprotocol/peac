import { createHmac, timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../logging';
import { problemDetails } from '../http/problems';
import { WebhookSecretManager, MemorySecretStore, rotationConfigs } from './secret-rotation';
import { prometheus } from '../metrics/prom';
import { TTLReplayCache } from '../utils/ttl-replay-cache';

/**
 * Parse 'Peac-Signature' header of the form: "t=<ts>,s=<hex>"
 * Falls back to Peac-Timestamp header if 't=' not present.
 */
export function parsePeacSignature(
  sigHeader?: string | null,
  tsHeader?: string | null,
): { t: string; s: string } {
  const result: { t: string; s: string } = { t: '', s: '' };
  if (sigHeader) {
    for (const part of sigHeader.split(',')) {
      const [k, v] = part.split('=').map((s) => s.trim());
      if (k === 't' && v) result.t = v;
      if (k === 's' && v) result.s = v;
    }
  }
  if (!result.t && tsHeader) result.t = tsHeader.trim();
  return result;
}

/**
 * Canonical string the HMAC signs: "<METHOD>\n<PATH>\n<TIMESTAMP>\n<BODY>"
 * PATH should not include query string.
 */
export function canonicalString(method: string, path: string, t: string, rawBody: Buffer): Buffer {
  const head = `${method.toUpperCase()}\n${path}\n${t}\n`;
  // Concatenate without re-encoding the body
  return Buffer.concat([Buffer.from(head, 'utf8'), rawBody ?? Buffer.from('', 'utf8')]);
}

/**
 * Verify webhook request. Throws on failure; returns timestamp on success.
 */
export function verifyWebhookRequest(req: Request, secret: string): string {
  const rawBody: Buffer | undefined = req.rawBody;
  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    throw new Error('Missing raw body for webhook verification');
  }
  const sigHeader = req.get('Peac-Signature');
  const tsHeader = req.get('Peac-Timestamp');
  const { t, s } = parsePeacSignature(sigHeader, tsHeader);
  if (!t || !s) throw new Error('Missing signature parameters');
  const pathOnly = (req.originalUrl || req.url || '').split('?')[0] || '/peac/webhooks';
  const data = canonicalString(req.method, pathOnly, t, rawBody);
  const expected = createHmac('sha256', secret).update(data).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(s, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Invalid webhook signature');
  }
  return t;
}


export interface WebhookConfig {
  secret: string;
  toleranceSeconds: number;
  maxBodySize: number;
  enableRotation?: boolean;
  rotationConfig?: string;
  requireHostInSignature?: boolean;
}

const replayCache = new TTLReplayCache({ ttlMs: 10 * 60 * 1000, maxSize: 10_000 });

export function createWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  options?: {
    method?: string;
    host?: string;
    path?: string;
    requireHostInSignature?: boolean;
  },
): string {
  const method = options?.method || 'POST';
  const path = options?.path || '/webhooks/peac';

  let payload = `method:${method}\n`;

  // Optional host binding - only include if required and available
  if (options?.requireHostInSignature && options?.host) {
    payload += `host:${options.host}\n`;
  }

  payload += `path:${path}\n`;
  payload += `t:${timestamp}\n`;
  payload += `body:${rawBody}`;

  const signature = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  return `t=${timestamp},s=${signature}`;
}

export function parseWebhookSignature(
  signature: string,
): { timestamp: string; signature: string } | null {
  try {
    const parts = signature.split(',');
    let timestamp = '';
    let sig = '';

    for (const part of parts) {
      const trimmed = part.trim(); // Allow spaces
      const [key, value] = trimmed.split('=');
      if (key?.trim() === 't') timestamp = value?.trim() || '';
      if (key?.trim() === 's') sig = value?.trim() || '';
    }

    if (!timestamp || !sig) return null;
    return { timestamp, signature: sig };
  } catch {
    return null;
  }
}

export function verifyWebhookSignature(
  secret: string,
  signature: string,
  rawBody: string,
  toleranceSeconds = 300, // 5 minutes as per plan
  options?: {
    method?: string;
    host?: string;
    path?: string;
    requireHostInSignature?: boolean;
  },
): { valid: boolean; reason?: string } {
  const parsed = parseWebhookSignature(signature);
  if (!parsed) {
    return { valid: false, reason: 'invalid_signature_format' };
  }

  const { timestamp, signature: expectedSig } = parsed;

  // Check timestamp tolerance (prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  const webhookTime = parseInt(timestamp, 10);

  if (isNaN(webhookTime)) {
    return { valid: false, reason: 'invalid_timestamp' };
  }

  const timeDiff = Math.abs(now - webhookTime);
  if (timeDiff > toleranceSeconds) {
    return { valid: false, reason: 'timestamp_too_old' };
  }

  // Verify signature using new canonical format
  const computedSigFull = createWebhookSignature(secret, timestamp, rawBody, options);
  const computedParsed = parseWebhookSignature(computedSigFull);

  if (!computedParsed) {
    return { valid: false, reason: 'signature_computation_error' };
  }

  const computedSig = computedParsed.signature;

  if (computedSig.length !== expectedSig.length) {
    return { valid: false, reason: 'signature_mismatch' };
  }

  const isValid = timingSafeEqual(Buffer.from(computedSig, 'hex'), Buffer.from(expectedSig, 'hex'));

  if (!isValid) {
    return { valid: false, reason: 'signature_mismatch' };
  }

  // Check for replay
  const replayKey = `${timestamp}:${createHmac('sha256', 'replay').update(rawBody).digest('hex')}`;
  if (replayCache.has(replayKey)) {
    return { valid: false, reason: 'replay_attack' };
  }

  // Mark as seen
  replayCache.add(replayKey);

  return { valid: true };
}

export class WebhookVerifier {
  private secretManager?: WebhookSecretManager;

  constructor(private config: WebhookConfig) {
    this.initializeSecretRotation();
  }

  /**
   * Initialize secret rotation if enabled
   */
  private initializeSecretRotation(): void {
    if (!this.config.enableRotation) return;

    const environment = process.env.NODE_ENV || 'development';
    const configName = this.config.rotationConfig || environment;

    let rotationConfig;
    if (configName in rotationConfigs) {
      rotationConfig = rotationConfigs[configName as keyof typeof rotationConfigs];
    } else {
      logger.warn(
        {
          configName,
          availableConfigs: Object.keys(rotationConfigs),
        },
        'Unknown rotation config, using development defaults',
      );
      rotationConfig = rotationConfigs.development;
    }

    // Use in-memory store for now (can be extended to use external stores)
    const store = new MemorySecretStore();
    this.secretManager = new WebhookSecretManager({
      ...rotationConfig,
      externalStore: store,
    });

    // Set up event listeners
    this.secretManager.on('rotation', (event) => {
      logger.info(
        {
          event: event.type,
          secretId: event.secretId,
          version: event.version,
          metadata: event.metadata,
        },
        'Webhook secret rotation event',
      );
    });

    // Create initial secret if none exists
    if (!this.secretManager.getCurrentSecret()) {
      this.secretManager.rotateSecret().catch((error) => {
        logger.error(
          {
            error: error.message,
          },
          'Failed to create initial webhook secret',
        );
      });
    }

    logger.info(
      {
        rotationConfig: configName,
        rotationEnabled: true,
      },
      'Webhook secret rotation initialized',
    );
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();

      // Reject requests with Content-Encoding for v0.9.6 (avoid signature ambiguity)
      const contentEncoding = req.get('Content-Encoding');
      if (contentEncoding) {
        logger.warn(
          { path: req.path, contentEncoding },
          'Rejecting webhook with Content-Encoding header',
        );
        prometheus.incrementCounter('webhook_verification_total', {
          result: 'invalid',
          reason: 'content_encoding_rejected',
        });
        return problemDetails.send(res, 'unsupported_media_type', {
          detail: 'Content-Encoding not supported for webhooks in v0.9.6',
        });
      }

      // Check if we have any secrets configured
      const hasRotation = this.secretManager && this.secretManager.getCurrentSecret();
      const hasStaticSecret = this.config.secret;

      if (!hasRotation && !hasStaticSecret) {
        logger.error('No webhook secrets configured');
        prometheus.incrementCounter('webhook_verification_total', {
          result: 'error',
          reason: 'no_secrets',
        });
        return problemDetails.send(res, 'internal_error', {
          detail: 'Webhook verification not properly configured',
        });
      }

      const signature = req.get('Peac-Signature');
      if (!signature) {
        logger.warn({ path: req.path }, 'Missing webhook signature');
        prometheus.incrementCounter('webhook_verification_total', {
          result: 'invalid',
          reason: 'missing_signature',
        });
        return problemDetails.send(res, 'webhook_signature_invalid', {
          detail: 'Missing Peac-Signature header',
        });
      }

      // Get raw body from middleware
      const rawBody = req.rawBody;
      if (!rawBody) {
        logger.warn({ path: req.path }, 'Missing raw body for webhook verification');
        prometheus.incrementCounter('webhook_verification_total', {
          result: 'invalid',
          reason: 'missing_body',
        });
        return problemDetails.send(res, 'webhook_signature_invalid', {
          detail: 'Missing request body',
        });
      }

      if (rawBody.length > this.config.maxBodySize) {
        logger.warn({ path: req.path, bodySize: rawBody.length }, 'Webhook body too large');
        prometheus.incrementCounter('webhook_verification_total', {
          result: 'invalid',
          reason: 'body_too_large',
        });
        return problemDetails.send(res, 'validation_error', {
          detail: `Request body too large (max ${this.config.maxBodySize} bytes)`,
        });
      }

      // Parse signature to get timestamp
      const parsed = parseWebhookSignature(signature);
      if (!parsed) {
        logger.warn({ path: req.path }, 'Invalid signature format');
        prometheus.incrementCounter('webhook_verification_total', {
          result: 'invalid',
          reason: 'invalid_format',
        });
        return problemDetails.send(res, 'webhook_signature_invalid', {
          detail: 'Invalid signature format',
        });
      }

      // Check timestamp tolerance (prevent replay attacks)
      const now = Math.floor(Date.now() / 1000);
      const webhookTime = parseInt(parsed.timestamp, 10);

      if (isNaN(webhookTime)) {
        prometheus.incrementCounter('webhook_verification_total', {
          result: 'invalid',
          reason: 'invalid_timestamp',
        });
        return problemDetails.send(res, 'webhook_signature_invalid', {
          detail: 'Invalid timestamp',
        });
      }

      const timeDiff = Math.abs(now - webhookTime);
      if (timeDiff > this.config.toleranceSeconds) {
        prometheus.incrementCounter('webhook_verification_total', {
          result: 'invalid',
          reason: 'timestamp_too_old',
        });
        return problemDetails.send(res, 'webhook_signature_invalid', {
          detail: 'Timestamp too old',
        });
      }

      // Check for replay
      const replayKey = `${parsed.timestamp}:${createHmac('sha256', 'replay').update(rawBody).digest('hex')}`;
      if (replayCache.has(replayKey)) {
        prometheus.incrementCounter('webhook_verification_total', {
          result: 'invalid',
          reason: 'replay_attack',
        });
        return problemDetails.send(res, 'webhook_signature_invalid', {
          detail: 'Replay attack detected',
        });
      }

      let verification:
        | { valid: boolean; secretId?: string; version?: number; reason?: string }
        | undefined;

      // Try rotation-managed secrets first
      if (this.secretManager) {
        verification = this.secretManager.verifySignature(
          parsed.signature,
          parsed.timestamp,
          rawBody.toString('utf8'),
        );

        if (verification.valid) {
          // Mark as seen for replay protection
          replayCache.add(replayKey);

          // Record metrics
          prometheus.incrementCounter('webhook_verification_total', {
            result: 'valid',
            verification_method: 'rotation',
            secret_version: verification.version?.toString() || 'unknown',
          });

          const duration = Date.now() - startTime;
          prometheus.setGauge('webhook_verification_duration_ms', {}, duration);

          // Check for delivery ID idempotency
          const deliveryId = req.get('Peac-Delivery-Id');
          if (deliveryId && replayCache.has(deliveryId)) {
            logger.warn({ deliveryId, path: req.path }, 'Duplicate webhook delivery detected');
            prometheus.incrementCounter('webhook_verification_total', {
              result: 'invalid',
              reason: 'duplicate_delivery',
            });
            return problemDetails.send(res, 'webhook_signature_invalid', {
              detail: 'Duplicate webhook delivery',
            });
          }

          // Store delivery ID to prevent replay
          if (deliveryId) {
            replayCache.add(deliveryId);
          }

          logger.debug(
            {
              path: req.path,
              secretId: verification.secretId,
              version: verification.version,
              duration,
              deliveryId,
            },
            'Webhook signature verified with rotated secret',
          );

          return next();
        }
      }

      // Fallback to static secret if rotation verification failed or rotation not enabled
      if (hasStaticSecret) {
        // Prepare signature verification options
        const verificationOptions = {
          method: req.method,
          host: req.get('host') || req.get('x-forwarded-host') || undefined,
          path: req.path,
          requireHostInSignature: this.config.requireHostInSignature,
        };

        const staticVerification = verifyWebhookSignature(
          this.config.secret,
          signature,
          rawBody.toString('utf8'),
          this.config.toleranceSeconds,
          verificationOptions,
        );

        if (staticVerification.valid) {
          // Mark as seen for replay protection
          replayCache.add(replayKey);

          // Record metrics
          prometheus.incrementCounter('webhook_verification_total', {
            result: 'valid',
            verification_method: 'static',
          });

          const duration = Date.now() - startTime;
          prometheus.setGauge('webhook_verification_duration_ms', {}, duration);

          // Check for delivery ID idempotency
          const deliveryId = req.get('Peac-Delivery-Id');
          if (deliveryId && replayCache.has(deliveryId)) {
            logger.warn({ deliveryId, path: req.path }, 'Duplicate webhook delivery detected');
            prometheus.incrementCounter('webhook_verification_total', {
              result: 'invalid',
              reason: 'duplicate_delivery',
            });
            return problemDetails.send(res, 'webhook_signature_invalid', {
              detail: 'Duplicate webhook delivery',
            });
          }

          // Store delivery ID to prevent replay
          if (deliveryId) {
            replayCache.add(deliveryId);
          }

          logger.debug(
            {
              path: req.path,
              method: 'static',
              duration,
              deliveryId,
            },
            'Webhook signature verified with static secret',
          );

          return next();
        }

        verification = { valid: false, reason: staticVerification.reason };
      }

      // All verification methods failed
      const reason = verification?.reason || 'signature_mismatch';
      logger.warn(
        {
          path: req.path,
          reason,
          signatureLength: signature.length,
          hasRotation,
          hasStaticSecret,
        },
        'Webhook signature verification failed',
      );

      prometheus.incrementCounter('webhook_verification_total', {
        result: 'invalid',
        reason,
      });

      return problemDetails.send(res, 'webhook_signature_invalid', {
        detail: `Signature verification failed: ${reason}`,
      });
    };
  }

  getStats() {
    const baseStats = {
      replayCache: replayCache.getStats(),
      config: {
        toleranceSeconds: this.config.toleranceSeconds,
        maxBodySize: this.config.maxBodySize,
        hasSecret: !!this.config.secret,
        rotationEnabled: !!this.secretManager,
      },
    };

    if (this.secretManager) {
      return {
        ...baseStats,
        rotation: this.secretManager.getStats(),
      };
    }

    return baseStats;
  }

  /**
   * Get current signing secret (for creating outbound webhooks)
   */
  getCurrentSigningSecret(): string | null {
    if (this.secretManager) {
      const currentSecret = this.secretManager.getCurrentSecret();
      return currentSecret?.value || null;
    }
    return this.config.secret || null;
  }

  /**
   * Manually trigger secret rotation (if enabled)
   */
  async rotateSecret(): Promise<void> {
    if (!this.secretManager) {
      throw new Error('Secret rotation not enabled');
    }
    await this.secretManager.rotateSecret();
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.secretManager) {
      await this.secretManager.shutdown();
    }
  }
}

// Default webhook verifier instance
const webhookConfig: WebhookConfig = {
  secret: process.env.PEAC_WEBHOOK_SECRET || '',
  toleranceSeconds: parseInt(process.env.PEAC_WEBHOOK_TOLERANCE_SECONDS || '300'), // 5 minutes
  maxBodySize: parseInt(process.env.PEAC_WEBHOOK_MAX_BODY_SIZE || '1048576'), // 1MB
  enableRotation: process.env.PEAC_WEBHOOK_ROTATION_ENABLED === 'true',
  rotationConfig: process.env.PEAC_WEBHOOK_ROTATION_CONFIG,
  requireHostInSignature: process.env.PEAC_WEBHOOK_REQUIRE_HOST === 'true', // Default false for proxy compatibility
};

export const webhookVerifier = new WebhookVerifier(webhookConfig);
