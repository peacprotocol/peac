/**
 * x402+Fluora MCP marketplace adapter types
 *
 * Maps Fluora MCP tool call events to PEAC PaymentEvidence
 * using PEIP-SVC/mcp-call@1 subject profile.
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
  | 'invalid_server_id'
  | 'invalid_tool_name'
  | 'parse_error'
  | 'validation_error';

/**
 * Fluora MCP tool call event
 */
export interface FluoraMcpCallEvent {
  /** Unique call ID */
  callId: string;
  /** MCP server identifier */
  serverId: string;
  /** Tool name being invoked */
  toolName: string;
  /** Amount in minor units (cents, sats) */
  amount: number;
  /** Currency code (ISO 4217) */
  currency: string;
  /** Tenant or workspace ID */
  tenantId?: string;
  /** User or agent identifier */
  userId?: string;
  /** Tool input parameters (sanitized) */
  toolParams?: Record<string, unknown>;
  /** Execution time in milliseconds */
  executionMs?: number;
  /** Environment */
  env?: 'live' | 'test';
  /** Timestamp */
  timestamp?: string;
  /** Marketplace context */
  marketplace?: {
    sellerId?: string;
    listingId?: string;
    commission?: number;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Fluora webhook event wrapper
 */
export interface FluoraWebhookEvent {
  type: 'mcp.call.completed' | 'mcp.call.failed' | 'payment.captured';
  data: FluoraMcpCallEvent;
  signature?: string;
  webhookId?: string;
}

/**
 * Evidence structure for Fluora MCP call
 * Nested inside PaymentEvidence.evidence
 */
export interface FluoraEvidence {
  call_id: string;
  server_id: string;
  tool_name: string;
  tenant_id?: string;
  user_id?: string;
  execution_ms?: number;
  timestamp?: string;
  marketplace?: {
    seller_id?: string;
    listing_id?: string;
    commission?: number;
  };
  /** PEIP-SVC/mcp-call@1 profile marker */
  profile: 'PEIP-SVC/mcp-call@1';
}

/**
 * Adapter configuration
 */
export interface FluoraConfig {
  /** Default environment if not specified in event */
  defaultEnv?: 'live' | 'test';
  /** Allowed server IDs (if set, validates against this list) */
  allowedServers?: string[];
  /** Allowed tools (if set, validates against this list) */
  allowedTools?: string[];
}
