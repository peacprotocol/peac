/**
 * PEAC Protocol Negotiation Engine
 * Handles programmatic negotiation between publishers and AI agents
 */

const express = require('express');
const router = express.Router();

class NegotiationEngine {
  constructor(pact) {
    this.pact = pact;
  }

  async negotiate(proposal) {
    const { 
      use_case, 
      volume, 
      budget, 
      duration = '30 days',
      academic_verification
    } = proposal;

    // Validate use case
    const consent = this.pact.pact?.consent?.[use_case];
    if (!consent || consent === 'denied') {
      return {
        accepted: false,
        reason: 'Use case not allowed',
        alternatives: this.getSuggestedUseCases()
      };
    }

    // Calculate pricing
    const basePrice = this.calculatePrice(use_case, volume);
    let finalPrice = basePrice;

    // Apply templates
    if (academic_verification && this.pact.pact?.negotiation?.templates?.academic) {
      finalPrice *= 0.5; // 50% discount
    }

    if (volume > this.parseTB(this.pact.pact?.negotiation?.templates?.bulk_discount?.threshold)) {
      finalPrice *= 0.8; // 20% discount
    }

    // Check budget
    if (finalPrice <= budget) {
      return {
        accepted: true,
        pact_id: this.generatePactId(),
        terms: {
          use_case,
          volume,
          price: finalPrice,
          currency: 'USD',
          duration,
          payment_link: this.generatePaymentLink(finalPrice, use_case),
          attribution_required: this.pact.pact?.attribution?.required || false,
          attribution_format: this.pact.pact?.attribution?.format,
          expires: this.calculateExpiry(duration)
        },
        signature: this.signDeal({use_case, volume, price: finalPrice})
      };
    }

    // Counter offer
    return {
      accepted: false,
      reason: 'Budget insufficient',
      counter_offer: {
        suggested_budget: finalPrice,
        suggested_volume: this.calculateVolumeForBudget(budget),
        contact_human: this.pact.pact?.negotiation?.human_contact || 'sales@example.com'
      }
    };
  }

  calculatePrice(use_case, volume) {
    const economics = this.pact.pact?.economics;
    if (!economics) return 0;

    const pricing = economics.pricing_models?.usage_based;
    if (!pricing) return 0;

    const volumeGB = this.parseGB(volume);
    return volumeGB * (parseFloat(pricing.per_gb) || 0.01);
  }

  calculateVolumeForBudget(budget) {
    const economics = this.pact.pact?.economics;
    if (!economics) return '0GB';

    const pricing = economics.pricing_models?.usage_based;
    if (!pricing) return '0GB';

    const pricePerGB = parseFloat(pricing.per_gb) || 0.01;
    const gb = Math.floor(budget / pricePerGB);
    
    return gb >= 1024 ? `${Math.floor(gb / 1024)}TB` : `${gb}GB`;
  }

  generatePactId() {
    return `pact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generatePaymentLink(amount, purpose) {
    const base = this.pact.pact?.economics?.payment_processors?.stripe?.endpoint;
    if (!base) return null;
    
    return `${base}?amount=${amount}&purpose=${encodeURIComponent(purpose)}`;
  }

  calculateExpiry(duration) {
    const days = parseInt(duration) || 30;
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + days);
    return expiry.toISOString();
  }

  parseGB(volume) {
    const match = volume.match(/(\d+)(gb|tb)?/i);
    if (!match) return 0;
    
    const num = parseInt(match[1]);
    const unit = (match[2] || 'gb').toLowerCase();
    
    return unit === 'tb' ? num * 1024 : num;
  }

  parseTB(threshold) {
    if (!threshold) return Infinity;
    return this.parseGB(threshold);
  }

  getSuggestedUseCases() {
    const consent = this.pact.pact?.consent || {};
    return Object.keys(consent).filter(key => 
      consent[key] === 'allowed' || consent[key] === 'conditional'
    );
  }

  signDeal(terms) {
    // In production, use real crypto signing
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(terms));
    return hash.digest('hex');
  }
}

// Express routes
router.post('/negotiate', async (req, res) => {
  try {
    // In production, load pact from domain
    const pact = req.app.locals.pact;
    const engine = new NegotiationEngine(pact);
    
    const result = await engine.negotiate(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const negotiationRouter = router;
module.exports = { 
  NegotiationEngine, 
  router: negotiationRouter 
};