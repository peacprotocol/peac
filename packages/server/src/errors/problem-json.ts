/**
 * RFC7807 Problem Details Implementation
 */

import * as crypto from 'crypto';
import pino from 'pino';

const logger = pino({ name: 'problem-json' });

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  trace_id: string;
  'x-peac-retry-after'?: number;
  'x-peac-idempotency-key'?: string;
  'x-peac-advice'?: string;
}

// Core problem types
export enum ProblemType {
  AGREEMENT_NOT_FOUND = 'peac_agreement_not_found',
  AGREEMENT_INVALID = 'peac_agreement_invalid',
  AGREEMENT_EXPIRED = 'peac_agreement_expired',
  PAYMENT_INSUFFICIENT_FUNDS = 'peac_payment_insufficient_funds',
  PAYMENT_DUPLICATE_IDEMPOTENCY = 'peac_payment_duplicate_idempotency',
  PAYMENT_LIMIT_EXCEEDED = 'peac_payment_limit_exceeded',
  AUTH_INVALID_TOKEN = 'peac_auth_invalid_token',
  AUTH_EXPIRED = 'peac_auth_expired',
  AUTH_INSUFFICIENT_SCOPE = 'peac_auth_insufficient_scope',
  RATE_LIMIT_EXCEEDED = 'peac_rate_limit_exceeded',
  VALIDATION_INVALID_FIELD = 'peac_validation_invalid_field',
  PROVIDER_NOT_FOUND = 'peac_provider_not_found',
  PROVIDER_UNAVAILABLE = 'peac_provider_unavailable',
  PROVIDER_NO_MATCH = 'peac_provider_no_match',
  RECEIPT_VERIFICATION_FAILED = 'peac_receipt_verification_failed',
  CAPABILITY_NOT_SUPPORTED = 'peac_capability_not_supported',
  WEBHOOK_INVALID_SIGNATURE = 'peac_webhook_invalid_signature',
  PROTOCOL_VERSION_MISMATCH = 'peac_protocol_version_mismatch',
  INTERNAL_SERVER_ERROR = 'peac_internal_server_error',
}

const ADVICE_MAP: Record<string, string> = {
  peac_rate_limit_exceeded: 'Wait for the duration specified in x-peac-retry-after header',
  peac_auth_invalid_token: 'Check your API key is correct and active',
  peac_auth_expired: 'Obtain a new token',
  peac_payment_insufficient_funds: 'Top up your account balance',
  peac_payment_duplicate_idempotency:
    'Use a different idempotency key or check the original request status',
  peac_protocol_version_mismatch:
    'Update your client to a compatible version (check version_negotiation in discovery)',
  peac_validation_invalid_field: 'Check the field constraints in the API documentation',
  peac_capability_not_supported: 'This capability is not available - check discovery document',
  peac_internal_server_error:
    'An internal error occurred - please try again or contact support if it persists',
  peac_uda_missing: 'Obtain user delegation via OAuth device flow',
  peac_uda_invalid: 'Check your UDA token is valid and not expired',
  peac_uda_untrusted_issuer: 'The UDA issuer is not in the trusted list',
  peac_uda_replay: 'This UDA token has already been used',
  peac_uda_insufficient_entitlement: 'User does not have access to this resource',
  peac_uda_key_binding_failed: 'Agent key does not match UDA key binding',
  peac_attestation_required: 'Include X-PEAC-Agent-Attestation header',
  peac_attestation_invalid: 'Check your attestation token is valid',
  peac_attestation_revoked: 'This attestation has been revoked',
  peac_attestation_expired: 'Attestation has expired, obtain a new one',
  peac_attestation_audience_mismatch: 'Attestation audience does not match this service',
  peac_dpop_missing: 'Include DPoP header with proof of possession',
  peac_dpop_invalid: 'DPoP proof is invalid or malformed',
  peac_dpop_replay: 'This DPoP proof has already been used',
  peac_dpop_binding_mismatch: 'DPoP key does not match token binding',
};

export class PEACError extends Error {
  public problem: ProblemDetails;

  constructor(type: string, detail?: string, status?: number) {
    const title = type
      .replace(/_/g, ' ')
      .replace(/peac /i, '')
      .replace(/\b\w/g, (l) => l.toUpperCase());
    super(detail || title);

    this.problem = {
      type: `https://docs.peacprotocol.org/problems/${type}`,
      title,
      status: status || this.getDefaultStatus(type),
      detail,
      trace_id: this.generateTraceId(),
      'x-peac-advice': ADVICE_MAP[type],
    };
  }

  private getDefaultStatus(type: string): number {
    if (type.includes('not_found')) return 404;
    if (type.includes('invalid') || type.includes('expired')) return 400;
    if (type.includes('auth') || type.includes('missing')) return 401;
    if (type.includes('insufficient') || type.includes('mismatch')) return 403;
    if (type.includes('rate_limit')) return 429;
    if (type.includes('internal')) return 500;
    if (type.includes('unavailable')) return 503;
    if (type.includes('version')) return 406;
    return 400;
  }

  private generateTraceId(): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof global !== 'undefined' && (global as any).currentRequest?.headers?.traceparent) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (global as any).currentRequest.headers.traceparent.split('-')[1];
    }
    return crypto.randomBytes(16).toString('hex');
  }

  toJSON(): ProblemDetails {
    return this.problem;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static handler(
    err: Error & { status?: number; code?: string },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res: any,
    _next: () => void,
  ) {
    const traceId =
      req.headers['traceparent']?.split('-')[1] || crypto.randomBytes(16).toString('hex');

    logger.error(
      {
        err,
        trace_id: traceId,
        method: req.method,
        path: req.path,
      },
      'Request error',
    );

    let problem: ProblemDetails;

    if (err instanceof PEACError) {
      problem = err.problem;
      problem.trace_id = traceId;
    } else if (err.status && err.message) {
      problem = {
        type: 'https://docs.peacprotocol.org/problems/generic_error',
        title: 'Error',
        status: err.status,
        detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
        trace_id: traceId,
      };
    } else {
      problem = {
        type: `https://docs.peacprotocol.org/problems/peac_internal_server_error`,
        title: 'Internal Server Error',
        status: 500,
        detail:
          process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
        trace_id: traceId,
        'x-peac-advice': 'Please try again or contact support if the issue persists',
      };
    }

    res.status(problem.status).set('Content-Type', 'application/problem+json').json(problem);
  }
}
