/**
 * Verify tool schemas -- ZERO MCP SDK imports (DD-57)
 */

import { z } from 'zod';

export const VerifyInputSchema = z.object({
  jws: z.string().describe('JWS compact serialization (header.payload.signature)'),
  public_key_base64url: z
    .string()
    .optional()
    .describe('Ed25519 public key in base64url encoding (32 bytes)'),
  jwks: z.string().optional().describe('Inline JWKS JSON containing the verifying key'),
  issuer: z.string().optional().describe('Expected issuer URI for binding check'),
  audience: z.string().optional().describe('Expected audience URI for binding check'),
});

export type VerifyInput = z.infer<typeof VerifyInputSchema>;

const MetaSchema = z.object({
  serverVersion: z.string(),
  policyHash: z.string(),
  protocolVersion: z.string(),
});

const CheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  message: z.string().optional(),
});

export const VerifyOutputSchema = z.object({
  _meta: MetaSchema,
  ok: z.boolean(),
  code: z.string().optional(),
  message: z.string().optional(),
  variant: z.string().optional(),
  checks: z.array(CheckSchema),
  claimsSummary: z.record(z.string(), z.unknown()).optional(),
  keySource: z.string().optional(),
});

export type VerifyOutput = z.infer<typeof VerifyOutputSchema>;
