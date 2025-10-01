/**
 * @peac/parsers-universal/parsers/aipref
 * AIPREF parser adapter
 */

import type { Parser, PartialPolicy } from '../types.js';
import { PrefResolver } from '@peac/pref';

export class AIPrefParser implements Parser {
  readonly name = 'aipref';
  readonly priority = 80;
  private resolver = new PrefResolver();

  async test(url: URL): Promise<boolean> {
    return ['http:', 'https:'].includes(url.protocol);
  }

  async parse(url: URL, fetcher: typeof fetch): Promise<PartialPolicy | null> {
    try {
      const policy = await this.resolver.resolve({
        uri: url.toString(),
        headers: {},
      });

      if (policy.status === 'not_found') return null;

      const snapshot = policy.snapshot;
      const hasDeny = snapshot.crawl === false || snapshot['train-ai'] === false;
      const hasAllow = snapshot.crawl === true || snapshot['train-ai'] === true;

      return {
        source: 'aipref',
        deny: hasDeny,
        allow: hasAllow,
        metadata: snapshot,
      };
    } catch {
      return null;
    }
  }
}
