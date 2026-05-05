/**
 * Shared opaque-reference schema for v0.14.1 observational extensions
 * (a2a-handoff, cli-execution, lifecycle-observation).
 *
 * Generalizes the single-prefix precedent established by ReceiptRefSchema
 * (sha256:<64 hex>) and CredentialRefSchema ((sha256|hmac-sha256):<64 hex>)
 * into a multi-prefix grammar that uniformly rejects email shapes, raw human
 * names in any language, numeric strings, inline JSON, and free text without
 * language-specific or numeric-specific heuristics.
 *
 * Grammar (binding):
 *   - String, max UTF-8 byte length 256 by default (per call site).
 *   - MUST NOT contain whitespace.
 *   - MUST NOT contain `@` (rejects email shapes).
 *   - MUST NOT start with JSON-structural characters: `{` `[` `"`.
 *   - MUST start with one of the recognized reference prefixes:
 *       `ref:`  `urn:`  `did:`  `sha256:`  `peac:`  `https://`
 *   - When the value starts with `sha256:`, the suffix MUST be exactly
 *     64 lowercase hex characters (matches the canonical PEAC digest grammar
 *     in `wire-02-extensions/shared-validators.ts`).
 *   - When the value starts with `https://`, the URL MUST contain at least
 *     one additional non-whitespace character after the scheme.
 *
 * Byte-length enforcement uses UTF-8 byte length (TextEncoder) rather than
 * JavaScript string length (which counts UTF-16 code units), so multi-byte
 * payloads are correctly bounded.
 */
import { z } from 'zod';

export const OPAQUE_REF_PREFIXES = [
  'ref:',
  'urn:',
  'did:',
  'sha256:',
  'peac:',
  'https://',
] as const;

const FORBIDDEN_LEADING_CHARS = new Set(['{', '[', '"']);
const SHA256_STRICT = /^sha256:[a-f0-9]{64}$/;
const HTTPS_PREFIX = 'https://';

const utf8ByteLength = (value: string): number => new TextEncoder().encode(value).byteLength;

const matchesRecognizedPrefix = (value: string): boolean => {
  for (const prefix of OPAQUE_REF_PREFIXES) {
    if (value.startsWith(prefix)) return true;
  }
  return false;
};

export interface OpaqueRefSchemaOptions {
  maxBytes?: number;
  /** Stable diagnostic code attached to every refinement message. */
  errorCode?: string;
}

const DEFAULT_MAX_BYTES = 256;

/**
 * Construct an opaque-reference Zod schema with grammar enforcement.
 * Default max is 256 UTF-8 bytes; pass `maxBytes` to override per call site.
 * Pass `errorCode` to attach a stable code (e.g. `lifecycle.opaque_ref_grammar_violation`)
 * to every rejection message; downstream validators map this to their own
 * structured error reporting.
 */
export function createOpaqueRefSchema(options: OpaqueRefSchemaOptions = {}): z.ZodString {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const errorCode = options.errorCode ?? 'opaque_ref_grammar_violation';
  return z
    .string()
    .refine((s) => s.length > 0, { message: `${errorCode}: empty string` })
    .refine((s) => utf8ByteLength(s) <= maxBytes, {
      message: `${errorCode}: max ${maxBytes} UTF-8 bytes`,
    })
    .refine((s) => !/\s/.test(s), { message: `${errorCode}: whitespace not allowed` })
    .refine((s) => !s.includes('@'), { message: `${errorCode}: '@' not allowed` })
    .refine((s) => !FORBIDDEN_LEADING_CHARS.has(s[0] ?? ''), {
      message: `${errorCode}: must not begin with JSON-structural character (${[...FORBIDDEN_LEADING_CHARS].join(' ')})`,
    })
    .refine(matchesRecognizedPrefix, {
      message: `${errorCode}: must start with one of ${OPAQUE_REF_PREFIXES.join(', ')}`,
    })
    .refine(
      (s) => {
        if (!s.startsWith('sha256:')) return true;
        return SHA256_STRICT.test(s);
      },
      { message: `${errorCode}: sha256 prefix requires exactly :<64 lowercase hex>` }
    )
    .refine(
      (s) => {
        if (!s.startsWith(HTTPS_PREFIX)) return true;
        return s.length > HTTPS_PREFIX.length;
      },
      { message: `${errorCode}: https:// prefix requires non-empty path/host suffix` }
    );
}

export const OpaqueRefSchema = createOpaqueRefSchema();
export type OpaqueRef = z.infer<typeof OpaqueRefSchema>;

// NOTE: a canonical Sha256DigestSchema already exists at
// `packages/schema/src/wire-02-extensions/shared-validators.ts` and is
// re-exported from `packages/schema/src/wire-02-extensions/index.ts`.
// v0.14.1 schemas should import that one rather than re-defining the shape
// here. We deliberately do NOT re-export it from this module to avoid
// barrel collisions.
