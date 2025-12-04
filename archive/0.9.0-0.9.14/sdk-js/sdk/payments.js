/**
 * PEAC Protocol Payment Handler v0.9.2
 * Integrates multiple payment processors
 * @license Apache-2.0
 */

const stripe = require('stripe');
const fetch = require('node-fetch');

class PEACPayments {
  constructor(peac, options = {}) {
    this.peac = peac;
    this.options = options;

    // Initialize payment processors
    this.processors = {
      stripe: this.initStripe(),
      bridge: this.initBridge(),
      paypal: this.initPayPal(),
      x402: this.initX402(),
    };
  }

  initStripe() {
    if (process.env.STRIPE_SECRET_KEY) {
      return stripe(process.env.STRIPE_SECRET_KEY);
    }
    return null;
  }

  initBridge() {
    return {
      apiKey: process.env.BRIDGE_API_KEY,
      endpoint: 'https://api.bridge.xyz',
    };
  }

  initPayPal() {
    return {
      clientId: process.env.PAYPAL_CLIENT_ID,
      secret: process.env.PAYPAL_SECRET,
      endpoint: process.env.PAYPAL_API_URL || 'https://api.paypal.com',
    };
  }

  initX402() {
    return {
      endpoint: process.env.X402_ENDPOINT || 'https://x402.api',
    };
  }

  async processPayment(request) {
    const { amount, currency = 'usd', purpose, processor, metadata = {} } = request;

    // Validate against peac terms
    const validation = this.validatePaymentTerms(purpose, amount);
    if (!validation.valid) {
      throw new Error(`Payment validation failed: ${validation.reason}`);
    }

    // Add peac metadata
    const enrichedMetadata = {
      ...metadata,
      peac_id: this.peac.id || 'unknown',
      peac_version: this.peac.version,
      purpose,
      domain: this.peac.metadata?.domain,
      timestamp: new Date().toISOString(),
    };

    // Route to processor
    switch (processor) {
      case 'stripe':
        return this.processStripePayment(amount, currency, enrichedMetadata);
      case 'bridge':
        return this.processBridgePayment(amount, currency, enrichedMetadata);
      case 'paypal': {
        return this.processPayPalPayment(amount, currency, enrichedMetadata);
      }
      case 'x402':
        return this.processX402Payment(amount, currency, enrichedMetadata);
      default:
        throw new Error(`Unsupported payment processor: ${processor}`);
    }
  }

  async processStripePayment(amount, currency, metadata) {
    if (!this.processors.stripe) {
      throw new Error('Stripe not configured');
    }

    try {
      const paymentIntent = await this.processors.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        metadata,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      // Check for Agent Pay support
      const agentPayEnabled = this.peac.peac?.economics?.payment_processors?.stripe?.agent_pay;

      return {
        processor: 'stripe',
        payment_id: paymentIntent.id,
        client_secret: paymentIntent.client_secret,
        amount,
        currency,
        status: paymentIntent.status,
        agent_pay_enabled: agentPayEnabled || false,
        metadata,
      };
    } catch (error) {
      throw new Error(`Stripe payment failed: ${error.message}`);
    }
  }

  async processBridgePayment(amount, currency, metadata) {
    const bridge = this.processors.bridge;
    if (!bridge.apiKey) {
      throw new Error('Bridge not configured');
    }

    const endpoint =
      this.peac.peac?.economics?.payment_processors?.bridge?.endpoint ||
      `${bridge.endpoint}/v0/payments`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bridge.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `peac-${Date.now()}-${Math.random()}`,
          Accept: 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(amount * 100), // Bridge uses cents
          source_currency: currency.toUpperCase(),
          destination_currency: 'USDB', // Bridge stablecoin
          destination: {
            type: 'wallet',
            address: this.peac.peac?.economics?.payment_processors?.bridge?.wallet,
          },
          metadata,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Bridge payment failed');
      }

      const result = await response.json();

      return {
        processor: 'bridge',
        payment_id: result.id,
        status: result.status,
        amount,
        currency,
        destination_currency: 'USDB',
        exchange_rate: result.exchange_rate,
        metadata,
      };
    } catch (error) {
      throw new Error(`Bridge payment failed: ${error.message}`);
    }
  }

  async processPayPalPayment(amount, currency, metadata) {
    const paypal = this.processors.paypal;
    if (!paypal.clientId) {
      throw new Error('PayPal not configured');
    }

    try {
      // Get access token
      const authResponse = await fetch(`${paypal.endpoint}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${paypal.clientId}:${paypal.secret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });

      const { access_token } = await authResponse.json();

      // Create payment
      const paymentResponse = await fetch(`${paypal.endpoint}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [
            {
              amount: {
                currency_code: currency.toUpperCase(),
                value: amount.toFixed(2),
              },
              custom_id: metadata.peac_id,
              description: `PEAC Protocol Payment - ${metadata.purpose}`,
            },
          ],
          application_context: {
            return_url: this.options.success_url || 'https://example.com/success',
            cancel_url: this.options.cancel_url || 'https://example.com/cancel',
          },
        }),
      });

      const order = await paymentResponse.json();

      return {
        processor: 'paypal',
        payment_id: order.id,
        status: order.status,
        amount,
        currency,
        links: order.links,
        metadata,
      };
    } catch (error) {
      throw new Error(`PayPal payment failed: ${error.message}`);
    }
  }

  async processX402Payment(amount, currency, metadata) {
    const x402 = this.processors.x402;
    const endpoint = this.peac.peac?.economics?.payment_processors?.x402 || x402.endpoint;

    try {
      // X402 HTTP Payment Protocol
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Payment-Version': '1.0',
          'X-Payment-Network': 'ethereum',
          'X-Payment-Currency': currency.toUpperCase(),
        },
        body: JSON.stringify({
          amount: amount.toString(),
          currency,
          recipient: this.peac.metadata?.payment_address,
          metadata,
        }),
      });

      if (!response.ok) {
        throw new Error(`X402 payment failed with status ${response.status}`);
      }

      const result = await response.json();

      return {
        processor: 'x402',
        payment_id: result.transaction_id || `x402_${Date.now()}`,
        status: result.status || 'pending',
        amount,
        currency,
        network: result.network || 'ethereum',
        metadata,
      };
    } catch (error) {
      throw new Error(`X402 payment failed: ${error.message}`);
    }
  }

  validatePaymentTerms(purpose, amount) {
    const economics = this.peac.peac?.economics;
    const consent = this.peac.peac?.consent;

    // Check if purpose is allowed
    if (consent && consent[purpose] === 'denied') {
      return { valid: false, reason: `Purpose '${purpose}' is denied` };
    }

    // Check if payment is required
    if (consent && consent[purpose]?.conditions) {
      const conditions = consent[purpose].conditions;
      const paymentRequired = conditions.find((c) => c.payment_required);

      if (paymentRequired && amount <= 0) {
        return { valid: false, reason: 'Payment required for this purpose' };
      }
    }

    // Validate amount against pricing models
    if (economics?.pricing_models) {
      const pricing = economics.pricing_models;

      // Check minimum amounts
      if (pricing.minimum && amount < pricing.minimum) {
        return {
          valid: false,
          reason: `Amount below minimum: ${pricing.minimum}`,
        };
      }
    }

    return { valid: true };
  }

  async createPaymentLink(amount, purpose, options = {}) {
    const processor = options.processor || 'stripe';

    switch (processor) {
      case 'stripe':
        return this.createStripePaymentLink(amount, purpose, options);
      case 'paypal':
        return this.createPayPalPaymentLink(amount, purpose, options);
      default:
        throw new Error(`Payment links not supported for ${processor}`);
    }
  }

  async createStripePaymentLink(amount, purpose, options) {
    if (!this.processors.stripe) {
      throw new Error('Stripe not configured');
    }

    const session = await this.processors.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: options.currency || 'usd',
            product_data: {
              name: `PEAC Protocol - ${purpose}`,
              description: `Payment for ${purpose} as per peac.txt`,
              metadata: {
                peac_id: this.peac.id,
                purpose,
              },
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url:
        options.success_url || `${this.options.base_url}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: options.cancel_url || `${this.options.base_url}/cancel`,
      metadata: {
        peac_id: this.peac.id,
        purpose,
        domain: this.peac.metadata?.domain,
      },
    });

    return session.url;
  }

  async createPayPalPaymentLink(amount, purpose, options) {
    const result = await this.processPayPalPayment(amount, options.currency || 'usd', {
      purpose,
      peac_id: this.peac.id,
    });

    const approveLink = result.links.find((link) => link.rel === 'approve');
    return approveLink?.href;
  }

  // Get payment status
  async getPaymentStatus(paymentId, processor) {
    switch (processor) {
      case 'stripe': {
        if (!this.processors.stripe) {
          throw new Error('Stripe not configured');
        }
        const intent = await this.processors.stripe.paymentIntents.retrieve(paymentId);
        return {
          processor: 'stripe',
          payment_id: intent.id,
          status: intent.status,
          amount: intent.amount / 100,
          currency: intent.currency,
        };
      }

      case 'paypal': {
        return {
          processor: 'paypal',
          payment_id: `PAYPAL-${Date.now()}`,
          status: 'pending',
          approval_url: `https://www.paypal.com/checkoutnow?token=TEST`,
        };
      }

      default:
        throw new Error(`Unsupported processor: ${processor}`);
    }
  }
}

module.exports = PEACPayments;
