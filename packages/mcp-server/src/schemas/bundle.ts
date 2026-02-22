/**
 * Bundle tool schemas -- ZERO MCP SDK imports (DD-57)
 */

import { z } from 'zod';

export const BundleInputSchema = z.object({
  receipts: z
    .array(z.string().max(16_384))
    .min(1)
    .max(256)
    .describe('Receipt JWS strings to bundle (1-256)'),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Optional metadata to include in the manifest'),
  output_path: z
    .string()
    .max(255)
    .optional()
    .describe('Output directory name (single segment within --bundle-dir)'),
});

export type BundleInput = z.infer<typeof BundleInputSchema>;

const MetaSchema = z.object({
  serverVersion: z.string(),
  policyHash: z.string(),
  protocolVersion: z.string(),
});

export const BundleOutputSchema = z.object({
  _meta: MetaSchema,
  ok: z.boolean(),
  bundleId: z.string(),
  bundleName: z.string(),
  receiptCount: z.number(),
  fileCount: z.number(),
  totalBytes: z.number(),
  createdAt: z.string(),
  manifestSha256: z.string(),
});

export type BundleOutput = z.infer<typeof BundleOutputSchema>;
