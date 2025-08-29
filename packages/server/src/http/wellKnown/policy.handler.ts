import { Request, Response } from 'express';
import { contentNegotiation } from '../middleware/content-negotiation';
import { logger } from '../../logging';
import { metrics } from '../../metrics';
import { problemDetails } from '../problems';
import { POLICY_VERSION } from '@peacprotocol/schema';
const POLICY_LAST_MODIFIED = new Date('2024-12-01T00:00:00Z').toUTCString();

interface PEACPolicy {
  version: string;
  default: string;
  identity: {
    web_bot_auth: {
      accepted: boolean;
    };
  };
  attribution: {
    required: boolean;
    format: string;
    benefits: {
      rate_multiplier: number;
      cache_ttl: number;
      priority: boolean;
    };
  };
  rate_limits: {
    anonymous_rpm: number;
    attributed_rpm: number;
  };
  receipts: string;
  paths: Array<{
    match: string;
    rule: string;
  }>;
}

let MEMOIZED_POLICY: PEACPolicy | null = null;
let MEMOIZED_YAML: string | null = null;
let MEMOIZED_JSON: string | null = null;

function ensurePolicyMemoized(): {
  policy: PEACPolicy;
  yaml: string;
  json: string;
} {
  if (!MEMOIZED_POLICY || !MEMOIZED_YAML || !MEMOIZED_JSON) {
    MEMOIZED_POLICY = buildPolicy();
    MEMOIZED_YAML = policyToYAML(MEMOIZED_POLICY);
    MEMOIZED_JSON = JSON.stringify(MEMOIZED_POLICY, null, 2);
  }
  return { policy: MEMOIZED_POLICY, yaml: MEMOIZED_YAML, json: MEMOIZED_JSON };
}

function buildPolicy(): PEACPolicy {
  return {
    version: POLICY_VERSION,
    default: 'allow',
    identity: {
      web_bot_auth: {
        accepted: true,
      },
    },
    attribution: {
      required: false,
      format: 'AgentName (https://url) [purpose]',
      benefits: {
        rate_multiplier: 10,
        cache_ttl: 3600,
        priority: true,
      },
    },
    rate_limits: {
      anonymous_rpm: 60,
      attributed_rpm: 600,
    },
    receipts: 'optional',
    paths: [
      {
        match: '/admin/**',
        rule: 'deny',
      },
    ],
  };
}

function policyToYAML(policy: PEACPolicy): string {
  return `version: ${policy.version}
default: ${policy.default}

identity:
  web_bot_auth:
    accepted: ${policy.identity.web_bot_auth.accepted}

attribution:
  required: ${policy.attribution.required}
  format: "${policy.attribution.format}"
  benefits:
    rate_multiplier: ${policy.attribution.benefits.rate_multiplier}
    cache_ttl: ${policy.attribution.benefits.cache_ttl}
    priority: ${policy.attribution.benefits.priority}

rate_limits:
  anonymous_rpm: ${policy.rate_limits.anonymous_rpm}
  attributed_rpm: ${policy.rate_limits.attributed_rpm}

receipts: ${policy.receipts}

paths:
${policy.paths.map((p) => `  - match: "${p.match}"\n    rule: ${p.rule}`).join('\n')}
`;
}

export async function handlePolicy(req: Request, res: Response): Promise<void> {
  const timer = metrics.httpRequestDuration.startTimer({
    method: 'GET',
    route: '/.well-known/peac',
  });

  try {
    const { yaml, json } = ensurePolicyMemoized();

    // Check content negotiation
    const acceptable = contentNegotiation.negotiate(req, [
      'text/plain; charset=utf-8',
      'application/json',
    ]);

    const useJson = acceptable === 'application/json';
    const content = useJson ? json : yaml;
    const contentType = useJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8';

    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      'Last-Modified': POLICY_LAST_MODIFIED,
      Vary: 'Accept',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    });

    timer({ status: 200 });
    res.status(200).send(content);

    logger.info({ format: useJson ? 'json' : 'yaml' }, 'Policy served successfully');
  } catch (error) {
    timer({ status: 500 });
    logger.error({ error }, 'Failed to serve policy');
    problemDetails.send(res, 'internal_error', {
      detail: 'Failed to retrieve policy',
    });
  }
}

export function _invalidatePolicyCache(): void {
  MEMOIZED_POLICY = null;
  MEMOIZED_YAML = null;
  MEMOIZED_JSON = null;
}
