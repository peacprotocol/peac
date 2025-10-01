/**
 * @peac/parsers-universal/parsers/peac-txt
 * peac.txt parser adapter
 */

import type { Parser, PartialPolicy } from '../types.js';
import { parse as parsePeacTxt } from '@peac/disc';

async function fetchPeacTxt(url: URL): Promise<string | null> {
  try {
    const peacUrl = new URL('/.well-known/peac.txt', url.origin);
    const response = await fetch(peacUrl.toString(), {
      headers: { 'User-Agent': 'PEAC/0.9.15 (+https://peacprotocol.org)' },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

export class PeacTxtParser implements Parser {
  readonly name = 'peac.txt';
  readonly priority = 50;

  async test(url: URL): Promise<boolean> {
    return ['http:', 'https:'].includes(url.protocol);
  }

  async parse(url: URL, fetcher: typeof fetch): Promise<PartialPolicy | null> {
    const content = await fetchPeacTxt(url);
    if (!content) return null;

    const result = parsePeacTxt(content);
    if (!result.valid || !result.data) return null;

    return {
      source: 'peac.txt',
      metadata: result.data as Record<string, unknown>,
    };
  }
}
