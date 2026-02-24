/**
 * @peac/mappings-content-signals
 *
 * Content use policy signal parsing for PEAC Protocol (DD-136, DD-137).
 *
 * Parses content use signals from multiple sources and resolves them
 * using priority precedence. Signals RECORD observations, never enforce.
 *
 * Supported sources:
 * - robots.txt (RFC 9309)
 * - tdmrep.json (EU TDM Directive 2019/790, Art. 4)
 * - Content-Usage header (AIPREF draft, RFC 9651)
 *
 * All parsers receive pre-fetched content (no network I/O, DD-55).
 */

// Types
export type {
  SignalSource,
  SignalDecision,
  ContentPurpose,
  ContentSignalEntry,
  ContentSignalObservation,
  RobotsTxtInput,
  TdmrepInput,
  ContentUsageInput,
  SfValueType,
  SfDictionaryMember,
  ContentUsageParseResult,
} from './types.js';

export {
  AI_USER_AGENTS,
  SOURCE_PRECEDENCE,
  MAX_ROBOTS_TXT_SIZE,
  MAX_TDMREP_SIZE,
  MAX_HEADER_SIZE,
} from './types.js';

// Parsers
export { parseRobotsTxt } from './robots.js';
export { parseTdmrep } from './tdmrep.js';
export { parseContentUsage } from './content-usage.js';

// Resolution
export {
  resolveSignals,
  getSourcePrecedence,
  hasHigherPriority,
  getDecisionForPurpose,
} from './resolve.js';

// Observation factory
export { createObservation } from './observation.js';
export type { CreateObservationInput } from './observation.js';
