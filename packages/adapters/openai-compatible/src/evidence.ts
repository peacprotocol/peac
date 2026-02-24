/**
 * Evidence mapping for OpenAI-compatible chat completions (DD-138).
 *
 * Maps a ChatCompletion into InteractionEvidenceV01 using the hash-first
 * model: SHA-256 digests of messages and output, plaintext metadata only.
 */

import type { ChatCompletion, ChatMessage, InferenceReceiptParams } from './types.js';
import { hashMessages, hashOutput, messagesBytes, outputBytes } from './hash.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Well-known interaction kind for chat completions. */
export const INFERENCE_KIND = 'inference.chat_completion';

/** Extension key for inference metadata. */
export const INFERENCE_EXTENSION_KEY = 'org.peacprotocol/inference@0.1';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Interaction evidence structure (matches InteractionEvidenceV01 from @peac/schema). */
export interface InferenceEvidence {
  interaction_id: string;
  kind: typeof INFERENCE_KIND;
  executor: {
    platform: string;
    version?: string;
  };
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  input: {
    digest: {
      alg: 'sha-256';
      value: string;
      bytes: number;
    };
    redaction: 'hash_only';
  };
  output: {
    digest: {
      alg: 'sha-256';
      value: string;
      bytes: number;
    };
    redaction: 'hash_only';
  };
  result: {
    status: 'ok' | 'error';
  };
  extensions: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Concatenate all choice message contents into a single string. */
function concatOutputContent(completion: ChatCompletion): string {
  return completion.choices.map((c) => c.message.content ?? '').join('');
}

/** Extract finish_reason from the first choice (if any). */
function primaryFinishReason(completion: ChatCompletion): string | null {
  if (completion.choices.length === 0) return null;
  return completion.choices[0].finish_reason;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create interaction evidence from an OpenAI-compatible chat completion.
 *
 * Hash-first model (DD-138): no raw prompt or completion text is stored.
 * Only SHA-256 digests, model ID, token counts, and timing are recorded.
 *
 * @param params - Messages, completion response, and optional provider
 * @returns InteractionEvidenceV01-compatible object
 */
export async function fromChatCompletion(
  params: InferenceReceiptParams
): Promise<InferenceEvidence> {
  const { messages, completion, provider } = params;

  // Hash inputs and outputs
  const outputContent = concatOutputContent(completion);
  const [inputHash, outputHash] = await Promise.all([
    hashMessages(messages),
    hashOutput(outputContent),
  ]);

  // Extract the hex value (strip `sha256:` prefix for digest.value)
  const inputValue = inputHash.slice('sha256:'.length);
  const outputValue = outputHash.slice('sha256:'.length);

  // Build platform identifier
  const platform = provider ? `openai-compatible:${provider}` : 'openai-compatible';

  // Build inference extension metadata
  const inferenceExt: Record<string, unknown> = {
    model: completion.model,
    finish_reason: primaryFinishReason(completion),
  };
  if (completion.usage) {
    inferenceExt.usage = {
      prompt_tokens: completion.usage.prompt_tokens,
      completion_tokens: completion.usage.completion_tokens,
      total_tokens: completion.usage.total_tokens,
    };
  }

  // Determine result status from finish_reason
  const finishReason = primaryFinishReason(completion);
  const resultStatus: 'ok' | 'error' =
    finishReason === 'error' || completion.choices.length === 0 ? 'error' : 'ok';

  const evidence: InferenceEvidence = {
    interaction_id: completion.id,
    kind: INFERENCE_KIND,
    executor: {
      platform,
      version: completion.model,
    },
    started_at: new Date(completion.created * 1000).toISOString(),
    input: {
      digest: {
        alg: 'sha-256',
        value: inputValue,
        bytes: messagesBytes(messages),
      },
      redaction: 'hash_only',
    },
    output: {
      digest: {
        alg: 'sha-256',
        value: outputValue,
        bytes: outputBytes(outputContent),
      },
      redaction: 'hash_only',
    },
    result: {
      status: resultStatus,
    },
    extensions: {
      [INFERENCE_EXTENSION_KEY]: inferenceExt,
    },
  };

  return evidence;
}
