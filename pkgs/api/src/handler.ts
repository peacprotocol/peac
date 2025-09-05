/**
 * @peac/api/handler - PEAC verify API handler
 * /peac/verify endpoint with RFC 9457 Problem Details
 */

import { handleVerifyError, validationError } from './errors.js';
import type { VerifyRequest, VerifyResponse, HttpStatus } from './types.js';

export interface VerifyContext {
  verifyFn: (jws: string, keys: Record<string, any>) => Promise<any>;
  defaultKeys: Record<string, any>;
  generateTraceId?: () => string;
}

export class VerifyApiHandler {
  constructor(private ctx: VerifyContext) {}

  async handle(
    request: VerifyRequest,
    instance?: string,
  ): Promise<{ status: HttpStatus; body: VerifyResponse | any }> {
    try {
      // Validate request format
      const validation = this.validateRequest(request);
      if (!validation.valid) {
        const error = validationError(validation.errors!, instance);
        return error;
      }

      // Use provided keys or defaults
      const keys = request.keys || this.ctx.defaultKeys;

      // Verify the receipt
      const result = await this.ctx.verifyFn(request.receipt, keys);

      // Build successful response
      const response: VerifyResponse = {
        valid: true,
        receipt: {
          header: result.hdr,
          payload: result.obj,
        },
        verification: {
          signature: 'valid',
          schema: 'valid',
          timestamp: new Date().toISOString(),
          key_id: result.hdr.kid,
        },
      };

      return {
        status: 200,
        body: response,
      };
    } catch (error) {
      return handleVerifyError(error, instance);
    }
  }

  private validateRequest(request: VerifyRequest): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!request) {
      errors.push('Request body is required');
    } else {
      if (!request.receipt) {
        errors.push('receipt field is required');
      } else if (typeof request.receipt !== 'string') {
        errors.push('receipt must be a string');
      } else if (!this.isValidJwsFormat(request.receipt)) {
        errors.push('receipt must be a valid JWS compact serialization (header.payload.signature)');
      }

      if (request.keys && typeof request.keys !== 'object') {
        errors.push('keys must be an object');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private isValidJwsFormat(jws: string): boolean {
    const parts = jws.split('.');
    if (parts.length !== 3) return false;

    // Basic base64url format check
    const base64urlPattern = /^[A-Za-z0-9_-]+$/;
    return parts.every((part) => base64urlPattern.test(part));
  }
}

// Express.js adapter
export function createExpressHandler(ctx: VerifyContext) {
  const handler = new VerifyApiHandler(ctx);

  return async (req: any, res: any) => {
    const instance = req.originalUrl || req.url;
    const result = await handler.handle(req.body, instance);

    res.status(result.status);

    if (result.status !== 200) {
      res.set('Content-Type', 'application/problem+json');
    } else {
      res.set('Content-Type', 'application/json');
    }

    res.json(result.body);
  };
}

// Hono adapter
export function createHonoHandler(ctx: VerifyContext) {
  const handler = new VerifyApiHandler(ctx);

  return async (c: any) => {
    const body = await c.req.json();
    const instance = c.req.url;
    const result = await handler.handle(body, instance);

    const headers = {
      'Content-Type': result.status === 200 ? 'application/json' : 'application/problem+json',
    };

    return c.json(result.body, result.status, headers);
  };
}

// Generic handler for any framework
export function createGenericHandler(ctx: VerifyContext) {
  return new VerifyApiHandler(ctx);
}
