/**
 * @peac/adapter-openclaw - Plugin Entry Point
 *
 * OpenClaw plugin types and utilities for PEAC receipts.
 * This module provides types and factory functions for OpenClaw integration.
 *
 * Note: Full plugin activation requires OpenClaw's plugin runtime.
 * The types and utilities here allow building custom integrations.
 */

import type { CaptureSession, SpoolStore, DedupeIndex } from '@peac/capture-core';
import { createCaptureSession, createHasher } from '@peac/capture-core';
import { sign, base64urlDecode } from '@peac/crypto';
import type { OpenClawAdapterConfig } from './types.js';
import { createHookHandler, type OpenClawHookHandler } from './hooks.js';
import {
  createReceiptEmitter,
  createBackgroundService,
  type Signer,
  type ReceiptWriter,
  type BackgroundEmitterService,
} from './emitter.js';

// =============================================================================
// JWK Type
// =============================================================================

/**
 * JSON Web Key structure for signing keys (Ed25519).
 */
export interface JWK {
  kty: string;
  crv?: string;
  x?: string;
  d?: string;
  kid?: string;
  alg?: string;
  use?: string;
}

// =============================================================================
// Plugin Configuration Types
// =============================================================================

/**
 * Plugin configuration from openclaw.plugin.json configSchema.
 *
 * @experimental This interface is experimental and may change.
 */
export interface PluginConfig {
  enabled?: boolean;
  output_dir?: string;
  capture?: {
    mode?: 'hash_only' | 'allowlist';
    allowlist?: string[];
    max_payload_size?: number;
  };
  signing: {
    key_ref: string;
    issuer: string;
    audience?: string;
  };
  correlation?: {
    include_workflow?: boolean;
    // Note: include_identity and identity_attestation_ref are reserved for future use
  };
  background?: {
    drain_interval_ms?: number;
    batch_size?: number;
  };
}

/**
 * OpenClaw plugin context provided by the runtime.
 */
export interface PluginContext {
  /** Plugin configuration from gateway config */
  config: PluginConfig;
  /** Agent workspace directory */
  workspaceDir: string;
  /** Logger instance */
  logger: PluginLogger;
  /** Register a tool call hook */
  onToolCall: (handler: ToolCallHandler) => void;
  /** Register a tool result hook */
  onToolResult: (handler: ToolResultHandler) => void;
  /** Register tools */
  registerTools: (tools: PluginTool[]) => void;
}

/**
 * Plugin logger interface.
 */
export interface PluginLogger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

/**
 * Tool call event from OpenClaw.
 */
export interface ToolCallEvent {
  tool_call_id: string;
  run_id: string;
  session_key?: string;
  tool_name: string;
  tool_provider?: string;
  input: unknown;
  started_at: string;
}

/**
 * Tool result event from OpenClaw.
 */
export interface ToolResultEvent {
  tool_call_id: string;
  run_id: string;
  session_key?: string;
  tool_name: string;
  output: unknown;
  completed_at: string;
  status: 'ok' | 'error' | 'timeout' | 'canceled';
  error_code?: string;
}

/**
 * Tool call handler function.
 */
export type ToolCallHandler = (event: ToolCallEvent) => void | Promise<void>;

/**
 * Tool result handler function.
 */
export type ToolResultHandler = (event: ToolResultEvent) => void | Promise<void>;

/**
 * Plugin tool definition.
 */
export interface PluginTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

// =============================================================================
// Signer Creation
// =============================================================================

/**
 * Create a signer from a JWK private key.
 *
 * @param jwk - Ed25519 private key in JWK format
 * @param issuer - Issuer URI for receipts
 * @param audience - Optional audience URI
 * @returns Signer instance
 */
export function createJwkSigner(jwk: JWK, issuer: string, audience?: string): Signer {
  const kid = jwk.kid || generateKeyId(jwk);

  // Extract the private key bytes from JWK
  if (!jwk.d) {
    throw new Error('JWK must include private key (d parameter)');
  }

  // Decode base64url to get raw key bytes
  const privateKeyBytes = base64urlDecode(jwk.d);

  return {
    async sign(payload: unknown): Promise<string> {
      return sign(payload, privateKeyBytes, kid);
    },

    getKeyId(): string {
      return kid;
    },

    getIssuer(): string {
      return issuer;
    },

    getAudience(): string | undefined {
      return audience;
    },
  };
}

/**
 * Resolve a signer from a key reference string.
 *
 * Supported formats:
 * - env:VAR_NAME - Load key from environment variable
 * - file:/path - Load from file (development only)
 *
 * @param keyRef - Key reference string
 * @param issuer - Issuer URI
 * @param audience - Optional audience URI
 * @returns Promise resolving to Signer
 */
export async function resolveSigner(
  keyRef: string,
  issuer: string,
  audience?: string
): Promise<Signer> {
  const colonIndex = keyRef.indexOf(':');
  if (colonIndex === -1) {
    throw new Error(`Invalid key reference format: ${keyRef}. Expected scheme:value`);
  }

  const scheme = keyRef.slice(0, colonIndex);
  const value = keyRef.slice(colonIndex + 1);

  switch (scheme) {
    case 'env': {
      const keyData = process.env[value];
      if (!keyData) {
        throw new Error(`Environment variable ${value} not set for signing key`);
      }
      const jwk = JSON.parse(keyData) as JWK;
      return createJwkSigner(jwk, issuer, audience);
    }

    case 'file': {
      const fs = await import('fs');
      const keyData = await fs.promises.readFile(value, 'utf-8');
      const jwk = JSON.parse(keyData) as JWK;
      return createJwkSigner(jwk, issuer, audience);
    }

    case 'keychain':
      throw new Error('Keychain signing not yet implemented. Use env: for development.');

    case 'sidecar':
      throw new Error('Sidecar signing not yet implemented. Use env: for development.');

    default:
      throw new Error(`Unknown key reference scheme: ${scheme}. Use env: or file:`);
  }
}

/**
 * Generate a key ID from a JWK by hashing its public components.
 */
export function generateKeyId(jwk: JWK): string {
  const publicPart = jwk.x || '';
  let hash = 0;
  for (let i = 0; i < publicPart.length; i++) {
    const char = publicPart.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `k_${Math.abs(hash).toString(16).padStart(8, '0')}`;
}

// =============================================================================
// Receipt Writer
// =============================================================================

/**
 * Create a file system receipt writer with atomic writes.
 *
 * Writes are atomic: write to .tmp, fsync, rename. This ensures
 * partially written files are never observable.
 *
 * @param outputDir - Directory for receipt files
 * @returns Promise resolving to ReceiptWriter
 */
export async function createFileReceiptWriter(outputDir: string): Promise<ReceiptWriter> {
  const fs = await import('fs');
  const pathModule = await import('path');

  // Use path.resolve for portability
  const resolvedOutputDir = pathModule.resolve(outputDir);

  // Ensure directory exists
  await fs.promises.mkdir(resolvedOutputDir, { recursive: true });

  return {
    async write(receipt) {
      const filename = `${receipt.rid}.peac.json`;
      const filepath = pathModule.join(resolvedOutputDir, filename);
      const tempPath = `${filepath}.tmp`;

      const content = JSON.stringify(
        {
          rid: receipt.rid,
          interaction_id: receipt.interaction_id,
          entry_digest: receipt.entry_digest,
          _jws: receipt.jws,
        },
        null,
        2
      );

      // Atomic write: write to .tmp, fsync, rename, fsync dir
      await fs.promises.writeFile(tempPath, content, 'utf-8');

      // fsync file for durability (open, sync, close)
      const fd = await fs.promises.open(tempPath, 'r');
      await fd.sync();
      await fd.close();

      // Atomic rename (POSIX guarantees atomicity)
      await fs.promises.rename(tempPath, filepath);

      // fsync parent directory for full crash durability (POSIX best practice)
      // This ensures the rename is persisted even on power loss
      // Best-effort: may fail on some platforms (Windows, network FS)
      try {
        const dirFd = await fs.promises.open(resolvedOutputDir, 'r');
        await dirFd.sync();
        await dirFd.close();
      } catch {
        // Directory fsync not supported on this platform - continue anyway
        // Receipt is still atomic via rename, just not fully durable on power loss
      }

      return filepath;
    },

    async close() {
      // No-op for file writer
    },
  };
}

// =============================================================================
// Plugin Instance
// =============================================================================

/**
 * Plugin instance state.
 */
export interface PluginInstance {
  /** Capture session */
  session: CaptureSession;
  /** Hook handler for tool calls */
  hookHandler: OpenClawHookHandler;
  /** Background emitter service */
  backgroundService: BackgroundEmitterService;
  /** Start the plugin */
  start(): void;
  /** Stop the plugin */
  stop(): Promise<void>;
  /** Get plugin stats */
  getStats(): PluginStats;
}

/**
 * Plugin statistics.
 */
export interface PluginStats {
  totalCaptured: number;
  duplicatesSkipped: number;
  pendingCount: number;
  totalEmitted: number;
  totalErrors: number;
  keyId: string;
  isRunning: boolean;
}

/**
 * Options for creating a plugin instance.
 */
export interface CreatePluginOptions {
  /** Signer for receipts */
  signer: Signer;
  /** Receipt writer */
  writer: ReceiptWriter;
  /** Adapter configuration */
  adapterConfig?: OpenClawAdapterConfig;
  /** Spool store implementation (required) */
  store: SpoolStore;
  /** Dedupe index implementation (required) */
  dedupe: DedupeIndex;
  /** Background drain interval in ms (default: 1000) */
  drainIntervalMs?: number;
  /** Batch size for draining (default: 100) */
  batchSize?: number;
  /** Error callback */
  onError?: (error: Error) => void;
}

/**
 * Create a plugin instance.
 *
 * @param options - Plugin options
 * @returns Plugin instance
 */
export async function createPluginInstance(options: CreatePluginOptions): Promise<PluginInstance> {
  const {
    signer,
    writer,
    adapterConfig,
    store,
    dedupe,
    drainIntervalMs = 1000,
    batchSize = 100,
    onError,
  } = options;

  // Create hasher
  const hasher = await createHasher();

  // Create capture session
  const session = createCaptureSession({
    store,
    dedupe,
    hasher,
  });

  // Track stats
  const stats: PluginStats = {
    totalCaptured: 0,
    duplicatesSkipped: 0,
    pendingCount: 0,
    totalEmitted: 0,
    totalErrors: 0,
    keyId: signer.getKeyId(),
    isRunning: false,
  };

  // Create hook handler
  const hookHandler = createHookHandler({
    session,
    config: adapterConfig,
    onCapture: (result) => {
      if (result.success) {
        stats.totalCaptured++;
        stats.pendingCount++;
      } else {
        stats.duplicatesSkipped++;
      }
    },
  });

  // Create receipt emitter
  const emitter = createReceiptEmitter({
    signer,
    writer,
    onEmit: (result) => {
      if (result.success) {
        stats.totalEmitted++;
        stats.pendingCount = Math.max(0, stats.pendingCount - 1);
      }
    },
    onError: (error) => {
      stats.totalErrors++;
      if (onError) onError(error);
    },
  });

  // Track last emitted sequence for cursor-based emission
  // This is the in-memory cursor; on restart, we rebuild from dedupe index
  let lastEmittedSequence = 0;

  // Mutex to prevent overlapping drain cycles
  let drainInProgress = false;

  // Create background service with proper cursor tracking
  // Note: For full restart safety, the dedupe index should be persistent.
  // The getPendingEntries filters out already-emitted entries using the dedupe index.
  const backgroundService = createBackgroundService({
    emitter,
    drainIntervalMs,
    getPendingEntries: async () => {
      // Prevent overlapping drain cycles
      if (drainInProgress) return [];
      drainInProgress = true;

      try {
        // Read entries after the last emitted sequence
        const currentSequence = await store.getSequence();
        if (currentSequence <= lastEmittedSequence) return [];

        // Read from cursor position
        const entries = await store.read(lastEmittedSequence, batchSize);

        // Filter out entries that are already emitted (restart safety)
        // This uses the persistent dedupe index as source of truth
        const pending = [];
        for (const entry of entries) {
          if (entry.sequence <= lastEmittedSequence) continue;
          // Check if already emitted in dedupe index
          const dedupeEntry = await dedupe.get(entry.action.id);
          if (dedupeEntry?.emitted) continue;
          pending.push(entry);
        }
        return pending;
      } finally {
        drainInProgress = false;
      }
    },
    markEmitted: async (digest) => {
      // Find the entry with this digest and update cursor
      const entries = await store.read(lastEmittedSequence, batchSize);
      const entry = entries.find((e) => e.entry_digest === digest);
      if (entry) {
        // Update in-memory cursor
        if (entry.sequence > lastEmittedSequence) {
          lastEmittedSequence = entry.sequence;
        }
        // Mark in persistent dedupe index (restart-safe)
        await dedupe.markEmitted(entry.action.id);
      }
    },
    onError,
  });

  return {
    session,
    hookHandler,
    backgroundService,

    start() {
      stats.isRunning = true;
      backgroundService.start();
    },

    async stop() {
      backgroundService.stop();
      await backgroundService.drain();
      await hookHandler.close();
      stats.isRunning = false;
    },

    getStats() {
      return { ...stats };
    },
  };
}
