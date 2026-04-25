// Internal facade: re-export adapter registries from public @peac/kernel.
// See verifier-context.ts for the design rationale.

export {
  PAYMENT_RAILS,
  CONTROL_ENGINES,
  TRANSPORT_METHODS,
  AGENT_PROTOCOLS,
  findPaymentRail,
  findControlEngine,
  findTransportMethod,
  findAgentProtocol,
} from '@peac/kernel';

export type {
  PaymentRailEntry,
  ControlEngineEntry,
  TransportMethodEntry,
  AgentProtocolEntry,
} from '@peac/kernel';
