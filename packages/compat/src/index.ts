// Workspace-private internal scaffold. NOT published.
//
// This package holds the migration-class taxonomy and the archival-export
// type surface. v0.13.1 is the scaffold release; future releases finalize
// the normative documents under docs/specs/ and add reader/writer
// implementations.
//
// IMPORTANT: no published package depends on this package at runtime.
// @peac/protocol does NOT import from this package, even from its
// _internal/ source tree. The protocol-private-imports tooling test
// asserts this invariant.

export type { MigrationClass, MigrationVerdict } from './taxonomy.js';
export { classifyMigration } from './taxonomy.js';
export type { ArchivalRecord, ArchivalBundle } from './archival-export.js';
