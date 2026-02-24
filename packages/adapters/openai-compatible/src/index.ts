/**
 * @peac/adapter-openai-compatible
 *
 * OpenAI-compatible chat completion adapter for PEAC interaction evidence.
 * Hash-first model (DD-138): no raw prompt or completion text in receipts.
 *
 * Works with any OpenAI-compatible provider (OpenAI, Anthropic via adapter,
 * Ollama, vLLM, Together, etc.) without importing their SDKs.
 *
 * @packageDocumentation
 */

// Types
export type {
  ChatRole,
  ChatMessage,
  ChatUsage,
  ChatChoice,
  ChatCompletion,
  InferenceReceiptParams,
} from './types.js';

// WebCrypto utility
export { getSubtle } from './crypto.js';

// Hash utilities
export { hashMessages, hashOutput, messagesBytes, outputBytes } from './hash.js';

// Evidence mapping
export { fromChatCompletion, INFERENCE_KIND, INFERENCE_EXTENSION_KEY } from './evidence.js';
export type { InferenceEvidence } from './evidence.js';
