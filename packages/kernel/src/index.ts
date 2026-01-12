/**
 * PEAC Kernel
 * Normative constants, errors, and registries for the PEAC protocol
 *
 * @packageDocumentation
 */

// Export types
export type {
  // JSON-safe types (v0.9.21+)
  JsonPrimitive,
  JsonValue,
  JsonArray,
  JsonObject,
  // Registry types
  ErrorDefinition,
  PaymentRailEntry,
  ControlEngineEntry,
  TransportMethodEntry,
  AgentProtocolEntry,
} from './types.js';

// Export constants
export {
  WIRE_TYPE,
  WIRE_VERSION,
  ALGORITHMS,
  HEADERS,
  DISCOVERY,
  JWKS,
  RECEIPT,
  LIMITS,
  CONSTANTS,
} from './constants.js';

// Export errors
export {
  ERROR_CODES,
  ERRORS,
  BUNDLE_ERRORS,
  DISPUTE_ERRORS,
  getError,
  isRetriable,
  type ErrorCode,
} from './errors.js';

// Export registries
export {
  PAYMENT_RAILS,
  CONTROL_ENGINES,
  TRANSPORT_METHODS,
  AGENT_PROTOCOLS,
  REGISTRIES,
  findPaymentRail,
  findControlEngine,
  findTransportMethod,
  findAgentProtocol,
} from './registries.js';

// Export HTTP utilities (cache safety, header management)
export { VARY_HEADERS, applyPurposeVary, getPeacVaryHeaders, needsPurposeVary } from './http.js';
