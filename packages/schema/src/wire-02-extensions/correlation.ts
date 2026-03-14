/**
 * Correlation Extension Group (org.peacprotocol/correlation)
 *
 * Records workflow correlation and traceability metadata.
 * OpenTelemetry-compatible trace and span IDs.
 * Shipped in v0.12.0-preview.1 (DD-153).
 */

import { z } from 'zod';
import { EXTENSION_LIMITS } from './limits.js';

export const CORRELATION_EXTENSION_KEY = 'org.peacprotocol/correlation' as const;

/** OpenTelemetry trace ID: exactly 32 lowercase hex chars */
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;

/** OpenTelemetry span ID: exactly 16 lowercase hex chars */
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/;

export const CorrelationExtensionSchema = z
  .object({
    /** OpenTelemetry-compatible trace ID (32 lowercase hex chars) */
    trace_id: z
      .string()
      .length(EXTENSION_LIMITS.maxTraceIdLength)
      .regex(TRACE_ID_PATTERN, 'trace_id must be 32 lowercase hex characters')
      .optional(),
    /** OpenTelemetry-compatible span ID (16 lowercase hex chars) */
    span_id: z
      .string()
      .length(EXTENSION_LIMITS.maxSpanIdLength)
      .regex(SPAN_ID_PATTERN, 'span_id must be 16 lowercase hex characters')
      .optional(),
    /** Workflow identifier */
    workflow_id: z.string().min(1).max(EXTENSION_LIMITS.maxWorkflowIdLength).optional(),
    /** Parent receipt JTI for causal chains */
    parent_jti: z.string().min(1).max(EXTENSION_LIMITS.maxParentJtiLength).optional(),
    /** JTIs this receipt depends on */
    depends_on: z
      .array(z.string().min(1).max(EXTENSION_LIMITS.maxParentJtiLength))
      .max(EXTENSION_LIMITS.maxDependsOnLength)
      .optional(),
  })
  .strict();

export type CorrelationExtension = z.infer<typeof CorrelationExtensionSchema>;
