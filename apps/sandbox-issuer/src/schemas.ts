/**
 * Request validation schemas
 *
 * Strict whitelist: only explicitly allowed fields are accepted.
 * Server computes iss, iat, jti, kind, type. No arbitrary claims passthrough.
 */

import { z } from 'zod';

const MAX_URL_LENGTH = 2048;
const MAX_STRING_LENGTH = 256;

export const IssueRequestSchema = z
  .object({
    /** Subject identifier URL (required): what the record is about */
    sub: z.string().url().max(MAX_URL_LENGTH),

    /** Declared purpose (optional) */
    purpose: z.string().max(MAX_STRING_LENGTH).optional(),
  })
  .strict();

export type IssueRequest = z.infer<typeof IssueRequestSchema>;

export const MAX_BODY_SIZE = 16 * 1024; // 16 KB
