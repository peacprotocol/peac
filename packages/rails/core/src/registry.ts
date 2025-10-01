import type { PaymentRail } from './types.js';

export class RailRegistry {
  private rails = new Map<string, PaymentRail>();

  register(rail: PaymentRail): void {
    if (this.rails.has(rail.name)) {
      throw new Error(`Rail ${rail.name} already registered`);
    }
    this.rails.set(rail.name, rail);
  }

  get(name: PaymentRail['name']): PaymentRail {
    const rail = this.rails.get(name);
    if (!rail) {
      throw new Error(`Rail ${name} not found in registry`);
    }
    return rail;
  }

  /**
   * Select rail based on preference or default to first available
   */
  select(preferred?: PaymentRail['name']): PaymentRail {
    if (preferred) {
      return this.get(preferred);
    }

    // Default to x402 if available, otherwise first registered
    if (this.rails.has('x402')) {
      return this.rails.get('x402')!;
    }

    const first = Array.from(this.rails.values())[0];
    if (!first) {
      throw new Error('No payment rails registered');
    }
    return first;
  }

  list(): PaymentRail[] {
    return Array.from(this.rails.values());
  }
}
