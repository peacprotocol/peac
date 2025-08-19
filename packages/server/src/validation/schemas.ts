import { z } from 'zod';

/**
 * Comprehensive Zod validation schemas for PEAC Protocol v0.9.6
 * Provides type-safe, RFC-compliant input validation with detailed error messages
 */

// Base validation patterns
export const uuidSchema = z.string().uuid('Must be a valid UUID');
export const isoDateSchema = z.string().datetime('Must be a valid ISO 8601 datetime');
export const emailSchema = z.string().email('Must be a valid email address');
export const urlSchema = z.string().url('Must be a valid URL');

// Currency validation (ISO 4217 + crypto)
export const currencySchema = z
  .string()
  .min(3, 'Currency must be at least 3 characters')
  .max(4, 'Currency must be at most 4 characters')
  .regex(/^[A-Z0-9]+$/, 'Currency must contain only uppercase letters and numbers')
  .refine((val) => {
    // Common currencies + stablecoins
    const validCurrencies = [
      'USD',
      'EUR',
      'GBP',
      'JPY',
      'CAD',
      'AUD',
      'CHF',
      'CNY',
      'SEK',
      'NOK',
      'USDC',
      'USDT',
      'DAI',
      'PYUSD',
      'FRAX',
      'LUSD',
      'TUSD',
      'BUSD',
    ];
    return validCurrencies.includes(val);
  }, 'Must be a valid ISO 4217 currency code or supported stablecoin');

// Amount validation with precision
export const amountSchema = z
  .number()
  .positive('Amount must be positive')
  .finite('Amount must be finite')
  .multipleOf(0.01, 'Amount can have at most 2 decimal places')
  .max(10000000, 'Amount cannot exceed 10,000,000')
  .min(0.01, 'Amount must be at least 0.01');

// Pagination schemas
export const limitSchema = z
  .string()
  .regex(/^\d+$/, 'Limit must be a number')
  .transform(Number)
  .pipe(z.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100'));

export const cursorSchema = z
  .string()
  .min(1, 'Cursor cannot be empty')
  .refine((val) => {
    try {
      const decoded = Buffer.from(val, 'base64').toString();
      JSON.parse(decoded);
      return true;
    } catch {
      return false;
    }
  }, 'Cursor must be valid base64-encoded JSON');

// Payment schemas
export const paymentRailSchema = z.enum(['credits', 'x402'], {
  errorMap: () => ({ message: 'Rail must be either "credits" or "x402"' }),
});

export const paymentStatusSchema = z.enum(['pending', 'requires_action', 'succeeded', 'failed']);

export const createPaymentSchema = z.object({
  rail: paymentRailSchema,
  amount: amountSchema,
  currency: currencySchema,
  metadata: z
    .record(z.unknown())
    .optional()
    .refine((val) => {
      if (!val) return true;
      // Check metadata size (prevent DoS)
      const jsonStr = JSON.stringify(val);
      return jsonStr.length <= 10000; // 10KB limit
    }, 'Metadata cannot exceed 10KB when serialized'),
});

export const paymentListQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: limitSchema.optional().default('50'),
  sort: z.enum(['created_at', 'amount', 'status']).optional().default('created_at'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  status: paymentStatusSchema.optional(),
  rail: paymentRailSchema.optional(),
  currency: currencySchema.optional(),
});

// Negotiation schemas
export const negotiationStateSchema = z.enum(['proposed', 'accepted', 'rejected']);

export const createNegotiationSchema = z.object({
  terms: z
    .record(z.unknown())
    .optional()
    .refine((val) => {
      if (!val) return true;
      const jsonStr = JSON.stringify(val);
      return jsonStr.length <= 50000; // 50KB limit for terms
    }, 'Terms cannot exceed 50KB when serialized'),
  context: z
    .record(z.unknown())
    .optional()
    .refine((val) => {
      if (!val) return true;
      const jsonStr = JSON.stringify(val);
      return jsonStr.length <= 10000; // 10KB limit for context
    }, 'Context cannot exceed 10KB when serialized'),
  proposed_by: z
    .string()
    .min(1, 'Proposed by cannot be empty')
    .max(255, 'Proposed by cannot exceed 255 characters')
    .optional(),
});

export const acceptNegotiationSchema = z.object({
  decided_by: z
    .string()
    .min(1, 'Decided by cannot be empty')
    .max(255, 'Decided by cannot exceed 255 characters')
    .optional(),
  metadata: z
    .record(z.unknown())
    .optional()
    .refine((val) => {
      if (!val) return true;
      const jsonStr = JSON.stringify(val);
      return jsonStr.length <= 10000;
    }, 'Metadata cannot exceed 10KB when serialized'),
});

export const rejectNegotiationSchema = z.object({
  reason: z
    .string()
    .min(1, 'Rejection reason is required')
    .max(1000, 'Rejection reason cannot exceed 1000 characters')
    .trim(),
  decided_by: z
    .string()
    .min(1, 'Decided by cannot be empty')
    .max(255, 'Decided by cannot exceed 255 characters')
    .optional(),
  metadata: z
    .record(z.unknown())
    .optional()
    .refine((val) => {
      if (!val) return true;
      const jsonStr = JSON.stringify(val);
      return jsonStr.length <= 10000;
    }, 'Metadata cannot exceed 10KB when serialized'),
});

export const negotiationListQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: limitSchema.optional().default('50'),
  state: negotiationStateSchema.optional(),
  sort: z.enum(['created_at', 'updated_at']).optional().default('created_at'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  expires_at: isoDateSchema.optional(),
});

// Webhook schemas
export const webhookEventSchema = z.enum([
  'payment.succeeded',
  'payment.failed',
  'negotiation.updated',
]);

export const webhookPayloadSchema = z.object({
  type: webhookEventSchema,
  id: z.string().min(1, 'Event ID is required'),
  object: z.string().min(1, 'Object type is required'),
  data: z.record(z.unknown()),
  created: z
    .number()
    .int()
    .positive('Created timestamp must be positive')
    .refine((val) => {
      // Ensure timestamp is reasonable (not too far in past/future)
      const now = Math.floor(Date.now() / 1000);
      const maxAge = 30 * 24 * 60 * 60; // 30 days
      const maxFuture = 5 * 60; // 5 minutes
      return val >= now - maxAge && val <= now + maxFuture;
    }, 'Timestamp must be within reasonable range'),
});

// Request parameter schemas
export const idParamSchema = z.object({
  id: uuidSchema,
});

// Header validation schemas
export const idempotencyKeySchema = z
  .string()
  .min(1, 'Idempotency key cannot be empty')
  .max(255, 'Idempotency key cannot exceed 255 characters')
  .regex(
    /^[a-zA-Z0-9\-_]+$/,
    'Idempotency key can only contain letters, numbers, hyphens, and underscores',
  );

export const requestIdSchema = z.string().uuid('Request ID must be a valid UUID').optional();

// Content negotiation schemas
export const acceptHeaderSchema = z
  .string()
  .refine((val) => {
    const acceptableTypes = [
      'application/json',
      'application/problem+json',
      'application/vnd.peac.capabilities+json',
      'application/*',
      '*/*',
    ];

    const acceptedTypes = val
      .split(',')
      .map((type) => type.trim().split(';')[0])
      .map((type) => type.toLowerCase());

    return acceptedTypes.some((accepted) =>
      acceptableTypes.some((supported) => {
        if (accepted === supported) return true;
        if (accepted === '*/*') return true;
        if (accepted === 'application/*' && supported.startsWith('application/')) return true;
        // Support vendor media types
        if (
          accepted.startsWith('application/vnd.peac.') &&
          supported === 'application/vnd.peac.capabilities+json'
        )
          return true;
        return false;
      }),
    );
  }, 'Accept header must include supported content types')
  .optional();

// Rate limiting schemas
export const rateLimitHeadersSchema = z.object({
  'ratelimit-limit': z.string().regex(/^\d+$/, 'Rate limit must be numeric'),
  'ratelimit-remaining': z.string().regex(/^\d+$/, 'Rate remaining must be numeric'),
  'ratelimit-reset': z.string().regex(/^\d+$/, 'Rate reset must be numeric'),
});

// Security validation
export const hmacSignatureSchema = z
  .string()
  .min(1, 'Signature cannot be empty')
  .regex(/^t=\d+,s=[a-f0-9]{64}$/, 'Signature must match format: t=timestamp,s=hex_signature');

// Export types for TypeScript inference
export type CreatePaymentRequest = z.infer<typeof createPaymentSchema>;
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
export type CreateNegotiationRequest = z.infer<typeof createNegotiationSchema>;
export type AcceptNegotiationRequest = z.infer<typeof acceptNegotiationSchema>;
export type RejectNegotiationRequest = z.infer<typeof rejectNegotiationSchema>;
export type NegotiationListQuery = z.infer<typeof negotiationListQuerySchema>;
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
export type IdParam = z.infer<typeof idParamSchema>;

// Privacy and data protection schemas
export const consentRequestSchema = z.object({
  userId: z.string().min(1).max(255),
  purposes: z.array(z.string().min(1)).min(1),
  source: z.enum(['explicit', 'implicit', 'legitimate_interest']).optional().default('explicit'),
  expiresAt: z.string().datetime().optional(),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().max(500).optional(),
});

export const dataRequestSchema = z.object({
  type: z.enum(['access', 'export', 'delete', 'rectification', 'portability']),
  userId: z.string().min(1).max(255),
  metadata: z.record(z.unknown()).optional(),
});

export const privacyQuerySchema = z.object({
  purpose: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

// Validation result type
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: z.ZodError;
}

// Schema registry for dynamic validation
export const schemaRegistry = {
  // Payment schemas
  'payment.create': createPaymentSchema,
  'payment.listQuery': paymentListQuerySchema,

  // Negotiation schemas
  'negotiation.create': createNegotiationSchema,
  'negotiation.accept': acceptNegotiationSchema,
  'negotiation.reject': rejectNegotiationSchema,
  'negotiation.listQuery': negotiationListQuerySchema,

  // Webhook schemas
  'webhook.payload': webhookPayloadSchema,

  // Parameter schemas
  'param.id': idParamSchema,

  // Header schemas
  'header.idempotencyKey': idempotencyKeySchema,
  'header.requestId': requestIdSchema,
  'header.accept': acceptHeaderSchema,
  'header.hmacSignature': hmacSignatureSchema,

  // Privacy schemas
  'privacy.consentRequest': consentRequestSchema,
  'privacy.dataRequest': dataRequestSchema,
  'privacy.query': privacyQuerySchema,
} as const;

export type SchemaKey = keyof typeof schemaRegistry;

// Privacy request types
export type ConsentRequest = z.infer<typeof consentRequestSchema>;
export type DataRequestType = z.infer<typeof dataRequestSchema>;
export type PrivacyQuery = z.infer<typeof privacyQuerySchema>;
