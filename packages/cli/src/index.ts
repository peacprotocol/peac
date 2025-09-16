/**
 * @peac/cli - PEAC Protocol CLI utilities
 * Provides discovery, hashing, and verification commands
 */

export { DiscoverCommand } from './commands/discover.js';
export { HashCommand } from './commands/hash.js';
export { VerifyCommand } from './commands/verify.js';
export { formatOutput, createExitHandler } from './utils.js';
export type { CLIOptions, CommandResult } from './types.js';
