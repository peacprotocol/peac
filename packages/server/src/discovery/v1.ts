import { Router } from 'express';
import * as crypto from 'crypto';
import pino from 'pino';
import { AdapterRegistry } from '../adapters/registry';
import { deepMerge } from '../utils/deep-merge';
import { WIRE_VERSION } from '@peacprotocol/schema';

const logger = pino({ name: 'discovery' });

export class DiscoveryService {
  private cache: {
    document?: Record<string, unknown>;
    etag?: string;
    generated?: number;
  } = {};

  private readonly TTL = 300000;

  constructor(
    private adapterRegistry: AdapterRegistry,
    private config: {
      base_url: string;
      version: string;
      x_release: string;
    },
  ) {}

  async getCapabilities(): Promise<{ document: Record<string, unknown>; etag: string }> {
    if (
      this.cache.document &&
      this.cache.etag &&
      this.cache.generated &&
      Date.now() - this.cache.generated < this.TTL
    ) {
      return {
        document: this.cache.document,
        etag: this.cache.etag,
      };
    }

    const base = {
      protocol: 'PEAC',
      version: WIRE_VERSION,
      'x-release': WIRE_VERSION,

      endpoints: {
        agreements: {
          href: '/peac/agreements',
          methods: ['POST', 'GET'],
        },
        payments: {
          href: '/peac/payments/charges',
          methods: ['POST'],
        },
        receipts: {
          href: '/peac/receipts/verify',
          methods: ['POST'],
        },
        webhooks: {
          href: '/webhooks/peac',
        },
      },

      auth_hints: {
        bearer: true,
        api_key: true,
        dpop: true,
        mtls: false,
      },

      access_modes: {
        public: false,
        authenticated: true,
        delegated: true,
        paid: true,
      },

      data_use: {
        no_training: true,
        no_retention: false,
        no_resale: true,
        attribution_required: true,
      },

      data_retention: {
        max_days: 30,
        deletion_available: true,
        gdpr_compliant: true,
        ccpa_compliant: true,
      },

      payment_adapters: [
        {
          name: 'credits',
          type: 'hybrid',
          currencies: ['USD'],
          settlement_time: 'instant',
          preferred: true,
        },
        {
          name: 'stripe_test',
          type: 'fiat',
          currencies: ['USD', 'EUR', 'GBP'],
          settlement_time: 'days',
        },
      ],

      limits: {
        rate: '100/min',
        max_charge: '10.00',
        max_agreement_duration: 'P30D',
        idempotency_window: 'PT24H',
      },

      receipts: {
        algorithms: ['ES256', 'RS256'],
        jwks_uri: `${this.config.base_url}/.well-known/jwks.json`,
        verification_endpoint: '/peac/receipts/verify',
      },

      x402: {
        supported: true,
        algorithm: 'fairness_v0',
        transparency_uri: `${this.config.base_url}/transparency`,
      },

      compliance: {
        eu_ai_act: true,
        content_license: 'proprietary',
      },

      version_negotiation: {
        request_header: 'peac-version',
        current: WIRE_VERSION,
        supported: [WIRE_VERSION],
      },
    };

    const adapterFragments = this.adapterRegistry.composeDiscovery();
    let document = deepMerge(base, adapterFragments);

    if (process.env.PEAC_MCP_ENABLED === 'true') {
      document = deepMerge(document, {
        adapters: {
          mcp: {
            enabled: true,
            tools: ['peac.negotiate', 'peac.pay', 'peac.verify'],
            endpoint: process.env.MCP_ENDPOINT,
          },
        },
      });
    }

    const content = JSON.stringify(document);
    const etag = `"${crypto.createHash('sha256').update(content).digest('hex')}"`;

    this.cache = {
      document,
      etag,
      generated: Date.now(),
    };

    logger.info({ etag }, 'Discovery document generated');

    return { document, etag };
  }
}

export function createDiscoveryRouter(
  adapterRegistry: AdapterRegistry,
  config: { base_url: string; version: string; x_release: string },
): Router {
  const router = Router();
  const service = new DiscoveryService(adapterRegistry, config);

  router.get('/.well-known/peac-capabilities', async (req, res, next) => {
    try {
      const acceptHeader = req.headers['accept'] || 'application/json';

      // Check if client wants vendor media type
      const wantsVendorType = acceptHeader.includes('application/vnd.peac.capabilities+json');

      // Return 406 for unsupported media types (like text/plain)
      if (
        !acceptHeader.includes('application/json') &&
        !acceptHeader.includes('application/vnd.peac.capabilities+json') &&
        !acceptHeader.includes('*/*')
      ) {
        return res.status(406).json({
          type: 'https://peacprotocol.org/problems/not-acceptable',
          title: 'Not Acceptable',
          status: 406,
          detail: 'Unsupported media type requested',
        });
      }

      const { document, etag } = await service.getCapabilities();

      // Set content type based on what was requested
      const contentType = wantsVendorType
        ? `application/vnd.peac.capabilities+json; version=${config.version}`
        : 'application/json; charset=utf-8';

      const lastModified = new Date().toUTCString();

      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
        ETag: etag,
        'Last-Modified': lastModified,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        Vary: 'Accept, Accept-Encoding',
      });

      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

      return res.json(document);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
