/**
 * Static policy loader (DD-53: load once, hash, never reload)
 */

import { readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
import { sha256Hex } from '@peac/crypto';
import { PolicyLoadError } from './errors.js';

const ToolPolicySchema = z.object({
  enabled: z.boolean().default(true),
  allowed_kinds: z.array(z.string()).optional(),
});

const RedactionSchema = z.object({
  strip_evidence: z.boolean().default(false),
  strip_payment: z.boolean().default(false),
  inspect_full_claims: z.boolean().default(false),
});

const LimitsSchema = z.object({
  max_jws_bytes: z.number().int().positive().default(16_384),
  max_response_bytes: z.number().int().positive().default(65_536),
  tool_timeout_ms: z.number().int().positive().default(30_000),
  max_concurrency: z.number().int().positive().default(10),
  max_claims_bytes: z.number().int().positive().default(262_144),
  max_bundle_receipts: z.number().int().positive().default(256),
  max_bundle_bytes: z.number().int().positive().default(16_777_216),
  max_ttl_seconds: z.number().int().positive().default(86_400),
});

// JWKS config: file-only. URL fetch is not implemented (SSRF surface).
// When allow_network + URL fetch is added, gate it behind allow_network
// with strict allowlist, timeouts, max-size, and no-redirect policy.
const JwksConfigSchema = z.object({
  file: z.string().optional(),
});

export const PolicySchema = z.object({
  version: z.literal('1'),
  allow_network: z.boolean().default(false),
  redaction: RedactionSchema.default({}),
  tools: z.record(z.string(), ToolPolicySchema).default({}),
  limits: LimitsSchema.default({}),
  jwks: JwksConfigSchema.optional(),
});

export type PolicyConfig = z.infer<typeof PolicySchema>;

const DEFAULT_POLICY: PolicyConfig = {
  version: '1',
  allow_network: false,
  redaction: { strip_evidence: false, strip_payment: false, inspect_full_claims: false },
  tools: {},
  limits: {
    max_jws_bytes: 16_384,
    max_response_bytes: 65_536,
    tool_timeout_ms: 30_000,
    max_concurrency: 10,
    max_claims_bytes: 262_144,
    max_bundle_receipts: 256,
    max_bundle_bytes: 16_777_216,
    max_ttl_seconds: 86_400,
  },
};

export function getDefaultPolicy(): PolicyConfig {
  return structuredClone(DEFAULT_POLICY);
}

/**
 * Deep stable stringify: recursively sorts all object keys at every level
 * so semantically identical policies always produce the same hash regardless
 * of insertion order. Arrays preserve element order (order-significant).
 */
function deepStableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(deepStableStringify).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ':' + deepStableStringify(obj[k]));
  return '{' + pairs.join(',') + '}';
}

/**
 * Compute the policy hash from a canonical JSON representation.
 * Accepts either raw JSON string or a PolicyConfig object.
 * When given a PolicyConfig, uses deep stable stringify (recursive key sort)
 * so semantically identical policies always hash identically.
 */
export async function computePolicyHash(input: string | PolicyConfig): Promise<string> {
  const canonical = typeof input === 'string' ? input : deepStableStringify(input);
  return sha256Hex(canonical);
}

export async function loadPolicy(
  filePath: string
): Promise<{ policy: PolicyConfig; hash: string }> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err) {
    throw new PolicyLoadError(
      `Failed to read policy file: ${filePath} -- ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Warn on world-writable permissions (0o002)
  try {
    const s = await stat(filePath);
    if (s.mode & 0o002) {
      process.stderr.write(
        `[peac-mcp-server] WARNING: Policy file ${filePath} is world-writable\n`
      );
    }
  } catch {
    // stat failure is non-fatal
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PolicyLoadError(`Policy file is not valid JSON: ${filePath}`);
  }

  const result = PolicySchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new PolicyLoadError(`Policy validation failed: ${issues}`);
  }

  // Hash the materialized policy (after Zod defaults applied) for determinism
  const hash = await computePolicyHash(result.data);
  return { policy: result.data, hash };
}
