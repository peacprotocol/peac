/**
 * @peac/rails-x402-fluora
 *
 * x402+Fluora MCP marketplace adapter for PEAC protocol.
 * Maps Fluora MCP tool call events to PaymentEvidence using PEIP-SVC/mcp-call@1 profile.
 */

export type {
  FluoraMcpCallEvent,
  FluoraWebhookEvent,
  FluoraEvidence,
  FluoraConfig,
  AdapterResult,
  AdapterErrorCode,
} from './types.js';

export {
  parseMcpCallEvent,
  mapToPaymentEvidence,
  fromMcpCallEvent,
  fromWebhookEvent,
} from './adapter.js';
