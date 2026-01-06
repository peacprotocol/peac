/**
 * PEAC Audit Types (v0.9.27+)
 *
 * Type definitions for audit logging and case bundle generation.
 * These types define the normative JSONL audit log format.
 */

/**
 * Audit event categories aligned with PEAC operations.
 */
export type AuditEventType =
  | 'receipt_issued'
  | 'receipt_verified'
  | 'receipt_denied'
  | 'access_decision'
  | 'dispute_filed'
  | 'dispute_acknowledged'
  | 'dispute_resolved'
  | 'dispute_rejected'
  | 'dispute_appealed'
  | 'dispute_final'
  | 'attribution_created'
  | 'attribution_verified'
  | 'identity_verified'
  | 'identity_rejected'
  | 'policy_evaluated';

/**
 * Audit event severity levels.
 */
export type AuditSeverity = 'info' | 'warn' | 'error' | 'critical';

/**
 * W3C Trace Context for correlation.
 *
 * @see https://www.w3.org/TR/trace-context/
 */
export interface TraceContext {
  /** Trace ID (32 hex characters) */
  trace_id: string;
  /** Span ID (16 hex characters) */
  span_id: string;
  /** Parent span ID (optional) */
  parent_span_id?: string;
  /** Trace flags (optional, default 00) */
  trace_flags?: string;
}

/**
 * Actor information for audit entries.
 * May be a user, agent, or system component.
 */
export interface AuditActor {
  /** Actor type */
  type: 'user' | 'agent' | 'system';
  /** Actor identifier (URI, DID, or opaque ID) */
  id: string;
  /** Human-readable name (optional) */
  name?: string;
}

/**
 * Resource affected by the audit event.
 */
export interface AuditResource {
  /** Resource type */
  type: 'receipt' | 'attribution' | 'identity' | 'policy' | 'dispute' | 'content';
  /** Resource identifier (jti, URL, ref, etc.) */
  id: string;
  /** Resource URI (optional) */
  uri?: string;
}

/**
 * Outcome of the audited operation.
 */
export interface AuditOutcome {
  /** Whether the operation succeeded */
  success: boolean;
  /** Result code (e.g., 'allowed', 'denied', 'upheld') */
  result?: string;
  /** Error code if failed */
  error_code?: string;
  /** Human-readable message */
  message?: string;
}

/**
 * Core audit entry structure (JSONL normative format).
 *
 * Each line in a JSONL audit log is one AuditEntry serialized as JSON.
 * Fields are ordered for consistent serialization.
 */
export interface AuditEntry {
  /** PEAC audit format version */
  version: 'peac.audit/0.9';

  /** Unique entry identifier (ULID recommended) */
  id: string;

  /** Event type from controlled vocabulary */
  event_type: AuditEventType;

  /** ISO 8601 timestamp with timezone */
  timestamp: string;

  /** Event severity level */
  severity: AuditSeverity;

  /** Optional trace context for distributed tracing */
  trace?: TraceContext;

  /** Actor who triggered the event */
  actor: AuditActor;

  /** Resource affected by the event */
  resource: AuditResource;

  /** Outcome of the operation */
  outcome: AuditOutcome;

  /** Additional context (privacy-safe, no PII) */
  context?: Record<string, unknown>;

  /** Dispute reference if related to a dispute (ULID format) */
  dispute_ref?: string;
}

/**
 * Case bundle containing related audit entries for a dispute.
 *
 * A case bundle gathers all relevant events for dispute resolution,
 * organized chronologically with trace correlation.
 */
export interface CaseBundle {
  /** PEAC case bundle format version */
  version: 'peac.bundle/0.9';

  /** Dispute reference this bundle is for (ULID) */
  dispute_ref: string;

  /** When the bundle was generated */
  generated_at: string;

  /** Who generated the bundle */
  generated_by: string;

  /** Audit entries in chronological order */
  entries: AuditEntry[];

  /** Unique trace IDs involved in this case */
  trace_ids: string[];

  /** Summary statistics */
  summary: CaseBundleSummary;
}

/**
 * Summary statistics for a case bundle.
 */
export interface CaseBundleSummary {
  /** Total number of entries */
  entry_count: number;

  /** Count by event type */
  by_event_type: Record<string, number>;

  /** Count by severity */
  by_severity: Record<AuditSeverity, number>;

  /** Earliest event timestamp */
  first_event: string;

  /** Latest event timestamp */
  last_event: string;

  /** Unique actors involved */
  actor_count: number;

  /** Unique resources affected */
  resource_count: number;
}

/**
 * Options for creating audit entries.
 */
export interface CreateAuditEntryOptions {
  /** Optional ID (generated if not provided) */
  id?: string;

  /** Event type */
  event_type: AuditEventType;

  /** Severity level (defaults to 'info') */
  severity?: AuditSeverity;

  /** Trace context for correlation */
  trace?: TraceContext;

  /** Actor information */
  actor: AuditActor;

  /** Resource affected */
  resource: AuditResource;

  /** Operation outcome */
  outcome: AuditOutcome;

  /** Additional context */
  context?: Record<string, unknown>;

  /** Dispute reference if applicable */
  dispute_ref?: string;

  /** Timestamp (current time if not provided) */
  timestamp?: string;
}

/**
 * Options for creating a case bundle.
 */
export interface CreateCaseBundleOptions {
  /** Dispute reference (ULID) */
  dispute_ref: string;

  /** Who is generating the bundle */
  generated_by: string;

  /** Audit entries to include */
  entries: AuditEntry[];
}

/**
 * JSONL formatting options.
 */
export interface JsonlOptions {
  /** Pretty print each entry (for debugging, not production) */
  pretty?: boolean;

  /** Include newline at end of output */
  trailingNewline?: boolean;
}

/**
 * JSONL parsing options.
 */
export interface JsonlParseOptions {
  /** Skip invalid lines instead of throwing */
  skipInvalid?: boolean;

  /** Maximum lines to parse (0 = unlimited) */
  maxLines?: number;
}
