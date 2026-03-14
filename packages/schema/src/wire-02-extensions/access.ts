/**
 * Access Extension Group (org.peacprotocol/access)
 *
 * Records access control decision evidence.
 * Shipped in v0.12.0-preview.1 (DD-153).
 */

import { z } from 'zod';
import { EXTENSION_LIMITS } from './limits.js';

export const ACCESS_EXTENSION_KEY = 'org.peacprotocol/access' as const;

export const AccessExtensionSchema = z
  .object({
    /** Resource being accessed (URI or identifier) */
    resource: z.string().min(1).max(EXTENSION_LIMITS.maxResourceLength),
    /** Action performed on the resource */
    action: z.string().min(1).max(EXTENSION_LIMITS.maxActionLength),
    /** Access decision */
    decision: z.enum(['allow', 'deny', 'review']),
  })
  .strict();

export type AccessExtension = z.infer<typeof AccessExtensionSchema>;
