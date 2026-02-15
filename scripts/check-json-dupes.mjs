#!/usr/bin/env node
/**
 * check-json-dupes.mjs
 *
 * Detects duplicate keys in JSON files. JSON parsers silently accept
 * duplicates (last-write-wins), which causes heisenbugs.
 *
 * Usage:
 *   node scripts/check-json-dupes.mjs <file1> <file2> ...
 *   git ls-files -- '*.json' | node scripts/check-json-dupes.mjs --stdin
 *
 * Exits 0 if no duplicates, 1 if any found.
 */

import { readFileSync } from 'fs';
import { createInterface } from 'readline';

/**
 * Parse JSON text and detect duplicate keys at any nesting depth.
 * Uses a character-by-character state machine -- no eval, no reviver hacks.
 */
function findDuplicateKeys(text, filePath) {
  const dupes = [];
  // Stack of { keys: Set } for each nested object
  const stack = [];
  let i = 0;
  const len = text.length;

  function skipWhitespace() {
    while (i < len && ' \t\n\r'.includes(text[i])) i++;
  }

  function parseString() {
    if (text[i] !== '"') throw new Error(`Expected " at offset ${i}`);
    i++; // skip opening quote
    let result = '';
    while (i < len) {
      const ch = text[i];
      if (ch === '\\') {
        i++;
        if (i < len) {
          result += text[i];
          i++;
        }
      } else if (ch === '"') {
        i++; // skip closing quote
        return result;
      } else {
        result += ch;
        i++;
      }
    }
    throw new Error(`Unterminated string at offset ${i}`);
  }

  function skipValue() {
    skipWhitespace();
    if (i >= len) return;
    const ch = text[i];
    if (ch === '"') {
      parseString();
    } else if (ch === '{') {
      parseObject();
    } else if (ch === '[') {
      parseArray();
    } else {
      // number, true, false, null
      while (i < len && !'  \t\n\r,}]'.includes(text[i])) i++;
    }
  }

  function lineCol(offset) {
    let line = 1;
    let col = 1;
    for (let j = 0; j < offset && j < len; j++) {
      if (text[j] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
    }
    return { line, col };
  }

  function parseObject() {
    i++; // skip {
    const keys = new Set();
    stack.push(keys);
    skipWhitespace();
    if (i < len && text[i] === '}') {
      i++;
      stack.pop();
      return;
    }
    while (i < len) {
      skipWhitespace();
      const keyOffset = i;
      const key = parseString();
      if (keys.has(key)) {
        const pos = lineCol(keyOffset);
        dupes.push({
          file: filePath,
          line: pos.line,
          col: pos.col,
          key,
        });
      }
      keys.add(key);
      skipWhitespace();
      if (text[i] === ':') i++; // skip colon
      skipValue();
      skipWhitespace();
      if (text[i] === ',') {
        i++;
      } else if (text[i] === '}') {
        i++;
        stack.pop();
        return;
      }
    }
    stack.pop();
  }

  function parseArray() {
    i++; // skip [
    skipWhitespace();
    if (i < len && text[i] === ']') {
      i++;
      return;
    }
    while (i < len) {
      skipValue();
      skipWhitespace();
      if (text[i] === ',') {
        i++;
      } else if (text[i] === ']') {
        i++;
        return;
      }
    }
  }

  try {
    skipWhitespace();
    if (i < len) {
      if (text[i] === '{') parseObject();
      else if (text[i] === '[') parseArray();
    }
  } catch {
    // Malformed JSON -- let other tools (tsc, eslint) report parse errors
  }

  return dupes;
}

async function main() {
  const args = process.argv.slice(2);
  const stdinMode = args.includes('--stdin');

  let files = [];

  if (stdinMode) {
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        files.push(trimmed);
      }
    }
  } else {
    files = args.filter((f) => !f.startsWith('-'));
  }

  if (files.length === 0 && !stdinMode) {
    console.error('Usage:');
    console.error('  node scripts/check-json-dupes.mjs <file1> <file2> ...');
    console.error("  git ls-files -- '*.json' | node scripts/check-json-dupes.mjs --stdin");
    process.exit(1);
  }

  let totalDupes = 0;

  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      // Skip unreadable files
      continue;
    }

    const dupes = findDuplicateKeys(content, file);
    for (const d of dupes) {
      console.log(`${d.file}:${d.line}:${d.col} duplicate key "${d.key}"`);
      totalDupes++;
    }
  }

  if (totalDupes > 0) {
    console.error(`\nFound ${totalDupes} duplicate JSON key(s)`);
    process.exit(1);
  } else {
    console.log('No duplicate JSON keys found');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
