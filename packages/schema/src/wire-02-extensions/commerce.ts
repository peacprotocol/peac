/**
 * Commerce Extension Group (org.peacprotocol/commerce)
 *
 * Records payment transaction evidence.
 * Shipped in v0.12.0-preview.1 (DD-153).
 */

import { z } from 'zod';
import { EXTENSION_LIMITS } from './limits.js';

export const COMMERCE_EXTENSION_KEY = 'org.peacprotocol/commerce' as const;

/** Base-10 integer string: optional leading minus, one or more digits */
const AMOUNT_MINOR_PATTERN = /^-?[0-9]+$/;

export const CommerceExtensionSchema = z
  .object({
    /** Payment rail identifier (e.g., 'stripe', 'x402', 'lightning') */
    payment_rail: z.string().min(1).max(EXTENSION_LIMITS.maxPaymentRailLength),
    /**
     * Amount in smallest currency unit as a string for arbitrary precision.
     * Base-10 integer: optional leading minus, one or more digits.
     * Decimals and empty strings are rejected.
     */
    amount_minor: z
      .string()
      .min(1)
      .max(EXTENSION_LIMITS.maxAmountMinorLength)
      .regex(
        AMOUNT_MINOR_PATTERN,
        'amount_minor must be a base-10 integer string (e.g., "1000", "-50")'
      ),
    /** ISO 4217 currency code or asset identifier */
    currency: z.string().min(1).max(EXTENSION_LIMITS.maxCurrencyLength),
    /** Caller-assigned payment reference */
    reference: z.string().max(EXTENSION_LIMITS.maxReferenceLength).optional(),
    /** Asset identifier for non-fiat (e.g., token address) */
    asset: z.string().max(EXTENSION_LIMITS.maxAssetLength).optional(),
    /** Environment discriminant */
    env: z.enum(['live', 'test']).optional(),
  })
  .strict();

export type CommerceExtension = z.infer<typeof CommerceExtensionSchema>;
