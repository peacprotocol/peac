/**
 * Session manager unit tests
 */

import { describe, it, expect, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SessionManager } from '../../src/session-manager.js';

function makeServerFactory(): () => McpServer {
  return () => new McpServer({ name: 'test-server', version: '0.0.1' });
}

describe('SessionManager', () => {
  let manager: SessionManager;

  afterEach(async () => {
    if (manager) {
      await manager.cleanup();
    }
  });

  it('should create a session with unique ID', async () => {
    manager = new SessionManager();
    const entry = await manager.createSession(makeServerFactory());
    expect(entry.sessionId).toBeTruthy();
    expect(typeof entry.sessionId).toBe('string');
    expect(entry.server).toBeInstanceOf(McpServer);
    expect(entry.transport).toBeTruthy();
    expect(manager.size).toBe(1);
  });

  it('should create multiple isolated sessions', async () => {
    manager = new SessionManager();
    const e1 = await manager.createSession(makeServerFactory());
    const e2 = await manager.createSession(makeServerFactory());
    expect(e1.sessionId).not.toBe(e2.sessionId);
    expect(e1.server).not.toBe(e2.server);
    expect(e1.transport).not.toBe(e2.transport);
    expect(manager.size).toBe(2);
  });

  it('should look up session by ID', async () => {
    manager = new SessionManager();
    const entry = await manager.createSession(makeServerFactory());
    const found = manager.getSession(entry.sessionId);
    expect(found).toBe(entry);
  });

  it('should return undefined for unknown session ID', () => {
    manager = new SessionManager();
    expect(manager.getSession('nonexistent')).toBeUndefined();
  });

  it('should terminate a session', async () => {
    manager = new SessionManager();
    const entry = await manager.createSession(makeServerFactory());
    const terminated = await manager.terminateSession(entry.sessionId);
    expect(terminated).toBe(true);
    expect(manager.size).toBe(0);
    expect(manager.getSession(entry.sessionId)).toBeUndefined();
  });

  it('should return false when terminating unknown session', async () => {
    manager = new SessionManager();
    const terminated = await manager.terminateSession('nonexistent');
    expect(terminated).toBe(false);
  });

  it('should enforce max session limit', async () => {
    manager = new SessionManager({ maxSessions: 2 });
    await manager.createSession(makeServerFactory());
    await manager.createSession(makeServerFactory());
    await expect(manager.createSession(makeServerFactory())).rejects.toThrow(
      /Session limit reached/
    );
    expect(manager.size).toBe(2);
  });

  it('should evict stale sessions on TTL expiry', async () => {
    manager = new SessionManager({ ttlMs: 1 }); // 1ms TTL
    await manager.createSession(makeServerFactory());
    expect(manager.size).toBe(1);

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 10));

    // Creating a new session triggers eviction
    await manager.createSession(makeServerFactory());
    expect(manager.size).toBe(1); // stale one evicted, new one created
  });

  it('should update lastSeen on getSession', async () => {
    manager = new SessionManager({ ttlMs: 50 });
    const entry = await manager.createSession(makeServerFactory());
    const initialLastSeen = entry.lastSeen;

    await new Promise((r) => setTimeout(r, 10));
    manager.getSession(entry.sessionId);
    expect(entry.lastSeen).toBeGreaterThan(initialLastSeen);
  });

  // CVE-2026-25536 regression: verify no shared state between sessions.
  // The vulnerability occurs when a single McpServer/transport is reused
  // across multiple clients, allowing one client's response to leak to another.
  it('should guarantee per-session isolation (CVE-2026-25536 regression)', async () => {
    manager = new SessionManager();
    const factory = makeServerFactory();

    const sessions = await Promise.all([
      manager.createSession(factory),
      manager.createSession(factory),
      manager.createSession(factory),
    ]);

    // Each session must have a unique server instance
    const servers = new Set(sessions.map((s) => s.server));
    expect(servers.size).toBe(3);

    // Each session must have a unique transport instance
    const transports = new Set(sessions.map((s) => s.transport));
    expect(transports.size).toBe(3);

    // Each session must have a unique ID
    const ids = new Set(sessions.map((s) => s.sessionId));
    expect(ids.size).toBe(3);

    // Terminating one session must not affect others
    await manager.terminateSession(sessions[0].sessionId);
    expect(manager.getSession(sessions[1].sessionId)).toBe(sessions[1]);
    expect(manager.getSession(sessions[2].sessionId)).toBe(sessions[2]);
    expect(manager.getSession(sessions[0].sessionId)).toBeUndefined();
  });

  it('should cleanup all sessions', async () => {
    manager = new SessionManager();
    await manager.createSession(makeServerFactory());
    await manager.createSession(makeServerFactory());
    await manager.createSession(makeServerFactory());
    expect(manager.size).toBe(3);

    await manager.cleanup();
    expect(manager.size).toBe(0);
  });
});
