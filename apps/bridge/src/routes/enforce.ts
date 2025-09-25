/**
 * /enforce endpoint - Core orchestration with proper standards compliance
 * - Wire version: 0.9.13
 * - Media types: application/peac+json (success), application/problem+json (errors)
 * - Problem URIs: https://peacprotocol.org/problems/<slug>
 * - AIPREF mandatory in receipts
 * - Normalized payment object for 402
 */

import { Context } from 'hono';
import { enforce } from '@peac/core';
import { peacHeaders } from '../util/http.js';
import { recordEnforce } from './metrics.js';

const PROBLEM_BASE = 'https://peacprotocol.org/problems/';

export async function enforceRoute(c: Context) {
  const startTime = performance.now();

  try {
    const body = await c.req.json();
    const { resource, context = {}, options = {} } = body;

    // Validate required fields
    if (!resource || typeof resource !== 'string') {
      const problem = {
        type: PROBLEM_BASE + 'bad-request',
        title: 'Bad Request',
        status: 400,
        detail: 'Missing or invalid required field: resource',
        instance: `/enforce/${c.get('requestId')}`,
        extensions: {
          required_fields: ['resource'],
        },
      };
      const problemBody = JSON.stringify(problem);
      return c.newResponse(
        problemBody,
        400,
        peacHeaders({
          'Content-Type': 'application/problem+json; charset=utf-8',
          'X-Request-ID': c.get('requestId'),
        })
      );
    }

    // Add trace context if enabled
    const enrichedContext = { ...context };
    if (process.env.PEAC_INCLUDE_TRACE_IN_RECEIPT === 'true') {
      const traceparent = c.get('traceparent');
      if (traceparent) {
        enrichedContext.trace_id = traceparent;
      }
    }

    // Bridge-specific options
    const bridgeOptions = {
      issuer: 'https://bridge.peacprotocol.local',
      ...options,
    };

    // Call core enforce function
    const result = await enforce(resource, enrichedContext, bridgeOptions);

    // AIPREF shim (dev-phase): never mutate the JWS receipt.
    // If core did not include AIPREF, expose best-effort AIPREF as side info in success body.
    const aiprefSidecar =
      (result as any).claims?.aipref ??
      (result.decision?.policies?.some((p: any) => p.type === 'aipref')
        ? undefined
        : { status: 'not_applicable' });

    // Performance logging
    const elapsed = performance.now() - startTime;
    console.log(
      `Enforce: ${result.allowed ? 'allow' : result.problem?.status || 'deny'} in ${elapsed.toFixed(2)}ms`
    );

    if (result.allowed) {
      // Success response with application/peac+json
      const responseBody = JSON.stringify({
        allowed: true,
        decision: 'allow',
        receipt: result.receipt,
        policy_hash: (result as any).policy_hash, // rely on core; do not fabricate
        aipref: aiprefSidecar,
      });

      const res = c.newResponse(
        responseBody,
        200,
        peacHeaders(
          {
            'Content-Type': 'application/peac+json',
            'PEAC-Receipt': result.receipt || '',
            'X-Request-ID': c.get('requestId'),
          },
          true
        ) // Mark as sensitive - contains receipt
      );
      recordEnforce('allow', performance.now() - startTime);
      return res;
    }

    // Problem+JSON for deny/pay responses

    const status = result.problem?.status || 403;
    const isPaymentRequired = status === 402 || result.decision?.evaluation === 'payment_required';

    const problem = {
      type: PROBLEM_BASE + (isPaymentRequired ? 'payment-required' : 'access-denied'),
      title: isPaymentRequired ? 'Payment Required' : 'Access Denied',
      status: isPaymentRequired ? 402 : 403,
      detail: result.problem?.detail || 'Policy evaluation resulted in denial',
      instance: `/enforce/${c.get('requestId')}`,
      extensions: {},
    };

    // Normalized payment object for 402
    if (isPaymentRequired) {
      const settlement = result.decision?.settlement || {};
      (problem.extensions as any).payment = {
        rail: (settlement as any).rail || 'x402',
        amount: (settlement as any).amount?.value || '5.00',
        currency: (settlement as any).amount?.currency || 'USD',
        provider_ids: (settlement as any).provider_ids || [],
        evidence: (settlement as any).evidence || {},
        retry_after: (settlement as any).retry_after || 60,
      };
    }

    // Add policy metadata
    const problemData = result.problem as any;
    if (problemData?.['required-purpose']) {
      (problem.extensions as any).required_purpose = problemData['required-purpose'];
    }
    if (problemData?.['min-tier']) {
      (problem.extensions as any).min_tier = problemData['min-tier'];
    }
    if (problemData?.['policy-sources']) {
      (problem.extensions as any).policy_sources = problemData['policy-sources'];
    }

    const retryAfter = isPaymentRequired && (problem.extensions as any)?.payment?.retry_after;
    const headers = peacHeaders({
      'Content-Type': 'application/problem+json; charset=utf-8',
      'X-Request-ID': c.get('requestId'),
      ...(Number.isFinite(retryAfter) ? { 'Retry-After': String(retryAfter) } : {}),
    });
    const res = c.newResponse(JSON.stringify(problem), problem.status as any, headers);
    recordEnforce(isPaymentRequired ? 'pay' : 'deny', performance.now() - startTime);
    return res;
  } catch (error) {
    const elapsed = performance.now() - startTime;
    console.error(`Enforce error after ${elapsed.toFixed(2)}ms:`, error);

    const problem = {
      type: PROBLEM_BASE + 'internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred during policy evaluation',
      instance: `/enforce/${c.get('requestId')}`,
      extensions: {
        error_type: error instanceof Error ? error.constructor.name : 'UnknownError',
      },
    };
    const errorBody = JSON.stringify(problem);
    return c.newResponse(
      errorBody,
      500,
      peacHeaders({
        'Content-Type': 'application/problem+json; charset=utf-8',
        'X-Request-ID': c.get('requestId'),
      })
    );
  }
}
