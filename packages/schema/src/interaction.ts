/**
 * PEAC Interaction Evidence Types (v0.10.7+)
 *
 * Interaction evidence captures what happened during agent execution.
 * This is an extension type - stored at evidence.extensions["org.peacprotocol/interaction@0.1"]
 *
 * Design principles:
 * - Wire-stable: Uses extensions mechanism (NOT a top-level evidence field)
 * - Hash-only by default: Privacy-preserving content digests
 * - Open kind registry: Not a closed enum, converges through convention
 * - 1 receipt = 1 interaction: No batching (use bundles for that)
 *
 * @see docs/specs/INTERACTION-EVIDENCE.md
 */

import { z } from 'zod';
import type { JsonValue } from '@peac/kernel';
import type { PEACEnvelope } from './envelope.js';
import type { WorkflowContext } from './workflow.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Extension key for interaction evidence
 * Used in evidence.extensions['org.peacprotocol/interaction@0.1']
 */
export const INTERACTION_EXTENSION_KEY = 'org.peacprotocol/interaction@0.1';

/**
 * Canonical digest algorithms (NORMATIVE)
 *
 * k = 1024 bytes (binary), m = 1024*1024 bytes (binary)
 * NO case-insensitivity, NO regex matching - strict canonical set only.
 */
export const CANONICAL_DIGEST_ALGS = [
  'sha-256', // Full SHA-256
  'sha-256:trunc-64k', // First 64KB (65536 bytes)
  'sha-256:trunc-1m', // First 1MB (1048576 bytes)
] as const;

/**
 * Size constants for digest truncation (NORMATIVE)
 */
export const DIGEST_SIZE_CONSTANTS = {
  k: 1024, // 1 KB = 1024 bytes (binary)
  m: 1024 * 1024, // 1 MB = 1048576 bytes (binary)
  'trunc-64k': 65536, // 64 * 1024
  'trunc-1m': 1048576, // 1024 * 1024
} as const;

/**
 * Result status values for interaction outcomes
 */
export const RESULT_STATUSES = ['ok', 'error', 'timeout', 'canceled'] as const;

/**
 * Redaction modes for payload references
 */
export const REDACTION_MODES = ['hash_only', 'redacted', 'plaintext_allowlisted'] as const;

/**
 * Policy decision values
 */
export const POLICY_DECISIONS = ['allow', 'deny', 'constrained'] as const;

/**
 * Well-known interaction kinds (informational, not normative)
 *
 * The kind field accepts any string matching the kind grammar.
 * These well-known values are listed in the PEAC registries for interop.
 * New kinds do NOT require protocol updates - just use the name.
 *
 * Custom kinds: use "custom:<reverse-dns>" or "<reverse-dns>:<token>"
 */
export const WELL_KNOWN_KINDS = [
  'tool.call',
  'http.request',
  'fs.read',
  'fs.write',
  'message',
] as const;

/**
 * Reserved kind prefixes (NORMATIVE)
 *
 * Kinds starting with these prefixes that are NOT in WELL_KNOWN_KINDS
 * MUST be rejected to prevent namespace pollution.
 */
export const RESERVED_KIND_PREFIXES = ['peac.', 'org.peacprotocol.'] as const;

/**
 * Interaction evidence limits (DoS protection)
 */
export const INTERACTION_LIMITS = {
  /** Maximum interaction ID length */
  maxInteractionIdLength: 256,
  /** Maximum kind length */
  maxKindLength: 128,
  /** Maximum platform name length */
  maxPlatformLength: 64,
  /** Maximum version string length */
  maxVersionLength: 64,
  /** Maximum plugin ID length */
  maxPluginIdLength: 128,
  /** Maximum tool name length */
  maxToolNameLength: 256,
  /** Maximum provider length */
  maxProviderLength: 128,
  /** Maximum URI length */
  maxUriLength: 2048,
  /** Maximum method length */
  maxMethodLength: 16,
  /** Maximum error code length */
  maxErrorCodeLength: 128,
  /** Maximum payment reference length */
  maxPaymentReferenceLength: 256,
  /** Maximum receipt RID length */
  maxReceiptRidLength: 128,
} as const;

// ============================================================================
// Shared Invariant Helpers (used by both schema and ordered validator)
// ============================================================================

/**
 * Check if a kind requires a tool target (internal helper)
 */
function requiresTool(kind: string): boolean {
  return kind.startsWith('tool.');
}

/**
 * Check if a kind requires a resource target (internal helper)
 */
function requiresResource(kind: string): boolean {
  return kind.startsWith('http.') || kind.startsWith('fs.');
}

/**
 * Check if a kind uses a reserved prefix (internal helper)
 */
function usesReservedPrefix(kind: string): boolean {
  return RESERVED_KIND_PREFIXES.some((prefix) => kind.startsWith(prefix));
}

/**
 * Check if a resource object is meaningful - has at least uri (internal helper)
 * Empty resource objects {} are not valid targets.
 */
function hasMeaningfulResource(resource: Record<string, unknown> | undefined): boolean {
  if (!resource) return false;
  if (typeof resource.uri === 'string' && resource.uri.length > 0) return true;
  return false;
}

// ============================================================================
// Format Patterns
// ============================================================================

/**
 * Kind format pattern
 *
 * Lowercase letters, digits, dots, underscores, colons, hyphens.
 * Must start with a letter, end with letter or digit.
 * Min 2 chars, max 128 chars.
 *
 * Examples: "tool.call", "http.request", "custom:com.example.foo"
 */
export const KIND_FORMAT_PATTERN = /^[a-z][a-z0-9._:-]{0,126}[a-z0-9]$/;

/**
 * Extension key format pattern (NORMATIVE)
 *
 * Reverse-DNS domain + '/' + key name + optional version
 * Pattern: ^([a-z0-9-]+\.)+[a-z0-9-]+\/[a-z][a-z0-9._:-]{0,126}[a-z0-9](?:@[0-9]+(?:\.[0-9]+)*)?$
 *
 * Examples:
 * - "com.example/foo"
 * - "org.peacprotocol/interaction@0.1"
 * - "io.vendor/custom-data"
 */
export const EXTENSION_KEY_PATTERN =
  /^([a-z0-9-]+\.)+[a-z0-9-]+\/[a-z][a-z0-9._:-]{0,126}[a-z0-9](?:@[0-9]+(?:\.[0-9]+)*)?$/;

/**
 * Digest value format (64 lowercase hex chars)
 */
export const DIGEST_VALUE_PATTERN = /^[a-f0-9]{64}$/;

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Digest algorithm schema - strict canonical set
 */
export const DigestAlgSchema = z.enum(CANONICAL_DIGEST_ALGS);

/**
 * Digest schema for privacy-preserving content hashing
 */
export const DigestSchema = z
  .object({
    /** Algorithm: 'sha-256' (full) or 'sha-256:trunc-{size}' (truncated) */
    alg: DigestAlgSchema,
    /** 64 lowercase hex chars (SHA-256 output) */
    value: z.string().regex(DIGEST_VALUE_PATTERN, 'Must be 64 lowercase hex chars'),
    /** Original byte length before any truncation (REQUIRED) */
    bytes: z.number().int().nonnegative(),
  })
  .strict();

/**
 * Payload reference schema (on-wire, portable)
 */
export const PayloadRefSchema = z
  .object({
    /** Content digest */
    digest: DigestSchema,
    /** Redaction mode */
    redaction: z.enum(REDACTION_MODES),
  })
  .strict();

/**
 * Executor identity schema (who ran this)
 */
export const ExecutorSchema = z
  .object({
    /** Platform identifier: 'openclaw', 'mcp', 'a2a', 'claude-code' */
    platform: z.string().min(1).max(INTERACTION_LIMITS.maxPlatformLength),
    /** Platform version */
    version: z.string().max(INTERACTION_LIMITS.maxVersionLength).optional(),
    /** Plugin that captured this */
    plugin_id: z.string().max(INTERACTION_LIMITS.maxPluginIdLength).optional(),
    /** Hash of plugin package (provenance) */
    plugin_digest: DigestSchema.optional(),
  })
  .strict();

/**
 * Tool target schema (for tool.call kind)
 */
export const ToolTargetSchema = z
  .object({
    /** Tool name */
    name: z.string().min(1).max(INTERACTION_LIMITS.maxToolNameLength),
    /** Tool provider */
    provider: z.string().max(INTERACTION_LIMITS.maxProviderLength).optional(),
    /** Tool version */
    version: z.string().max(INTERACTION_LIMITS.maxVersionLength).optional(),
  })
  .strict();

/**
 * Resource target schema (for http/fs kinds)
 */
export const ResourceTargetSchema = z
  .object({
    /** Resource URI */
    uri: z.string().max(INTERACTION_LIMITS.maxUriLength).optional(),
    /** HTTP method or operation */
    method: z.string().max(INTERACTION_LIMITS.maxMethodLength).optional(),
  })
  .strict();

/**
 * Execution result schema
 */
export const ResultSchema = z
  .object({
    /** Result status */
    status: z.enum(RESULT_STATUSES),
    /** Error code (PEAC error code or namespaced) */
    error_code: z.string().max(INTERACTION_LIMITS.maxErrorCodeLength).optional(),
    /** Whether the operation can be retried */
    retryable: z.boolean().optional(),
  })
  .strict();

/**
 * Policy context schema (policy state at execution time)
 */
export const PolicyContextSchema = z
  .object({
    /** Policy decision */
    decision: z.enum(POLICY_DECISIONS),
    /** Whether sandbox mode was enabled */
    sandbox_enabled: z.boolean().optional(),
    /** Whether elevated permissions were granted */
    elevated: z.boolean().optional(),
    /** Hash of effective policy document */
    effective_policy_digest: DigestSchema.optional(),
  })
  .strict();

/**
 * References schema (links to related evidence)
 */
export const RefsSchema = z
  .object({
    /** Links to evidence.payment.reference */
    payment_reference: z.string().max(INTERACTION_LIMITS.maxPaymentReferenceLength).optional(),
    /** Correlation across receipts */
    related_receipt_rid: z.string().max(INTERACTION_LIMITS.maxReceiptRidLength).optional(),
  })
  .strict();

/**
 * Kind schema with format validation
 */
export const KindSchema = z
  .string()
  .min(2)
  .max(INTERACTION_LIMITS.maxKindLength)
  .regex(KIND_FORMAT_PATTERN, 'Invalid kind format');

/**
 * Interaction evidence schema (base, without cross-field refinements)
 */
const InteractionEvidenceV01BaseSchema = z
  .object({
    /** Stable ID for idempotency/dedupe (REQUIRED) */
    interaction_id: z.string().min(1).max(INTERACTION_LIMITS.maxInteractionIdLength),

    /** Event kind - open string, not closed enum (REQUIRED) */
    kind: KindSchema,

    /** Executor identity (REQUIRED) */
    executor: ExecutorSchema,

    /** Tool target (when kind is tool-related) */
    tool: ToolTargetSchema.optional(),

    /** Resource target (when kind is http/fs-related) */
    resource: ResourceTargetSchema.optional(),

    /** Input payload reference */
    input: PayloadRefSchema.optional(),

    /** Output payload reference */
    output: PayloadRefSchema.optional(),

    /** Start time (RFC 3339) (REQUIRED) */
    started_at: z.string().datetime(),

    /** Completion time (RFC 3339) */
    completed_at: z.string().datetime().optional(),

    /** Duration in milliseconds (OPTIONAL, non-normative) */
    duration_ms: z.number().int().nonnegative().optional(),

    /** Execution outcome */
    result: ResultSchema.optional(),

    /** Policy context at execution */
    policy: PolicyContextSchema.optional(),

    /** References to related evidence */
    refs: RefsSchema.optional(),

    /** Platform-specific extensions (MUST be namespaced) */
    extensions: z.record(z.unknown()).optional(),
  })
  .strict();

/**
 * Interaction evidence schema with invariant refinements
 *
 * ALL REJECT invariants are enforced here. This ensures that
 * both direct schema validation and ordered validation produce
 * consistent results.
 */
export const InteractionEvidenceV01Schema = InteractionEvidenceV01BaseSchema.superRefine(
  (ev, ctx) => {
    // Invariant 1: completed_at >= started_at
    if (ev.completed_at && ev.started_at) {
      const startedAt = new Date(ev.started_at).getTime();
      const completedAt = new Date(ev.completed_at).getTime();
      if (completedAt < startedAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'completed_at must be >= started_at',
          path: ['completed_at'],
        });
      }
    }

    // Invariant 2: output requires result.status
    if (ev.output && !ev.result?.status) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'result.status is required when output is present',
        path: ['result'],
      });
    }

    // Invariant 3: error status requires error_code or NON-EMPTY extensions
    // Empty extensions object {} is not valid detail
    if (ev.result?.status === 'error') {
      const hasErrorCode = Boolean(ev.result.error_code);
      const hasNonEmptyExtensions =
        ev.extensions !== undefined && Object.keys(ev.extensions).length > 0;
      if (!hasErrorCode && !hasNonEmptyExtensions) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'error_code or non-empty extensions required when status is error',
          path: ['result', 'error_code'],
        });
      }
    }

    // Invariant 4: extension keys must be properly namespaced
    if (ev.extensions) {
      for (const key of Object.keys(ev.extensions)) {
        if (!EXTENSION_KEY_PATTERN.test(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid extension key format: ${key} (must be reverse-DNS/name[@version])`,
            path: ['extensions', key],
          });
        }
      }
    }

    // Invariant 5: reserved kind prefixes (REJECT rule)
    // Kinds starting with peac.* or org.peacprotocol.* that are NOT in WELL_KNOWN_KINDS are rejected
    if (
      usesReservedPrefix(ev.kind) &&
      !WELL_KNOWN_KINDS.includes(ev.kind as (typeof WELL_KNOWN_KINDS)[number])
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `kind "${ev.kind}" uses reserved prefix`,
        path: ['kind'],
      });
    }

    // Invariant 6: target consistency (REJECT rule)
    // tool.* kinds MUST have tool field with name
    if (requiresTool(ev.kind) && !ev.tool) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `kind "${ev.kind}" requires tool field`,
        path: ['tool'],
      });
    }
    // http.* and fs.* kinds MUST have resource field with meaningful content (at least uri)
    if (requiresResource(ev.kind)) {
      if (!ev.resource) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `kind "${ev.kind}" requires resource field`,
          path: ['resource'],
        });
      } else if (!hasMeaningfulResource(ev.resource as Record<string, unknown>)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `kind "${ev.kind}" requires resource.uri to be non-empty`,
          path: ['resource', 'uri'],
        });
      }
    }
  }
);

// ============================================================================
// TypeScript Types (inferred from Zod schemas)
// ============================================================================

export type DigestAlg = z.infer<typeof DigestAlgSchema>;
export type Digest = z.infer<typeof DigestSchema>;
export type PayloadRef = z.infer<typeof PayloadRefSchema>;
export type Executor = z.infer<typeof ExecutorSchema>;
export type ToolTarget = z.infer<typeof ToolTargetSchema>;
export type ResourceTarget = z.infer<typeof ResourceTargetSchema>;
export type ResultStatus = z.infer<typeof ResultSchema>['status'];
export type Result = z.infer<typeof ResultSchema>;
export type PolicyDecision = z.infer<typeof PolicyContextSchema>['decision'];
export type PolicyContext = z.infer<typeof PolicyContextSchema>;
export type Refs = z.infer<typeof RefsSchema>;
export type InteractionEvidenceV01 = z.infer<typeof InteractionEvidenceV01Schema>;

// ============================================================================
// Validation Result Types
// ============================================================================

/**
 * Validation error with code and optional field path
 */
export interface ValidationError {
  /** Machine-readable error code (E_INTERACTION_*) */
  code: string;
  /** Human-readable message */
  message: string;
  /** JSON path to the problematic field */
  field?: string;
}

/**
 * Validation warning with code and optional field path
 */
export interface ValidationWarning {
  /** Machine-readable warning code (W_INTERACTION_*) */
  code: string;
  /** Human-readable message */
  message: string;
  /** JSON path to the problematic field */
  field?: string;
}

/**
 * Result of interaction evidence validation.
 *
 * Warning-capable API: returns both errors (fatal) and warnings (non-fatal).
 * This enables conformance testing with warning fixtures.
 */
export type InteractionValidationResult =
  | { valid: true; value: InteractionEvidenceV01; warnings: ValidationWarning[] }
  | { valid: false; errors: ValidationError[]; warnings: ValidationWarning[] };

// ============================================================================
// Ordered Validation (Conformance)
// ============================================================================

/**
 * Validate interaction evidence with explicit evaluation ordering.
 *
 * Returns canonical error codes per validation ordering.
 * This function does NOT depend on Zod's internal validation ordering.
 * Cross-language implementations MUST produce identical error_code values
 * for the same invalid input.
 *
 * Validation order:
 * 1. Required field presence
 * 2. Required field format (interaction_id, kind, started_at)
 * 3. Kind format and reserved prefix check
 * 4. Executor field validation
 * 5. Optional field format (completed_at, digests, etc.)
 * 6. Cross-field invariants (timing, output-result, error-detail)
 * 7. Extension key namespacing
 * 8. Target consistency (kind prefix -> target field)
 *
 * @param input - Raw input to validate
 * @returns Validation result with canonical error codes on failure
 */
export function validateInteractionOrdered(input: unknown): InteractionValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Step 1: Type check (arrays are typeof 'object' but not valid input)
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {
      valid: false,
      errors: [
        {
          code: 'E_INTERACTION_INVALID_FORMAT',
          message: 'Input must be an object',
        },
      ],
      warnings: [],
    };
  }

  const obj = input as Record<string, unknown>;

  // Step 2: Required field presence
  if (typeof obj.interaction_id !== 'string' || obj.interaction_id.length === 0) {
    errors.push({
      code: 'E_INTERACTION_MISSING_ID',
      message: 'interaction_id is required',
      field: 'interaction_id',
    });
  } else if (obj.interaction_id.length > INTERACTION_LIMITS.maxInteractionIdLength) {
    errors.push({
      code: 'E_INTERACTION_INVALID_FORMAT',
      message: `interaction_id exceeds max length (${INTERACTION_LIMITS.maxInteractionIdLength})`,
      field: 'interaction_id',
    });
  }

  // Step 3: Kind format validation
  // Empty string is semantically "missing", not "invalid format"
  if (typeof obj.kind !== 'string' || obj.kind.length === 0) {
    errors.push({
      code: 'E_INTERACTION_MISSING_KIND',
      message: 'kind is required',
      field: 'kind',
    });
  } else if (obj.kind.length < 2 || obj.kind.length > INTERACTION_LIMITS.maxKindLength) {
    errors.push({
      code: 'E_INTERACTION_INVALID_KIND_FORMAT',
      message: `kind must be 2-${INTERACTION_LIMITS.maxKindLength} characters`,
      field: 'kind',
    });
  } else if (!KIND_FORMAT_PATTERN.test(obj.kind)) {
    errors.push({
      code: 'E_INTERACTION_INVALID_KIND_FORMAT',
      message: 'kind must match pattern: lowercase, start with letter, end with alphanumeric',
      field: 'kind',
    });
  } else {
    // Check reserved prefixes
    for (const prefix of RESERVED_KIND_PREFIXES) {
      if (obj.kind.startsWith(prefix) && !WELL_KNOWN_KINDS.includes(obj.kind as never)) {
        errors.push({
          code: 'E_INTERACTION_KIND_RESERVED',
          message: `kind "${obj.kind}" uses reserved prefix "${prefix}"`,
          field: 'kind',
        });
        break;
      }
    }
    // Warn if not in well-known registry (but valid format)
    if (
      errors.length === 0 &&
      !WELL_KNOWN_KINDS.includes(obj.kind as (typeof WELL_KNOWN_KINDS)[number])
    ) {
      warnings.push({
        code: 'W_INTERACTION_KIND_UNREGISTERED',
        message: `kind "${obj.kind}" is not in the well-known registry`,
        field: 'kind',
      });
    }
  }

  // Step 4: started_at validation
  // Invalid format is treated as "missing" because the value is unusable
  // E_INTERACTION_INVALID_TIMING is reserved for relational errors (completed_at < started_at)
  if (typeof obj.started_at !== 'string') {
    errors.push({
      code: 'E_INTERACTION_MISSING_STARTED_AT',
      message: 'started_at is required',
      field: 'started_at',
    });
  } else {
    const startedAtDate = new Date(obj.started_at);
    if (isNaN(startedAtDate.getTime())) {
      errors.push({
        code: 'E_INTERACTION_MISSING_STARTED_AT',
        message: 'started_at must be a valid ISO 8601 datetime',
        field: 'started_at',
      });
    }
  }

  // Step 5: Executor validation
  if (typeof obj.executor !== 'object' || obj.executor === null) {
    errors.push({
      code: 'E_INTERACTION_MISSING_EXECUTOR',
      message: 'executor is required',
      field: 'executor',
    });
  } else {
    const executor = obj.executor as Record<string, unknown>;
    if (typeof executor.platform !== 'string' || executor.platform.length === 0) {
      errors.push({
        code: 'E_INTERACTION_MISSING_EXECUTOR',
        message: 'executor.platform is required',
        field: 'executor.platform',
      });
    } else if (executor.platform.length > INTERACTION_LIMITS.maxPlatformLength) {
      errors.push({
        code: 'E_INTERACTION_INVALID_FORMAT',
        message: `executor.platform exceeds max length (${INTERACTION_LIMITS.maxPlatformLength})`,
        field: 'executor.platform',
      });
    }
  }

  // Return early if we have fatal errors from required fields
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // Step 6: Digest validation (optional fields)
  const validateDigest = (
    digest: unknown,
    fieldPath: string
  ): { errors: ValidationError[]; valid: boolean } => {
    const digestErrors: ValidationError[] = [];
    if (typeof digest !== 'object' || digest === null) {
      digestErrors.push({
        code: 'E_INTERACTION_INVALID_DIGEST',
        message: 'digest must be an object',
        field: fieldPath,
      });
      return { errors: digestErrors, valid: false };
    }
    const d = digest as Record<string, unknown>;
    if (!CANONICAL_DIGEST_ALGS.includes(d.alg as DigestAlg)) {
      digestErrors.push({
        code: 'E_INTERACTION_INVALID_DIGEST_ALG',
        message: `digest.alg must be one of: ${CANONICAL_DIGEST_ALGS.join(', ')}`,
        field: `${fieldPath}.alg`,
      });
    }
    if (typeof d.value !== 'string' || !DIGEST_VALUE_PATTERN.test(d.value)) {
      digestErrors.push({
        code: 'E_INTERACTION_INVALID_DIGEST',
        message: 'digest.value must be 64 lowercase hex chars',
        field: `${fieldPath}.value`,
      });
    }
    if (typeof d.bytes !== 'number' || !Number.isInteger(d.bytes) || d.bytes < 0) {
      digestErrors.push({
        code: 'E_INTERACTION_INVALID_DIGEST',
        message: 'digest.bytes must be a non-negative integer',
        field: `${fieldPath}.bytes`,
      });
    }
    return { errors: digestErrors, valid: digestErrors.length === 0 };
  };

  // Validate input digest if present
  if (obj.input !== undefined) {
    const inputObj = obj.input as Record<string, unknown>;
    if (inputObj.digest !== undefined) {
      const result = validateDigest(inputObj.digest, 'input.digest');
      errors.push(...result.errors);
    }
  }

  // Validate output digest if present
  if (obj.output !== undefined) {
    const outputObj = obj.output as Record<string, unknown>;
    if (outputObj.digest !== undefined) {
      const result = validateDigest(outputObj.digest, 'output.digest');
      errors.push(...result.errors);
    }
  }

  // Step 7: Timing invariant (completed_at >= started_at)
  if (typeof obj.completed_at === 'string' && typeof obj.started_at === 'string') {
    const startedAt = new Date(obj.started_at).getTime();
    const completedAt = new Date(obj.completed_at).getTime();
    if (!isNaN(startedAt) && !isNaN(completedAt) && completedAt < startedAt) {
      errors.push({
        code: 'E_INTERACTION_INVALID_TIMING',
        message: 'completed_at must be >= started_at',
        field: 'completed_at',
      });
    }
  }

  // Step 8: Output requires result invariant
  if (obj.output !== undefined) {
    const result = obj.result as Record<string, unknown> | undefined;
    if (!result?.status) {
      errors.push({
        code: 'E_INTERACTION_MISSING_RESULT',
        message: 'result.status is required when output is present',
        field: 'result',
      });
    }
  }

  // Step 9: Error status requires detail (error_code OR non-empty extensions)
  // Empty extensions object {} is not valid detail
  if (obj.result !== undefined) {
    const result = obj.result as Record<string, unknown>;
    if (result.status === 'error') {
      const hasErrorCode = Boolean(result.error_code);
      const hasNonEmptyExtensions =
        obj.extensions !== undefined &&
        typeof obj.extensions === 'object' &&
        obj.extensions !== null &&
        Object.keys(obj.extensions as object).length > 0;
      if (!hasErrorCode && !hasNonEmptyExtensions) {
        errors.push({
          code: 'E_INTERACTION_MISSING_ERROR_DETAIL',
          message: 'error_code or non-empty extensions required when result.status is error',
          field: 'result.error_code',
        });
      }
    }
  }

  // Step 10: Extension key namespacing
  if (obj.extensions !== undefined) {
    if (typeof obj.extensions !== 'object' || obj.extensions === null) {
      errors.push({
        code: 'E_INTERACTION_INVALID_FORMAT',
        message: 'extensions must be an object',
        field: 'extensions',
      });
    } else {
      for (const key of Object.keys(obj.extensions as object)) {
        if (!EXTENSION_KEY_PATTERN.test(key)) {
          errors.push({
            code: 'E_INTERACTION_INVALID_EXTENSION_KEY',
            message: `Invalid extension key format: "${key}" (must be reverse-DNS/name[@version])`,
            field: `extensions.${key}`,
          });
        }
      }
    }
  }

  // Step 11: Target consistency (prefix-aware, using shared helpers)
  const kind = obj.kind as string;
  const hasTool = obj.tool !== undefined;
  const hasResource = obj.resource !== undefined;

  // tool.* kinds MUST have tool field
  if (requiresTool(kind) && !hasTool) {
    errors.push({
      code: 'E_INTERACTION_MISSING_TARGET',
      message: `kind "${kind}" requires tool field`,
      field: 'tool',
    });
  }

  // http.* and fs.* kinds MUST have resource field with meaningful content
  if (requiresResource(kind)) {
    if (!hasResource) {
      errors.push({
        code: 'E_INTERACTION_MISSING_TARGET',
        message: `kind "${kind}" requires resource field`,
        field: 'resource',
      });
    } else if (!hasMeaningfulResource(obj.resource as Record<string, unknown>)) {
      errors.push({
        code: 'E_INTERACTION_MISSING_TARGET',
        message: `kind "${kind}" requires resource.uri to be non-empty`,
        field: 'resource.uri',
      });
    }
  }

  // Warn if neither target present (non-strict kinds like 'message')
  if (!hasTool && !hasResource && errors.length === 0) {
    warnings.push({
      code: 'W_INTERACTION_MISSING_TARGET',
      message: 'Neither tool nor resource field is present',
      field: 'tool',
    });
  }

  // Return early if we have errors
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // Final Zod validation for strict schema compliance
  const zodResult = InteractionEvidenceV01Schema.safeParse(input);
  if (!zodResult.success) {
    return {
      valid: false,
      errors: [
        {
          code: 'E_INTERACTION_INVALID_FORMAT',
          message: zodResult.error.issues[0]?.message || 'Schema validation failed',
          field: zodResult.error.issues[0]?.path.join('.'),
        },
      ],
      warnings,
    };
  }

  return { valid: true, value: zodResult.data, warnings };
}

// ============================================================================
// Compatibility Result Type
// ============================================================================

/**
 * Simple validation result for conformance harness compatibility.
 *
 * This matches the pattern used by other PEAC validators (workflow, etc.)
 * and allows conformance fixtures to test without needing to handle the
 * full warning-capable API shape.
 */
export interface SimpleValidationResult {
  /** Whether the input is valid */
  valid: boolean;
  /** Error code on failure */
  error_code?: string;
  /** Field path on failure */
  error_field?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate interaction evidence (simple API for conformance harness)
 *
 * This is the recommended entry point for conformance testing.
 * Returns a simple result matching the existing harness contract.
 *
 * ## Warnings Contract
 *
 * This compat API intentionally **omits warnings** from the result.
 * Warnings are available via validateInteractionOrdered() for consumers
 * who explicitly opt in. Stable consumers should:
 * - Use this function for pass/fail validation
 * - Use validateInteractionOrdered() only when warnings are needed
 *
 * This prevents breaking changes if warning codes are added/modified.
 *
 * @param input - Raw input to validate
 * @returns Simple validation result with error_code on failure (no warnings)
 */
export function validateInteraction(input: unknown): SimpleValidationResult {
  const result = validateInteractionOrdered(input);
  if (result.valid) {
    return { valid: true };
  }
  const firstError = result.errors[0];
  return {
    valid: false,
    error_code: firstError?.code,
    error_field: firstError?.field,
  };
}

/**
 * Validate interaction evidence (throwing)
 *
 * @param evidence - Object to validate
 * @returns Validated InteractionEvidenceV01
 * @throws ZodError if validation fails
 */
export function validateInteractionEvidence(evidence: unknown): InteractionEvidenceV01 {
  return InteractionEvidenceV01Schema.parse(evidence);
}

/**
 * Check if an object is valid interaction evidence (non-throwing)
 *
 * @param evidence - Object to check
 * @returns True if valid InteractionEvidenceV01
 */
export function isValidInteractionEvidence(evidence: unknown): evidence is InteractionEvidenceV01 {
  return InteractionEvidenceV01Schema.safeParse(evidence).success;
}

/**
 * Check if a kind is in the well-known registry
 *
 * @param kind - Kind string to check
 * @returns True if well-known
 */
export function isWellKnownKind(kind: string): kind is (typeof WELL_KNOWN_KINDS)[number] {
  return WELL_KNOWN_KINDS.includes(kind as (typeof WELL_KNOWN_KINDS)[number]);
}

/**
 * Check if a kind uses a reserved prefix
 *
 * @param kind - Kind string to check
 * @returns True if uses reserved prefix
 */
export function isReservedKindPrefix(kind: string): boolean {
  return RESERVED_KIND_PREFIXES.some((prefix) => kind.startsWith(prefix));
}

/**
 * Check if a digest uses truncation
 *
 * @param digest - Digest to check
 * @returns True if truncated
 */
export function isDigestTruncated(digest: Digest): boolean {
  return digest.alg.startsWith('sha-256:trunc-');
}

// ============================================================================
// SDK Accessors
// ============================================================================

/**
 * Get interaction evidence from a PEAC envelope
 *
 * @param receipt - PEAC envelope to read from
 * @returns Interaction evidence if present, undefined otherwise
 */
export function getInteraction(receipt: PEACEnvelope): InteractionEvidenceV01 | undefined {
  return receipt.evidence?.extensions?.[INTERACTION_EXTENSION_KEY] as
    | InteractionEvidenceV01
    | undefined;
}

/**
 * Set interaction evidence on a PEAC envelope (mutates)
 *
 * @param receipt - PEAC envelope to modify
 * @param interaction - Interaction evidence to set
 */
export function setInteraction(receipt: PEACEnvelope, interaction: InteractionEvidenceV01): void {
  if (!receipt.evidence) {
    receipt.evidence = {};
  }
  if (!receipt.evidence.extensions) {
    receipt.evidence.extensions = {};
  }
  receipt.evidence.extensions[INTERACTION_EXTENSION_KEY] = interaction as unknown as JsonValue;
}

/**
 * Check if a PEAC envelope has interaction evidence
 *
 * @param receipt - PEAC envelope to check
 * @returns True if interaction evidence is present
 */
export function hasInteraction(receipt: PEACEnvelope): boolean {
  return receipt.evidence?.extensions?.[INTERACTION_EXTENSION_KEY] !== undefined;
}

// ============================================================================
// Projection API
// ============================================================================

/**
 * ReceiptView - pure view layer that makes extensions feel like top-level fields
 *
 * Does NOT modify the underlying envelope; just provides convenient access.
 * This projection allows code to work with interaction evidence as if it were
 * a first-class field while maintaining wire format stability.
 */
export interface ReceiptView {
  /** The underlying envelope (unchanged) */
  readonly envelope: PEACEnvelope;

  /** Interaction evidence (from extension) - feels like top-level */
  readonly interaction?: InteractionEvidenceV01;

  /** Array form for uniform pipeline processing */
  readonly interactions: readonly InteractionEvidenceV01[];

  /** Workflow context (from auth.extensions) */
  readonly workflow?: WorkflowContext;
}

/**
 * Create a view over a PEAC envelope that provides first-class access
 * to extension data without modifying the wire format.
 *
 * @param envelope - PEAC envelope to create view for
 * @returns ReceiptView with convenient accessors
 *
 * @example
 * const view = createReceiptView(envelope);
 * if (view.interaction) {
 *   console.log(view.interaction.kind);
 * }
 */
export function createReceiptView(envelope: PEACEnvelope): ReceiptView {
  const interaction = getInteraction(envelope);
  const workflow = envelope.auth?.extensions?.['org.peacprotocol/workflow'] as
    | WorkflowContext
    | undefined;

  return {
    envelope,
    interaction,
    interactions: interaction ? [interaction] : [],
    workflow,
  };
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Parameters for creating interaction evidence
 */
export interface CreateInteractionParams {
  interaction_id: string;
  kind: string;
  executor: {
    platform: string;
    version?: string;
    plugin_id?: string;
    plugin_digest?: Digest;
  };
  tool?: {
    name: string;
    provider?: string;
    version?: string;
  };
  resource?: {
    uri?: string;
    method?: string;
  };
  input?: {
    digest: Digest;
    redaction: (typeof REDACTION_MODES)[number];
  };
  output?: {
    digest: Digest;
    redaction: (typeof REDACTION_MODES)[number];
  };
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  result?: {
    status: (typeof RESULT_STATUSES)[number];
    error_code?: string;
    retryable?: boolean;
  };
  policy?: {
    decision: (typeof POLICY_DECISIONS)[number];
    sandbox_enabled?: boolean;
    elevated?: boolean;
    effective_policy_digest?: Digest;
  };
  refs?: {
    payment_reference?: string;
    related_receipt_rid?: string;
  };
  extensions?: Record<string, JsonValue>;
}

/**
 * Create validated interaction evidence
 *
 * @param params - Interaction parameters
 * @returns Validated InteractionEvidenceV01
 * @throws ZodError if validation fails
 */
export function createInteractionEvidence(params: CreateInteractionParams): InteractionEvidenceV01 {
  const evidence: InteractionEvidenceV01 = {
    interaction_id: params.interaction_id,
    kind: params.kind,
    executor: {
      platform: params.executor.platform,
      ...(params.executor.version && { version: params.executor.version }),
      ...(params.executor.plugin_id && { plugin_id: params.executor.plugin_id }),
      ...(params.executor.plugin_digest && { plugin_digest: params.executor.plugin_digest }),
    },
    ...(params.tool && { tool: params.tool }),
    ...(params.resource && { resource: params.resource }),
    ...(params.input && { input: params.input }),
    ...(params.output && { output: params.output }),
    started_at: params.started_at,
    ...(params.completed_at && { completed_at: params.completed_at }),
    ...(params.duration_ms !== undefined && { duration_ms: params.duration_ms }),
    ...(params.result && { result: params.result }),
    ...(params.policy && { policy: params.policy }),
    ...(params.refs && { refs: params.refs }),
    ...(params.extensions && { extensions: params.extensions }),
  };

  return validateInteractionEvidence(evidence);
}
