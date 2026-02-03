/**
 * @peac/adapter-openclaw
 *
 * OpenClaw adapter for PEAC interaction evidence capture.
 *
 * This package provides:
 * - Mapper: OpenClaw tool call events -> PEAC CapturedAction
 * - Hooks: Sync capture bindings (< 10ms target)
 * - Emitter: Background receipt signing and persistence
 *
 * @packageDocumentation
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // OpenClaw event types
  OpenClawToolCallEvent,
  OpenClawPolicyContext,
  OpenClawContext,

  // Configuration
  OpenClawAdapterConfig,

  // Mapping
  MappingResult,
  MappingWarning,

  // Emitter
  ReceiptEmitter,
  EmitResult,

  // Extension types
  OpenClawContextExtension,
} from './types.js';

export {
  // Extension keys
  OPENCLAW_EXTENSION_KEYS,

  // Error codes
  OPENCLAW_ERROR_CODES,
  type OpenClawErrorCode,

  // Warning codes
  OPENCLAW_WARNING_CODES,
  type OpenClawWarningCode,
} from './types.js';

// =============================================================================
// Mapper
// =============================================================================

export {
  mapToolCallEvent,
  mapToolCallEventBatch,
  extractWorkflowId,
  buildWorkflowContext,
} from './mapper.js';

// =============================================================================
// Hooks
// =============================================================================

export type {
  OpenClawHookHandler,
  HookHandlerConfig,
  HookCaptureResult,
  SessionHistoryTailer,
  TailerConfig,
} from './hooks.js';

export {
  createHookHandler,
  captureBatch,
  captureParallel,
  createSessionHistoryTailer,
} from './hooks.js';

// =============================================================================
// Emitter
// =============================================================================

export type {
  Signer,
  ReceiptWriter,
  SignedReceipt,
  EmitterConfig,
  BackgroundEmitterService,
  BackgroundServiceConfig,
  EmitterStats,
} from './emitter.js';

export { createReceiptEmitter, createBackgroundService } from './emitter.js';

// =============================================================================
// Plugin (OpenClaw plugin types and utilities)
// =============================================================================

export type {
  JWK,
  PluginConfig,
  PluginContext,
  PluginLogger,
  ToolCallEvent,
  ToolResultEvent,
  ToolCallHandler,
  ToolResultHandler,
  PluginTool,
  PluginInstance,
  PluginStats,
  CreatePluginOptions,
} from './plugin.js';

export {
  createJwkSigner,
  resolveSigner,
  generateKeyId,
  createFileReceiptWriter,
  createPluginInstance,
} from './plugin.js';

// =============================================================================
// Tools
// =============================================================================

export {
  createStatusTool,
  createExportBundleTool,
  createVerifyTool,
  createQueryTool,
} from './tools.js';
