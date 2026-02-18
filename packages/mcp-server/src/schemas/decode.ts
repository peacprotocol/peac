/**
 * Decode tool schemas -- ZERO MCP SDK imports (DD-57)
 */

import { z } from 'zod';

export const DecodeInputSchema = z.object({
  jws: z.string().describe('JWS compact serialization to decode'),
});

export type DecodeInput = z.infer<typeof DecodeInputSchema>;

const MetaSchema = z.object({
  serverVersion: z.string(),
  policyHash: z.string(),
  protocolVersion: z.string(),
});

export const DecodeOutputSchema = z.object({
  _meta: MetaSchema,
  header: z.record(z.string(), z.unknown()),
  payload: z.record(z.string(), z.unknown()),
  verified: z.literal(false),
});

export type DecodeOutput = z.infer<typeof DecodeOutputSchema>;
