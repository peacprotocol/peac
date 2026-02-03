/**
 * @peac/capture-core/testkit
 *
 * In-memory implementations for testing.
 * NOT for production use - use @peac/capture-node for durable storage.
 *
 * @example
 * ```typescript
 * import {
 *   createInMemorySpoolStore,
 *   createInMemoryDedupeIndex,
 * } from '@peac/capture-core/testkit';
 * ```
 */

export {
  InMemorySpoolStore,
  InMemoryDedupeIndex,
  createInMemorySpoolStore,
  createInMemoryDedupeIndex,
} from './memory';
