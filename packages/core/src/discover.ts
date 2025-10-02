import { UniversalParser } from '@peac/parsers-universal';
import type { UnifiedPolicy } from '@peac/parsers-universal';
import { canonicalizeJson } from './hash.js';
import { createHash } from 'node:crypto';

export interface DiscoveryResult {
  origin: string;
  policy: UnifiedPolicy;
  policy_hash: string;
  discovered_at: string;
  sources: string[];
}

export async function discoverPolicy(
  origin: string,
  options?: { fetcher?: typeof fetch }
): Promise<DiscoveryResult> {
  const parser = new UniversalParser();
  const fetcher = options?.fetcher ?? fetch;

  const policy = await parser.parseAll(origin, fetcher);

  const canonical = canonicalizeJson(policy);
  const policy_hash = createHash('sha256').update(canonical, 'utf8').digest('base64url');

  const sources: string[] = [];
  if (policy.sources) {
    sources.push(...policy.sources);
  }

  return {
    origin,
    policy,
    policy_hash,
    discovered_at: new Date().toISOString(),
    sources,
  };
}

export async function discoverAndEnforce(
  origin: string,
  agent: string,
  action: 'crawl' | 'train',
  options?: { fetcher?: typeof fetch }
): Promise<{
  allowed: boolean;
  policy_hash: string;
  reason: string;
}> {
  const result = await discoverPolicy(origin, options);

  const agentPolicy = result.policy.agents?.[agent];
  let allowed = false;
  let reason = '';

  if (agentPolicy && agentPolicy[action] !== undefined) {
    allowed = agentPolicy[action] === true;
    reason = allowed
      ? `Agent ${agent} explicitly allowed for ${action}`
      : `Agent ${agent} explicitly denied for ${action}`;
  } else {
    const globalPermission =
      action === 'crawl' ? result.policy.globalCrawl : result.policy.globalTrain;

    if (globalPermission !== undefined) {
      allowed = globalPermission === true;
      reason = allowed ? `Global policy allows ${action}` : `Global policy denies ${action}`;
    } else {
      allowed = true;
      reason = `No policy found, defaulting to allow for ${action}`;
    }
  }

  return {
    allowed,
    policy_hash: result.policy_hash,
    reason,
  };
}
