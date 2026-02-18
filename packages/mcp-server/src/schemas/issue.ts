/**
 * Issue tool schemas -- ZERO MCP SDK imports (DD-57)
 */

import { z } from 'zod';

export const IssueInputSchema = z.object({
  aud: z.string().url().describe('Audience / resource URI (https://)'),
  amt: z.number().int().nonnegative().describe('Amount in smallest currency unit'),
  cur: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .describe('ISO 4217 currency code (uppercase, e.g. USD)'),
  rail: z.string().describe('Payment rail identifier'),
  reference: z.string().describe('Unique payment reference'),
  asset: z.string().optional().describe('Asset transferred (e.g. USDC) -- defaults to currency'),
  env: z.enum(['live', 'test']).default('test').describe('Environment'),
  network: z.string().optional().describe('Network/chain identifier'),
  evidence: z.unknown().optional().describe('Rail-specific evidence (JSON-safe)'),
  subject: z.string().url().optional().describe('Subject URI (https://)'),
  ttl_seconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Time-to-live in seconds (computes exp = iat + ttl)'),
  kind: z.string().optional().describe('Receipt kind for policy filtering'),
});

export type IssueInput = z.infer<typeof IssueInputSchema>;

const MetaSchema = z.object({
  serverVersion: z.string(),
  policyHash: z.string(),
  protocolVersion: z.string(),
});

const ClaimsSummarySchema = z.object({
  iss: z.string(),
  aud: z.string(),
  iat: z.number(),
  exp: z.number().optional(),
  rid: z.string(),
  amt: z.number(),
  cur: z.string(),
});

export const IssueOutputSchema = z.object({
  _meta: MetaSchema,
  ok: z.boolean(),
  jws: z.string(),
  claimsSummary: ClaimsSummarySchema,
});

export type IssueOutput = z.infer<typeof IssueOutputSchema>;
