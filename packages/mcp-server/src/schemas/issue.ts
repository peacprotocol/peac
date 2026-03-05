/**
 * Issue tool schemas -- Wire 0.2 only (DD-57, DD-156)
 *
 * The MCP peac_issue tool accepts Wire 0.2 fields exclusively.
 * No wire_version discriminator: the MCP server is a forward-looking
 * adoption surface; agents should only issue Wire 0.2 receipts.
 */

import { z } from 'zod';

export const IssueInputSchema = z.object({
  kind: z
    .enum(['evidence', 'challenge'])
    .describe('Structural kind: evidence (records interaction) or challenge (requests action)'),
  type: z
    .string()
    .min(1)
    .max(256)
    .describe('Semantic type in reverse-DNS or absolute URI form (e.g. org.peacprotocol/payment)'),
  sub: z
    .string()
    .max(2048)
    .optional()
    .describe('Subject identifier (resource or interaction target)'),
  pillars: z
    .array(
      z.enum([
        'access',
        'attribution',
        'commerce',
        'compliance',
        'consent',
        'identity',
        'privacy',
        'provenance',
        'purpose',
        'safety',
      ])
    )
    .optional()
    .describe('Evidence pillars from closed 10-value taxonomy (sorted ascending)'),
  occurred_at: z
    .string()
    .optional()
    .describe('ISO 8601 timestamp when interaction occurred (evidence kind only)'),
  extensions: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Extension groups keyed by reverse-DNS identifier'),
  policy: z
    .object({
      uri: z.string().url().max(2048).describe('Policy document URI (HTTPS only)'),
      version: z.string().max(256).optional().describe('Policy version'),
      digest: z
        .string()
        .regex(/^sha256:[0-9a-f]{64}$/)
        .optional()
        .describe('Policy digest in sha256:<64 hex> format'),
    })
    .optional()
    .describe('Policy binding block'),
  ttl_seconds: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Reserved for future use (Wire 0.2 receipts do not expire)'),
});

export type IssueInput = z.infer<typeof IssueInputSchema>;

const MetaSchema = z.object({
  serverVersion: z.string(),
  policyHash: z.string(),
  protocolVersion: z.string(),
});

const ClaimsSummarySchema = z.object({
  iss: z.string(),
  kind: z.string(),
  type: z.string(),
  iat: z.number(),
  jti: z.string(),
  sub: z.string().optional(),
  pillars: z.array(z.string()).optional(),
});

export const IssueOutputSchema = z.object({
  _meta: MetaSchema,
  ok: z.boolean(),
  jws: z.string(),
  claimsSummary: ClaimsSummarySchema,
});

export type IssueOutput = z.infer<typeof IssueOutputSchema>;
