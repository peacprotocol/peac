// Workspace-private internal facade. Re-exports the same public constants
// from @peac/kernel grouped into ergonomic sub-modules. Identity is preserved
// (constants are the SAME object references); never duplicated.
//
// Public consumers MUST import from @peac/kernel directly.
//
// Internal consumers may import from a sub-module path:
//   import { POLICY } from '@peac/registries/verifier-context';
//   import { PAYMENT_RAILS } from '@peac/registries/adapters';
//   import { EXTENSION_GROUPS } from '@peac/registries/extensions';
//   import { PROOF_TYPES } from '@peac/registries/proofs-and-receipts';
//
// or from the barrel for the composite REGISTRIES object plus everything else.

export * from './verifier-context.js';
export * from './adapters.js';
export * from './extensions.js';
export * from './proofs-and-receipts.js';

// Composite registries object (public from @peac/kernel; re-exported here for
// internal consumers that want a single entry point).
export { REGISTRIES } from '@peac/kernel';
