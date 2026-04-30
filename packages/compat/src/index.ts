// Workspace-private package contract. NOT published.
//
// This package holds the migration-class taxonomy and the archival-export
// reader / writer / validator. The exports describe a workspace-private
// package contract; they are not a public protocol surface and not a
// stable cross-organization interchange format.
//
// IMPORTANT: no published package depends on this package at runtime.
// @peac/protocol does NOT import from this package, even from its
// _internal/ source tree. The protocol-private-imports tooling test
// asserts this invariant.

export type { MigrationClass, MigrationVerdict } from './taxonomy.js';
export { classifyMigration } from './taxonomy.js';
export type {
  ArchivalRecord,
  ArchivalBundle,
  ArchivalValidationFailure,
  ArchivalValidationResult,
} from './archival-export.js';
export {
  ARCHIVAL_BUNDLE_VERSION,
  serializeArchivalBundle,
  parseArchivalBundle,
  validateArchivalBundle,
} from './archival-export.js';
