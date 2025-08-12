/**
 * Negotiation Types
 * Normalized four-term schema (price, duration, usage, attribution_required).
 */

export type UsageCategory =
  | 'training'
  | 'inference'
  | 'analytics'
  | 'display'
  | 'cache';

export interface Terms {
  /** Minor currency units as a decimal-free string (e.g., "2500" for $25.00). */
  price: string;
  /** Duration in seconds. */
  duration: number;
  /** Usage category. */
  usage: UsageCategory;
  /** Whether attribution is required. */
  attribution_required: boolean;
}

export interface Offer {
  id: string;        // offer id (uuid)
  resource: string;  // URL or policy key
  terms: Terms;
  meta?: Record<string, unknown>;
}

export type Outcome = 'agreed' | 'rejected' | 'countered' | 'expired';
