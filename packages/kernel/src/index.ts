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
  NextAction,
  ErrorDefinition,
  ErrorCategory,
  PaymentRailEntry,
  ControlEngineEntry,
  TransportMethodEntry,
  AgentProtocolEntry,
} from './types.js';

// Export error categories (generated from specs/kernel/errors.json)
export { ERROR_CATEGORIES } from './types.js';

// Export constants
export {
  WIRE_TYPE,
  WIRE_VERSION,
  ALGORITHMS,
  HEADERS,
  POLICY,
  ISSUER_CONFIG,
  DISCOVERY, // @deprecated - use POLICY instead
  JWKS,
  RECEIPT,
  LIMITS,
  BUNDLE_VERSION,
  VERIFICATION_REPORT_VERSION,
  HASH,
  parseHash,
  formatHash,
  isValidHash,
  // Verifier constants (v0.10.8+)
  VERIFIER_LIMITS,
  VERIFIER_NETWORK,
  PRIVATE_IP_RANGES,
  VERIFIER_POLICY_VERSION,
  VERIFICATION_MODES,
  CONSTANTS,
} from './constants.js';

// Export errors
export {
  ERROR_CODES,
  ERRORS,
  BUNDLE_ERRORS,
  DISPUTE_ERRORS,
  getError,
  isRetryable,
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

// Evidence Carrier Contract types (v0.11.1+ DD-124)
export { PEAC_RECEIPT_HEADER, PEAC_RECEIPT_URL_HEADER } from './carrier.js';
export type {
  ReceiptRef,
  CarrierFormat,
  PeacEvidenceCarrier,
  CarrierMeta,
  CarrierValidationResult,
  CarrierAdapter,
} from './carrier.js';
