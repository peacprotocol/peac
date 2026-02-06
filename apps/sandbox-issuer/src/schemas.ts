/**
 * Request validation schemas
 *
 * Strict whitelist -- only explicitly allowed fields are accepted.
 * Server computes iss, iat, exp, rid. No arbitrary claims passthrough.
 */

import { z } from 'zod';

const MAX_URL_LENGTH = 2048;
const MAX_STRING_LENGTH = 256;
const MAX_EXP_SECONDS = 86400; // 24 hours
const DEFAULT_EXP_SECONDS = 3600; // 1 hour

export const IssueRequestSchema = z
  .object({
    /** Audience URL (required) -- who will verify this receipt */
    aud: z.string().url().max(MAX_URL_LENGTH),

    /** Subject identifier (optional) */
    sub: z.string().max(MAX_STRING_LENGTH).optional(),

    /** Declared purpose (optional) */
    purpose: z.string().max(MAX_STRING_LENGTH).optional(),

    /** Expiration in seconds from now (optional, default 1h, max 24h) */
    expires_in: z
      .number()
      .int()
      .positive()
      .max(MAX_EXP_SECONDS)
      .optional()
      .default(DEFAULT_EXP_SECONDS),
  })
  .strict();

export type IssueRequest = z.infer<typeof IssueRequestSchema>;

export const MAX_BODY_SIZE = 16 * 1024; // 16 KB
