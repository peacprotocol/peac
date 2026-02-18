/**
 * Inspect tool schemas -- ZERO MCP SDK imports (DD-57)
 */

import { z } from 'zod';

export const InspectInputSchema = z.object({
  jws: z.string().describe('JWS compact serialization to inspect'),
  full_claims: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include full decoded claims (may be redacted by policy)'),
});

export type InspectInput = z.infer<typeof InspectInputSchema>;

const MetaSchema = z.object({
  serverVersion: z.string(),
  policyHash: z.string(),
  protocolVersion: z.string(),
});

export const InspectOutputSchema = z.object({
  _meta: MetaSchema,
  header: z.record(z.string(), z.unknown()),
  payloadMeta: z.object({
    variant: z.string(),
    issuer: z.string().optional(),
    audience: z.string().optional(),
    issuedAt: z.string().optional(),
    expiresAt: z.string().optional(),
    receiptId: z.string().optional(),
  }),
  fullPayload: z.record(z.string(), z.unknown()).optional(),
  redacted: z.boolean(),
  verified: z.literal(false),
});

export type InspectOutput = z.infer<typeof InspectOutputSchema>;
