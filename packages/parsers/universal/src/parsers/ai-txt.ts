/**
 * @peac/parsers-universal/parsers/ai-txt
 * ai.txt parser (OpenAI/Google variants)
 */

import type { Parser, PartialPolicy } from '../types.js';

async function fetchAiTxt(url: URL): Promise<string | null> {
  try {
    const aiUrl = new URL('/ai.txt', url.origin);
    const response = await fetch(aiUrl.toString(), {
      headers: { 'User-Agent': 'PEAC/0.9.15 (+https://peacprotocol.org)' },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function parseAiTxt(content: string): PartialPolicy | null {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  const policy: Record<string, unknown> = {};
  let hasRules = false;

  for (const line of lines) {
    const [field, value] = line.split(':').map((s) => s.trim());
    if (field && value) {
      policy[field.toLowerCase()] = value;
      hasRules = true;
    }
  }

  if (!hasRules) return null;

  const disallowAll =
    policy['user-agent'] === '*' && (policy['disallow'] === '/' || policy['disallow'] === '*');

  return {
    source: 'ai.txt',
    deny: disallowAll,
    metadata: policy,
  };
}

export class AiTxtParser implements Parser {
  readonly name = 'ai.txt';
  readonly priority = 60;

  async test(url: URL): Promise<boolean> {
    return ['http:', 'https:'].includes(url.protocol);
  }

  async parse(url: URL, fetcher: typeof fetch): Promise<PartialPolicy | null> {
    const content = await fetchAiTxt(url);
    if (!content) return null;
    return parseAiTxt(content);
  }
}
