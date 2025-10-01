import { createHash } from 'node:crypto';

/**
 * Generate deterministic idempotency key for payment operations
 * Format: base64url(sha256(resource + purpose + user))
 */
export function idempotencyKey(input: {
  resource: string;
  purpose?: string;
  user?: string;
}): string {
  const parts = [input.resource, input.purpose || 'default', input.user || 'anonymous'];

  const canonical = parts.join('|');
  const hash = createHash('sha256').update(canonical, 'utf8').digest('base64url');

  return `peac_${hash.slice(0, 32)}`;
}
