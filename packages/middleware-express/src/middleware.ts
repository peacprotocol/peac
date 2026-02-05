/**
 * Express.js Middleware for PEAC Receipt Issuance
 *
 * Intercepts responses and adds PEAC receipts automatically.
 *
 * @packageDocumentation
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import {
  createReceipt,
  validateConfig,
  type MiddlewareConfig,
  type RequestContext,
} from '@peac/middleware-core';

/**
 * Express-specific middleware configuration
 */
export interface ExpressMiddlewareConfig extends MiddlewareConfig {
  /** Skip receipt generation for certain routes */
  skip?: (req: Request) => boolean;

  /** Custom audience extraction from request */
  audienceExtractor?: (req: Request) => string;

  /** Custom subject extraction from request */
  subjectExtractor?: (req: Request) => string | undefined;

  /** Error handler for receipt generation failures */
  onError?: (error: Error, req: Request, res: Response) => void;
}

/**
 * Symbol to store PEAC context on request
 */
const PEAC_CONTEXT_KEY = Symbol('peac-context');

/**
 * Request with PEAC context attached
 */
export interface RequestWithPeacContext extends Request {
  [PEAC_CONTEXT_KEY]?: RequestContext;
}

/**
 * Check if a request has PEAC context
 */
export function hasPeacContext(req: Request): req is RequestWithPeacContext {
  return PEAC_CONTEXT_KEY in req;
}

/**
 * Get the PEAC receipt from a response (for testing/debugging)
 *
 * @param res - Express response object
 * @returns Receipt JWS if present, undefined otherwise
 */
export function getReceiptFromResponse(res: Response): string | undefined {
  const receipt = res.getHeader('PEAC-Receipt');
  return typeof receipt === 'string' ? receipt : undefined;
}

/**
 * Convert Express request to RequestContext
 */
function buildRequestContext(req: Request): RequestContext {
  return {
    method: req.method,
    path: req.path,
    headers: req.headers as Record<string, string | string[] | undefined>,
    body: req.body,
    timestamp: Date.now(),
  };
}

/**
 * Express middleware that adds PEAC receipts to responses
 *
 * The middleware intercepts `res.json()` and `res.send()` to inject
 * PEAC receipts into responses. For header transport (default), the
 * receipt is added as a `PEAC-Receipt` header. For body transport,
 * the response is wrapped in a `{ data, peac_receipt }` structure.
 *
 * @param config - Middleware configuration
 * @returns Express request handler
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { peacMiddleware } from '@peac/middleware-express';
 *
 * const app = express();
 *
 * // Add PEAC middleware
 * app.use(peacMiddleware({
 *   issuer: 'https://api.example.com',
 *   signingKey: privateKey,
 *   keyId: 'prod-2026-02',
 * }));
 *
 * app.get('/api/data', (req, res) => {
 *   res.json({ items: [1, 2, 3] });
 *   // PEAC-Receipt header automatically added
 * });
 * ```
 */
export function peacMiddleware(config: ExpressMiddlewareConfig): RequestHandler {
  // Validate configuration at initialization
  validateConfig(config);

  return async function peacReceiptMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    // Check if we should skip this request
    if (config.skip?.(req)) {
      next();
      return;
    }

    // Build and store request context
    const requestContext = buildRequestContext(req);
    (req as RequestWithPeacContext)[PEAC_CONTEXT_KEY] = requestContext;

    // Enhance config with Express-specific extractors
    const enhancedConfig: MiddlewareConfig = {
      ...config,
      claimsGenerator: async (ctx) => {
        const baseClaims = config.claimsGenerator
          ? await config.claimsGenerator(ctx)
          : {};

        return {
          ...baseClaims,
          // Override audience if custom extractor provided
          ...(config.audienceExtractor && { aud: config.audienceExtractor(req) }),
          // Add subject if extractor provided
          ...(config.subjectExtractor && { sub: config.subjectExtractor(req) }),
        };
      },
    };

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override res.json to inject receipt
    res.json = function jsonWithReceipt(body: unknown): Response {
      // Generate receipt asynchronously
      createReceipt(
        enhancedConfig,
        requestContext,
        {
          statusCode: res.statusCode,
          headers: res.getHeaders() as Record<string, string | string[] | undefined>,
          body,
        }
      )
        .then((result) => {
          // Add headers from receipt result
          for (const [key, value] of Object.entries(result.headers)) {
            res.setHeader(key, value);
          }

          // If body transport, use wrapped body
          if (result.bodyWrapper) {
            return originalJson(result.bodyWrapper);
          }

          return originalJson(body);
        })
        .catch((error: Error) => {
          // Handle errors without breaking the response
          if (config.onError) {
            config.onError(error, req, res);
          } else {
            // Log but don't fail the response
            console.error('[PEAC] Receipt generation failed:', error.message);
          }

          // Send original body on error
          return originalJson(body);
        });

      // Return response for chaining (synchronous return)
      // The actual response will be sent by the promise chain
      return res;
    };

    next();
  };
}

/**
 * Create middleware with synchronous receipt generation (blocking)
 *
 * This variant waits for receipt generation before sending the response.
 * Use this when you need to guarantee the receipt is in the response,
 * but be aware it adds latency.
 *
 * @param config - Middleware configuration
 * @returns Express request handler
 */
export function peacMiddlewareSync(config: ExpressMiddlewareConfig): RequestHandler {
  // Validate configuration at initialization
  validateConfig(config);

  return async function peacReceiptMiddlewareSync(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    // Check if we should skip this request
    if (config.skip?.(req)) {
      next();
      return;
    }

    // Build and store request context
    const requestContext = buildRequestContext(req);
    (req as RequestWithPeacContext)[PEAC_CONTEXT_KEY] = requestContext;

    // Enhance config with Express-specific extractors
    const enhancedConfig: MiddlewareConfig = {
      ...config,
      claimsGenerator: async (ctx) => {
        const baseClaims = config.claimsGenerator
          ? await config.claimsGenerator(ctx)
          : {};

        return {
          ...baseClaims,
          ...(config.audienceExtractor && { aud: config.audienceExtractor(req) }),
          ...(config.subjectExtractor && { sub: config.subjectExtractor(req) }),
        };
      },
    };

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override res.json to inject receipt synchronously
    res.json = function jsonWithReceiptSync(body: unknown): Response {
      // We can't make this truly sync due to crypto operations,
      // but we can make it blocking by using a sync wrapper
      const syncWrapper = async (): Promise<void> => {
        try {
          const result = await createReceipt(
            enhancedConfig,
            requestContext,
            {
              statusCode: res.statusCode,
              headers: res.getHeaders() as Record<string, string | string[] | undefined>,
              body,
            }
          );

          // Add headers
          for (const [key, value] of Object.entries(result.headers)) {
            res.setHeader(key, value);
          }

          // Send response
          if (result.bodyWrapper) {
            originalJson(result.bodyWrapper);
          } else {
            originalJson(body);
          }
        } catch (error) {
          if (config.onError) {
            config.onError(error as Error, req, res);
          } else {
            console.error('[PEAC] Receipt generation failed:', (error as Error).message);
          }
          originalJson(body);
        }
      };

      // Execute synchronously by blocking
      syncWrapper();
      return res;
    };

    next();
  };
}
