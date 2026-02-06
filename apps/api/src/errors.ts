/**
 * @peac/api/errors - RFC 9457 Problem Details error generator
 * Standardized error responses for PEAC verify API
 */

import type { ProblemDetails, VerifyErrorDetails, ErrorContext, HttpStatus } from './types.js';

export class ProblemError extends Error {
  constructor(
    public status: HttpStatus,
    public problemType: string,
    public title: string,
    public detail?: string,
    public instance?: string,
    public extensions?: Record<string, unknown>
  ) {
    super(title);
    this.name = 'ProblemError';
  }

  toProblemDetails(): ProblemDetails {
    return {
      type: this.problemType,
      title: this.title,
      status: this.status,
      detail: this.detail,
      instance: this.instance,
      ...this.extensions,
    };
  }
}

/** Shape used by isProblemError for duck-typed detection */
interface ProblemErrorLike {
  name: string;
  status: number;
  toProblemDetails: () => ProblemDetails;
}

/**
 * Duck-typed ProblemError detection.
 *
 * Bundlers (tsup) can duplicate the ProblemError class, breaking instanceof.
 * This predicate checks by shape so error handlers work across bundle boundaries.
 */
export function isProblemError(err: unknown): err is ProblemErrorLike {
  return (
    err instanceof Error &&
    err.name === 'ProblemError' &&
    typeof (err as any).toProblemDetails === 'function'
  );
}

export function createProblemDetails(ctx: ErrorContext, instance?: string): VerifyErrorDetails {
  const baseUrl = 'https://www.peacprotocol.org/problems';

  const problems: Record<string, { status: number; title: string; detail: string }> = {
    'invalid-jws-format': {
      status: 400,
      title: 'Invalid JWS Format',
      detail: 'The provided receipt is not a valid JWS compact serialization',
    },
    'missing-receipt': {
      status: 400,
      title: 'Missing Receipt',
      detail: 'Receipt parameter is required in request body',
    },
    'invalid-signature': {
      status: 422,
      title: 'Invalid Signature',
      detail: 'Receipt signature verification failed',
    },
    'unknown-key-id': {
      status: 422,
      title: 'Unknown Key ID',
      detail: 'The kid in the receipt header is not recognized',
    },
    'schema-validation-failed': {
      status: 422,
      title: 'Schema Validation Failed',
      detail: 'Receipt payload does not conform to PEAC schema',
    },
    'expired-receipt': {
      status: 422,
      title: 'Expired Receipt',
      detail: 'Receipt timestamp is outside acceptable window',
    },
    'processing-error': {
      status: 500,
      title: 'Processing Error',
      detail: 'An internal error occurred while processing the receipt',
    },
  };

  const problem = problems[ctx.code] || problems['processing-error'];

  return {
    type: `${baseUrl}/${ctx.code}`,
    title: problem.title,
    status: problem.status,
    detail: ctx.details?.join('; ') || problem.detail,
    instance,
    'peac-error-code': ctx.code,
    'peac-trace-id': ctx.traceId,
    'validation-failures': ctx.details,
  };
}

export function handleVerifyError(
  error: unknown,
  instance?: string
): { status: HttpStatus; body: VerifyErrorDetails } {
  let ctx: ErrorContext;

  if (error instanceof ProblemError) {
    return {
      status: error.status,
      body: error.toProblemDetails() as VerifyErrorDetails,
    };
  }

  if (error instanceof Error) {
    // Map common errors to structured responses
    if (error.message.includes('Invalid JWS')) {
      ctx = { code: 'invalid-jws-format', category: 'validation' };
    } else if (error.message.includes('Unknown key')) {
      ctx = { code: 'unknown-key-id', category: 'authentication' };
    } else if (error.message.includes('signature')) {
      ctx = { code: 'invalid-signature', category: 'validation' };
    } else if (error.message.includes('schema')) {
      ctx = { code: 'schema-validation-failed', category: 'validation' };
    } else {
      ctx = {
        code: 'processing-error',
        category: 'processing',
        details: [error.message],
      };
    }
  } else {
    ctx = {
      code: 'processing-error',
      category: 'processing',
      details: [String(error)],
    };
  }

  const problemDetails = createProblemDetails(ctx, instance);
  return {
    status: problemDetails.status as HttpStatus,
    body: problemDetails,
  };
}

// Convenience function for validation errors
export function validationError(
  details: string[],
  instance?: string
): { status: HttpStatus; body: VerifyErrorDetails } {
  const ctx: ErrorContext = {
    code: 'schema-validation-failed',
    category: 'validation',
    details,
  };

  const problemDetails = createProblemDetails(ctx, instance);
  return {
    status: 422,
    body: problemDetails,
  };
}
