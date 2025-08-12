/**
 * Negotiation Engine
 * Deterministic wrapper over the state machine with optional latency metrics.
 * Not imported by the HTTP runtime in v0.9.3.
 */

import { normalizeTerms, step, type Context } from './state-machine';
import type { Offer, Terms } from './types';

type Histogram = { observe: (labels: Record<string, string>, value: number) => void };
let hist: Histogram | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { metrics } = require('../metrics');
  hist = (metrics && 'negotiationLatency' in metrics && typeof metrics.negotiationLatency === 'object' ? metrics.negotiationLatency : undefined) as Histogram | undefined;
} catch {
  /* metrics optional */
}

export interface EngineOptions {
  maxRounds?: number; // default 3
}

export class NegotiationEngine {
  private readonly maxRounds: number;

  constructor(opts?: EngineOptions) {
    this.maxRounds = opts?.maxRounds ?? 3;
  }

  /** Runs one negotiation loop. */
  run(
    resource: string,
    initial: Offer,
    counters: Offer[]
  ): { final: Offer | null; outcome: 'agreed' | 'rejected' | 'expired' } {
    const started = Date.now();
    const ctx: Context = { resource, current: undefined, rounds: 0, maxRounds: this.maxRounds };

    const init = { ...initial, terms: normalizeTerms(initial.terms) };
    step('INIT', ctx, { type: 'MAKE_OFFER', offer: init });

    let last = init;
    for (const c of counters) {
      const next = { ...c, terms: normalizeTerms(c.terms) };
      step('OFFERED', ctx, { type: 'COUNTER', offer: next });
      last = next;
      if (ctx.rounds >= ctx.maxRounds) break;
    }

    if (ctx.rounds <= ctx.maxRounds && last) {
      const ms = Date.now() - started;
      hist?.observe({ resource, outcome: 'agreed' }, ms / 1000);
      return { final: last, outcome: 'agreed' };
    }

    const ms = Date.now() - started;
    hist?.observe({ resource, outcome: 'expired' }, ms / 1000);
    return { final: null, outcome: 'expired' };
  }

  /** Normalizes terms to the canonical format. */
  normalize(terms: Terms): Terms {
    return normalizeTerms(terms);
  }
}
