/**
 * Tests for audit entry creation and validation
 */

import { describe, it, expect } from 'vitest';
import {
  createAuditEntry,
  validateAuditEntry,
  isValidAuditEntry,
  isValidUlid,
  isValidTraceContext,
  generateAuditId,
  AUDIT_VERSION,
  AUDIT_EVENT_TYPES,
  AUDIT_SEVERITIES,
} from '../src/entry.js';
import type { AuditEntry, TraceContext } from '../src/types.js';

describe('generateAuditId', () => {
  it('generates valid ULID format', () => {
    const id = generateAuditId();
    expect(id).toHaveLength(26);
    expect(isValidUlid(id)).toBe(true);
  });

  it('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateAuditId());
    }
    expect(ids.size).toBe(100);
  });

  it('generates IDs with timestamp prefix', () => {
    // ULIDs have a timestamp prefix (first 10 chars) that encodes time
    // Two IDs generated within the same millisecond may have same prefix
    const id = generateAuditId();
    const timestampPart = id.substring(0, 10);
    const randomPart = id.substring(10);

    // Both parts should be valid Crockford Base32
    expect(timestampPart).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
    expect(randomPart).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
    expect(timestampPart.length).toBe(10);
    expect(randomPart.length).toBe(16);
  });
});

describe('isValidUlid', () => {
  it('accepts valid ULIDs', () => {
    expect(isValidUlid('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
    expect(isValidUlid('00000000000000000000000000')).toBe(true);
    expect(isValidUlid('7ZZZZZZZZZZZZZZZZZZZZZZZZZ')).toBe(true);
  });

  it('rejects invalid ULIDs', () => {
    expect(isValidUlid('01arz3ndektsv4rrffq69g5fav')).toBe(false); // lowercase
    expect(isValidUlid('01ARZ3NDEKTSV4RRFFQ69G5FA')).toBe(false); // too short
    expect(isValidUlid('01ARZ3NDEKTSV4RRFFQ69G5FAVX')).toBe(false); // too long
    expect(isValidUlid('01ARZ3NDEKTSV4RRFFQ69G5FAI')).toBe(false); // invalid char I
    expect(isValidUlid('01ARZ3NDEKTSV4RRFFQ69G5FAL')).toBe(false); // invalid char L
    expect(isValidUlid('01ARZ3NDEKTSV4RRFFQ69G5FAO')).toBe(false); // invalid char O
    expect(isValidUlid('01ARZ3NDEKTSV4RRFFQ69G5FAU')).toBe(false); // invalid char U
    expect(isValidUlid('')).toBe(false);
  });
});

describe('isValidTraceContext', () => {
  it('accepts valid trace contexts', () => {
    const valid: TraceContext = {
      trace_id: 'abc123def456789012345678901234ab',
      span_id: '1234567890123456',
    };
    expect(isValidTraceContext(valid)).toBe(true);
  });

  it('accepts trace context with optional fields', () => {
    const valid: TraceContext = {
      trace_id: 'abc123def456789012345678901234ab',
      span_id: '1234567890123456',
      parent_span_id: 'abcdef1234567890',
      trace_flags: '01',
    };
    expect(isValidTraceContext(valid)).toBe(true);
  });

  it('rejects invalid trace ID', () => {
    expect(
      isValidTraceContext({
        trace_id: 'tooshort',
        span_id: '1234567890123456',
      })
    ).toBe(false);
  });

  it('rejects invalid span ID', () => {
    expect(
      isValidTraceContext({
        trace_id: 'abc123def456789012345678901234ab',
        span_id: 'tooshort',
      })
    ).toBe(false);
  });

  it('rejects invalid parent span ID', () => {
    expect(
      isValidTraceContext({
        trace_id: 'abc123def456789012345678901234ab',
        span_id: '1234567890123456',
        parent_span_id: 'invalid',
      })
    ).toBe(false);
  });

  it('rejects invalid trace flags', () => {
    expect(
      isValidTraceContext({
        trace_id: 'abc123def456789012345678901234ab',
        span_id: '1234567890123456',
        trace_flags: 'xyz',
      })
    ).toBe(false);
  });
});

describe('createAuditEntry', () => {
  it('creates entry with required fields', () => {
    const entry = createAuditEntry({
      event_type: 'receipt_issued',
      actor: { type: 'system', id: 'peac-issuer' },
      resource: { type: 'receipt', id: 'jti:rec_abc123' },
      outcome: { success: true },
    });

    expect(entry.version).toBe(AUDIT_VERSION);
    expect(entry.id).toHaveLength(26);
    expect(entry.event_type).toBe('receipt_issued');
    expect(entry.severity).toBe('info'); // default
    expect(entry.actor).toEqual({ type: 'system', id: 'peac-issuer' });
    expect(entry.resource).toEqual({ type: 'receipt', id: 'jti:rec_abc123' });
    expect(entry.outcome).toEqual({ success: true });
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('creates entry with all optional fields', () => {
    const entry = createAuditEntry({
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      event_type: 'dispute_filed',
      severity: 'warn',
      timestamp: '2026-01-06T12:00:00Z',
      actor: { type: 'user', id: 'user:abc123', name: 'Test User' },
      resource: { type: 'dispute', id: '01ARZ3NDEKTSV4RRFFQ69G5FBW', uri: 'https://example.com' },
      outcome: { success: true, result: 'filed', message: 'Dispute created' },
      trace: {
        trace_id: 'abc123def456789012345678901234ab',
        span_id: '1234567890123456',
      },
      context: { custom: 'value' },
      dispute_ref: '01ARZ3NDEKTSV4RRFFQ69G5FBW',
    });

    expect(entry.id).toBe('01ARZ3NDEKTSV4RRFFQ69G5FAV');
    expect(entry.severity).toBe('warn');
    expect(entry.timestamp).toBe('2026-01-06T12:00:00Z');
    expect(entry.actor.name).toBe('Test User');
    expect(entry.resource.uri).toBe('https://example.com');
    expect(entry.outcome.result).toBe('filed');
    expect(entry.trace?.trace_id).toBe('abc123def456789012345678901234ab');
    expect(entry.context).toEqual({ custom: 'value' });
    expect(entry.dispute_ref).toBe('01ARZ3NDEKTSV4RRFFQ69G5FBW');
  });

  it('supports all event types', () => {
    for (const eventType of AUDIT_EVENT_TYPES) {
      const entry = createAuditEntry({
        event_type: eventType,
        actor: { type: 'system', id: 'test' },
        resource: { type: 'receipt', id: 'test' },
        outcome: { success: true },
      });
      expect(entry.event_type).toBe(eventType);
    }
  });

  it('supports all severity levels', () => {
    for (const severity of AUDIT_SEVERITIES) {
      const entry = createAuditEntry({
        event_type: 'receipt_issued',
        severity,
        actor: { type: 'system', id: 'test' },
        resource: { type: 'receipt', id: 'test' },
        outcome: { success: true },
      });
      expect(entry.severity).toBe(severity);
    }
  });
});

describe('validateAuditEntry', () => {
  const validEntry: AuditEntry = {
    version: 'peac.audit/0.9',
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    event_type: 'receipt_issued',
    timestamp: '2026-01-06T12:00:00Z',
    severity: 'info',
    actor: { type: 'system', id: 'peac-issuer' },
    resource: { type: 'receipt', id: 'jti:rec_abc123' },
    outcome: { success: true },
  };

  it('validates correct entry', () => {
    const result = validateAuditEntry(validEntry);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects non-object', () => {
    expect(validateAuditEntry(null).valid).toBe(false);
    expect(validateAuditEntry('string').valid).toBe(false);
    expect(validateAuditEntry(123).valid).toBe(false);
  });

  it('rejects invalid version', () => {
    const result = validateAuditEntry({ ...validEntry, version: 'wrong' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid version: expected "peac.audit/0.9", got "wrong"');
  });

  it('rejects invalid ID', () => {
    const result = validateAuditEntry({ ...validEntry, id: 'invalid' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Invalid or missing id'))).toBe(true);
  });

  it('rejects invalid event type', () => {
    const result = validateAuditEntry({ ...validEntry, event_type: 'unknown' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Invalid event_type'))).toBe(true);
  });

  it('rejects invalid timestamp', () => {
    const result = validateAuditEntry({ ...validEntry, timestamp: 'not-a-date' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Invalid or missing timestamp'))).toBe(true);
  });

  it('rejects invalid severity', () => {
    const result = validateAuditEntry({ ...validEntry, severity: 'unknown' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Invalid severity'))).toBe(true);
  });

  it('rejects invalid actor', () => {
    const result = validateAuditEntry({ ...validEntry, actor: { type: 'invalid', id: 'x' } });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Invalid actor.type'))).toBe(true);
  });

  it('rejects actor without id', () => {
    const result = validateAuditEntry({ ...validEntry, actor: { type: 'user', id: '' } });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Actor must have non-empty id'))).toBe(true);
  });

  it('rejects invalid resource type', () => {
    const result = validateAuditEntry({
      ...validEntry,
      resource: { type: 'invalid', id: 'x' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Invalid resource.type'))).toBe(true);
  });

  it('rejects outcome without success field', () => {
    const result = validateAuditEntry({
      ...validEntry,
      outcome: { result: 'ok' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Outcome must have boolean success'))).toBe(true);
  });

  it('rejects invalid trace context', () => {
    const result = validateAuditEntry({
      ...validEntry,
      trace: { trace_id: 'short', span_id: 'short' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Invalid trace context'))).toBe(true);
  });

  it('rejects invalid dispute_ref', () => {
    const result = validateAuditEntry({
      ...validEntry,
      dispute_ref: 'not-a-ulid',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Invalid dispute_ref'))).toBe(true);
  });
});

describe('isValidAuditEntry', () => {
  it('returns true for valid entries', () => {
    const entry = createAuditEntry({
      event_type: 'receipt_issued',
      actor: { type: 'system', id: 'test' },
      resource: { type: 'receipt', id: 'test' },
      outcome: { success: true },
    });
    expect(isValidAuditEntry(entry)).toBe(true);
  });

  it('returns false for invalid entries', () => {
    expect(isValidAuditEntry({})).toBe(false);
    expect(isValidAuditEntry(null)).toBe(false);
  });
});
