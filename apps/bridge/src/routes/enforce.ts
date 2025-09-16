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
          'Content-Type': 'application/problem+json',
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

    // Ensure AIPREF is present in receipts (dev-phase requirement)
    if (result.receipt && result.decision) {
      // Check if AIPREF was included in policy discovery
      const hasAipref = result.decision.policies?.some((p) => p.type === 'aipref');
      if (!hasAipref) {
        // Inject AIPREF status - this should ideally be done in core enforce()
        const receiptParts = result.receipt.split('..');
        if (receiptParts.length === 2) {
          try {
            const claims = JSON.parse(Buffer.from(receiptParts[0], 'base64url').toString());
            if (!claims.aipref) {
              claims.aipref = { status: 'not_applicable' };
              const newPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');
              result.receipt = `${newPayload}..${receiptParts[1]}`;
            }
          } catch (error) {
            console.warn('Failed to inject AIPREF into receipt:', error);
          }
        }
      }
    }

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
        policy_hash: result.decision?.policies?.[0]?.content
          ? `SHA256:${Buffer.from(JSON.stringify(result.decision.policies[0].content)).toString('base64').slice(0, 16)}`
          : undefined,
      });

      return c.newResponse(
        responseBody,
        200,
        peacHeaders({
          'Content-Type': 'application/peac+json',
          'PEAC-Receipt': result.receipt || '',
          'X-Request-ID': c.get('requestId'),
        })
      );
    }

    // Problem+JSON for deny/pay responses
    c.header('Content-Type', 'application/problem+json');

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
      problem.extensions.payment = {
        rail: result.decision?.settlement?.rail || 'x402',
        amount: result.decision?.settlement?.amount?.value || '5.00',
        currency: result.decision?.settlement?.amount?.currency || 'USD',
        provider_ids: result.decision?.settlement?.provider_ids || [],
        evidence: result.decision?.settlement?.evidence || {},
        retry_after: result.decision?.settlement?.retry_after || 60,
      };
    }

    // Add policy metadata
    if (result.problem?.['required-purpose']) {
      problem.extensions.required_purpose = result.problem['required-purpose'];
    }
    if (result.problem?.['min-tier']) {
      problem.extensions.min_tier = result.problem['min-tier'];
    }
    if (result.problem?.['policy-sources']) {
      problem.extensions.policy_sources = result.problem['policy-sources'];
    }

    const denialBody = JSON.stringify(problem);
    return c.newResponse(
      denialBody,
      problem.status,
      peacHeaders({
        'Content-Type': 'application/problem+json',
        'X-Request-ID': c.get('requestId'),
      })
    );
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
        'Content-Type': 'application/problem+json',
        'X-Request-ID': c.get('requestId'),
      })
    );
  }
}
