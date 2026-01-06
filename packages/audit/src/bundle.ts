/**
 * Case Bundle Generation (v0.9.27+)
 *
 * Case bundles collect related audit entries for dispute resolution.
 * They provide a comprehensive view of all events related to a dispute.
 */

import type {
  AuditEntry,
  AuditSeverity,
  CaseBundle,
  CaseBundleSummary,
  CreateCaseBundleOptions,
} from './types.js';

/** PEAC case bundle format version */
export const BUNDLE_VERSION = 'peac.bundle/0.9' as const;

/**
 * Create a case bundle from audit entries.
 *
 * @param options - Bundle creation options
 * @returns A CaseBundle with entries and summary
 *
 * @example
 * ```typescript
 * const bundle = createCaseBundle({
 *   dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
 *   generated_by: 'https://platform.example.com',
 *   entries: auditEntries,
 * });
 * ```
 */
export function createCaseBundle(options: CreateCaseBundleOptions): CaseBundle {
  // Sort entries chronologically
  const sortedEntries = [...options.entries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Collect unique trace IDs
  const traceIds = new Set<string>();
  for (const entry of sortedEntries) {
    if (entry.trace?.trace_id) {
      traceIds.add(entry.trace.trace_id);
    }
  }

  // Generate summary
  const summary = generateBundleSummary(sortedEntries);

  return {
    version: BUNDLE_VERSION,
    dispute_ref: options.dispute_ref,
    generated_at: new Date().toISOString(),
    generated_by: options.generated_by,
    entries: sortedEntries,
    trace_ids: Array.from(traceIds),
    summary,
  };
}

/**
 * Generate summary statistics for a set of audit entries.
 *
 * @param entries - Sorted audit entries
 * @returns Summary statistics
 */
export function generateBundleSummary(entries: AuditEntry[]): CaseBundleSummary {
  // Count by event type
  const byEventType: Record<string, number> = {};
  for (const entry of entries) {
    byEventType[entry.event_type] = (byEventType[entry.event_type] ?? 0) + 1;
  }

  // Count by severity
  const bySeverity: Record<AuditSeverity, number> = {
    info: 0,
    warn: 0,
    error: 0,
    critical: 0,
  };
  for (const entry of entries) {
    bySeverity[entry.severity]++;
  }

  // Collect unique actors and resources
  const actors = new Set<string>();
  const resources = new Set<string>();
  for (const entry of entries) {
    actors.add(`${entry.actor.type}:${entry.actor.id}`);
    resources.add(`${entry.resource.type}:${entry.resource.id}`);
  }

  // First and last timestamps
  const firstEvent = entries.length > 0 ? entries[0].timestamp : '';
  const lastEvent = entries.length > 0 ? entries[entries.length - 1].timestamp : '';

  return {
    entry_count: entries.length,
    by_event_type: byEventType,
    by_severity: bySeverity,
    first_event: firstEvent,
    last_event: lastEvent,
    actor_count: actors.size,
    resource_count: resources.size,
  };
}

/**
 * Filter entries by dispute reference.
 *
 * @param entries - All audit entries
 * @param disputeRef - Dispute reference to filter by
 * @returns Entries related to the dispute
 */
export function filterByDispute(entries: AuditEntry[], disputeRef: string): AuditEntry[] {
  return entries.filter((entry) => entry.dispute_ref === disputeRef);
}

/**
 * Filter entries by trace ID.
 *
 * @param entries - All audit entries
 * @param traceId - Trace ID to filter by
 * @returns Entries with matching trace ID
 */
export function filterByTraceId(entries: AuditEntry[], traceId: string): AuditEntry[] {
  return entries.filter((entry) => entry.trace?.trace_id === traceId);
}

/**
 * Filter entries by time range.
 *
 * @param entries - All audit entries
 * @param start - Start of time range (ISO 8601)
 * @param end - End of time range (ISO 8601)
 * @returns Entries within the time range (inclusive)
 */
export function filterByTimeRange(entries: AuditEntry[], start: string, end: string): AuditEntry[] {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();

  return entries.filter((entry) => {
    const entryTime = new Date(entry.timestamp).getTime();
    return entryTime >= startTime && entryTime <= endTime;
  });
}

/**
 * Filter entries by resource.
 *
 * @param entries - All audit entries
 * @param resourceType - Resource type to filter by
 * @param resourceId - Resource ID (optional, filters by type only if not provided)
 * @returns Entries affecting the specified resource
 */
export function filterByResource(
  entries: AuditEntry[],
  resourceType: string,
  resourceId?: string
): AuditEntry[] {
  return entries.filter((entry) => {
    if (entry.resource.type !== resourceType) {
      return false;
    }
    if (resourceId && entry.resource.id !== resourceId) {
      return false;
    }
    return true;
  });
}

/**
 * Correlation result for trace analysis.
 */
export interface TraceCorrelation {
  /** Trace ID */
  trace_id: string;

  /** Entries in this trace */
  entries: AuditEntry[];

  /** Span IDs in this trace */
  span_ids: string[];

  /** Time span (first to last entry) in milliseconds */
  duration_ms: number;
}

/**
 * Correlate entries by trace ID.
 *
 * Groups entries by their trace ID and computes correlation metrics.
 *
 * @param entries - Audit entries with trace context
 * @returns Array of trace correlations
 */
export function correlateByTrace(entries: AuditEntry[]): TraceCorrelation[] {
  // Group by trace ID
  const byTrace = new Map<string, AuditEntry[]>();

  for (const entry of entries) {
    if (entry.trace?.trace_id) {
      const existing = byTrace.get(entry.trace.trace_id) ?? [];
      existing.push(entry);
      byTrace.set(entry.trace.trace_id, existing);
    }
  }

  // Build correlations
  const correlations: TraceCorrelation[] = [];

  for (const [traceId, traceEntries] of byTrace) {
    // Sort by timestamp
    const sorted = [...traceEntries].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Collect unique span IDs
    const spanIds = new Set<string>();
    for (const entry of sorted) {
      if (entry.trace?.span_id) {
        spanIds.add(entry.trace.span_id);
      }
    }

    // Calculate duration
    const firstTime = new Date(sorted[0].timestamp).getTime();
    const lastTime = new Date(sorted[sorted.length - 1].timestamp).getTime();

    correlations.push({
      trace_id: traceId,
      entries: sorted,
      span_ids: Array.from(spanIds),
      duration_ms: lastTime - firstTime,
    });
  }

  return correlations;
}

/**
 * Serialize a case bundle to JSON.
 *
 * @param bundle - Case bundle to serialize
 * @param pretty - Pretty print (default: false)
 * @returns JSON string
 */
export function serializeBundle(bundle: CaseBundle, pretty: boolean = false): string {
  if (pretty) {
    return JSON.stringify(bundle, null, 2);
  }
  return JSON.stringify(bundle);
}
