/**
 * Internal record-core barrel.
 *
 * @internal
 *
 * NOT re-exported from packages/protocol/src/index.ts. Internal callers
 * inside @peac/protocol use relative imports either to this barrel or
 * (for narrower targeting) directly to the sub-modules.
 */

export { defaultCodec, getCodec, _registeredCodecNames, CodecError } from './codec/index.js';
export type { CodecHeader, RecordCodec } from './codec/index.js';
export { normalize } from './normalize.js';
export type { InternalMigrationClass } from './types.js';
