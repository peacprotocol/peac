/**
 * @peac/cli - PEAC Protocol CLI utilities
 * Provides discovery, hashing, and verification commands
 */

export { DiscoverCommand } from './commands/discover';
export { HashCommand } from './commands/hash';
export { VerifyCommand } from './commands/verify';
export { formatOutput, createExitHandler } from './utils';
export type { CLIOptions, CommandResult } from './types';
