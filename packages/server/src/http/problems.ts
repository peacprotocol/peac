import { Response } from 'express';

export interface ProblemDetails {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [key: string]: unknown;
}

export class ProblemDetailsHandler {
  private readonly problemMap: Map<string, ProblemDetails> = new Map([
    [
      'validation_error',
      {
        type: 'https://peacprotocol.org/problems/validation-error',
        title: 'Validation Error',
        status: 400,
      },
    ],
    [
      'authentication_required',
      {
        type: 'https://peacprotocol.org/problems/authentication-required',
        title: 'Authentication Required',
        status: 401,
      },
    ],
    [
      'insufficient_permissions',
      {
        type: 'https://peacprotocol.org/problems/insufficient-permissions',
        title: 'Insufficient Permissions',
        status: 403,
      },
    ],
    [
      'not_found',
      {
        type: 'https://peacprotocol.org/problems/not-found',
        title: 'Not Found',
        status: 404,
      },
    ],
    [
      'resource_not_found',
      {
        type: 'https://peacprotocol.org/problems/resource-not-found',
        title: 'Resource Not Found',
        status: 404,
      },
    ],
    [
      'not_acceptable',
      {
        type: 'https://peacprotocol.org/problems/not-acceptable',
        title: 'Not Acceptable',
        status: 406,
      },
    ],
    [
      'unsupported_media_type',
      {
        type: 'https://peacprotocol.org/problems/unsupported-media-type',
        title: 'Unsupported Media Type',
        status: 415,
      },
    ],
    [
      'invalid_reference',
      {
        type: 'https://peacprotocol.org/problems/invalid-reference',
        title: 'Unprocessable Entity',
        status: 422,
      },
    ],
    [
      'protocol_error',
      {
        type: 'https://peacprotocol.org/problems/protocol-error',
        title: 'Upgrade Required',
        status: 426,
      },
    ],
    [
      'protocol_version_required',
      {
        type: 'https://peacprotocol.org/problems/protocol-version-required',
        title: 'Upgrade Required',
        status: 426,
      },
    ],
    [
      'protocol_version_unsupported',
      {
        type: 'https://peacprotocol.org/problems/protocol-version-unsupported',
        title: 'Upgrade Required',
        status: 426,
      },
    ],
    [
      'rate_limit_exceeded',
      {
        type: 'https://peacprotocol.org/problems/rate-limit-exceeded',
        title: 'Rate Limit Exceeded',
        status: 429,
      },
    ],
    [
      'fingerprint_mismatch',
      {
        type: 'https://peacprotocol.org/problems/fingerprint-mismatch',
        title: 'Conflict',
        status: 409,
      },
    ],
    [
      'agreement_mismatch',
      {
        type: 'https://peacprotocol.org/problems/agreement-mismatch',
        title: 'Conflict',
        status: 409,
      },
    ],
    [
      'webhook_signature_invalid',
      {
        type: 'https://peacprotocol.org/problems/webhook-signature-invalid',
        title: 'Unauthorized',
        status: 401,
      },
    ],
    [
      'internal_error',
      {
        type: 'https://peacprotocol.org/problems/internal-error',
        title: 'Internal Server Error',
        status: 500,
      },
    ],
    [
      'not_implemented',
      {
        type: 'https://peacprotocol.org/problems/not-implemented',
        title: 'Not Implemented',
        status: 501,
      },
    ],
    [
      'payment_provider_unavailable',
      {
        type: 'https://peacprotocol.org/problems/payment-provider-unavailable',
        title: 'Payment Provider Unavailable',
        status: 503,
      },
    ],
  ]);

  send(res: Response, problemType: string, extensions?: Record<string, unknown>): void {
    const problem = this.problemMap.get(problemType) || {
      type: 'about:blank',
      title: 'Unknown Error',
      status: 500,
    };

    const response: ProblemDetails = {
      ...problem,
      ...extensions,
    };

    // Add trace_id from X-Request-Id if available
    const requestId = res.get('X-Request-Id');
    if (requestId) {
      response.trace_id = requestId;
    }

    // Add instance URI if not provided
    if (!response.instance) {
      response.instance = res.req?.originalUrl || res.req?.url || undefined;
    }

    // Add retry hints for specific problems
    if (problemType === 'rate_limit_exceeded' && extensions?.retry_after) {
      res.set('Retry-After', String(extensions.retry_after));
    }

    if (problemType === 'authentication_required') {
      res.set('WWW-Authenticate', 'DPoP realm="PEAC"');
    }

    // Set proper Content-Type for RFC 7807
    res.set('Content-Type', 'application/problem+json');
    res.status(response.status).json(response);
  }

  createProblem(
    status: number,
    title: string,
    detail?: string,
    extensions?: Record<string, unknown>
  ): ProblemDetails {
    return {
      type: 'about:blank',
      title,
      status,
      detail,
      ...extensions,
    };
  }
}

export const problemDetails = new ProblemDetailsHandler();
