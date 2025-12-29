/**
 * x402+Fluora adapter - parse -> validate -> map
 *
 * Converts Fluora MCP tool call events to PEAC PaymentEvidence
 * following the "never throws" invariant with Result types.
 */

import type { PaymentEvidence } from '@peac/schema';
import type {
  FluoraMcpCallEvent,
  FluoraEvidence,
  FluoraConfig,
  AdapterResult,
  AdapterErrorCode,
} from './types.js';

const RAIL_ID = 'x402.fluora';

/**
 * Create an error result
 */
function err<T>(error: string, code: AdapterErrorCode): AdapterResult<T> {
  return { ok: false, error, code };
}

/**
 * Create a success result
 */
function ok<T>(value: T): AdapterResult<T> {
  return { ok: true, value };
}

/**
 * Validate required string field
 */
function validateRequiredString(
  value: unknown,
  fieldName: string
): AdapterResult<string> {
  if (typeof value !== 'string' || value.trim() === '') {
    return err(`${fieldName} is required and must be a non-empty string`, 'missing_required_field');
  }
  return ok(value);
}

/**
 * Validate amount (must be safe positive integer in minor units)
 */
function validateAmount(amount: unknown): AdapterResult<number> {
  if (typeof amount !== 'number') {
    return err('amount must be a number', 'invalid_amount');
  }
  if (!Number.isSafeInteger(amount)) {
    return err('amount must be a safe integer', 'invalid_amount');
  }
  if (amount < 0) {
    return err('amount must be non-negative', 'invalid_amount');
  }
  return ok(amount);
}

/**
 * Validate currency (ISO 4217, uppercase)
 */
function validateCurrency(currency: unknown): AdapterResult<string> {
  if (typeof currency !== 'string') {
    return err('currency must be a string', 'invalid_currency');
  }
  const normalized = currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    return err('currency must be a valid ISO 4217 code (3 uppercase letters)', 'invalid_currency');
  }
  return ok(normalized);
}

/**
 * Parse and validate a Fluora MCP call event
 */
export function parseMcpCallEvent(
  event: unknown,
  config?: FluoraConfig
): AdapterResult<FluoraMcpCallEvent> {
  if (!event || typeof event !== 'object') {
    return err('event must be an object', 'parse_error');
  }

  const e = event as Record<string, unknown>;

  // Validate required fields
  const callIdResult = validateRequiredString(e.callId, 'callId');
  if (!callIdResult.ok) return callIdResult as AdapterResult<FluoraMcpCallEvent>;

  const serverIdResult = validateRequiredString(e.serverId, 'serverId');
  if (!serverIdResult.ok) return serverIdResult as AdapterResult<FluoraMcpCallEvent>;

  const toolNameResult = validateRequiredString(e.toolName, 'toolName');
  if (!toolNameResult.ok) return toolNameResult as AdapterResult<FluoraMcpCallEvent>;

  const amountResult = validateAmount(e.amount);
  if (!amountResult.ok) return amountResult as AdapterResult<FluoraMcpCallEvent>;

  const currencyResult = validateCurrency(e.currency);
  if (!currencyResult.ok) return currencyResult as AdapterResult<FluoraMcpCallEvent>;

  // Validate against config if provided
  if (config?.allowedServers && !config.allowedServers.includes(serverIdResult.value)) {
    return err(`server '${serverIdResult.value}' is not in allowed list`, 'invalid_server_id');
  }

  if (config?.allowedTools && !config.allowedTools.includes(toolNameResult.value)) {
    return err(`tool '${toolNameResult.value}' is not in allowed list`, 'invalid_tool_name');
  }

  // Build validated event
  const validated: FluoraMcpCallEvent = {
    callId: callIdResult.value,
    serverId: serverIdResult.value,
    toolName: toolNameResult.value,
    amount: amountResult.value,
    currency: currencyResult.value,
  };

  // Optional fields
  if (e.tenantId && typeof e.tenantId === 'string') {
    validated.tenantId = e.tenantId;
  }
  if (e.userId && typeof e.userId === 'string') {
    validated.userId = e.userId;
  }
  if (e.toolParams && typeof e.toolParams === 'object') {
    validated.toolParams = e.toolParams as Record<string, unknown>;
  }
  if (typeof e.executionMs === 'number') {
    validated.executionMs = e.executionMs;
  }
  if (e.env && (e.env === 'live' || e.env === 'test')) {
    validated.env = e.env;
  }
  if (e.timestamp && typeof e.timestamp === 'string') {
    validated.timestamp = e.timestamp;
  }
  if (e.marketplace && typeof e.marketplace === 'object') {
    validated.marketplace = e.marketplace as FluoraMcpCallEvent['marketplace'];
  }
  if (e.metadata && typeof e.metadata === 'object') {
    validated.metadata = e.metadata as Record<string, unknown>;
  }

  return ok(validated);
}

/**
 * Map a validated MCP call event to PaymentEvidence
 */
export function mapToPaymentEvidence(
  event: FluoraMcpCallEvent,
  config?: FluoraConfig
): PaymentEvidence {
  const evidence: FluoraEvidence = {
    call_id: event.callId,
    server_id: event.serverId,
    tool_name: event.toolName,
    profile: 'PEIP-SVC/mcp-call@1',
  };

  // Optional evidence fields
  if (event.tenantId) evidence.tenant_id = event.tenantId;
  if (event.userId) evidence.user_id = event.userId;
  if (event.executionMs !== undefined) evidence.execution_ms = event.executionMs;
  if (event.timestamp) evidence.timestamp = event.timestamp;
  if (event.marketplace) {
    evidence.marketplace = {
      seller_id: event.marketplace.sellerId,
      listing_id: event.marketplace.listingId,
      commission: event.marketplace.commission,
    };
  }

  const result: PaymentEvidence = {
    rail: RAIL_ID,
    reference: event.callId,
    amount: event.amount,
    currency: event.currency.toUpperCase(),
    asset: event.currency.toUpperCase(),
    env: event.env ?? config?.defaultEnv ?? 'live',
    evidence,
  };

  // Add aggregator if marketplace context exists
  if (event.marketplace?.sellerId) {
    result.aggregator = 'fluora';
    result.splits = [
      {
        party: event.marketplace.sellerId,
        share: event.marketplace.commission !== undefined
          ? (100 - event.marketplace.commission) / 100
          : 0.85, // Default 85% to seller
      },
    ];
  }

  return result;
}

/**
 * Parse, validate, and map an MCP call event to PaymentEvidence
 * Main entry point - follows parse -> validate -> map pattern
 */
export function fromMcpCallEvent(
  event: unknown,
  config?: FluoraConfig
): AdapterResult<PaymentEvidence> {
  const parseResult = parseMcpCallEvent(event, config);
  if (!parseResult.ok) {
    return parseResult as AdapterResult<PaymentEvidence>;
  }

  const paymentEvidence = mapToPaymentEvidence(parseResult.value, config);
  return ok(paymentEvidence);
}

/**
 * Parse and process a webhook event
 */
export function fromWebhookEvent(
  webhookEvent: unknown,
  config?: FluoraConfig
): AdapterResult<PaymentEvidence> {
  if (!webhookEvent || typeof webhookEvent !== 'object') {
    return err('webhook event must be an object', 'parse_error');
  }

  const w = webhookEvent as Record<string, unknown>;

  if (!w.type || typeof w.type !== 'string') {
    return err('webhook event type is required', 'missing_required_field');
  }

  if (!w.data || typeof w.data !== 'object') {
    return err('webhook event data is required', 'missing_required_field');
  }

  // Only process completed MCP call events
  if (w.type !== 'mcp.call.completed' && w.type !== 'payment.captured') {
    return err(`unsupported webhook event type: ${w.type}`, 'validation_error');
  }

  return fromMcpCallEvent(w.data, config);
}
