/**
 * Tests for case bundle generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCaseBundle,
  generateBundleSummary,
  filterByDispute,
  filterByTraceId,
  filterByTimeRange,
  filterByResource,
  correlateByTrace,
  serializeBundle,
  BUNDLE_VERSION,
} from '../src/bundle.js';
import { createAuditEntry } from '../src/entry.js';
import type { AuditEntry } from '../src/types.js';

describe('createCaseBundle', () => {
  const disputeRef = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

  const entries: AuditEntry[] = [
    createAuditEntry({
      id: '01ARZ3NDEKTSV4RRFFQ69G5FA1',
      event_type: 'dispute_filed',
      timestamp: '2026-01-06T12:00:00Z',
      actor: { type: 'user', id: 'user:abc' },
      resource: { type: 'dispute', id: disputeRef },
      outcome: { success: true },
      dispute_ref: disputeRef,
      trace: {
        trace_id: 'abc123def456789012345678901234ab',
        span_id: '1111111111111111',
      },
    }),
    createAuditEntry({
      id: '01ARZ3NDEKTSV4RRFFQ69G5FA2',
      event_type: 'dispute_acknowledged',
      timestamp: '2026-01-06T14:00:00Z',
      actor: { type: 'system', id: 'platform' },
      resource: { type: 'dispute', id: disputeRef },
      outcome: { success: true },
      dispute_ref: disputeRef,
      trace: {
        trace_id: 'def456abc789012345678901234abcde',
        span_id: '2222222222222222',
      },
    }),
  ];

  it('creates bundle with correct structure', () => {
    const bundle = createCaseBundle({
      dispute_ref: disputeRef,
      generated_by: 'https://platform.example.com',
      entries,
    });

    expect(bundle.version).toBe(BUNDLE_VERSION);
    expect(bundle.dispute_ref).toBe(disputeRef);
    expect(bundle.generated_by).toBe('https://platform.example.com');
    expect(bundle.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(bundle.entries).toHaveLength(2);
    expect(bundle.trace_ids).toHaveLength(2);
  });

  it('sorts entries chronologically', () => {
    const unorderedEntries = [entries[1], entries[0]]; // Reversed
    const bundle = createCaseBundle({
      dispute_ref: disputeRef,
      generated_by: 'test',
      entries: unorderedEntries,
    });

    expect(bundle.entries[0].id).toBe('01ARZ3NDEKTSV4RRFFQ69G5FA1');
    expect(bundle.entries[1].id).toBe('01ARZ3NDEKTSV4RRFFQ69G5FA2');
  });

  it('collects unique trace IDs', () => {
    const bundle = createCaseBundle({
      dispute_ref: disputeRef,
      generated_by: 'test',
      entries,
    });

    expect(bundle.trace_ids).toContain('abc123def456789012345678901234ab');
    expect(bundle.trace_ids).toContain('def456abc789012345678901234abcde');
  });

  it('handles entries without trace context', () => {
    const entryNoTrace = createAuditEntry({
      event_type: 'dispute_filed',
      actor: { type: 'user', id: 'user:abc' },
      resource: { type: 'dispute', id: disputeRef },
      outcome: { success: true },
    });

    const bundle = createCaseBundle({
      dispute_ref: disputeRef,
      generated_by: 'test',
      entries: [entryNoTrace],
    });

    expect(bundle.trace_ids).toHaveLength(0);
  });

  it('includes summary statistics', () => {
    const bundle = createCaseBundle({
      dispute_ref: disputeRef,
      generated_by: 'test',
      entries,
    });

    expect(bundle.summary.entry_count).toBe(2);
    expect(bundle.summary.first_event).toBe('2026-01-06T12:00:00Z');
    expect(bundle.summary.last_event).toBe('2026-01-06T14:00:00Z');
  });
});

describe('generateBundleSummary', () => {
  const entries: AuditEntry[] = [
    createAuditEntry({
      event_type: 'receipt_issued',
      severity: 'info',
      timestamp: '2026-01-06T12:00:00Z',
      actor: { type: 'system', id: 'issuer' },
      resource: { type: 'receipt', id: 'rec_1' },
      outcome: { success: true },
    }),
    createAuditEntry({
      event_type: 'receipt_verified',
      severity: 'info',
      timestamp: '2026-01-06T13:00:00Z',
      actor: { type: 'agent', id: 'agent:xyz' },
      resource: { type: 'receipt', id: 'rec_1' },
      outcome: { success: true },
    }),
    createAuditEntry({
      event_type: 'access_decision',
      severity: 'warn',
      timestamp: '2026-01-06T14:00:00Z',
      actor: { type: 'system', id: 'gateway' },
      resource: { type: 'policy', id: 'policy_1' },
      outcome: { success: false, error_code: 'E_ACCESS_DENIED' },
    }),
  ];

  it('counts entries correctly', () => {
    const summary = generateBundleSummary(entries);
    expect(summary.entry_count).toBe(3);
  });

  it('counts by event type', () => {
    const summary = generateBundleSummary(entries);
    expect(summary.by_event_type['receipt_issued']).toBe(1);
    expect(summary.by_event_type['receipt_verified']).toBe(1);
    expect(summary.by_event_type['access_decision']).toBe(1);
  });

  it('counts by severity', () => {
    const summary = generateBundleSummary(entries);
    expect(summary.by_severity.info).toBe(2);
    expect(summary.by_severity.warn).toBe(1);
    expect(summary.by_severity.error).toBe(0);
    expect(summary.by_severity.critical).toBe(0);
  });

  it('tracks first and last events', () => {
    const summary = generateBundleSummary(entries);
    expect(summary.first_event).toBe('2026-01-06T12:00:00Z');
    expect(summary.last_event).toBe('2026-01-06T14:00:00Z');
  });

  it('counts unique actors', () => {
    const summary = generateBundleSummary(entries);
    expect(summary.actor_count).toBe(3); // system:issuer, agent:agent:xyz, system:gateway
  });

  it('counts unique resources', () => {
    const summary = generateBundleSummary(entries);
    expect(summary.resource_count).toBe(2); // receipt:rec_1, policy:policy_1
  });

  it('handles empty array', () => {
    const summary = generateBundleSummary([]);
    expect(summary.entry_count).toBe(0);
    expect(summary.first_event).toBe('');
    expect(summary.last_event).toBe('');
  });
});

describe('filterByDispute', () => {
  const entries: AuditEntry[] = [
    createAuditEntry({
      event_type: 'dispute_filed',
      actor: { type: 'user', id: 'user:abc' },
      resource: { type: 'dispute', id: 'dispute_1' },
      outcome: { success: true },
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    }),
    createAuditEntry({
      event_type: 'receipt_issued',
      actor: { type: 'system', id: 'issuer' },
      resource: { type: 'receipt', id: 'rec_1' },
      outcome: { success: true },
    }),
    createAuditEntry({
      event_type: 'dispute_resolved',
      actor: { type: 'system', id: 'platform' },
      resource: { type: 'dispute', id: 'dispute_1' },
      outcome: { success: true },
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    }),
  ];

  it('filters entries by dispute ref', () => {
    const filtered = filterByDispute(entries, '01ARZ3NDEKTSV4RRFFQ69G5FAV');
    expect(filtered).toHaveLength(2);
    expect(filtered.every((e) => e.dispute_ref === '01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
  });

  it('returns empty array for non-existent dispute', () => {
    const filtered = filterByDispute(entries, '01ARZ3NDEKTSV4RRFFQ69G5FXX');
    expect(filtered).toHaveLength(0);
  });
});

describe('filterByTraceId', () => {
  const traceId = 'abc123def456789012345678901234ab';
  const entries: AuditEntry[] = [
    createAuditEntry({
      event_type: 'receipt_issued',
      actor: { type: 'system', id: 'test' },
      resource: { type: 'receipt', id: 'rec_1' },
      outcome: { success: true },
      trace: { trace_id: traceId, span_id: '1111111111111111' },
    }),
    createAuditEntry({
      event_type: 'receipt_verified',
      actor: { type: 'agent', id: 'agent' },
      resource: { type: 'receipt', id: 'rec_1' },
      outcome: { success: true },
      trace: { trace_id: 'other00000000000000000000000000', span_id: '2222222222222222' },
    }),
  ];

  it('filters entries by trace ID', () => {
    const filtered = filterByTraceId(entries, traceId);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].trace?.trace_id).toBe(traceId);
  });
});

describe('filterByTimeRange', () => {
  const entries: AuditEntry[] = [
    createAuditEntry({
      event_type: 'receipt_issued',
      timestamp: '2026-01-06T10:00:00Z',
      actor: { type: 'system', id: 'test' },
      resource: { type: 'receipt', id: 'rec_1' },
      outcome: { success: true },
    }),
    createAuditEntry({
      event_type: 'receipt_issued',
      timestamp: '2026-01-06T12:00:00Z',
      actor: { type: 'system', id: 'test' },
      resource: { type: 'receipt', id: 'rec_2' },
      outcome: { success: true },
    }),
    createAuditEntry({
      event_type: 'receipt_issued',
      timestamp: '2026-01-06T14:00:00Z',
      actor: { type: 'system', id: 'test' },
      resource: { type: 'receipt', id: 'rec_3' },
      outcome: { success: true },
    }),
  ];

  it('filters entries within time range', () => {
    const filtered = filterByTimeRange(entries, '2026-01-06T11:00:00Z', '2026-01-06T13:00:00Z');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].resource.id).toBe('rec_2');
  });

  it('includes boundary timestamps', () => {
    const filtered = filterByTimeRange(entries, '2026-01-06T10:00:00Z', '2026-01-06T14:00:00Z');
    expect(filtered).toHaveLength(3);
  });
});

describe('filterByResource', () => {
  const entries: AuditEntry[] = [
    createAuditEntry({
      event_type: 'receipt_issued',
      actor: { type: 'system', id: 'test' },
      resource: { type: 'receipt', id: 'rec_1' },
      outcome: { success: true },
    }),
    createAuditEntry({
      event_type: 'receipt_verified',
      actor: { type: 'agent', id: 'agent' },
      resource: { type: 'receipt', id: 'rec_1' },
      outcome: { success: true },
    }),
    createAuditEntry({
      event_type: 'policy_evaluated',
      actor: { type: 'system', id: 'gateway' },
      resource: { type: 'policy', id: 'policy_1' },
      outcome: { success: true },
    }),
  ];

  it('filters by resource type only', () => {
    const filtered = filterByResource(entries, 'receipt');
    expect(filtered).toHaveLength(2);
  });

  it('filters by resource type and ID', () => {
    const filtered = filterByResource(entries, 'receipt', 'rec_1');
    expect(filtered).toHaveLength(2);
  });

  it('returns empty for non-matching type', () => {
    const filtered = filterByResource(entries, 'dispute');
    expect(filtered).toHaveLength(0);
  });
});

describe('correlateByTrace', () => {
  const traceId1 = 'abc123def456789012345678901234ab';
  const traceId2 = 'def456abc789012345678901234abcde';

  const entries: AuditEntry[] = [
    createAuditEntry({
      event_type: 'receipt_issued',
      timestamp: '2026-01-06T12:00:00Z',
      actor: { type: 'system', id: 'test' },
      resource: { type: 'receipt', id: 'rec_1' },
      outcome: { success: true },
      trace: { trace_id: traceId1, span_id: '1111111111111111' },
    }),
    createAuditEntry({
      event_type: 'receipt_verified',
      timestamp: '2026-01-06T12:00:10Z',
      actor: { type: 'agent', id: 'agent' },
      resource: { type: 'receipt', id: 'rec_1' },
      outcome: { success: true },
      trace: { trace_id: traceId1, span_id: '2222222222222222' },
    }),
    createAuditEntry({
      event_type: 'policy_evaluated',
      timestamp: '2026-01-06T13:00:00Z',
      actor: { type: 'system', id: 'gateway' },
      resource: { type: 'policy', id: 'policy_1' },
      outcome: { success: true },
      trace: { trace_id: traceId2, span_id: '3333333333333333' },
    }),
  ];

  it('groups entries by trace ID', () => {
    const correlations = correlateByTrace(entries);
    expect(correlations).toHaveLength(2);
  });

  it('calculates correlation metrics', () => {
    const correlations = correlateByTrace(entries);
    const trace1 = correlations.find((c) => c.trace_id === traceId1);

    expect(trace1).toBeDefined();
    expect(trace1!.entries).toHaveLength(2);
    expect(trace1!.span_ids).toHaveLength(2);
    expect(trace1!.duration_ms).toBe(10000); // 10 seconds
  });

  it('sorts entries within each trace', () => {
    const correlations = correlateByTrace(entries);
    const trace1 = correlations.find((c) => c.trace_id === traceId1);

    expect(trace1!.entries[0].event_type).toBe('receipt_issued');
    expect(trace1!.entries[1].event_type).toBe('receipt_verified');
  });

  it('ignores entries without trace context', () => {
    const entryNoTrace = createAuditEntry({
      event_type: 'receipt_issued',
      actor: { type: 'system', id: 'test' },
      resource: { type: 'receipt', id: 'rec_x' },
      outcome: { success: true },
    });

    const correlations = correlateByTrace([...entries, entryNoTrace]);
    expect(correlations).toHaveLength(2); // Still only 2 traces
  });
});

describe('serializeBundle', () => {
  let bundle: ReturnType<typeof createCaseBundle>;

  beforeEach(() => {
    bundle = createCaseBundle({
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      generated_by: 'test',
      entries: [
        createAuditEntry({
          event_type: 'dispute_filed',
          actor: { type: 'user', id: 'user:abc' },
          resource: { type: 'dispute', id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
          outcome: { success: true },
        }),
      ],
    });
  });

  it('serializes to compact JSON by default', () => {
    const json = serializeBundle(bundle);
    expect(json).not.toContain('\n');
    expect(JSON.parse(json)).toEqual(bundle);
  });

  it('serializes to pretty JSON when requested', () => {
    const json = serializeBundle(bundle, true);
    expect(json).toContain('\n');
    expect(JSON.parse(json)).toEqual(bundle);
  });
});
