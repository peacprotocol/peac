import { Request, Response } from 'express';
import { Transform } from 'stream';
import { createGzip } from 'zlib';
import { verifySignature } from '../adapters/webbot/signature.js';
import { parseWebBotAuthHeaders } from '../adapters/webbot/parse.js';
import { problemDetails } from './problems.js';
import { logger } from '../logging/index.js';
import { metrics } from '../metrics/index.js';
import { telemetry } from '../telemetry/log.js';
import crypto from 'crypto';

interface ExportQuery {
  from?: string;
  to?: string;
  fmt?: 'ndjson' | 'csv';
  type?: 'receipts' | 'attribution';
  cursor?: string;
}

interface ExportRow {
  timestamp: string;
  path_hash: string;
  method: string;
  tier: 'anonymous' | 'attributed' | 'verified';
  policy_hash: string;
  attribution?: string;
  receipt_id?: string;
}

class NDJSONTransform extends Transform {
  constructor() {
    super({ objectMode: true });
  }

  _transform(chunk: ExportRow, _encoding: string, callback: () => void) {
    this.push(JSON.stringify(chunk) + '\n');
    callback();
  }
}

class CSVTransform extends Transform {
  private headerWritten = false;

  constructor() {
    super({ objectMode: true });
  }

  _transform(chunk: ExportRow, _encoding: string, callback: () => void) {
    if (!this.headerWritten) {
      this.push('timestamp,path_hash,method,tier,policy_hash,attribution,receipt_id\n');
      this.headerWritten = true;
    }

    const row = [
      chunk.timestamp,
      chunk.path_hash,
      chunk.method,
      chunk.tier,
      chunk.policy_hash,
      chunk.attribution || '',
      chunk.receipt_id || '',
    ]
      .map((field) => `"${String(field).replace(/"/g, '""')}"`)
      .join(',');

    this.push(row + '\n');
    callback();
  }
}

export async function exportHandler(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();

  try {
    // Parse query parameters
    const query: ExportQuery = {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      fmt: (req.query.fmt as 'ndjson' | 'csv') || 'ndjson',
      type: (req.query.type as 'receipts' | 'attribution') || 'receipts',
      cursor: req.query.cursor as string | undefined,
    };

    // Validate parameters
    if (query.fmt && !['ndjson', 'csv'].includes(query.fmt)) {
      return problemDetails.send(res, 'invalid_request', {
        detail: 'fmt must be ndjson or csv',
      });
    }

    if (query.type && !['receipts', 'attribution'].includes(query.type)) {
      return problemDetails.send(res, 'invalid_request', {
        detail: 'type must be receipts or attribution',
      });
    }

    // Authenticate request
    const authResult = await authenticateExportRequest(req);
    if (!authResult.ok) {
      metrics.exportAttempts?.inc({ result: 'auth_failed', reason: authResult.reason });

      if (authResult.reason === 'missing_auth') {
        return problemDetails.send(res, 'unauthorized', {
          detail: 'Export requires HTTP Message Signatures or Bearer token authentication',
        });
      }

      return problemDetails.send(res, 'forbidden', {
        detail: `Authentication failed: ${authResult.reason}`,
      });
    }

    logger.info(
      {
        authMethod: authResult.method,
        keyThumbprint: authResult.thumbprint,
        exportType: query.type,
        format: query.fmt,
      },
      'Export request authenticated',
    );

    // Parse date range
    const fromDate = query.from ? new Date(query.from) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: 24h ago
    const toDate = query.to ? new Date(query.to) : new Date(); // Default: now

    if (fromDate >= toDate) {
      return problemDetails.send(res, 'invalid_request', {
        detail: 'from date must be before to date',
      });
    }

    // Check date range limit (max 30 days)
    const maxRangeMs = 30 * 24 * 60 * 60 * 1000;
    if (toDate.getTime() - fromDate.getTime() > maxRangeMs) {
      return problemDetails.send(res, 'invalid_request', {
        detail: 'Date range cannot exceed 30 days',
      });
    }

    // Set response headers
    const isCompressed = req.headers['accept-encoding']?.includes('gzip');
    const contentType = query.fmt === 'csv' ? 'text/csv' : 'application/x-ndjson';

    res.set({
      'content-type': contentType,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });

    if (isCompressed) {
      res.set('content-encoding', 'gzip');
    }

    // Create streaming pipeline
    const transformer = query.fmt === 'csv' ? new CSVTransform() : new NDJSONTransform();
    let pipeline = transformer;

    if (isCompressed) {
      const gzip = createGzip({ level: 6 });
      pipeline = transformer.pipe(gzip);
    }

    pipeline.pipe(res);

    // Start streaming data
    let rowCount = 0;
    const maxRows = 100000; // Configurable limit
    let nextCursor: string | undefined;

    try {
      // This is a mock implementation - in real implementation,
      // this would stream from a database cursor
      const mockData = await getMockExportData(query, fromDate, toDate, maxRows);

      for (const row of mockData.rows) {
        if (rowCount >= maxRows) {
          nextCursor = mockData.nextCursor;
          break;
        }

        transformer.write(row);
        rowCount++;

        // Backpressure handling
        if (!transformer.write(row)) {
          await new Promise((resolve) => transformer.once('drain', resolve));
        }
      }

      // Set cursor header if more data available
      if (nextCursor) {
        res.set('peac-cursor', nextCursor);
      }

      transformer.end();

      const duration = Date.now() - startTime;

      metrics.exportAttempts?.inc({ result: 'success', format: query.fmt });
      metrics.exportRowsStreamed?.inc({ format: query.fmt }, rowCount);
      metrics.exportDuration?.observe({ format: query.fmt }, duration);

      logger.info(
        {
          exportType: query.type,
          format: query.fmt,
          rowCount,
          duration,
          compressed: isCompressed,
          hasMore: !!nextCursor,
        },
        'Export completed successfully',
      );

      telemetry.logExportStream(req, {
        type: query.type!,
        format: query.fmt!,
        rows: rowCount,
        dur_ms: duration,
      });
    } catch (streamError) {
      logger.error(
        {
          error: streamError instanceof Error ? streamError.message : String(streamError),
          exportType: query.type,
          format: query.fmt,
        },
        'Export streaming failed',
      );

      // If headers already sent, can't send problem details
      if (res.headersSent) {
        res.destroy();
      } else {
        problemDetails.send(res, 'internal_error');
      }
    }
  } catch (error) {
    const duration = Date.now() - startTime;

    metrics.exportAttempts?.inc({ result: 'error' });

    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        duration,
      },
      'Export request failed',
    );

    if (!res.headersSent) {
      problemDetails.send(res, 'internal_error');
    }
  }
}

interface AuthResult {
  ok: boolean;
  method?: 'signature' | 'token' | 'mtls';
  reason?: string;
  thumbprint?: string;
}

async function authenticateExportRequest(req: Request): Promise<AuthResult> {
  // Check for mTLS authentication first
  const tlsSocket = (req as any).client;
  if (tlsSocket?.authorized && tlsSocket?.getPeerCertificate) {
    const cert = tlsSocket.getPeerCertificate();
    if (cert && cert.subject) {
      // Validate certificate subject against allowlist
      const allowedCNs = process.env.PEAC_EXPORT_MTLS_ALLOWED?.split(',') || [];
      const cn = cert.subject.CN;

      if (allowedCNs.length > 0 && !allowedCNs.includes(cn)) {
        return { ok: false, reason: 'mtls_cn_not_allowed' };
      }

      return { ok: true, method: 'mtls', thumbprint: cert.fingerprint };
    }
  }

  // Check for HTTP Message Signatures
  const wbaHeaders = parseWebBotAuthHeaders(req.headers);
  if (wbaHeaders.signature && wbaHeaders.signatureInput) {
    try {
      // For exports, we use the site receipt key for verification
      // This is a placeholder - real implementation would load the current site key
      const mockSiteKey = {
        jwk: {
          kty: 'OKP',
          crv: 'Ed25519',
          x: 'mock-public-key-bytes', // This would be the actual site public key
        },
        thumbprint: 'mock-thumbprint',
      };

      const verifyResult = await verifySignature(
        wbaHeaders.signature,
        wbaHeaders.signatureInput,
        req,
        mockSiteKey.jwk,
        Date.now(),
        120, // 2 minute skew
      );

      if (verifyResult.ok) {
        return {
          ok: true,
          method: 'signature',
          thumbprint: mockSiteKey.thumbprint,
        };
      }

      return { ok: false, reason: 'signature_invalid' };
    } catch (error) {
      return { ok: false, reason: 'signature_error' };
    }
  }

  // Check for Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    // Validate token against configured value
    const expectedToken = process.env.PEAC_EXPORT_TOKEN;
    if (!expectedToken) {
      return { ok: false, reason: 'token_not_configured' };
    }

    if (crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(expectedToken, 'utf8'))) {
      return { ok: true, method: 'token' };
    }

    return { ok: false, reason: 'token_invalid' };
  }

  return { ok: false, reason: 'missing_auth' };
}

async function getMockExportData(
  query: ExportQuery,
  fromDate: Date,
  toDate: Date,
  maxRows: number,
): Promise<{ rows: ExportRow[]; nextCursor?: string }> {
  // Mock implementation - real version would stream from database
  const rows: ExportRow[] = [];

  // Generate some mock data
  const startTime = fromDate.getTime();
  const endTime = toDate.getTime();
  const interval = (endTime - startTime) / Math.min(maxRows, 1000);

  for (let i = 0; i < Math.min(maxRows, 1000); i++) {
    const timestamp = new Date(startTime + i * interval);

    rows.push({
      timestamp: timestamp.toISOString(),
      path_hash: crypto
        .createHash('sha256')
        .update(`/api/path-${i}`)
        .digest('hex')
        .substring(0, 40),
      method: ['GET', 'POST', 'PUT', 'DELETE'][i % 4]!,
      tier: ['anonymous', 'attributed', 'verified'][i % 3] as any,
      policy_hash: crypto.createHash('sha256').update('policy').digest('hex').substring(0, 40),
      attribution: i % 3 === 1 ? `Agent ${i} (https://agent.example.com)` : undefined,
      receipt_id: query.type === 'receipts' ? crypto.randomUUID() : undefined,
    });
  }

  return { rows };
}
