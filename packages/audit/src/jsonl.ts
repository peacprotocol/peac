/**
 * JSONL Formatting and Parsing (v0.9.27+)
 *
 * JSONL (JSON Lines) is the normative format for PEAC audit logs.
 * Each line is a complete, valid JSON object representing one audit entry.
 *
 * @see https://jsonlines.org/
 */

import type { AuditEntry, JsonlOptions, JsonlParseOptions } from './types.js';
import { isValidAuditEntry } from './entry.js';

/**
 * Format an audit entry to a single JSONL line.
 *
 * @param entry - Audit entry to format
 * @param options - Formatting options
 * @returns JSON string (single line unless pretty=true)
 *
 * @example
 * ```typescript
 * const line = formatJsonlLine(entry);
 * // '{"version":"peac.audit/0.9","id":"01ARZ...","event_type":"receipt_issued",...}'
 * ```
 */
export function formatJsonlLine(entry: AuditEntry, options?: JsonlOptions): string {
  if (options?.pretty) {
    return JSON.stringify(entry, null, 2);
  }
  return JSON.stringify(entry);
}

/**
 * Format multiple audit entries to JSONL format.
 *
 * @param entries - Array of audit entries
 * @param options - Formatting options
 * @returns JSONL string (one entry per line)
 *
 * @example
 * ```typescript
 * const jsonl = formatJsonl(entries);
 * // '{"version":"peac.audit/0.9",...}\n{"version":"peac.audit/0.9",...}'
 * ```
 */
export function formatJsonl(entries: AuditEntry[], options?: JsonlOptions): string {
  const lines = entries.map((entry) => formatJsonlLine(entry, { pretty: false }));
  const result = lines.join('\n');

  if (options?.trailingNewline && result.length > 0) {
    return result + '\n';
  }

  return result;
}

/**
 * Parse result for a single JSONL line.
 */
export interface JsonlParseLineResult {
  ok: true;
  entry: AuditEntry;
  lineNumber: number;
}

/**
 * Parse error for a single JSONL line.
 */
export interface JsonlParseLineError {
  ok: false;
  error: string;
  lineNumber: number;
  raw?: string;
}

/**
 * Parse a single JSONL line.
 *
 * @param line - JSON string to parse
 * @param lineNumber - Line number for error reporting
 * @returns Parse result with entry or error
 */
export function parseJsonlLine(
  line: string,
  lineNumber: number = 1
): JsonlParseLineResult | JsonlParseLineError {
  const trimmed = line.trim();

  // Skip empty lines
  if (trimmed.length === 0) {
    return {
      ok: false,
      error: 'Empty line',
      lineNumber,
    };
  }

  try {
    const parsed = JSON.parse(trimmed);

    if (!isValidAuditEntry(parsed)) {
      return {
        ok: false,
        error: 'Invalid audit entry structure',
        lineNumber,
        raw: trimmed.length > 100 ? trimmed.substring(0, 100) + '...' : trimmed,
      };
    }

    return {
      ok: true,
      entry: parsed,
      lineNumber,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'JSON parse error',
      lineNumber,
      raw: trimmed.length > 100 ? trimmed.substring(0, 100) + '...' : trimmed,
    };
  }
}

/**
 * Parse result for JSONL content.
 */
export interface JsonlParseResult {
  /** Successfully parsed entries */
  entries: AuditEntry[];

  /** Parse errors (if skipInvalid=true) */
  errors: JsonlParseLineError[];

  /** Total lines processed */
  totalLines: number;

  /** Lines successfully parsed */
  successCount: number;

  /** Lines that failed to parse */
  errorCount: number;
}

/**
 * Parse JSONL content to audit entries.
 *
 * @param content - JSONL string content
 * @param options - Parsing options
 * @returns Parse result with entries and errors
 *
 * @example
 * ```typescript
 * const result = parseJsonl(jsonlContent, { skipInvalid: true });
 * console.log(`Parsed ${result.successCount}/${result.totalLines} entries`);
 * ```
 */
export function parseJsonl(content: string, options?: JsonlParseOptions): JsonlParseResult {
  const lines = content.split('\n');
  const entries: AuditEntry[] = [];
  const errors: JsonlParseLineError[] = [];
  const maxLines = options?.maxLines ?? 0;
  let processed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Skip empty lines
    if (line.trim().length === 0) {
      continue;
    }

    // Check max lines limit
    if (maxLines > 0 && processed >= maxLines) {
      break;
    }

    processed++;

    const result = parseJsonlLine(line, lineNumber);

    if (result.ok) {
      entries.push(result.entry);
    } else {
      if (options?.skipInvalid) {
        errors.push(result);
      } else {
        // Return immediately on first error if not skipping
        return {
          entries,
          errors: [result],
          totalLines: processed,
          successCount: entries.length,
          errorCount: 1,
        };
      }
    }
  }

  return {
    entries,
    errors,
    totalLines: processed,
    successCount: entries.length,
    errorCount: errors.length,
  };
}

/**
 * Stream-friendly JSONL line appender.
 *
 * Creates a function that appends audit entries to a string buffer
 * in JSONL format, suitable for streaming to files or network.
 *
 * @param options - Formatting options
 * @returns Appender function
 *
 * @example
 * ```typescript
 * const appender = createJsonlAppender();
 * for (const entry of entries) {
 *   const line = appender(entry);
 *   await stream.write(line);
 * }
 * ```
 */
export function createJsonlAppender(options?: JsonlOptions): (entry: AuditEntry) => string {
  return (entry: AuditEntry): string => {
    const line = formatJsonlLine(entry, { pretty: false });
    return line + '\n';
  };
}
