/**
 * Agent-to-Agent Bridge
 * Minimal event-bus abstraction intended for future adapters (e.g., Redis, WebSocket).
 * Not imported by the HTTP runtime in v0.9.3.
 */

import { EventEmitter } from 'events';

export type AgentId = string;

export interface BridgeMessage<T = unknown> {
  id: string;           // message id (uuid)
  type: string;         // event type
  from: AgentId;        // sender id
  to?: AgentId | '*';   // recipient id or broadcast
  payload: T;           // message payload
  ts: number;           // unix ms
}

export interface BridgeOptions {
  inMemory?: boolean;   // defaults to true
}

type Handler = (msg: BridgeMessage) => void;

export class A2ABridge {
  private readonly bus = new EventEmitter();
  private readonly opts: Required<BridgeOptions>;

  constructor(opts?: BridgeOptions) {
    this.opts = { inMemory: true, ...(opts || {}) };
  }

  /** Subscribe to a message type. Returns an unsubscribe function. */
  subscribe(type: string, handler: Handler): () => void {
    this.bus.on(type, handler);
    return () => this.bus.off(type, handler);
  }

  /** Publish a message (in-memory fan-out). */
  publish<T = unknown>(msg: BridgeMessage<T>): void {
    if (!msg?.id || !msg?.type || !msg?.from || typeof msg.ts !== 'number') {
      throw new Error('a2a_invalid_message');
    }
    // The option is honored here so it isn’t “unused.”
    if (this.opts.inMemory) {
      this.bus.emit(msg.type, msg);
    } else {
      // future: dispatch to external transport
      this.bus.emit(msg.type, msg);
    }
  }

  /** Cleanup hook. */
  async shutdown(): Promise<void> {
    this.bus.removeAllListeners();
  }
}
