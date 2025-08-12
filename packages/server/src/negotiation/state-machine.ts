/**
 * Negotiation State Machine
 * Deterministic transitions for a compact four-term negotiation.
 */

import type { Offer, Terms, Outcome } from './types';

export type State = 'INIT' | 'OFFERED' | 'COUNTERED' | 'AGREED' | 'REJECTED' | 'EXPIRED';

export interface Context {
  resource: string;
  current?: Offer;
  rounds: number;
  maxRounds: number;
}

export type Event =
  | { type: 'MAKE_OFFER'; offer: Offer }
  | { type: 'COUNTER'; offer: Offer }
  | { type: 'ACCEPT' }
  | { type: 'REJECT' }
  | { type: 'TIMEOUT' };

export interface Transition {
  state: State;
  ctx: Context;
  outcome?: Outcome;
}

export function step(state: State, ctx: Context, ev: Event): Transition {
  switch (state) {
    case 'INIT':
      if (ev.type === 'MAKE_OFFER') {
        return { state: 'OFFERED', ctx: { ...ctx, current: ev.offer, rounds: 1 } };
      }
      return { state, ctx };

    case 'OFFERED':
      if (ev.type === 'ACCEPT') return { state: 'AGREED', ctx, outcome: 'agreed' };
      if (ev.type === 'REJECT') return { state: 'REJECTED', ctx, outcome: 'rejected' };
      if (ev.type === 'COUNTER') {
        const rounds = ctx.rounds + 1;
        if (rounds > ctx.maxRounds) return { state: 'EXPIRED', ctx, outcome: 'expired' };
        return { state: 'COUNTERED', ctx: { ...ctx, current: ev.offer, rounds } };
      }
      if (ev.type === 'TIMEOUT') return { state: 'EXPIRED', ctx, outcome: 'expired' };
      return { state, ctx };

    case 'COUNTERED':
      if (ev.type === 'ACCEPT') return { state: 'AGREED', ctx, outcome: 'agreed' };
      if (ev.type === 'REJECT') return { state: 'REJECTED', ctx, outcome: 'rejected' };
      if (ev.type === 'COUNTER') {
        const rounds = ctx.rounds + 1;
        if (rounds > ctx.maxRounds) return { state: 'EXPIRED', ctx, outcome: 'expired' };
        return { state: 'COUNTERED', ctx: { ...ctx, current: ev.offer, rounds } };
      }
      if (ev.type === 'TIMEOUT') return { state: 'EXPIRED', ctx, outcome: 'expired' };
      return { state, ctx };

    default:
      return { state, ctx };
  }
}

/** Normalization helper for the four-term schema. */
export function normalizeTerms(t: Terms): Terms {
  return {
    price: String(BigInt(t.price)),
    duration: Math.max(1, Math.floor(t.duration)),
    usage: t.usage,
    attribution_required: !!t.attribution_required,
  };
}
