/**
 * Local internal type union for the record-core internal modules.
 *
 * @internal
 *
 * If protocol internals need a migration-class literal in the future,
 * define it here. Importing the equivalent type from a workspace-private
 * package is forbidden by the protocol-private-imports tooling test (which
 * walks packages/protocol/src/** for forbidden import specifiers).
 *
 * v0.13.1 has no live consumer for this type; it exists as the named
 * landing point for a future inline definition.
 */

export type InternalMigrationClass = 'exact' | 'derived' | 'lossy' | 'impossible';
