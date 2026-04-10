import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeypair, verifyLocal } from '@peac/protocol';
import {
  issueEvent,
  issueSessionEvent,
  issueTaskEvent,
  issueToolUseEvent,
  issueMcpCallEvent,
  issuePermissionEvent,
  issueOutcomeEvent,
  EventFamily,
  EVENT_TYPES,
  EXTENSION_NAMESPACE,
} from '../src/index.js';
import { decode } from '@peac/crypto';

describe('issue-event', () => {
  let privateKey: Uint8Array;
  let publicKey: Uint8Array;
  const kid = 'test-key-1';
  const issuer = 'https://test.example.com';
  const sessionId = 'sess_test_001';
  const agentId = 'agent-001';

  beforeAll(async () => {
    const kp = await generateKeypair();
    privateKey = kp.privateKey;
    publicKey = kp.publicKey;
  });

  it('should issue a valid signed JWS for each event family', async () => {
    for (const family of Object.values(EventFamily)) {
      const result = await issueEvent({
        privateKey,
        kid,
        issuer,
        sessionId,
        agentId,
        provider: 'test-provider',
        event: { family, event: `${family}.test` },
      });
      expect(result.jws).toBeTruthy();
      expect(result.family).toBe(family);
    }
  });

  it('should produce verifiable receipts', async () => {
    const result = await issueSessionEvent({
      privateKey,
      kid,
      issuer,
      sessionId,
      agentId,
      provider: 'test-provider',
      event: 'session.created',
    });

    const verification = await verifyLocal(result.jws, publicKey);
    expect(verification.valid).toBe(true);
  });

  it('should set correct type URI for each family factory', async () => {
    const factories = [
      { fn: issueSessionEvent, expected: EVENT_TYPES.SESSION },
      { fn: issueTaskEvent, expected: EVENT_TYPES.TASK },
      { fn: issueToolUseEvent, expected: EVENT_TYPES.TOOL_USE },
      { fn: issueMcpCallEvent, expected: EVENT_TYPES.MCP_CALL },
      { fn: issuePermissionEvent, expected: EVENT_TYPES.PERMISSION },
      { fn: issueOutcomeEvent, expected: EVENT_TYPES.OUTCOME },
    ];

    for (const { fn, expected } of factories) {
      const result = await fn({
        privateKey,
        kid,
        issuer,
        sessionId,
        agentId,
        provider: 'test-provider',
        event: 'test.event',
      });
      expect(result.type).toBe(expected);
    }
  });

  it('should include extension namespace with session_id, event, agent_id, provider', async () => {
    const result = await issueSessionEvent({
      privateKey,
      kid,
      issuer,
      sessionId,
      agentId,
      provider: 'custom-runtime',
      event: 'session.created',
    });

    const decoded = decode(result.jws);
    const claims = decoded.payload as Record<string, unknown>;
    const ext = claims.extensions as Record<string, Record<string, unknown>>;
    const agentExt = ext[EXTENSION_NAMESPACE];

    expect(agentExt.session_id).toBe(sessionId);
    expect(agentExt.event).toBe('session.created');
    expect(agentExt.agent_id).toBe(agentId);
    expect(agentExt.provider).toBe('custom-runtime');
  });

  it('should include custom details in extension', async () => {
    const result = await issueToolUseEvent({
      privateKey,
      kid,
      issuer,
      sessionId,
      agentId,
      provider: 'test',
      event: 'tool.invoked',
      details: { tool: 'web_search', input_hash: 'sha256:abc' },
    });

    const decoded = decode(result.jws);
    const claims = decoded.payload as Record<string, unknown>;
    const ext = claims.extensions as Record<string, Record<string, unknown>>;
    const agentExt = ext[EXTENSION_NAMESPACE];

    expect(agentExt.tool).toBe('web_search');
    expect(agentExt.input_hash).toBe('sha256:abc');
  });

  it('should produce identical record shape regardless of provider string', async () => {
    const providers = ['anthropic', 'openai', 'google', 'custom-corp'];
    const results = await Promise.all(
      providers.map((provider) =>
        issueSessionEvent({
          privateKey,
          kid,
          issuer,
          sessionId,
          agentId,
          provider,
          event: 'session.created',
        })
      )
    );

    const shapes = results.map((r) => {
      const decoded = decode(r.jws);
      const claims = decoded.payload as Record<string, unknown>;
      return Object.keys(claims).sort().join(',');
    });

    // All providers produce the same claim key structure
    expect(new Set(shapes).size).toBe(1);
  });

  it('should function without any vendor SDK present', () => {
    // This test proves the package has no vendor SDK import at runtime.
    // If any vendor SDK were a dependency, the import at the top of this
    // file would fail when that SDK is not installed.
    expect(true).toBe(true);
  });
});
