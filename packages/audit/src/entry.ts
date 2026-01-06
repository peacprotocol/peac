/**
 * Audit Entry Creation and Validation (v0.9.27+)
 *
 * Functions for creating and validating PEAC audit entries.
 */

import type {
  AuditEntry,
  AuditEventType,
  AuditSeverity,
  CreateAuditEntryOptions,
  TraceContext,
} from './types.js';

/** PEAC audit format version */
export const AUDIT_VERSION = 'peac.audit/0.9' as const;

/**
 * Valid audit event types.
 */
export const AUDIT_EVENT_TYPES: readonly AuditEventType[] = [
  'receipt_issued',
  'receipt_verified',
  'receipt_denied',
  'access_decision',
  'dispute_filed',
  'dispute_acknowledged',
  'dispute_resolved',
  'dispute_rejected',
  'dispute_appealed',
  'dispute_final',
  'attribution_created',
  'attribution_verified',
  'identity_verified',
  'identity_rejected',
  'policy_evaluated',
] as const;

/**
 * Valid severity levels.
 */
export const AUDIT_SEVERITIES: readonly AuditSeverity[] = [
  'info',
  'warn',
  'error',
  'critical',
] as const;

/**
 * ULID-compatible ID generator.
 * Uses timestamp prefix + random suffix for time-ordered, unique IDs.
 *
 * Format: 26 uppercase alphanumeric characters (Crockford Base32)
 */
export function generateAuditId(): string {
  // Crockford Base32 alphabet (excludes I, L, O, U)
  const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  // Timestamp component (10 chars, milliseconds since epoch)
  const now = Date.now();
  let timestampPart = '';
  let time = now;
  for (let i = 0; i < 10; i++) {
    timestampPart = ALPHABET[time % 32] + timestampPart;
    time = Math.floor(time / 32);
  }

  // Random component (16 chars)
  let randomPart = '';
  for (let i = 0; i < 16; i++) {
    randomPart += ALPHABET[Math.floor(Math.random() * 32)];
  }

  return timestampPart + randomPart;
}

/**
 * Validate ULID format.
 *
 * @param id - ID to validate
 * @returns True if valid ULID format
 */
export function isValidUlid(id: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(id);
}

/**
 * Validate trace context format.
 *
 * @param trace - Trace context to validate
 * @returns True if valid W3C Trace Context format
 */
export function isValidTraceContext(trace: TraceContext): boolean {
  // Trace ID: 32 hex characters
  if (!/^[0-9a-f]{32}$/i.test(trace.trace_id)) {
    return false;
  }

  // Span ID: 16 hex characters
  if (!/^[0-9a-f]{16}$/i.test(trace.span_id)) {
    return false;
  }

  // Parent span ID (optional): 16 hex characters
  if (trace.parent_span_id && !/^[0-9a-f]{16}$/i.test(trace.parent_span_id)) {
    return false;
  }

  // Trace flags (optional): 2 hex characters
  if (trace.trace_flags && !/^[0-9a-f]{2}$/i.test(trace.trace_flags)) {
    return false;
  }

  return true;
}

/**
 * Create an audit entry with defaults applied.
 *
 * @param options - Entry creation options
 * @returns A valid AuditEntry
 *
 * @example
 * ```typescript
 * const entry = createAuditEntry({
 *   event_type: 'receipt_issued',
 *   actor: { type: 'system', id: 'peac-issuer' },
 *   resource: { type: 'receipt', id: 'jti:rec_abc123' },
 *   outcome: { success: true, result: 'issued' },
 * });
 * ```
 */
export function createAuditEntry(options: CreateAuditEntryOptions): AuditEntry {
  const entry: AuditEntry = {
    version: AUDIT_VERSION,
    id: options.id ?? generateAuditId(),
    event_type: options.event_type,
    timestamp: options.timestamp ?? new Date().toISOString(),
    severity: options.severity ?? 'info',
    actor: options.actor,
    resource: options.resource,
    outcome: options.outcome,
  };

  if (options.trace) {
    entry.trace = options.trace;
  }

  if (options.context) {
    entry.context = options.context;
  }

  if (options.dispute_ref) {
    entry.dispute_ref = options.dispute_ref;
  }

  return entry;
}

/**
 * Validation result type.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate an audit entry.
 *
 * @param entry - Entry to validate
 * @returns Validation result with any errors
 */
export function validateAuditEntry(entry: unknown): ValidationResult {
  const errors: string[] = [];

  if (!entry || typeof entry !== 'object') {
    return { valid: false, errors: ['Entry must be an object'] };
  }

  const e = entry as Record<string, unknown>;

  // Version check
  if (e.version !== AUDIT_VERSION) {
    errors.push(`Invalid version: expected "${AUDIT_VERSION}", got "${e.version}"`);
  }

  // ID check
  if (typeof e.id !== 'string' || !isValidUlid(e.id)) {
    errors.push('Invalid or missing id (must be ULID format)');
  }

  // Event type check
  if (!AUDIT_EVENT_TYPES.includes(e.event_type as AuditEventType)) {
    errors.push(`Invalid event_type: "${e.event_type}"`);
  }

  // Timestamp check
  if (typeof e.timestamp !== 'string' || isNaN(Date.parse(e.timestamp))) {
    errors.push('Invalid or missing timestamp (must be ISO 8601)');
  }

  // Severity check
  if (!AUDIT_SEVERITIES.includes(e.severity as AuditSeverity)) {
    errors.push(`Invalid severity: "${e.severity}"`);
  }

  // Actor check
  if (!e.actor || typeof e.actor !== 'object') {
    errors.push('Missing or invalid actor');
  } else {
    const actor = e.actor as Record<string, unknown>;
    if (!['user', 'agent', 'system'].includes(actor.type as string)) {
      errors.push(`Invalid actor.type: "${actor.type}"`);
    }
    if (typeof actor.id !== 'string' || actor.id.length === 0) {
      errors.push('Actor must have non-empty id');
    }
  }

  // Resource check
  if (!e.resource || typeof e.resource !== 'object') {
    errors.push('Missing or invalid resource');
  } else {
    const resource = e.resource as Record<string, unknown>;
    const validTypes = ['receipt', 'attribution', 'identity', 'policy', 'dispute', 'content'];
    if (!validTypes.includes(resource.type as string)) {
      errors.push(`Invalid resource.type: "${resource.type}"`);
    }
    if (typeof resource.id !== 'string' || resource.id.length === 0) {
      errors.push('Resource must have non-empty id');
    }
  }

  // Outcome check
  if (!e.outcome || typeof e.outcome !== 'object') {
    errors.push('Missing or invalid outcome');
  } else {
    const outcome = e.outcome as Record<string, unknown>;
    if (typeof outcome.success !== 'boolean') {
      errors.push('Outcome must have boolean success field');
    }
  }

  // Trace check (optional but must be valid if present)
  if (e.trace) {
    if (!isValidTraceContext(e.trace as TraceContext)) {
      errors.push('Invalid trace context format');
    }
  }

  // Dispute ref check (optional but must be valid ULID if present)
  if (e.dispute_ref) {
    if (typeof e.dispute_ref !== 'string' || !isValidUlid(e.dispute_ref)) {
      errors.push('Invalid dispute_ref (must be ULID format)');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if an object is a valid audit entry.
 *
 * @param entry - Object to check
 * @returns True if valid
 */
export function isValidAuditEntry(entry: unknown): entry is AuditEntry {
  return validateAuditEntry(entry).valid;
}
