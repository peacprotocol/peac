/**
 * Identity Extension Group (org.peacprotocol/identity)
 *
 * Records identity verification or attestation evidence.
 * Shipped in v0.12.0-preview.1 (DD-153).
 */

import { z } from 'zod';
import { EXTENSION_LIMITS } from './limits.js';

export const IDENTITY_EXTENSION_KEY = 'org.peacprotocol/identity' as const;

export const IdentityExtensionSchema = z
  .object({
    /** Proof reference (opaque string; no actor_binding: top-level actor is sole location) */
    proof_ref: z.string().max(EXTENSION_LIMITS.maxProofRefLength).optional(),
  })
  .strict();

export type IdentityExtension = z.infer<typeof IdentityExtensionSchema>;
