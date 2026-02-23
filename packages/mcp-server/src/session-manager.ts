/**
 * MCP Session Manager -- Mcp-Session-Id lifecycle, eviction, isolation
 *
 * Each HTTP session gets its own McpServer + StreamableHTTPServerTransport
 * pair. This is the primary defense against CVE-2026-25536 (cross-client
 * response data leak when a single transport is reused across connections).
 *
 * INVARIANT: NEVER reuse a single transport instance across multiple
 * client sessions. Each session is fully isolated.
 */

import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export interface SessionEntry {
  readonly sessionId: string;
  readonly server: McpServer;
  readonly transport: StreamableHTTPServerTransport;
  readonly createdAt: number;
  readonly clientIp: string;
  lastSeen: number;
}

export interface SessionManagerOptions {
  /** Max idle time before eviction (ms). Default: 30 min */
  ttlMs?: number;
  /** Max concurrent sessions. Default: 100 */
  maxSessions?: number;
  /** Max sessions per client IP. Default: 10 */
  maxSessionsPerIp?: number;
  /** Eviction sweep interval (ms). Default: 60s */
  sweepIntervalMs?: number;
}

type ServerFactory = () => McpServer;

export class SessionManager {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly ipSessionCount = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly maxSessionsPerIp: number;
  private sweepTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly options: SessionManagerOptions = {}) {
    this.ttlMs = options.ttlMs ?? 30 * 60 * 1000; // 30 min
    this.maxSessions = options.maxSessions ?? 100;
    this.maxSessionsPerIp = options.maxSessionsPerIp ?? 10;
  }

  /** Start periodic eviction sweep */
  startSweep(): void {
    const intervalMs = this.options.sweepIntervalMs ?? 60_000;
    this.sweepTimer = setInterval(() => this.evictStale(), intervalMs);
    this.sweepTimer.unref();
  }

  /** Create a new isolated session with its own McpServer + transport */
  async createSession(serverFactory: ServerFactory, clientIp = 'unknown'): Promise<SessionEntry> {
    // Evict stale sessions first
    this.evictStale();

    // Check global capacity
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Session limit reached (${this.maxSessions}). Try again later.`);
    }

    // Check per-IP capacity (prevents one IP exhausting the global pool)
    const ipCount = this.ipSessionCount.get(clientIp) ?? 0;
    if (ipCount >= this.maxSessionsPerIp) {
      throw new Error(
        `Per-IP session limit reached (${this.maxSessionsPerIp} for ${clientIp}). Try again later.`
      );
    }

    const sessionId = randomUUID();
    const server = serverFactory();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
    });

    await server.connect(transport);

    const now = Date.now();
    const entry: SessionEntry = {
      sessionId,
      server,
      transport,
      clientIp,
      createdAt: now,
      lastSeen: now,
    };

    this.sessions.set(sessionId, entry);
    this.ipSessionCount.set(clientIp, ipCount + 1);
    return entry;
  }

  /** Look up an existing session by ID */
  getSession(sessionId: string): SessionEntry | undefined {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.lastSeen = Date.now();
    }
    return entry;
  }

  /** Terminate and clean up a specific session */
  async terminateSession(sessionId: string): Promise<boolean> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;

    this.sessions.delete(sessionId);
    this.decrementIpCount(entry.clientIp);
    try {
      await entry.transport.close();
      await entry.server.close();
    } catch {
      // Best effort cleanup
    }
    return true;
  }

  /** Terminate all sessions and stop sweep */
  async cleanup(): Promise<void> {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }

    const entries = [...this.sessions.values()];
    this.sessions.clear();
    this.ipSessionCount.clear();

    await Promise.allSettled(
      entries.map(async (entry) => {
        try {
          await entry.transport.close();
          await entry.server.close();
        } catch {
          // Best effort
        }
      })
    );
  }

  /** Get current session count */
  get size(): number {
    return this.sessions.size;
  }

  /** Evict sessions past TTL */
  private evictStale(): void {
    const now = Date.now();
    for (const [id, entry] of this.sessions) {
      if (now - entry.lastSeen > this.ttlMs) {
        this.sessions.delete(id);
        this.decrementIpCount(entry.clientIp);
        // Fire-and-forget cleanup
        void entry.transport.close().catch(() => {});
        void entry.server.close().catch(() => {});
      }
    }
  }

  /** Decrement per-IP session count, removing the key when it reaches 0 */
  private decrementIpCount(ip: string): void {
    const count = this.ipSessionCount.get(ip) ?? 0;
    if (count <= 1) {
      this.ipSessionCount.delete(ip);
    } else {
      this.ipSessionCount.set(ip, count - 1);
    }
  }
}
