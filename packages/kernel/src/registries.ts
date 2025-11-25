/**
 * PEAC Protocol Registries
 * Derived from specs/kernel/registries.json
 *
 * NOTE: This file is manually synced for v0.9.15.
 * From v0.9.16+, this will be auto-generated via codegen.
 */

import type {
  PaymentRailEntry,
  ControlEngineEntry,
  TransportMethodEntry,
  AgentProtocolEntry,
} from './types.js';

/**
 * Payment Rails Registry
 * Settlement layer identifiers
 */
export const PAYMENT_RAILS: readonly PaymentRailEntry[] = [
  {
    id: 'x402',
    category: 'agentic-payment',
    description: 'HTTP 402-based paid call receipts',
    reference: 'https://www.x402.org/',
    status: 'informational',
  },
  {
    id: 'l402',
    category: 'agentic-payment',
    description: 'Lightning HTTP 402 Protocol (LSAT-based)',
    reference: 'https://docs.lightning.engineering/the-lightning-network/l402',
    status: 'informational',
  },
  {
    id: 'card-network',
    category: 'card',
    description: 'Generic card network authorizations/clearing',
    reference: null,
    status: 'informational',
  },
  {
    id: 'upi',
    category: 'account-to-account',
    description: 'Unified Payments Interface',
    reference: 'https://www.npci.org.in/',
    status: 'informational',
  },
] as const;

/**
 * Control Engines Registry
 * Governance and authorization engine identifiers
 */
export const CONTROL_ENGINES: readonly ControlEngineEntry[] = [
  {
    id: 'spend-control-service',
    category: 'limits',
    description: 'Generic spend control decisions (per-tx, daily, monthly limits)',
    reference: null,
    status: 'informational',
  },
  {
    id: 'risk-engine',
    category: 'fraud',
    description: 'Generic risk/fraud scoring engine',
    reference: null,
    status: 'informational',
  },
  {
    id: 'mandate-service',
    category: 'mandate',
    description: 'Generic enterprise mandate/approval chain evaluator',
    reference: null,
    status: 'informational',
  },
] as const;

/**
 * Transport Methods Registry
 * Transport-layer binding identifiers
 */
export const TRANSPORT_METHODS: readonly TransportMethodEntry[] = [
  {
    id: 'dpop',
    category: 'proof-of-possession',
    description: 'Demonstrating Proof-of-Possession at the Application Layer',
    reference: 'https://www.rfc-editor.org/rfc/rfc9449',
    status: 'informational',
  },
  {
    id: 'http-signature',
    category: 'message-signature',
    description: 'HTTP Message Signatures',
    reference: 'https://www.rfc-editor.org/rfc/rfc9421',
    status: 'informational',
  },
  {
    id: 'none',
    category: 'none',
    description: 'No transport binding',
    reference: null,
    status: 'informational',
  },
] as const;

/**
 * Agent Protocols Registry
 * Agentic protocol integration identifiers
 */
export const AGENT_PROTOCOLS: readonly AgentProtocolEntry[] = [
  {
    id: 'mcp',
    category: 'tool-protocol',
    description: 'Model Context Protocol (Anthropic)',
    reference: 'https://modelcontextprotocol.io/',
    status: 'informational',
  },
  {
    id: 'acp',
    category: 'commerce-protocol',
    description: 'Agentic Commerce Protocol',
    reference: null,
    status: 'informational',
  },
  {
    id: 'ap2',
    category: 'agent-protocol',
    description: 'Google Agent Protocol v2',
    reference: null,
    status: 'informational',
  },
  {
    id: 'tap',
    category: 'card-protocol',
    description: 'Token Authentication Protocol (Visa TAP)',
    reference: 'https://developer.visa.com/',
    status: 'informational',
  },
] as const;

/**
 * All registries export
 */
export const REGISTRIES = {
  payment_rails: PAYMENT_RAILS,
  control_engines: CONTROL_ENGINES,
  transport_methods: TRANSPORT_METHODS,
  agent_protocols: AGENT_PROTOCOLS,
} as const;

/**
 * Find payment rail by ID
 */
export function findPaymentRail(id: string): PaymentRailEntry | undefined {
  return PAYMENT_RAILS.find((rail) => rail.id === id);
}

/**
 * Find control engine by ID
 */
export function findControlEngine(id: string): ControlEngineEntry | undefined {
  return CONTROL_ENGINES.find((engine) => engine.id === id);
}

/**
 * Find transport method by ID
 */
export function findTransportMethod(id: string): TransportMethodEntry | undefined {
  return TRANSPORT_METHODS.find((method) => method.id === id);
}

/**
 * Find agent protocol by ID
 */
export function findAgentProtocol(id: string): AgentProtocolEntry | undefined {
  return AGENT_PROTOCOLS.find((protocol) => protocol.id === id);
}
