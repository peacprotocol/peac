/**
 * PEAC Protocol v0.9.6 Privacy and Data Protection Module
 *
 * Comprehensive data protection and privacy compliance system
 */

export { DataProtectionManager, createDataProtectionManager } from './data-protection';
export { createPrivacyRouter } from './http';
export type {
  DataClassification,
  ConsentRecord,
  DataRequest,
  EncryptionConfig,
  AuditEvent,
} from './data-protection';
