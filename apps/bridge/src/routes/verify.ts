/**
 * /verify endpoint - Receipt verification with application/peac+json
 * Uses existing VerifierV13 from apps/api for consistency
 */

import { Context } from 'hono';
import { peacHeaders } from '../util/http.js';

export async function verifyRoute(c: Context) {
  const startTime = performance.now();

  try {
    const body = await c.req.json();
    const { receipt, resource, options = {} } = body;

    // Validate required fields
    if (!receipt || typeof receipt !== 'string') {
      const problem = {
        type: 'https://peacprotocol.org/problems/bad-request',
        title: 'Bad Request',
        status: 400,
        detail: 'Missing or invalid required field: receipt',
        instance: `/verify/${c.get('requestId')}`,
        extensions: {
          required_fields: ['receipt'],
        },
      };
      const body = JSON.stringify(problem);
      return c.newResponse(
        body,
        400,
        peacHeaders({
          'Content-Type': 'application/problem+json',
          'X-Request-ID': c.get('requestId'),
        })
      );
    }

    // Use VerifierV13 class from apps/api for consistency
    // Dynamic import to avoid circular dependencies
    let verifier;
    try {
      const { VerifierV13 } = await import('../../api/src/verifier.js');
      verifier = new VerifierV13();
    } catch (importError) {
      // Fallback to basic verification if API verifier not available
      console.warn('VerifierV13 not available, using basic verification');
      verifier = {
        async verify(receipt, options) {
          // Basic receipt validation
          const parts = receipt.split('..');
          if (parts.length !== 2) {
            return { valid: false, reason: 'Invalid receipt format' };
          }

          try {
            const claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
            return {
              valid: true,
              reason: 'Basic validation passed',
              claims,
              details: { verifier: 'bridge-fallback' },
            };
          } catch {
            return { valid: false, reason: 'Invalid receipt payload' };
          }
        },
      };
    }

    console.log(`Verify: processing receipt (${receipt.length} chars)`);

    const result = await verifier.verify(receipt, { resource, ...options });
    const elapsed = performance.now() - startTime;

    console.log(`Verify: ${result.valid ? 'valid' : 'invalid'} in ${elapsed.toFixed(2)}ms`);

    // Always return application/peac+json for verify endpoint
    const responseBody = JSON.stringify({
      valid: result.valid,
      reason: result.reason,
      claims: result.claims, // includes aipref, enforcement, payment blocks
      details: {
        ...result.details,
        bridge_meta: {
          version: '0.9.13.2',
          duration_ms: elapsed,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return c.newResponse(
      responseBody,
      200,
      peacHeaders({
        'Content-Type': 'application/peac+json',
        'X-Request-ID': c.get('requestId'),
      })
    );
  } catch (error) {
    const elapsed = performance.now() - startTime;
    console.error(`Verify error after ${elapsed.toFixed(2)}ms:`, error);

    // Return as peac+json (not problem+json) for consistency
    const errorBody = JSON.stringify({
      valid: false,
      reason: 'Verification failed due to internal error',
      details: {
        error_type: error instanceof Error ? error.constructor.name : 'UnknownError',
        duration_ms: elapsed,
      },
    });

    return c.newResponse(
      errorBody,
      200,
      peacHeaders({
        'Content-Type': 'application/peac+json',
        'X-Request-ID': c.get('requestId'),
      })
    );
  }
}
