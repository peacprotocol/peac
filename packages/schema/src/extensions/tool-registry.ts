/**
 * Tool Registry Extension Schema (v0.11.3+, DD-145 ZT Pack)
 *
 * Records tool registration and capability declarations in
 * ext["org.peacprotocol/tool_registry"].
 *
 * Security: registry_uri validated against URL scheme allowlist
 * (HTTPS + URN only; no file:// or data:// for SSRF prevention).
 */
import { z } from 'zod';

export const TOOL_REGISTRY_EXTENSION_KEY = 'org.peacprotocol/tool_registry' as const;

/**
 * URL scheme allowlist for registry_uri: HTTPS and URN only.
 * Prevents SSRF via file://, data://, or other local schemes.
 */
function isAllowedRegistryUri(value: string): boolean {
  if (value.startsWith('urn:')) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Tool Registry extension schema
 */
export const ToolRegistrySchema = z
  .object({
    /** Tool identifier */
    tool_id: z.string().min(1).max(256),

    /** Registry URI (HTTPS or URN only; no file:// or data:// for SSRF prevention) */
    registry_uri: z.string().max(2048).refine(isAllowedRegistryUri, {
      message: 'registry_uri must be an HTTPS URL or URN (file:// and data:// are prohibited)',
    }),

    /** Tool version (optional, semver-like) */
    version: z.string().max(64).optional(),

    /** Tool capabilities (optional) */
    capabilities: z.array(z.string().max(64)).max(32).optional(),
  })
  .strict();

export type ToolRegistry = z.infer<typeof ToolRegistrySchema>;

/**
 * Validate a ToolRegistry object.
 */
export function validateToolRegistry(
  data: unknown
): { ok: true; value: ToolRegistry } | { ok: false; error: string } {
  const result = ToolRegistrySchema.safeParse(data);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return { ok: false, error: result.error.message };
}
