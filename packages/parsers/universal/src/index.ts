/**
 * @peac/parsers-universal
 * Universal policy parser with deny-safe precedence
 */

import type { Parser, PartialPolicy, UnifiedPolicy, FetchOptions } from './types.js';
import {
  AIPrefParser,
  AgentPermissionsParser,
  RobotsParser,
  AiTxtParser,
  PeacTxtParser,
  ACPParser,
} from './parsers/index.js';

const DEFAULT_PRECEDENCE = [
  'agent-permissions',
  'aipref',
  'ai.txt',
  'robots.txt',
  'peac.txt',
  'acp',
];

function getDefaultParsers(): Parser[] {
  return [
    new AgentPermissionsParser(),
    new AIPrefParser(),
    new AiTxtParser(),
    new RobotsParser(),
    new PeacTxtParser(),
    new ACPParser(),
  ];
}

export class UniversalParser {
  private parsers: Parser[];

  constructor(parsers?: Parser[]) {
    this.parsers = parsers ?? getDefaultParsers();
    this.parsers = this.parsers.sort((a, b) => b.priority - a.priority);
  }

  async parseAll(origin: string, fetcher: typeof fetch = fetch): Promise<UnifiedPolicy> {
    const url = new URL(origin);
    const results: PartialPolicy[] = [];

    const parseResults = await Promise.allSettled(
      this.parsers.map(async (parser) => {
        const canParse = await parser.test(url);
        if (canParse) {
          return await parser.parse(url, fetcher);
        }
        return null;
      })
    );

    for (const result of parseResults) {
      if (result.status === 'fulfilled' && result.value) {
        results.push(result.value);
      }
    }

    return this.merge(results);
  }

  private merge(policies: PartialPolicy[]): UnifiedPolicy {
    if (policies.length === 0) {
      return {
        decision: 'deny',
        sources: [],
      };
    }

    const sources = policies.map((p) => p.source);
    let hasDeny = false;
    let hasAllow = false;
    const allConditions: Record<string, unknown> = {};
    const allMetadata: Record<string, unknown> = {};

    for (const policy of policies) {
      if (policy.deny) {
        hasDeny = true;
      }
      if (policy.allow) {
        hasAllow = true;
      }
      if (policy.conditions) {
        Object.assign(allConditions, policy.conditions);
      }
      if (policy.metadata) {
        Object.assign(allMetadata, policy.metadata);
      }
    }

    const decision = hasDeny ? 'deny' : hasAllow ? 'allow' : 'conditional';

    return {
      decision,
      sources,
      conditions: Object.keys(allConditions).length > 0 ? allConditions : undefined,
      metadata: Object.keys(allMetadata).length > 0 ? allMetadata : undefined,
    };
  }
}

export type { Parser, PartialPolicy, UnifiedPolicy, FetchOptions } from './types.js';
