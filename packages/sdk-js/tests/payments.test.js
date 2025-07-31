const { Payments } = require('../sdk');

describe('PEAC Payments', () => {
  let payments;
  let mockPact;

  beforeEach(() => {
    mockPact = {
      version: '0.9.2',
      protocol: 'peac',
      pact: {
        consent: {
          ai_training: {
            allowed: 'conditional',
            conditions: [{ payment_required: true }]
          }
        },
        economics: {
          pricing_models: {
            usage_based: {
              per_gb: '$0.01'
            }
          },
          payment_processors: {
            stripe: {
              endpoint: 'https://pay.example.com/stripe',
              agent_pay: true
            },
            bridge: {
              endpoint: 'https://api.bridge.xyz/orchestration/send'
            }
          }
        }
      }
    };
    
    payments = new Payments(mockPact);
  });

  describe('Payment validation', () => {
    test('validates payment terms correctly', () => {
      const validation = payments.validatePaymentTerms('ai_training', 10);
      expect(validation.valid).toBe(true);
    });

    test('rejects denied purposes', () => {
      mockPact.pact.consent.ai_training = 'denied';
      const validation = payments.validatePaymentTerms('ai_training', 10);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('denied');
    });

    test('enforces payment requirements', () => {
      const validation = payments.validatePaymentTerms('ai_training', 0);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('Payment required');
    });
  });

  describe('Payment processing', () => {
    test('routes to correct processor', async () => {
      // Mock payment methods
      payments.processStripePayment = jest.fn().mockResolvedValue({
        processor: 'stripe',
        payment_id: 'test_123',
        status: 'succeeded'
      });

      const result = await payments.processPayment({
        amount: 10,
        currency: 'usd',
        purpose: 'ai_training',
        processor: 'stripe'
      });

      expect(payments.processStripePayment).toHaveBeenCalled();
      expect(result.processor).toBe('stripe');
    });

    test('handles unsupported processor', async () => {
      await expect(payments.processPayment({
        amount: 10,
        processor: 'unsupported'
      })).rejects.toThrow('Unsupported payment processor');
    });
  });

  describe('Payment metadata', () => {
    test('enriches metadata correctly', async () => {
      payments.processStripePayment = jest.fn().mockImplementation((amount, currency, metadata) => {
        expect(metadata.pact_version).toBe('0.9.2');
        expect(metadata.purpose).toBe('ai_training');
        expect(metadata.timestamp).toBeDefined();
        return { processor: 'stripe', payment_id: 'test' };
      });

      await payments.processPayment({
        amount: 10,
        purpose: 'ai_training',
        processor: 'stripe'
      });
    });
  });
});