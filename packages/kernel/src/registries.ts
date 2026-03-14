/**
 * PEAC Protocol Registries
 *
 * BACKWARD-COMPATIBILITY BARREL: re-exports from registries.generated.ts.
 * The generated file is the single source of truth (specs/kernel/registries.json).
 *
 * This file exists solely for the ./registries subpath export in package.json.
 * All registry data, types, and finder functions come from the generated file.
 *
 * v0.12.2 (DD-183): migrated from manual sync to codegen.
 */

// Re-export everything from the generated file
export {
  PAYMENT_RAILS,
  CONTROL_ENGINES,
  TRANSPORT_METHODS,
  AGENT_PROTOCOLS,
  PROOF_TYPES,
  RECEIPT_TYPES,
  EXTENSION_GROUPS,
  PILLAR_VALUES,
  TYPE_TO_EXTENSION_MAP,
  REGISTRIES,
  findPaymentRail,
  findControlEngine,
  findTransportMethod,
  findAgentProtocol,
  findProofType,
  findReceiptType,
  findExtensionGroup,
} from './registries.generated.js';

export type {
  ProofTypeEntry,
  ReceiptTypeEntry,
  ExtensionGroupEntry,
} from './registries.generated.js';
