/**
 * @peac/crawler v0.9.12.1 - Cloudflare webhook HMAC verification
 * Timing-safe HMAC verification for webhook payloads
 */

import crypto from 'node:crypto';

export interface WebhookVerificationOptions {
  secret: string;
  algorithm?: string;
  encoding?: 'hex' | 'base64';
  timestampTolerance?: number; // seconds
}

export interface WebhookPayload {
  timestamp: number;
  signature: string;
  body: string;
}

export interface WebhookVerificationResult {
  valid: boolean;
  reason?: 'invalid_signature' | 'timestamp_expired' | 'malformed_payload';
  timestamp?: number;
}

/**
 * Verify Cloudflare webhook signature using HMAC-SHA256
 */
export function verifyCloudflareWebhook(
  body: string,
  signature: string,
  secret: string,
  options: Partial<WebhookVerificationOptions> = {}
): boolean {
  const opts: WebhookVerificationOptions = {
    algorithm: 'sha256',
    encoding: 'hex',
    ...options,
    secret,
  };

  try {
    const expectedSignature = crypto
      .createHmac(opts.algorithm, opts.secret)
      .update(body, 'utf8')
      .digest(opts.encoding);

    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature, opts.encoding),
      Buffer.from(expectedSignature, opts.encoding)
    );
  } catch (error) {
    // Any error in computation means invalid signature
    return false;
  }
}

/**
 * Verify webhook with timestamp validation
 */
export function verifyWebhookWithTimestamp(
  payload: WebhookPayload,
  secret: string,
  options: Partial<WebhookVerificationOptions> = {}
): WebhookVerificationResult {
  const opts: WebhookVerificationOptions = {
    algorithm: 'sha256',
    encoding: 'hex',
    timestampTolerance: 300, // 5 minutes default
    ...options,
    secret,
  };

  // Check timestamp if tolerance is specified
  if (opts.timestampTolerance && opts.timestampTolerance > 0) {
    const now = Math.floor(Date.now() / 1000);
    const age = now - payload.timestamp;

    if (age > opts.timestampTolerance) {
      return {
        valid: false,
        reason: 'timestamp_expired',
        timestamp: payload.timestamp,
      };
    }
  }

  // Create signed payload (timestamp + body)
  const signedPayload = `${payload.timestamp}.${payload.body}`;

  // Verify signature
  const signatureValid = verifyCloudflareWebhook(signedPayload, payload.signature, secret, opts);

  return {
    valid: signatureValid,
    reason: signatureValid ? undefined : 'invalid_signature',
    timestamp: payload.timestamp,
  };
}

/**
 * Parse Cloudflare webhook headers to extract signature and timestamp
 */
export function parseWebhookHeaders(headers: Record<string, string>): {
  signature?: string;
  timestamp?: number;
} {
  // Cloudflare typically sends signature in X-Signature header
  const signature = headers['x-signature'] || headers['X-Signature'];

  // Timestamp might be in X-Timestamp or extracted from signature header
  let timestamp: number | undefined;

  const timestampHeader = headers['x-timestamp'] || headers['X-Timestamp'];
  if (timestampHeader) {
    timestamp = parseInt(timestampHeader, 10);
  }

  // Some webhook implementations include timestamp in the signature header
  // Format: "t=1234567890,v1=signature_here"
  if (!timestamp && signature?.includes('t=')) {
    const timestampMatch = signature.match(/t=(\d+)/);
    if (timestampMatch) {
      timestamp = parseInt(timestampMatch[1], 10);
    }
  }

  return { signature, timestamp };
}

/**
 * Generate webhook signature for testing
 */
export function generateWebhookSignature(
  body: string,
  secret: string,
  timestamp?: number,
  options: Partial<WebhookVerificationOptions> = {}
): { signature: string; timestamp: number } {
  const opts: WebhookVerificationOptions = {
    algorithm: 'sha256',
    encoding: 'hex',
    ...options,
    secret,
  };

  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${body}`;

  const signature = crypto
    .createHmac(opts.algorithm, opts.secret)
    .update(signedPayload, 'utf8')
    .digest(opts.encoding);

  return { signature, timestamp: ts };
}

/**
 * Middleware function for webhook verification
 */
export function createWebhookVerifier(
  secret: string,
  options: Partial<WebhookVerificationOptions> = {}
) {
  return (req: any, res: any, next: any) => {
    try {
      const { signature, timestamp } = parseWebhookHeaders(req.headers);

      if (!signature) {
        return res.status(400).json({
          error: 'Missing webhook signature',
          code: 'WEBHOOK_SIGNATURE_MISSING',
        });
      }

      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

      let result: WebhookVerificationResult;

      if (timestamp) {
        result = verifyWebhookWithTimestamp({ body, signature, timestamp }, secret, options);
      } else {
        const valid = verifyCloudflareWebhook(body, signature, secret, options);
        result = { valid, reason: valid ? undefined : 'invalid_signature' };
      }

      if (!result.valid) {
        return res.status(401).json({
          error: 'Webhook verification failed',
          code: 'WEBHOOK_VERIFICATION_FAILED',
          reason: result.reason,
        });
      }

      // Add verification info to request
      req.webhook = {
        verified: true,
        timestamp: result.timestamp,
      };

      next();
    } catch (error) {
      return res.status(500).json({
        error: 'Webhook verification error',
        code: 'WEBHOOK_VERIFICATION_ERROR',
        message: error.message,
      });
    }
  };
}
