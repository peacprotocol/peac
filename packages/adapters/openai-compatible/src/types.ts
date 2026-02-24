/**
 * OpenAI-compatible Chat Completion Types (DD-138)
 *
 * Self-contained minimal types matching the OpenAI chat completion API shape.
 * Works with any OpenAI-compatible provider (OpenAI, Anthropic via adapter,
 * Ollama, vLLM, Together, etc.) without importing their SDKs.
 */

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

/** Chat message role */
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool' | 'function';

/** Chat message */
export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  name?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

// ---------------------------------------------------------------------------
// Completion types
// ---------------------------------------------------------------------------

/** Token usage statistics */
export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** Completion choice */
export interface ChatChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string | null;
}

/** Chat completion response */
export interface ChatCompletion {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatChoice[];
  usage?: ChatUsage;
}

// ---------------------------------------------------------------------------
// Evidence params
// ---------------------------------------------------------------------------

/** Parameters for creating interaction evidence from a chat completion */
export interface InferenceReceiptParams {
  /** The chat messages sent as input */
  messages: ChatMessage[];
  /** The completion response */
  completion: ChatCompletion;
  /** Optional provider identifier (e.g., 'openai', 'anthropic', 'ollama') */
  provider?: string;
}
