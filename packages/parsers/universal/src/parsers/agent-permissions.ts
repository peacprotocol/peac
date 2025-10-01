/**
 * @peac/parsers-universal/parsers/agent-permissions
 * agent-permissions.json parser
 */

import type { Parser, PartialPolicy } from '../types.js';

interface AgentPermissions {
  agents?: Array<{
    id: string;
    permissions: {
      crawl?: boolean;
      index?: boolean;
      train?: boolean;
    };
  }>;
}

async function fetchAgentPermissions(url: URL): Promise<string | null> {
  try {
    const permUrl = new URL('/.well-known/agent-permissions.json', url.origin);
    const response = await fetch(permUrl.toString(), {
      headers: {
        'User-Agent': 'PEAC/0.9.15 (+https://peacprotocol.org)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function parseAgentPermissions(content: string): PartialPolicy | null {
  try {
    const data: AgentPermissions = JSON.parse(content);
    if (!data.agents || data.agents.length === 0) return null;

    let hasDeny = false;
    let hasAllow = false;

    for (const agent of data.agents) {
      if (agent.permissions.crawl === false || agent.permissions.train === false) {
        hasDeny = true;
      }
      if (agent.permissions.crawl === true || agent.permissions.train === true) {
        hasAllow = true;
      }
    }

    return {
      source: 'agent-permissions',
      deny: hasDeny,
      allow: hasAllow && !hasDeny,
      metadata: data as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

export class AgentPermissionsParser implements Parser {
  readonly name = 'agent-permissions';
  readonly priority = 100;

  async test(url: URL): Promise<boolean> {
    return ['http:', 'https:'].includes(url.protocol);
  }

  async parse(url: URL, fetcher: typeof fetch): Promise<PartialPolicy | null> {
    const content = await fetchAgentPermissions(url);
    if (!content) return null;
    return parseAgentPermissions(content);
  }
}
