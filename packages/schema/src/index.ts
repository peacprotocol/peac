/**
 * PEAC Protocol Schema Package
 * Wire format frozen at peac.receipt/0.9 with v1.0-equivalent semantics
 */

// Core envelope and types
export * from './envelope';
export * from './control';
export * from './evidence';
export * from './errors';

// Legacy types (for backward compatibility in tests)
export * from './constants';
export * from './types';

// Validators (explicit exports to avoid name conflicts with types)
export {
  NormalizedPayment,
  Extensions,
  JWSHeader,
  ReceiptClaims,
  Subject as SubjectSchema,
  AIPREFSnapshot as AIPREFSnapshotSchema,
  VerifyRequest as VerifyRequestSchema,
} from './validators';

// Envelope types (v0.9.15+ normative structure)
export type {
  PEACEnvelope,
  AuthContext,
  EvidenceBlock,
  MetadataBlock,
  EnforcementContext,
  TransportBinding,
  ContextMetadata,
} from './envelope';
