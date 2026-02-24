/**
 * Content Signal Types (DD-136, DD-137)
 *
 * Types for content use policy signal observation.
 * Signals RECORD observations, never enforce (DD-95 rail neutrality).
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

/**
 * Signal source identifier (DD-137 precedence order).
 *
 * Note: Content-Signal header is reserved for a future version when a parser
 * is implemented. Only sources with shipped parsers are included here.
 */
export type SignalSource = 'tdmrep-json' | 'content-usage-header' | 'robots-txt';

/** Three-state signal decision (DD-136) */
export type SignalDecision = 'allow' | 'deny' | 'unspecified';

/**
 * Canonical purpose token for content signals.
 *
 * Subset of PEAC CanonicalPurpose relevant to content use policy signals.
 */
export type ContentPurpose = 'ai-training' | 'ai-inference' | 'ai-search' | 'ai-generative' | 'tdm';

/** Single content signal entry from a specific source */
export interface ContentSignalEntry {
  /** Purpose this signal applies to */
  purpose: ContentPurpose;
  /** Three-state decision */
  decision: SignalDecision;
  /** Which source produced this signal */
  source: SignalSource;
  /** Raw value from the source (for debugging) */
  raw_value?: string;
}

// ---------------------------------------------------------------------------
// Structured Fields types (RFC 9651)
// ---------------------------------------------------------------------------

/** SF value type classification per RFC 9651 */
export type SfValueType = 'token' | 'string' | 'boolean' | 'inner-list' | 'byte-sequence';

/** Single parsed Structured Fields Dictionary member (RFC 9651) */
export interface SfDictionaryMember {
  /** Member key (lowercase, as parsed) */
  key: string;
  /** Raw member string from the header (key=value with parameters) */
  raw: string;
  /** SF value type classification */
  valueType: SfValueType;
  /** Token value if valueType is 'token', null otherwise */
  tokenValue: string | null;
}

/** Full parse result from Content-Usage header parsing */
export interface ContentUsageParseResult {
  /** Original raw header value */
  raw: string;
  /** All parsed SF Dictionary members (known and unknown) */
  parsed: SfDictionaryMember[];
  /** Mapped signal entries for recognized AIPREF vocabulary keys */
  entries: ContentSignalEntry[];
  /** Unrecognized dictionary members (forward-compatible pass-through) */
  extensions: SfDictionaryMember[];
}

/** Aggregated content signal observation */
export interface ContentSignalObservation {
  /** When the signals were observed (ISO 8601) */
  observed_at: string;
  /** URI the signals apply to */
  target_uri: string;
  /** Resolved signals (one per purpose, highest-priority source wins) */
  signals: ContentSignalEntry[];
  /** Content digest for integrity binding */
  digest?: { alg: 'sha-256'; val: string };
  /** Which sources were checked */
  sources_checked: SignalSource[];
}

// ---------------------------------------------------------------------------
// Input types (pre-fetched content)
// ---------------------------------------------------------------------------

/** Pre-fetched robots.txt content */
export interface RobotsTxtInput {
  /** Raw text content of robots.txt */
  content: string;
}

/** Pre-fetched tdmrep.json content */
export interface TdmrepInput {
  /** Raw JSON string of tdmrep.json */
  content: string;
}

/** Pre-fetched Content-Usage header value */
export interface ContentUsageInput {
  /** Raw header value */
  value: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum input size for robots.txt (500 KB) */
export const MAX_ROBOTS_TXT_SIZE = 512000;

/** Maximum input size for tdmrep.json (64 KB) */
export const MAX_TDMREP_SIZE = 65536;

/** Maximum header value size (8 KB) */
export const MAX_HEADER_SIZE = 8192;

/**
 * AI-relevant user-agent strings for robots.txt parsing.
 *
 * Maps user-agent tokens to the content purposes they represent.
 */
export const AI_USER_AGENTS: Record<string, ContentPurpose[]> = {
  gptbot: ['ai-training', 'ai-inference'],
  'chatgpt-user': ['ai-inference'],
  'anthropic-ai': ['ai-training', 'ai-inference'],
  claudebot: ['ai-training'],
  'google-extended': ['ai-training', 'ai-generative'],
  ccbot: ['ai-training'],
  perplexitybot: ['ai-search'],
  'cohere-ai': ['ai-training', 'ai-inference'],
  bytespider: ['ai-training'],
};

/**
 * Signal source precedence (DD-137).
 * Lower index = higher priority.
 *
 * Note: Content-Signal header is reserved for a future version.
 * When implemented, it will slot between tdmrep-json and content-usage-header.
 */
export const SOURCE_PRECEDENCE: readonly SignalSource[] = [
  'tdmrep-json',
  'content-usage-header',
  'robots-txt',
] as const;
