/**
 * @peac/parsers-universal/parsers/acp
 * ACP (Augmentation Consent Protocol) parser
 */

import type { Parser, PartialPolicy } from '../types.js';
import { safeFetch } from '@peac/safe-fetch';

interface ACPDocument {
  version?: string;
  consent?: {
    training?: boolean;
    indexing?: boolean;
    augmentation?: boolean;
  };
}

async function fetchACP(url: URL): Promise<string | null> {
  try {
    const acpUrl = new URL('/.well-known/acp.json', url.origin);
    const response = await safeFetch(acpUrl.toString(), {
      timeoutMs: 3000,
      headers: {
        Accept: 'application/json',
      },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function parseACP(content: string): PartialPolicy | null {
  try {
    const data: ACPDocument = JSON.parse(content);
    if (!data.consent) return null;

    const hasDeny =
      data.consent.training === false ||
      data.consent.indexing === false ||
      data.consent.augmentation === false;

    const hasAllow =
      data.consent.training === true ||
      data.consent.indexing === true ||
      data.consent.augmentation === true;

    return {
      source: 'acp',
      deny: hasDeny,
      allow: hasAllow && !hasDeny,
      metadata: data as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

export class ACPParser implements Parser {
  readonly name = 'acp';
  readonly priority = 10;

  async test(url: URL): Promise<boolean> {
    return ['http:', 'https:'].includes(url.protocol);
  }

  async parse(url: URL, fetcher: typeof fetch): Promise<PartialPolicy | null> {
    const content = await fetchACP(url);
    if (!content) return null;
    return parseACP(content);
  }
}
