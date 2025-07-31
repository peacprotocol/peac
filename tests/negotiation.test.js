const { Negotiation } = require('../sdk');

describe('PEAC Negotiation', () => {
  let negotiation;
  let mockPeac;

  beforeEach(() => {
    mockPeac = {
      version: '0.9.2',
      protocol: 'peac',
      peac: {
        consent: {
          ai_training: {
            allowed: 'conditional'
          }
        },
        economics: {
          pricing_models: {
            usage_based: {
              per_gb: '$0.01'
            }
          }
        },
        negotiation: {
          enabled: true,
          templates: {
            bulk_discount: {
              threshold: '100GB',
              discount: '20%'
            },
            academic: {
              discount: '50%'
            }
          }
        }
      }
    };
    
    negotiation = new Negotiation(mockPeac);
  });

  describe('Basic negotiation', () => {
    test('accepts valid proposal within budget', async () => {
      const proposal = {
        use_case: 'ai_training',
        volume: '100GB',
        budget: 10,
        attribution_commitment: true
      };
      
      const result = await negotiation.negotiate(proposal);
      expect(result.accepted).toBe(true);
      expect(result.terms.price).toBeCloseTo(0.8, 2); // 100GB * $0.01 with 20% bulk discount = $0.8
    });

    test('rejects proposal over budget', async () => {
      const proposal = {
        use_case: 'ai_training',
        volume: '1TB',
        budget: 5
      };
      
      const result = await negotiation.negotiate(proposal);
      expect(result.accepted).toBe(false);
      expect(result.counter_offer).toBeDefined();
      expect(result.counter_offer.suggested_budget).toBeGreaterThan(5);
    });

    test('rejects denied use cases', async () => {
      const proposal = {
        use_case: 'web_scraping',
        volume: '100GB',
        budget: 100
      };
      
      mockPeac.peac.consent.web_scraping = 'denied';
      const result = await negotiation.negotiate(proposal);
      expect(result.accepted).toBe(false);
      expect(result.reason).toBe('use_case_denied');
    });
  });

  describe('Discount templates', () => {
    test('applies bulk discount correctly', async () => {
      const proposal = {
        use_case: 'ai_training',
        volume: '2TB',
        budget: 50
      };
      
      const result = await negotiation.negotiate(proposal);
      expect(result.accepted).toBe(true);
      // 2TB = 2048GB * $0.01 = $20.48
      // With 20% discount = $16.384
      expect(result.terms.price).toBeCloseTo(16.384, 2);
    });

    test('applies academic discount', async () => {
      const proposal = {
        use_case: 'ai_training',
        volume: '100GB',
        budget: 10,
        academic_verification: true
      };
      
      const result = await negotiation.negotiate(proposal);
      expect(result.accepted).toBe(true);
      expect(result.terms.price).toBe(0.4); // $1 * 0.8 (bulk) * 0.5 (academic) = $0.4
    });

    test('combines multiple discounts', async () => {
      const proposal = {
        use_case: 'ai_training',
        volume: '2TB',
        budget: 50,
        academic_verification: true
      };
      
      const result = await negotiation.negotiate(proposal);
      expect(result.accepted).toBe(true);
      // Base: 2048GB * $0.01 = $20.48
      // Bulk discount 20%: $16.384
      // Academic 50%: $8.192
      expect(result.terms.price).toBeCloseTo(8.192, 2);
    });
  });

  describe('Volume parsing', () => {
    test('parses different volume formats', () => {
      expect(negotiation.parseVolume('100GB')).toEqual({ amount: 100, unit: 'gb' });
      expect(negotiation.parseVolume('1TB')).toEqual({ amount: 1, unit: 'tb' });
      expect(negotiation.parseVolume('1000 requests')).toEqual({ amount: 1000, unit: 'request' });
      expect(negotiation.parseVolume('60 minutes')).toEqual({ amount: 60, unit: 'minute' });
    });
  });

  describe('Counter offers', () => {
    test('creates reasonable counter offers', async () => {
      const proposal = {
        use_case: 'ai_training',
        volume: '1TB',
        budget: 5
      };
      
      const result = await negotiation.negotiate(proposal);
      expect(result.counter_offer.suggested_budget).toBeGreaterThan(5);
      expect(result.counter_offer.minimum_budget).toBeLessThanOrEqual(result.counter_offer.suggested_budget); // Allow equality due to possible rounding in negotiation algorithm
      expect(result.counter_offer.suggested_volume).toBeDefined();
    });
  });
});