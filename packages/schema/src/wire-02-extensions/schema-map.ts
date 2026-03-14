/**
 * Wire 0.2 Extension Schema Map
 *
 * Maps known extension group keys to their Zod schemas.
 * Used by validateKnownExtensions() for group-level validation
 * and by type-to-extension enforcement (DD-173.3).
 *
 * When new extension groups are added (PRs 2-4), they register
 * here. This file is the single mutation point for group registration.
 */

import type { z } from 'zod';

import { COMMERCE_EXTENSION_KEY, CommerceExtensionSchema } from './commerce.js';
import { ACCESS_EXTENSION_KEY, AccessExtensionSchema } from './access.js';
import { CHALLENGE_EXTENSION_KEY, ChallengeExtensionSchema } from './challenge.js';
import { IDENTITY_EXTENSION_KEY, IdentityExtensionSchema } from './identity.js';
import { CORRELATION_EXTENSION_KEY, CorrelationExtensionSchema } from './correlation.js';

/** Map from known extension key to its Zod schema */
export const EXTENSION_SCHEMA_MAP = new Map<string, z.ZodTypeAny>();
EXTENSION_SCHEMA_MAP.set(COMMERCE_EXTENSION_KEY, CommerceExtensionSchema);
EXTENSION_SCHEMA_MAP.set(ACCESS_EXTENSION_KEY, AccessExtensionSchema);
EXTENSION_SCHEMA_MAP.set(CHALLENGE_EXTENSION_KEY, ChallengeExtensionSchema);
EXTENSION_SCHEMA_MAP.set(IDENTITY_EXTENSION_KEY, IdentityExtensionSchema);
EXTENSION_SCHEMA_MAP.set(CORRELATION_EXTENSION_KEY, CorrelationExtensionSchema);
