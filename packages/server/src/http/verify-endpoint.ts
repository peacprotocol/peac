import { Request, Response } from 'express';
import { verifyReceipt } from '../core/receipts';
import { keyStore } from '../core/keys';
import { logger } from '../logging';
import { metrics } from '../metrics';

export interface BatchVerifyRequest {
  jws: string[];
}

export interface BatchVerifyResult {
  ok: boolean;
  claims?: any;
  kid?: string;
  alg?: 'EdDSA';
  error?: string;
}

const MAX_POST_ITEMS = 100;
const MAX_GET_ITEMS = 25;
const MAX_BODY_SIZE = 64 * 1024; // 64KB

export async function handleBatchVerifyPost(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();

  try {
    // Check content length
    const contentLength = parseInt(req.get('content-length') || '0');
    if (contentLength > MAX_BODY_SIZE) {
      res.status(413).json({
        type: 'https://peac.dev/problems/payload-too-large',
        title: 'Payload Too Large',
        status: 413,
        detail: `Body size ${contentLength} exceeds limit ${MAX_BODY_SIZE}`,
      });
      return;
    }

    // Parse request body
    let body: BatchVerifyRequest;
    try {
      body = req.body;
      if (!body || !Array.isArray(body.jws)) {
        throw new Error('Invalid request format');
      }
    } catch {
      res.status(400).json({
        type: 'https://peac.dev/problems/invalid-request',
        title: 'Invalid Request',
        status: 400,
        detail: 'Request body must be JSON with jws array',
      });
      return;
    }

    // Check item count limit
    if (body.jws.length > MAX_POST_ITEMS) {
      res.status(413).json({
        type: 'https://peac.dev/problems/too-many-items',
        title: 'Too Many Items',
        status: 413,
        detail: `Cannot verify ${body.jws.length} items, limit is ${MAX_POST_ITEMS}`,
      });
      return;
    }

    // Get all public keys for verification
    const keys = await keyStore.getAllPublic();

    // Verify all JWS tokens in parallel
    const results = await Promise.all(
      body.jws.map(async (jws): Promise<BatchVerifyResult> => {
        if (typeof jws !== 'string') {
          return { ok: false, error: 'invalid_format' };
        }

        const result = await verifyReceipt(jws, keys);

        if (result.ok) {
          return {
            ok: true,
            claims: result.claims,
            kid: result.kid,
            alg: result.alg,
          };
        } else {
          return {
            ok: false,
            error: result.error,
          };
        }
      })
    );

    const latency = Date.now() - startTime;
    metrics.batchVerifyLatency?.observe(latency);
    metrics.batchVerifyAttempts?.inc({
      method: 'POST',
      count: body.jws.length.toString(),
    });

    logger.info(
      {
        itemCount: body.jws.length,
        successCount: results.filter((r) => r.ok).length,
        latency,
      },
      'Batch verify completed'
    );

    res.json(results);
  } catch (error) {
    const latency = Date.now() - startTime;
    metrics.batchVerifyLatency?.observe(latency);

    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        latency,
      },
      'Batch verify failed'
    );

    res.status(500).json({
      type: 'https://peac.dev/problems/internal-error',
      title: 'Internal Server Error',
      status: 500,
    });
  }
}

export async function handleBatchVerifyGet(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();

  try {
    // Parse query parameters
    const jwsParams = Array.isArray(req.query.jws) ? req.query.jws : [req.query.jws];
    const jwsTokens = jwsParams.filter((jws): jws is string => typeof jws === 'string');

    if (jwsTokens.length === 0) {
      res.status(400).json({
        type: 'https://peac.dev/problems/missing-parameter',
        title: 'Missing Parameter',
        status: 400,
        detail: 'At least one jws parameter required',
      });
      return;
    }

    // Check item count limit (lower for GET)
    if (jwsTokens.length > MAX_GET_ITEMS) {
      res.status(413).json({
        type: 'https://peac.dev/problems/too-many-items',
        title: 'Too Many Items',
        status: 413,
        detail: `Cannot verify ${jwsTokens.length} items via GET, limit is ${MAX_GET_ITEMS}`,
      });
      return;
    }

    // Get all public keys for verification
    const keys = await keyStore.getAllPublic();

    // Verify all JWS tokens
    const results = await Promise.all(
      jwsTokens.map(async (jws): Promise<BatchVerifyResult> => {
        const result = await verifyReceipt(jws, keys);

        if (result.ok) {
          return {
            ok: true,
            claims: result.claims,
            kid: result.kid,
            alg: result.alg,
          };
        } else {
          return {
            ok: false,
            error: result.error,
          };
        }
      })
    );

    const latency = Date.now() - startTime;
    metrics.batchVerifyLatency?.observe(latency);
    metrics.batchVerifyAttempts?.inc({
      method: 'GET',
      count: jwsTokens.length.toString(),
    });

    logger.info(
      {
        itemCount: jwsTokens.length,
        successCount: results.filter((r) => r.ok).length,
        latency,
      },
      'Batch verify completed (GET)'
    );

    res.json(results);
  } catch (error) {
    const latency = Date.now() - startTime;
    metrics.batchVerifyLatency?.observe(latency);

    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        latency,
      },
      'Batch verify failed (GET)'
    );

    res.status(500).json({
      type: 'https://peac.dev/problems/internal-error',
      title: 'Internal Server Error',
      status: 500,
    });
  }
}
