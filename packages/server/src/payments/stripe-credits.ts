// Stripe "credits" placeholder for 0.9.5
export class StripeCreditsProvider {
  async processPayment(_body: unknown): Promise<string> {
    throw new Error('stripe_not_configured');
  }
}
