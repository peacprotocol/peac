/**
 * @peac/parsers-universal/parsers/robots
 * Robots.txt parser adapter
 */

import type { Parser, PartialPolicy } from '../types.js';
import { fetchRobots, parseRobots, robotsToAIPref } from '@peac/pref';

export class RobotsParser implements Parser {
  readonly name = 'robots.txt';
  readonly priority = 40;

  async test(url: URL): Promise<boolean> {
    return ['http:', 'https:'].includes(url.protocol);
  }

  async parse(url: URL, fetcher: typeof fetch): Promise<PartialPolicy | null> {
    const content = await fetchRobots(url.origin);
    if (!content) return null;

    const rules = parseRobots(content);
    const aipref = robotsToAIPref(rules);

    if (!aipref) return null;

    return {
      source: 'robots.txt',
      allow: aipref.crawl === true || aipref['train-ai'] === true,
      deny: aipref.crawl === false || aipref['train-ai'] === false,
      metadata: { rules: aipref },
    };
  }
}
