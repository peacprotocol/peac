import { Request, Response } from 'express';
import { createHash } from 'crypto';
import stringify from 'json-stable-stringify';
import { contentNegotiation } from '../middleware/content-negotiation';
import { logger } from '../../logging';
import { metrics } from '../../metrics';
import { problemDetails } from '../problems';
import { getVersionInfo } from '../../version';
const CAPABILITIES_MEDIA_TYPE = 'application/vnd.peac.capabilities+json';

// Fixed last modified for stable caching
const CAPABILITIES_LAST_MODIFIED = new Date('2024-12-01T00:00:00Z').toUTCString();

// Memoized capabilities, ETag, and JSON string computed at startup
let MEMOIZED_CAPABILITIES: PEACCapabilities | null = null;
let MEMOIZED_ETAG: string | null = null;
let MEMOIZED_JSON: string | null = null;

function ensureCapabilitiesMemoized(): {
  capabilities: PEACCapabilities;
  etag: string;
  json: string;
} {
  if (!MEMOIZED_CAPABILITIES || !MEMOIZED_ETAG || !MEMOIZED_JSON) {
    MEMOIZED_CAPABILITIES = buildCapabilities();
    MEMOIZED_ETAG = generateCapabilitiesETag(MEMOIZED_CAPABILITIES);
    MEMOIZED_JSON = JSON.stringify(MEMOIZED_CAPABILITIES);
  }
  return { capabilities: MEMOIZED_CAPABILITIES, etag: MEMOIZED_ETAG, json: MEMOIZED_JSON };
}

export function _invalidateCapabilitiesCache(): void {
  MEMOIZED_CAPABILITIES = null;
  MEMOIZED_ETAG = null;
  MEMOIZED_JSON = null;
}

export interface PEACCapabilities {
  version: string;
  protocol_version: string;
  min_protocol_version: string;
  conformance_level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
  protocols: {
    bridges: string[];
    native_a2a?: {
      handshake: boolean;
      orchestration?: string[];
    };
  };
  payments: {
    rails: string[];
    status: Record<string, string>;
    message: string;
  };
  features: {
    receipts: {
      signed: 'required' | 'optional';
      jwks?: string;
    };
    proofs?: {
      zk?: string;
      tee?: string;
    };
    eco?: {
      enabled: boolean;
      weight_default?: number;
    };
  };
  discovery?: {
    rank_explanations: boolean;
  };
  limits?: {
    max_request_size?: number;
    rate_limit?: {
      requests_per_minute?: number;
      requests_per_hour?: number;
    };
  };
  links?: {
    docs?: string;
    peip?: string;
  };
}

function buildCapabilities(): PEACCapabilities {
  const versionInfo = getVersionInfo();

  return {
    version: versionInfo.version,
    protocol_version: versionInfo.protocol_version,
    min_protocol_version: versionInfo.min_protocol_version,
    conformance_level: 'L1',
    protocols: {
      bridges: ['mcp', 'a2a', 'openai', 'langchain'],
      native_a2a: {
        handshake: true,
        orchestration: ['sequential'],
      },
    },
    payments: {
      rails: ['credits', 'x402:ethereum', 'stripe:fiat'],
      status: {
        credits: 'live',
        'x402:ethereum': 'simulation (prod-ready)',
        'stripe:fiat': 'simulation (prod-ready)',
      },
      message:
        'Three payment options available day one. Credits for testnet; x402/Stripe ready for production with configuration.',
    },
    features: {
      receipts: {
        signed: 'required',
        jwks: '/.well-known/jwks.json',
      },
      proofs: {
        zk: 'hook',
        tee: 'hook',
      },
      eco: {
        enabled: true,
        weight_default: 0,
      },
    },
    discovery: {
      rank_explanations: true,
    },
    limits: {
      max_request_size: 1048576, // 1MB
      rate_limit: {
        requests_per_minute: 60,
        requests_per_hour: 1000,
      },
    },
    links: {
      docs: 'https://peacprotocol.org/docs/v0.9.6',
      peip: 'https://peacprotocol.org/peip',
    },
  };
}

function generateCapabilitiesETag(capabilities: PEACCapabilities): string {
  const canonical = stringify(capabilities) || '{}';
  const hash = createHash('sha256').update(canonical, 'utf8').digest('base64');
  return `W/"${hash}"`; // Weak ETag, spec-correct
}

export async function handleCapabilities(req: Request, res: Response): Promise<void> {
  const timer = metrics.httpRequestDuration.startTimer({
    method: 'GET',
    route: '/.well-known/peac-capabilities',
  });

  try {
    // Get memoized capabilities, ETag, and JSON (computed once at startup)
    const { etag: capabilitiesETag, json: capabilitiesJSON } = ensureCapabilitiesMemoized();

    // Handle conditional requests first (before any heavy work)
    const clientETag = req.headers['if-none-match'];
    const clientLastModified = req.headers['if-modified-since'];

    if (clientETag === capabilitiesETag || clientLastModified === CAPABILITIES_LAST_MODIFIED) {
      timer({ status: 304 });
      logger.debug(
        { clientETag, capabilitiesETag, clientLastModified },
        'Capabilities served from cache (304)',
      );
      res.set({
        ETag: capabilitiesETag,
        'Last-Modified': CAPABILITIES_LAST_MODIFIED,
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
        Vary: 'Accept, Accept-Encoding',
      });
      res.status(304).end();
      return;
    }

    // Check content negotiation
    const versionInfo = getVersionInfo();
    const acceptable = contentNegotiation.negotiate(req, [
      `${CAPABILITIES_MEDIA_TYPE};version=${versionInfo.version}`,
      'application/json', // Fallback for compatibility
    ]);

    if (!acceptable) {
      timer({ status: 406 });
      return problemDetails.send(res, 'not_acceptable', {
        detail: 'The requested media type is not supported',
        supported: [`${CAPABILITIES_MEDIA_TYPE};version=${versionInfo.version}`],
      });
    }

    // Set appropriate headers
    res.set({
      'Content-Type': acceptable,
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      ETag: capabilitiesETag,
      'Last-Modified': CAPABILITIES_LAST_MODIFIED,
      Vary: 'Accept, Accept-Encoding',
    });

    timer({ status: 200 });
    res.status(200).send(capabilitiesJSON);

    logger.info({ version: versionInfo.version }, 'Capabilities served successfully');
  } catch (error) {
    timer({ status: 500 });
    logger.error({ error }, 'Failed to serve capabilities');
    problemDetails.send(res, 'internal_error', {
      detail: 'An unexpected error occurred',
    });
  }
}
