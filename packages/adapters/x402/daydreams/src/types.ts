/**
 * x402+Daydreams AI inference router adapter types
 *
 * Maps Daydreams AI inference events to PEAC PaymentEvidence
 * using PEIP-AI/inference@1 subject profile.
 */

/**
 * Result type for parse operations - "never throws" invariant
 */
export type AdapterResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; code: AdapterErrorCode };

/**
 * Error codes for adapter operations
 */
export type AdapterErrorCode =
  | 'missing_required_field'
  | 'invalid_amount'
  | 'invalid_currency'
  | 'invalid_model_id'
  | 'invalid_provider'
  | 'parse_error'
  | 'validation_error';

/**
 * Daydreams inference request event
 */
export interface DaydreamsInferenceEvent {
  /** Unique event ID */
  eventId: string;
  /** Model identifier (e.g., 'gpt-4', 'claude-3-opus') */
  modelId: string;
  /** Provider name (e.g., 'openai', 'anthropic') */
  provider: string;
  /** Amount in minor units (cents, sats) */
  amount: number;
  /** Currency code (ISO 4217) */
  currency: string;
  /** Input classification (prompt class) */
  inputClass?: 'text' | 'image' | 'audio' | 'multimodal';
  /** Output type */
  outputType?: 'text' | 'image' | 'audio' | 'embedding' | 'json';
  /** Token counts */
  tokens?: {
    input?: number;
    output?: number;
  };
  /** Session or conversation ID */
  sessionId?: string;
  /** User or agent identifier */
  userId?: string;
  /** Environment */
  env?: 'live' | 'test';
  /** Timestamp */
  timestamp?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Daydreams webhook event wrapper
 */
export interface DaydreamsWebhookEvent {
  type: 'inference.completed' | 'inference.failed' | 'payment.captured';
  data: DaydreamsInferenceEvent;
  signature?: string;
  webhookId?: string;
}

/**
 * Evidence structure for Daydreams inference
 * Nested inside PaymentEvidence.evidence
 */
export interface DaydreamsEvidence {
  event_id: string;
  model_id: string;
  provider: string;
  input_class?: string;
  output_type?: string;
  tokens?: {
    input?: number;
    output?: number;
  };
  session_id?: string;
  user_id?: string;
  timestamp?: string;
  /** PEIP-AI/inference@1 profile marker */
  profile: 'PEIP-AI/inference@1';
}

/**
 * Adapter configuration
 */
export interface DaydreamsConfig {
  /** Default environment if not specified in event */
  defaultEnv?: 'live' | 'test';
  /** Allowed providers (if set, validates against this list) */
  allowedProviders?: string[];
  /** Allowed models (if set, validates against this list) */
  allowedModels?: string[];
}
