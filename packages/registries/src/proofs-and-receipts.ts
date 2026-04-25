// Internal facade: re-export proof / receipt / pillar registries from public
// @peac/kernel. See verifier-context.ts for the design rationale.

export {
  PROOF_TYPES,
  RECEIPT_TYPES,
  PILLAR_VALUES,
  findProofType,
  findReceiptType,
} from '@peac/kernel';

export type { ProofTypeEntry, ReceiptTypeEntry } from '@peac/kernel';
