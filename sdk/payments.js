/**
 * PEAC Protocol Payment Handler
 * Integrates with Stripe, HTTP 402, and future payment rails
 */

const stripe = require('stripe');

class PEACPayments {
  constructor(pact, options = {}) {
    this.pact = pact;
    this.options = options;
    
    // Initialize payment processors
    if (process.env.STRIPE_SECRET_KEY) {
      this.stripe = stripe(process.env.STRIPE_SECRET_KEY);
    }
  }

  async processPayment(request) {
    const { amount, currency = 'usd', purpose, processor } = request;

    // Validate against pact terms
    if (!this.validatePaymentTerms(purpose, amount)) {
      throw new Error('Payment terms do not match pact');
    }

    switch (processor) {
      case 'stripe':
        return this.processStripePayment(amount, currency, purpose);
      case 'http402':
        return this.processHTTP402Payment(amount, currency, purpose);
      default:
        throw new Error(`Unsupported payment processor: ${processor}`);
    }
  }

  async processStripePayment(amount, currency, purpose) {
    if (!this.stripe) {
      throw new Error('Stripe not configured');
    }

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      metadata: {
        pact_id: this.pact.id || 'unknown',
        pact_version: this.pact.version,
        purpose,
        domain: this.pact.metadata?.domain
      }
    });

    return {
      processor: 'stripe',
      payment_id: paymentIntent.id,
      client_secret: paymentIntent.client_secret,
      amount,
      currency,
      status: paymentIntent.status
    };
  }

  async processHTTP402Payment(amount, currency, purpose) {
    // HTTP 402 Payment Required implementation
    return {
      processor: 'http402',
      payment_required: true,
      amount,
      currency,
      accept_payment: this.pact.pact?.economics?.payment_endpoints?.http402,
      purpose
    };
  }

  validatePaymentTerms(purpose, amount) {
    const economics = this.pact.pact?.economics;
    if (!economics) return false;

    // Check if purpose is allowed
    const consent = this.pact.pact?.consent;
    if (consent && consent[purpose] === 'denied') {
      return false;
    }

    // Validate amount if specified
    if (economics.pricing) {
      // Simple validation - can be extended
      return true;
    }

    return true;
  }

  async createPaymentLink(amount, purpose) {
    if (!this.stripe) {
      throw new Error('Stripe not configured');
    }

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `PEAC Protocol Payment - ${purpose}`,
            description: `Payment for ${purpose} as per pact.txt`
          },
          unit_amount: Math.round(amount * 100)
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${this.options.success_url || 'https://example.com/success'}`,
      cancel_url: `${this.options.cancel_url || 'https://example.com/cancel'}`
    });

    return session.url;
  }
}

module.exports = PEACPayments;