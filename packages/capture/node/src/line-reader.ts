/**
 * @peac/capture-node - Streaming Line Reader
 *
 * Custom streaming line parser that enforces maxLineBytes BEFORE
 * materializing the line as a JS string. Prevents memory blowup from
 * a single gigantic line -- the primary "local file DoS" vector.
 *
 * Used by both FsSpoolStore.read() and FsSpoolStore.fullScan().
 *
 * Design notes:
 * - Splits on \n (0x0a). Trailing \r is stripped before yielding (CRLF safe).
 * - Once a line exceeds maxLineBytes, buffered chunks are freed immediately
 *   and accumulatedBytes is capped at maxLineBytes+1 to avoid huge counters
 *   on pathological files.
 */

import { createReadStream } from 'node:fs';

// =============================================================================
// Types
// =============================================================================

export interface LineReaderOptions {
  /** Path to the file to read. */
  filePath: string;
  /** Maximum line length in bytes. Lines exceeding this trigger onLineTooLarge. */
  maxLineBytes: number;
  /** Read buffer size. Default: 64KB. */
  highWaterMark?: number;
}

/**
 * Result of reading a line.
 */
export type LineResult =
  | { kind: 'line'; line: string; byteOffset: number; byteLength: number }
  | { kind: 'line_too_large'; byteOffset: number; accumulatedBytes: number }
  | { kind: 'incomplete_tail'; line: string; byteOffset: number; byteLength: number };

// =============================================================================
// Helpers
// =============================================================================

/**
 * Strip a single trailing \r from a buffer (CRLF -> LF normalization).
 * Returns the same buffer if no trailing \r.
 */
function stripTrailingCR(buf: Buffer): Buffer {
  if (buf.length > 0 && buf[buf.length - 1] === 0x0d) {
    return buf.subarray(0, buf.length - 1);
  }
  return buf;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Stream lines from a file with pre-materialization size enforcement.
 *
 * Yields LineResult for each line. The caller decides how to handle each case:
 * - 'line': a complete, size-safe line (without trailing newline or \r)
 * - 'line_too_large': a line that exceeded maxLineBytes (bytes were NOT materialized)
 * - 'incomplete_tail': the last line had no trailing newline (potential crash artifact)
 */
export async function* streamLines(options: LineReaderOptions): AsyncGenerator<LineResult> {
  const { filePath, maxLineBytes, highWaterMark = 64 * 1024 } = options;

  const stream = createReadStream(filePath, { highWaterMark });

  // Accumulate bytes for the current line
  let chunks: Buffer[] = [];
  let accumulatedBytes = 0;
  let lineStartOffset = 0;
  let fileOffset = 0;
  let lineTooLarge = false;

  try {
    for await (const rawChunk of stream) {
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);

      let chunkOffset = 0;

      while (chunkOffset < chunk.length) {
        const newlineIndex = chunk.indexOf(0x0a, chunkOffset); // '\n'

        if (newlineIndex === -1) {
          // No newline in remaining chunk -- accumulate
          const remainder = chunk.subarray(chunkOffset);
          accumulatedBytes += remainder.length;

          if (accumulatedBytes > maxLineBytes) {
            if (!lineTooLarge) {
              // First time exceeding: free buffered chunks immediately
              chunks = [];
              lineTooLarge = true;
            }
            // Cap counter to avoid huge values on pathological files
            accumulatedBytes = maxLineBytes + 1;
          } else {
            chunks.push(Buffer.from(remainder));
          }

          fileOffset += remainder.length;
          chunkOffset = chunk.length;
        } else {
          // Found newline -- complete the line
          const segment = chunk.subarray(chunkOffset, newlineIndex);
          const segmentLength = segment.length;
          accumulatedBytes += segmentLength;

          if (lineTooLarge || accumulatedBytes > maxLineBytes) {
            // Line exceeded maxLineBytes -- yield error without materializing string
            yield {
              kind: 'line_too_large',
              byteOffset: lineStartOffset,
              accumulatedBytes: lineTooLarge ? maxLineBytes + 1 : accumulatedBytes,
            };
          } else {
            // Safe to materialize -- combine chunks into string
            chunks.push(Buffer.from(segment));
            let lineBuffer = chunks.length === 1 ? chunks[0]! : Buffer.concat(chunks);
            // Strip trailing \r (CRLF normalization)
            lineBuffer = stripTrailingCR(lineBuffer);
            const line = lineBuffer.toString('utf-8');

            yield {
              kind: 'line',
              line,
              byteOffset: lineStartOffset,
              byteLength: accumulatedBytes,
            };
          }

          // Reset for next line
          // +1 for the newline character itself
          fileOffset += segmentLength + 1;
          lineStartOffset = fileOffset;
          chunks = [];
          accumulatedBytes = 0;
          lineTooLarge = false;
          chunkOffset = newlineIndex + 1;
        }
      }
    }

    // Handle remaining data (no trailing newline = incomplete tail)
    if (accumulatedBytes > 0) {
      if (lineTooLarge || accumulatedBytes > maxLineBytes) {
        yield {
          kind: 'line_too_large',
          byteOffset: lineStartOffset,
          accumulatedBytes: lineTooLarge ? maxLineBytes + 1 : accumulatedBytes,
        };
      } else {
        let lineBuffer = chunks.length === 1 ? chunks[0]! : Buffer.concat(chunks);
        // Strip trailing \r (CRLF normalization)
        lineBuffer = stripTrailingCR(lineBuffer);
        const line = lineBuffer.toString('utf-8');

        yield {
          kind: 'incomplete_tail',
          line,
          byteOffset: lineStartOffset,
          byteLength: accumulatedBytes,
        };
      }
    }
  } finally {
    stream.destroy();
  }
}

/**
 * Truncate a file to a specific byte offset.
 * Used for crash recovery: truncate to last valid newline.
 */
export async function truncateFile(filePath: string, byteOffset: number): Promise<void> {
  const { truncate } = await import('node:fs/promises');
  await truncate(filePath, byteOffset);
}
