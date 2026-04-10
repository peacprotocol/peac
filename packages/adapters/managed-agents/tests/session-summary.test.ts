import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeypair } from '@peac/protocol';
import {
  buildSessionSummary,
  issueSessionEvent,
  issueTaskEvent,
  issueToolUseEvent,
  issueMcpCallEvent,
  issuePermissionEvent,
  issueOutcomeEvent,
  EventFamily,
} from '../src/index.js';

describe('session-summary', () => {
  let privateKey: Uint8Array;
  const kid = 'test-key-1';
  const issuer = 'https://summary-test.example.com';
  const sessionId = 'sess_summary_001';
  const agentId = 'agent-001';

  beforeAll(async () => {
    const kp = await generateKeypair();
    privateKey = kp.privateKey;
  });

  it('should return empty summary for zero receipts', () => {
    const summary = buildSessionSummary([]);
    expect(summary.sessionId).toBe('');
    expect(summary.receipts).toBe(0);
    expect(summary.families).toEqual([]);
    expect(summary.issuer).toBe('');
  });

  it('should summarize a single receipt', async () => {
    const result = await issueSessionEvent({
      privateKey,
      kid,
      issuer,
      sessionId,
      agentId,
      provider: 'test',
      event: 'session.created',
    });

    const summary = buildSessionSummary([result.jws]);
    expect(summary.sessionId).toBe(sessionId);
    expect(summary.receipts).toBe(1);
    expect(summary.families).toContain(EventFamily.Session);
    expect(summary.issuer).toBe(issuer);
  });

  it('should aggregate all 6 event families', async () => {
    const opts = { privateKey, kid, issuer, sessionId, agentId, provider: 'test' };

    const receipts = await Promise.all([
      issueSessionEvent({ ...opts, event: 'session.created' }),
      issueTaskEvent({ ...opts, event: 'task.submitted' }),
      issueToolUseEvent({ ...opts, event: 'tool.invoked' }),
      issueMcpCallEvent({ ...opts, event: 'mcp.tool_call' }),
      issuePermissionEvent({ ...opts, event: 'permission.confirmed' }),
      issueOutcomeEvent({ ...opts, event: 'outcome.evaluated' }),
    ]);

    const summary = buildSessionSummary(receipts.map((r) => r.jws));
    expect(summary.sessionId).toBe(sessionId);
    expect(summary.receipts).toBe(6);
    expect(summary.families).toHaveLength(6);
    expect(summary.families).toContain(EventFamily.Session);
    expect(summary.families).toContain(EventFamily.Task);
    expect(summary.families).toContain(EventFamily.ToolUse);
    expect(summary.families).toContain(EventFamily.McpCall);
    expect(summary.families).toContain(EventFamily.Permission);
    expect(summary.families).toContain(EventFamily.Outcome);
    expect(summary.issuer).toBe(issuer);
  });

  it('should deduplicate families from multiple events of same type', async () => {
    const opts = { privateKey, kid, issuer, sessionId, agentId, provider: 'test' };

    const receipts = await Promise.all([
      issueSessionEvent({ ...opts, event: 'session.created' }),
      issueSessionEvent({ ...opts, event: 'session.resumed' }),
      issueSessionEvent({ ...opts, event: 'session.completed' }),
    ]);

    const summary = buildSessionSummary(receipts.map((r) => r.jws));
    expect(summary.receipts).toBe(3);
    expect(summary.families).toHaveLength(1);
    expect(summary.families).toContain(EventFamily.Session);
  });
});
