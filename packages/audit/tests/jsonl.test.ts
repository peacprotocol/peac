/**
 * Tests for JSONL formatting and parsing
 */

import { describe, it, expect } from 'vitest';
import {
  formatJsonlLine,
  formatJsonl,
  parseJsonlLine,
  parseJsonl,
  createJsonlAppender,
} from '../src/jsonl.js';
import { createAuditEntry } from '../src/entry.js';
import type { AuditEntry } from '../src/types.js';

describe('formatJsonlLine', () => {
  const entry = createAuditEntry({
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    event_type: 'receipt_issued',
    actor: { type: 'system', id: 'test' },
    resource: { type: 'receipt', id: 'jti:rec_abc' },
    outcome: { success: true },
    timestamp: '2026-01-06T12:00:00Z',
  });

  it('formats entry as single line JSON', () => {
    const line = formatJsonlLine(entry);
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toEqual(entry);
  });

  it('formats entry with pretty option', () => {
    const line = formatJsonlLine(entry, { pretty: true });
    expect(line).toContain('\n');
    expect(JSON.parse(line)).toEqual(entry);
  });
});

describe('formatJsonl', () => {
  const entries = [
    createAuditEntry({
      id: '01ARZ3NDEKTSV4RRFFQ69G5FA1',
      event_type: 'receipt_issued',
      actor: { type: 'system', id: 'test' },
      resource: { type: 'receipt', id: 'jti:rec_1' },
      outcome: { success: true },
      timestamp: '2026-01-06T12:00:00Z',
    }),
    createAuditEntry({
      id: '01ARZ3NDEKTSV4RRFFQ69G5FA2',
      event_type: 'receipt_verified',
      actor: { type: 'agent', id: 'agent:xyz' },
      resource: { type: 'receipt', id: 'jti:rec_1' },
      outcome: { success: true },
      timestamp: '2026-01-06T12:01:00Z',
    }),
  ];

  it('formats multiple entries with newline separator', () => {
    const jsonl = formatJsonl(entries);
    const lines = jsonl.split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toEqual(entries[0]);
    expect(JSON.parse(lines[1])).toEqual(entries[1]);
  });

  it('adds trailing newline when requested', () => {
    const jsonl = formatJsonl(entries, { trailingNewline: true });
    expect(jsonl.endsWith('\n')).toBe(true);
  });

  it('handles empty array', () => {
    const jsonl = formatJsonl([]);
    expect(jsonl).toBe('');
  });

  it('handles single entry', () => {
    const jsonl = formatJsonl([entries[0]]);
    expect(jsonl).not.toContain('\n');
    expect(JSON.parse(jsonl)).toEqual(entries[0]);
  });
});

describe('parseJsonlLine', () => {
  const validEntry: AuditEntry = {
    version: 'peac.audit/0.9',
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    event_type: 'receipt_issued',
    timestamp: '2026-01-06T12:00:00Z',
    severity: 'info',
    actor: { type: 'system', id: 'test' },
    resource: { type: 'receipt', id: 'jti:rec_abc' },
    outcome: { success: true },
  };

  it('parses valid entry', () => {
    const result = parseJsonlLine(JSON.stringify(validEntry), 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry).toEqual(validEntry);
      expect(result.lineNumber).toBe(1);
    }
  });

  it('handles whitespace', () => {
    const result = parseJsonlLine('  ' + JSON.stringify(validEntry) + '  ', 5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry).toEqual(validEntry);
      expect(result.lineNumber).toBe(5);
    }
  });

  it('rejects empty line', () => {
    const result = parseJsonlLine('', 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Empty line');
    }
  });

  it('rejects invalid JSON', () => {
    const result = parseJsonlLine('not json', 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Unexpected token');
      expect(result.raw).toBe('not json');
    }
  });

  it('rejects invalid audit entry', () => {
    const result = parseJsonlLine('{"not":"valid"}', 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Invalid audit entry structure');
    }
  });

  it('truncates long raw content in errors', () => {
    const longLine = '{"key":"' + 'x'.repeat(200) + '"}';
    const result = parseJsonlLine(longLine, 1);
    expect(result.ok).toBe(false);
    if (!result.ok && result.raw) {
      expect(result.raw.length).toBeLessThanOrEqual(103); // 100 + '...'
    }
  });
});

describe('parseJsonl', () => {
  const validEntry1: AuditEntry = {
    version: 'peac.audit/0.9',
    id: '01ARZ3NDEKTSV4RRFFQ69G5FA1',
    event_type: 'receipt_issued',
    timestamp: '2026-01-06T12:00:00Z',
    severity: 'info',
    actor: { type: 'system', id: 'test' },
    resource: { type: 'receipt', id: 'jti:rec_1' },
    outcome: { success: true },
  };

  const validEntry2: AuditEntry = {
    version: 'peac.audit/0.9',
    id: '01ARZ3NDEKTSV4RRFFQ69G5FA2',
    event_type: 'receipt_verified',
    timestamp: '2026-01-06T12:01:00Z',
    severity: 'info',
    actor: { type: 'agent', id: 'agent:xyz' },
    resource: { type: 'receipt', id: 'jti:rec_1' },
    outcome: { success: true },
  };

  it('parses multiple valid entries', () => {
    const content = [JSON.stringify(validEntry1), JSON.stringify(validEntry2)].join('\n');
    const result = parseJsonl(content);

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toEqual(validEntry1);
    expect(result.entries[1]).toEqual(validEntry2);
    expect(result.totalLines).toBe(2);
    expect(result.successCount).toBe(2);
    expect(result.errorCount).toBe(0);
  });

  it('skips empty lines', () => {
    const content = [JSON.stringify(validEntry1), '', '  ', JSON.stringify(validEntry2)].join('\n');
    const result = parseJsonl(content);

    expect(result.entries).toHaveLength(2);
    expect(result.totalLines).toBe(2);
  });

  it('stops on first error by default', () => {
    const content = [JSON.stringify(validEntry1), 'invalid', JSON.stringify(validEntry2)].join(
      '\n'
    );
    const result = parseJsonl(content);

    expect(result.entries).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errorCount).toBe(1);
  });

  it('skips invalid lines when skipInvalid=true', () => {
    const content = [JSON.stringify(validEntry1), 'invalid', JSON.stringify(validEntry2)].join(
      '\n'
    );
    const result = parseJsonl(content, { skipInvalid: true });

    expect(result.entries).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.successCount).toBe(2);
    expect(result.errorCount).toBe(1);
  });

  it('respects maxLines option', () => {
    const content = [
      JSON.stringify(validEntry1),
      JSON.stringify(validEntry2),
      JSON.stringify(validEntry1),
    ].join('\n');
    const result = parseJsonl(content, { maxLines: 2 });

    expect(result.entries).toHaveLength(2);
    expect(result.totalLines).toBe(2);
  });

  it('handles empty content', () => {
    const result = parseJsonl('');
    expect(result.entries).toHaveLength(0);
    expect(result.totalLines).toBe(0);
  });

  it('handles only empty lines', () => {
    const result = parseJsonl('\n\n\n');
    expect(result.entries).toHaveLength(0);
    expect(result.totalLines).toBe(0);
  });
});

describe('createJsonlAppender', () => {
  it('creates function that formats entries with trailing newline', () => {
    const appender = createJsonlAppender();
    const entry = createAuditEntry({
      event_type: 'receipt_issued',
      actor: { type: 'system', id: 'test' },
      resource: { type: 'receipt', id: 'test' },
      outcome: { success: true },
    });

    const line = appender(entry);
    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line.trim())).toEqual(entry);
  });

  it('produces valid JSONL when concatenated', () => {
    const appender = createJsonlAppender();
    const entries = [
      createAuditEntry({
        event_type: 'receipt_issued',
        actor: { type: 'system', id: 'test' },
        resource: { type: 'receipt', id: 'test1' },
        outcome: { success: true },
      }),
      createAuditEntry({
        event_type: 'receipt_verified',
        actor: { type: 'agent', id: 'agent' },
        resource: { type: 'receipt', id: 'test1' },
        outcome: { success: true },
      }),
    ];

    let buffer = '';
    for (const entry of entries) {
      buffer += appender(entry);
    }

    // Parse the concatenated result
    const result = parseJsonl(buffer);
    expect(result.successCount).toBe(2);
  });
});
