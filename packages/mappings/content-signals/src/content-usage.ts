/**
 * Content-Usage Header Parser (AIPREF attach draft, draft-ietf-aipref-attach-04)
 *
 * Parses Content-Usage HTTP header values as Structured Fields Dictionaries
 * per RFC 9651. Maps AIPREF vocabulary keys (draft-ietf-aipref-vocab-03)
 * to PEAC ContentPurpose values.
 *
 * Scope: HTTP header parsing only. Does NOT parse robots.txt directives
 * or any other signal source. Receives pre-fetched header value (no network
 * I/O, DD-55).
 *
 * AIPREF vocabulary keys (draft-ietf-aipref-vocab-03, Table 1):
 *   - bots: Automated processing (parent of train-ai and search)
 *   - train-ai: AI training (parent of train-genai)
 *   - train-genai: Generative AI training
 *   - search: Search applications
 *
 * Values are SF Tokens: y = allow, n = disallow, anything else = unknown.
 * Bare keys (Boolean true per SF rules) are NOT y and produce unknown.
 *
 * Hierarchy propagation (Section 5.2 of vocab-03):
 *   bots -> train-ai -> train-genai
 *   bots -> search
 * When a specific key has no explicit preference, inherit from parent.
 */

import type {
  ContentSignalEntry,
  ContentPurpose,
  SignalDecision,
  SfDictionaryMember,
  SfValueType,
  ContentUsageParseResult,
} from './types.js';
import { MAX_HEADER_SIZE } from './types.js';

// ---------------------------------------------------------------------------
// AIPREF vocabulary
// ---------------------------------------------------------------------------

/**
 * All recognized AIPREF vocabulary keys (draft-ietf-aipref-vocab-03, Table 1).
 * Used for parsing; includes parent-only keys that do not produce output entries.
 */
const AIPREF_KNOWN_KEYS = new Set(['bots', 'train-ai', 'train-genai', 'search']);

/**
 * AIPREF leaf/child vocabulary keys mapped to PEAC ContentPurpose.
 * Per draft-ietf-aipref-vocab-03, Table 1.
 *
 * Note: `bots` is a parent-only key used solely for hierarchy propagation
 * (Section 5.2). It does not produce its own output entry.
 */
const AIPREF_KEY_MAP: Record<string, ContentPurpose> = {
  'train-ai': 'ai-training',
  'train-genai': 'ai-generative',
  search: 'ai-search',
};

/**
 * Hierarchy for AIPREF propagation (Section 5.2 of vocab-03).
 * Maps each key to its parent key. Root keys have no parent.
 */
const AIPREF_PARENT: Record<string, string | undefined> = {
  'train-genai': 'train-ai',
  'train-ai': 'bots',
  search: 'bots',
  bots: undefined,
};

// ---------------------------------------------------------------------------
// Structured Fields Dictionary Parser (RFC 9651 subset)
// ---------------------------------------------------------------------------

/**
 * Classify SF value type from the raw value portion of a member.
 */
function classifySfValue(valPart: string): { valueType: SfValueType; tokenValue: string | null } {
  if (valPart.startsWith('"')) {
    return { valueType: 'string', tokenValue: null };
  }
  if (valPart.startsWith('?')) {
    return { valueType: 'boolean', tokenValue: null };
  }
  if (valPart.startsWith('(')) {
    return { valueType: 'inner-list', tokenValue: null };
  }
  if (valPart.startsWith(':')) {
    return { valueType: 'byte-sequence', tokenValue: null };
  }
  // Token value (alphanumeric + limited special chars per RFC 9651)
  const tokenValue = valPart === 'y' || valPart === 'n' ? valPart : null;
  return { valueType: 'token', tokenValue };
}

/**
 * Parse an SF Dictionary header value (RFC 9651, Section 4.2.2).
 *
 * This is a minimal parser sufficient for AIPREF Content-Usage headers.
 * Handles: Token values, String values, Boolean bare items,
 * parameters (stripped). Does NOT handle Inner Lists.
 */
function parseSfDictionary(input: string): SfDictionaryMember[] {
  const members: SfDictionaryMember[] = [];
  const parts = input.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const raw = trimmed;
    const eqIdx = trimmed.indexOf('=');

    if (eqIdx === -1) {
      // Bare key: per SF rules, this is Boolean true, not Token y/n
      const key = stripParams(trimmed).trim().toLowerCase();
      if (key) {
        members.push({ key, raw, valueType: 'boolean', tokenValue: null });
      }
      continue;
    }

    const key = trimmed.slice(0, eqIdx).trim().toLowerCase();
    let valPart = trimmed.slice(eqIdx + 1).trim();

    // Strip parameters from value (;key=value portions)
    valPart = stripParams(valPart).trim();

    const { valueType, tokenValue } = classifySfValue(valPart);
    members.push({ key, raw, valueType, tokenValue });
  }

  return members;
}

/**
 * Strip SF parameters from a value or bare key.
 * Parameters start with ';' and are key=value or key pairs.
 */
function stripParams(s: string): string {
  const semiIdx = s.indexOf(';');
  return semiIdx === -1 ? s : s.slice(0, semiIdx);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse Content-Usage header value and extract signal entries.
 *
 * Implements the AIPREF attach draft (draft-ietf-aipref-attach-04) with
 * vocabulary from draft-ietf-aipref-vocab-03. Header is parsed as an
 * SF Dictionary (RFC 9651). Values must be Tokens: y = allow, n = disallow.
 *
 * Returns a structured result preserving all parse pipeline stages:
 * - `raw`: original header string
 * - `parsed`: all SF Dictionary members (known and unknown)
 * - `entries`: mapped signal entries for recognized AIPREF keys
 * - `extensions`: unrecognized dictionary members (forward-compatible)
 *
 * Scope: HTTP Content-Usage header only. Does not handle robots.txt
 * or any other signal source.
 *
 * @param value - Raw Content-Usage header value (pre-fetched)
 * @returns Structured parse result with entries and extensions
 */
export function parseContentUsage(value: string): ContentUsageParseResult {
  const emptyResult: ContentUsageParseResult = {
    raw: value,
    parsed: [],
    entries: [],
    extensions: [],
  };

  if (value.length > MAX_HEADER_SIZE) {
    return emptyResult;
  }

  // Step 1: Parse SF Dictionary
  const sfMembers = parseSfDictionary(value);

  // Step 2: Build raw preference map for known AIPREF keys
  // Track all known AIPREF keys (including parent-only keys like bots) for inheritance.
  // Separate unknown keys into extensions (forward-compatible pass-through).
  const rawPrefs = new Map<string, { decision: SignalDecision; raw: string }>();
  const extensions: SfDictionaryMember[] = [];

  for (const member of sfMembers) {
    if (!AIPREF_KNOWN_KEYS.has(member.key)) {
      // Unknown key: store as extension (never drop)
      extensions.push(member);
      continue;
    }

    let decision: SignalDecision;
    if (member.tokenValue === 'y') {
      decision = 'allow';
    } else if (member.tokenValue === 'n') {
      decision = 'deny';
    } else {
      decision = 'unspecified'; // Non-Token, unknown Token, or bare key
    }

    // Last value wins (SF Dictionary duplicate key rule)
    rawPrefs.set(member.key, { decision, raw: member.raw });
  }

  // Step 3: Apply hierarchy propagation (Section 5.2 of vocab-03)
  // For each leaf AIPREF key, if preference is missing or unspecified,
  // inherit from parent.
  const resolvedPrefs = new Map<string, { decision: SignalDecision; raw: string }>();
  for (const aiprefKey of Object.keys(AIPREF_KEY_MAP)) {
    const explicit = rawPrefs.get(aiprefKey);
    if (explicit && explicit.decision !== 'unspecified') {
      resolvedPrefs.set(aiprefKey, explicit);
      continue;
    }

    // Walk up hierarchy for inheritance
    let current: string | undefined = AIPREF_PARENT[aiprefKey];
    let inherited: { decision: SignalDecision; raw: string } | undefined;
    while (current) {
      const parentPref = rawPrefs.get(current);
      if (parentPref && parentPref.decision !== 'unspecified') {
        inherited = {
          decision: parentPref.decision,
          raw: `${aiprefKey} (inherited from ${current}=${parentPref.raw})`,
        };
        break;
      }
      current = AIPREF_PARENT[current];
    }

    if (inherited) {
      resolvedPrefs.set(aiprefKey, inherited);
    }
    // If no inheritance found, key stays absent (unspecified)
  }

  // Step 4: Convert to ContentSignalEntry
  const entries: ContentSignalEntry[] = [];
  for (const [aiprefKey, pref] of resolvedPrefs) {
    const purpose = AIPREF_KEY_MAP[aiprefKey];
    if (!purpose) continue;

    entries.push({
      purpose,
      decision: pref.decision,
      source: 'content-usage-header',
      raw_value: pref.raw,
    });
  }

  return {
    raw: value,
    parsed: sfMembers,
    entries,
    extensions,
  };
}
