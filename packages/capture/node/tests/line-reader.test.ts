/**
 * Tests for the streaming line reader.
 *
 * Covers: basic parsing, CRLF handling, maxLineBytes enforcement,
 * incomplete tails, empty files, and randomized chunk boundary fuzz testing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { streamLines, truncateFile } from '../src/line-reader.js';
import type { LineResult } from '../src/line-reader.js';

// =============================================================================
// Helpers
// =============================================================================

async function collectLines(
  filePath: string,
  maxLineBytes: number,
  highWaterMark?: number
): Promise<LineResult[]> {
  const results: LineResult[] = [];
  for await (const result of streamLines({ filePath, maxLineBytes, highWaterMark })) {
    results.push(result);
  }
  return results;
}

describe('streamLines', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'peac-linereader-'));
    filePath = path.join(tmpDir, 'test.jsonl');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ===========================================================================
  // Basic Parsing
  // ===========================================================================

  it('reads lines from a simple file', async () => {
    await fs.writeFile(filePath, 'line1\nline2\nline3\n', 'utf-8');
    const results = await collectLines(filePath, 1024);

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      kind: 'line',
      line: 'line1',
      byteOffset: 0,
      byteLength: 5,
    });
    expect(results[1]).toEqual({
      kind: 'line',
      line: 'line2',
      byteOffset: 6,
      byteLength: 5,
    });
    expect(results[2]).toEqual({
      kind: 'line',
      line: 'line3',
      byteOffset: 12,
      byteLength: 5,
    });
  });

  it('handles empty file', async () => {
    await fs.writeFile(filePath, '', 'utf-8');
    const results = await collectLines(filePath, 1024);
    expect(results).toHaveLength(0);
  });

  it('handles file with only newlines', async () => {
    await fs.writeFile(filePath, '\n\n\n', 'utf-8');
    const results = await collectLines(filePath, 1024);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.kind === 'line' && r.line === '')).toBe(true);
  });

  it('handles single line with trailing newline', async () => {
    await fs.writeFile(filePath, 'hello\n', 'utf-8');
    const results = await collectLines(filePath, 1024);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kind: 'line', line: 'hello' });
  });

  // ===========================================================================
  // Incomplete Tail
  // ===========================================================================

  it('yields incomplete_tail for last line without newline', async () => {
    await fs.writeFile(filePath, 'line1\nincomplete', 'utf-8');
    const results = await collectLines(filePath, 1024);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ kind: 'line', line: 'line1' });
    expect(results[1]).toMatchObject({
      kind: 'incomplete_tail',
      line: 'incomplete',
      byteOffset: 6,
      byteLength: 10,
    });
  });

  it('yields incomplete_tail for single line without newline', async () => {
    await fs.writeFile(filePath, 'only line', 'utf-8');
    const results = await collectLines(filePath, 1024);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      kind: 'incomplete_tail',
      line: 'only line',
      byteOffset: 0,
    });
  });

  // ===========================================================================
  // CRLF Handling
  // ===========================================================================

  it('strips trailing \\r from CRLF lines', async () => {
    await fs.writeFile(filePath, 'line1\r\nline2\r\nline3\r\n', 'utf-8');
    const results = await collectLines(filePath, 1024);

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ kind: 'line', line: 'line1' });
    expect(results[1]).toMatchObject({ kind: 'line', line: 'line2' });
    expect(results[2]).toMatchObject({ kind: 'line', line: 'line3' });
  });

  it('strips trailing \\r from incomplete tail', async () => {
    await fs.writeFile(filePath, 'line1\r\ntail\r', 'utf-8');
    const results = await collectLines(filePath, 1024);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ kind: 'line', line: 'line1' });
    expect(results[1]).toMatchObject({ kind: 'incomplete_tail', line: 'tail' });
  });

  it('handles mixed LF and CRLF', async () => {
    await fs.writeFile(filePath, 'lf\ncrlf\r\nlf2\n', 'utf-8');
    const results = await collectLines(filePath, 1024);

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ kind: 'line', line: 'lf' });
    expect(results[1]).toMatchObject({ kind: 'line', line: 'crlf' });
    expect(results[2]).toMatchObject({ kind: 'line', line: 'lf2' });
  });

  // ===========================================================================
  // maxLineBytes Enforcement
  // ===========================================================================

  it('yields line_too_large for oversized lines', async () => {
    const bigLine = 'x'.repeat(200);
    await fs.writeFile(filePath, `small\n${bigLine}\nafter\n`, 'utf-8');
    const results = await collectLines(filePath, 100);

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ kind: 'line', line: 'small' });
    expect(results[1]).toMatchObject({ kind: 'line_too_large' });
    expect(results[2]).toMatchObject({ kind: 'line', line: 'after' });
  });

  it('frees memory when line exceeds maxLineBytes', async () => {
    // Write a huge line (1MB) -- if chunks aren't freed, we'd hold up to 1MB
    const hugeLine = 'x'.repeat(1024 * 1024);
    await fs.writeFile(filePath, `small\n${hugeLine}\nafter\n`, 'utf-8');
    const results = await collectLines(filePath, 1000);

    expect(results[0]).toMatchObject({ kind: 'line', line: 'small' });
    expect(results[1]).toMatchObject({ kind: 'line_too_large' });
    // accumulatedBytes is capped at maxLineBytes+1
    if (results[1].kind === 'line_too_large') {
      expect(results[1].accumulatedBytes).toBe(1001);
    }
    expect(results[2]).toMatchObject({ kind: 'line', line: 'after' });
  });

  it('yields line_too_large for oversized incomplete tail', async () => {
    const bigTail = 'x'.repeat(200);
    await fs.writeFile(filePath, `small\n${bigTail}`, 'utf-8');
    const results = await collectLines(filePath, 100);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ kind: 'line', line: 'small' });
    expect(results[1]).toMatchObject({ kind: 'line_too_large' });
  });

  // ===========================================================================
  // truncateFile
  // ===========================================================================

  it('truncateFile truncates to exact byte offset', async () => {
    await fs.writeFile(filePath, 'line1\nline2\ngarbage', 'utf-8');
    const offset = Buffer.byteLength('line1\nline2\n', 'utf-8');
    await truncateFile(filePath, offset);

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('line1\nline2\n');
  });

  // ===========================================================================
  // Randomized Chunk Boundary Fuzz
  // ===========================================================================

  it('produces correct results regardless of chunk boundaries', async () => {
    // Generate test data with known lines
    const lines = ['short', 'medium line here', '', 'another', 'x'.repeat(50), 'last'];
    const content = lines.map((l) => l + '\n').join('');
    await fs.writeFile(filePath, content, 'utf-8');

    // Test with various highWaterMark values that create different chunk boundaries
    const watermarks = [1, 2, 3, 5, 7, 11, 16, 32, 64, 128, 1024];

    for (const hwm of watermarks) {
      const results = await collectLines(filePath, 1024, hwm);
      expect(results).toHaveLength(lines.length);

      for (let i = 0; i < lines.length; i++) {
        const r = results[i];
        expect(r.kind).toBe('line');
        if (r.kind === 'line') {
          expect(r.line).toBe(lines[i]);
        }
      }
    }
  });

  it('correct byteOffset across varied chunk boundaries', async () => {
    const content = 'abc\ndef\nghi\n';
    await fs.writeFile(filePath, content, 'utf-8');

    const watermarks = [1, 2, 3, 4, 5, 7, 12, 64];

    for (const hwm of watermarks) {
      const results = await collectLines(filePath, 1024, hwm);
      expect(results).toHaveLength(3);

      // abc starts at 0, def at 4, ghi at 8
      expect(results[0]).toMatchObject({ kind: 'line', line: 'abc', byteOffset: 0, byteLength: 3 });
      expect(results[1]).toMatchObject({ kind: 'line', line: 'def', byteOffset: 4, byteLength: 3 });
      expect(results[2]).toMatchObject({ kind: 'line', line: 'ghi', byteOffset: 8, byteLength: 3 });
    }
  });

  it('maxLineBytes enforcement works across chunk boundaries', async () => {
    // Line is 10 bytes, but we read in 3-byte chunks -- the limit must still trigger
    const content = '0123456789\nshort\n';
    await fs.writeFile(filePath, content, 'utf-8');

    const results = await collectLines(filePath, 5, 3);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ kind: 'line_too_large' });
    expect(results[1]).toMatchObject({ kind: 'line', line: 'short' });
  });

  it('CRLF stripping works across chunk boundaries', async () => {
    // \r\n split across chunk boundary
    const content = 'ab\r\ncd\r\n';
    await fs.writeFile(filePath, content, 'utf-8');

    // highWaterMark=3 means chunks: "ab\r" | "\ncd" | "\r\n"
    const results = await collectLines(filePath, 1024, 3);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ kind: 'line', line: 'ab' });
    expect(results[1]).toMatchObject({ kind: 'line', line: 'cd' });
  });

  it('handles randomized line lengths and chunk sizes', async () => {
    // Generate random lines of varying lengths
    const rng = (n: number) => Math.floor(Math.abs(Math.sin(n * 1337 + 42)) * n);
    const lineCount = 20;
    const lines: string[] = [];
    for (let i = 0; i < lineCount; i++) {
      const len = rng(i + 1) % 100;
      lines.push('a'.repeat(len));
    }
    const content = lines.map((l) => l + '\n').join('');
    await fs.writeFile(filePath, content, 'utf-8');

    // Test with prime-number chunk sizes to maximize boundary variety
    const watermarks = [1, 3, 7, 13, 37, 97, 256];

    for (const hwm of watermarks) {
      const results = await collectLines(filePath, 1024, hwm);
      expect(results).toHaveLength(lineCount);

      for (let i = 0; i < lineCount; i++) {
        const r = results[i];
        expect(r.kind).toBe('line');
        if (r.kind === 'line') {
          expect(r.line).toBe(lines[i]);
        }
      }
    }
  });
});
