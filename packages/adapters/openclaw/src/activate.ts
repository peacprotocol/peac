/**
 * @peac/adapter-openclaw - Plugin Activation
 *
 * High-level entry point that wires together all adapter components
 * from config. Calls existing functions (resolveSigner, createPluginInstance,
 * createFileReceiptWriter, etc.) -- no logic duplication.
 *
 * Usage:
 *   const result = await activate({ config, logger });
 *   result.instance.start();
 *
 * When OpenClaw's plugin loader gains a stable activation shape,
 * add a thin validated wrapper at that time.
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { OpenClawAdapterConfig } from './types.js';
import type { PluginLogger, PluginInstance, PluginTool } from './plugin.js';
import type { OpenClawHookHandler } from './hooks.js';
import type { FsSpoolStoreOptions } from '@peac/capture-node';
import { createFsSpoolStore, createFsDedupeIndex, getFsSpoolDiagnostics } from '@peac/capture-node';
import { resolveSigner, createFileReceiptWriter, createPluginInstance } from './plugin.js';
import {
  createStatusTool,
  createExportBundleTool,
  createVerifyTool,
  createQueryTool,
} from './tools.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for activating the plugin.
 */
export interface ActivateOptions {
  /** Adapter configuration (signing, capture, correlation, background). */
  config: ActivateConfig;
  /** Logger instance. */
  logger?: PluginLogger;
  /** Data directory for spool, dedupe, and signing key. Default: ~/.openclaw/peac/ */
  dataDir?: string;
  /** Spool store options override. */
  spoolOptions?: Partial<
    Pick<
      FsSpoolStoreOptions,
      'maxEntries' | 'maxFileBytes' | 'autoCommitIntervalMs' | 'lockOptions'
    >
  >;
}

/**
 * Configuration for activate(). Extends OpenClawAdapterConfig with
 * required signing fields.
 */
export interface ActivateConfig extends OpenClawAdapterConfig {
  /** Signing configuration (required for activation). */
  signing: {
    /** Key reference: env:VAR_NAME or file:/path */
    key_ref: string;
    /** Issuer URI for receipts */
    issuer: string;
    /** Optional audience URI */
    audience?: string;
  };
  /** Output directory for receipt files. Default: {dataDir}/receipts/ */
  output_dir?: string;
  /** Background emitter settings. */
  background?: {
    drain_interval_ms?: number;
    batch_size?: number;
  };
}

/**
 * Result of activating the plugin.
 */
export interface ActivateResult {
  /** The running plugin instance. */
  instance: PluginInstance;
  /** The 4 plugin tools (status, export, verify, query). */
  tools: PluginTool[];
  /** Hook handler for tool call events. */
  hookHandler: OpenClawHookHandler;
  /** Data directory used. */
  dataDir: string;
  /** Shut down the plugin cleanly. */
  shutdown: () => Promise<void>;
}

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_DATA_DIR_NAME = '.openclaw/peac';
const SPOOL_FILENAME = 'spool.jsonl';
const DEDUPE_FILENAME = 'dedupe.idx';

// =============================================================================
// Helpers
// =============================================================================

function defaultDataDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return path.join(home, DEFAULT_DATA_DIR_NAME);
}

function noopLogger(): PluginLogger {
  const noop = () => {};
  return { debug: noop, info: noop, warn: noop, error: noop };
}

// =============================================================================
// Activation
// =============================================================================

/**
 * Activate the PEAC evidence export plugin.
 *
 * This is the single canonical entry point. It:
 * 1. Resolves the signing key from config (env: or file:)
 * 2. Creates durable stores (FsSpoolStore + FsDedupeIndex)
 * 3. Creates the receipt writer
 * 4. Creates the plugin instance (session + hooks + emitter)
 * 5. Creates the 4 plugin tools
 * 6. Logs startup diagnostics
 *
 * @throws If signing key cannot be resolved
 * @throws If data directory is not writable
 * @throws If spool lockfile cannot be acquired
 */
export async function activate(options: ActivateOptions): Promise<ActivateResult> {
  const { config, spoolOptions } = options;
  const logger = options.logger ?? noopLogger();
  const dataDir = options.dataDir ?? defaultDataDir();

  // 1. Ensure data directory exists
  await fs.mkdir(dataDir, { recursive: true });

  // Verify writable
  try {
    await fs.access(dataDir, (await import('node:constants')).W_OK);
  } catch {
    throw new Error(`Data directory is not writable: ${dataDir}`);
  }

  // 2. Resolve signing key
  logger.info(`Resolving signing key from: ${config.signing.key_ref.split(':')[0]}:***`);
  const signer = await resolveSigner(
    config.signing.key_ref,
    config.signing.issuer,
    config.signing.audience
  );
  logger.info(`Signing key resolved. kid: ${signer.getKeyId()}`);

  // 3. Create durable stores
  const spoolPath = path.join(dataDir, SPOOL_FILENAME);
  const dedupePath = path.join(dataDir, DEDUPE_FILENAME);

  const store = await createFsSpoolStore({
    filePath: spoolPath,
    maxEntries: spoolOptions?.maxEntries,
    maxFileBytes: spoolOptions?.maxFileBytes,
    autoCommitIntervalMs: spoolOptions?.autoCommitIntervalMs,
    lockOptions: spoolOptions?.lockOptions,
    onWarning: (msg) => logger.warn(`spool: ${msg}`),
  });

  const dedupe = await createFsDedupeIndex({
    filePath: dedupePath,
  });

  // 4. Create receipt writer
  const outputDir = config.output_dir ?? path.join(dataDir, 'receipts');
  const writer = await createFileReceiptWriter(outputDir);

  // 5. Create plugin instance
  const instance = await createPluginInstance({
    signer,
    writer,
    adapterConfig: config,
    store,
    dedupe,
    drainIntervalMs: config.background?.drain_interval_ms,
    batchSize: config.background?.batch_size,
    onError: (err) => logger.error(`plugin error: ${err.message}`),
  });

  // 6. Create tools
  // Note: createStatusTool takes a snapshot of stats. Tools are re-created
  // when needed by the caller, or the status tool reads live stats internally.
  const tools: PluginTool[] = [
    createStatusTool(instance.getStats(), outputDir),
    createExportBundleTool(outputDir, logger),
    createVerifyTool(logger),
    createQueryTool(outputDir, logger),
  ];

  // 7. Log startup diagnostics
  const diag = getFsSpoolDiagnostics(store);
  if (diag) {
    logger.info(
      `PEAC evidence export active. ` +
        `Spool: ${diag.entryCount} entries, ${diag.fileBytes} bytes. ` +
        `Receipts: ${outputDir}`
    );
  } else {
    logger.info(`PEAC evidence export active. Receipts: ${outputDir}`);
  }

  // 8. Shutdown handler
  async function shutdown(): Promise<void> {
    logger.info('Shutting down PEAC evidence export...');
    await instance.stop();
    await store.close();
    await dedupe.close();
    logger.info('PEAC evidence export stopped.');
  }

  return {
    instance,
    tools,
    hookHandler: instance.hookHandler,
    dataDir,
    shutdown,
  };
}
