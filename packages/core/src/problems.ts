export const PROBLEM_BASE_URI = 'https://peacprotocol.org/problems/';

export type ProblemType =
  | 'payment-required'
  | 'policy-not-found'
  | 'replay-detected'
  | 'policy-denied'
  | 'invalid-receipt'
  | 'rate-limited';

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [key: string]: unknown;
}

export class ProblemFactory {
  static create(type: ProblemType, context: any): Problem {
    const catalog: Record<ProblemType, (ctx: any) => Problem> = {
      'payment-required': (ctx: { scheme: string; network?: string; amount?: string }) => ({
        type: `${PROBLEM_BASE_URI}payment-required`,
        title: 'Payment Required',
        status: 402,
        detail: `This resource requires payment via ${ctx.scheme}`,
        requirements: {
          scheme: ctx.scheme,
          ...(ctx.network && { network: ctx.network }),
          ...(ctx.amount && { amount: ctx.amount }),
        },
      }),

      'policy-not-found': (ctx: { url: string; searched: string[] }) => ({
        type: `${PROBLEM_BASE_URI}policy-not-found`,
        title: 'Policy Not Found',
        status: 404,
        detail: `No policy found for ${ctx.url}`,
        searched_locations: ctx.searched,
      }),

      'replay-detected': (ctx: { jti: string; first_seen: number }) => ({
        type: `${PROBLEM_BASE_URI}replay-detected`,
        title: 'Replay Detected',
        status: 409,
        detail: `Receipt ${ctx.jti} was already used`,
        first_seen: ctx.first_seen,
        jti: ctx.jti,
      }),

      'policy-denied': (ctx: { reason: string; policy_url?: string }) => ({
        type: `${PROBLEM_BASE_URI}policy-denied`,
        title: 'Policy Denied',
        status: 403,
        detail: `Access denied: ${ctx.reason}`,
        ...(ctx.policy_url && { policy_url: ctx.policy_url }),
      }),

      'invalid-receipt': (ctx: { error: string; field?: string }) => ({
        type: `${PROBLEM_BASE_URI}invalid-receipt`,
        title: 'Invalid Receipt',
        status: 400,
        detail: `Receipt validation failed: ${ctx.error}`,
        ...(ctx.field && { invalid_field: ctx.field }),
      }),

      'rate-limited': (ctx: { retry_after: number; limit: number }) => ({
        type: `${PROBLEM_BASE_URI}rate-limited`,
        title: 'Rate Limited',
        status: 429,
        detail: `Rate limit exceeded. Limit: ${ctx.limit} requests`,
        'retry-after': ctx.retry_after,
      }),
    };

    const factory = catalog[type];
    if (!factory) {
      throw new Error(`Unknown problem type: ${type}`);
    }

    const problem = factory(context);

    if (context.traceId || context.instance) {
      problem.instance = context.instance || `/trace/${context.traceId}`;
    }

    return problem;
  }

  static isValidProblem(obj: any): obj is Problem {
    return (
      obj?.type?.startsWith(PROBLEM_BASE_URI) &&
      typeof obj.title === 'string' &&
      typeof obj.status === 'number'
    );
  }
}

export const Problems = {
  paymentRequired: (scheme: string, network?: string, amount?: string, traceId?: string) =>
    ProblemFactory.create('payment-required', { scheme, network, amount, traceId }),

  policyNotFound: (url: string, searched: string[], traceId?: string) =>
    ProblemFactory.create('policy-not-found', { url, searched, traceId }),

  replayDetected: (jti: string, firstSeen: number, traceId?: string) =>
    ProblemFactory.create('replay-detected', { jti, first_seen: firstSeen, traceId }),

  policyDenied: (reason: string, policyUrl?: string, traceId?: string) =>
    ProblemFactory.create('policy-denied', { reason, policy_url: policyUrl, traceId }),

  invalidReceipt: (error: string, field?: string, traceId?: string) =>
    ProblemFactory.create('invalid-receipt', { error, field, traceId }),

  rateLimited: (retryAfter: number, limit: number, traceId?: string) =>
    ProblemFactory.create('rate-limited', { retry_after: retryAfter, limit, traceId }),
};
