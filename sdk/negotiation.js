/**
 * PEAC Protocol Negotiation Engine
 * Handles programmatic negotiation between publishers and consumers
 * @license Apache-2.0
 */

class PEACNegotiation {
  constructor(pact, options = {}) {
    this.pact = pact;
    this.options = options;
  }

  async negotiate(proposal) {
    const {
      use_case,
      volume,
      budget,
      duration = '30 days',
      attribution_commitment = true,
      framework,
      metadata = {}
    } = proposal;

    // Validate use case
    const consent = this.pact.pact?.consent?.[use_case];
    if (!consent || consent === 'denied') {
      return this.createRejection('use_case_denied', use_case);
    }

    // Check negotiation availability
    const negotiationEndpoint = this.pact.pact?.negotiation?.endpoint;
    const negotiationEnabled = this.pact.pact?.negotiation?.enabled;
    
    if (!negotiationEnabled && !negotiationEndpoint) {
      return this.createRejection('negotiation_not_available');
    }

    // Calculate base price
    const basePrice = this.calculatePrice(use_case, volume);
    let finalPrice = basePrice;
    
    // Apply templates
    const templates = this.pact.pact?.negotiation?.templates || {};
    finalPrice = this.applyTemplates(finalPrice, volume, proposal, templates);

    // Check budget
    if (finalPrice <= budget) {
      return this.createAcceptance({
        use_case,
        volume,
        price: finalPrice,
        duration,
        attribution_commitment,
        metadata
      });
    }

    // Create counter offer
    return this.createCounterOffer({
      use_case,
      volume,
      budget,
      finalPrice,
      basePrice
    });
  }

  calculatePrice(use_case, volume) {
    const economics = this.pact.pact?.economics;
    if (!economics) return 0;

    const pricing = economics.pricing_models?.usage_based;
    if (!pricing) return 0;

    // Parse volume
    const { amount, unit } = this.parseVolume(volume);
    
    // Calculate based on unit
    switch (unit) {
      case 'gb':
        return amount * (this.parsePrice(pricing.per_gb) || 0.01);
      case 'tb':
        return amount * 1024 * (this.parsePrice(pricing.per_gb) || 0.01);
      case 'requests':
        return amount * (this.parsePrice(pricing.per_request) || 0.001);
      case 'minutes':
        return amount * (this.parsePrice(pricing.per_minute) || 0.10);
      default:
        return 0;
    }
  }

  applyTemplates(price, volume, proposal, templates) {
    let finalPrice = price;

    // Bulk discount
    if (templates.bulk_discount) {
      const threshold = this.parseVolume(templates.bulk_discount.threshold);
      const proposalVolume = this.parseVolume(volume);
      
      if (proposalVolume.amount >= threshold.amount) {
        const discount = this.parsePercentage(templates.bulk_discount.discount);
        finalPrice *= (1 - discount);
      }
    }

    // Academic discount
    if (templates.academic && proposal.academic_verification) {
      const discount = this.parsePercentage(templates.academic.discount);
      finalPrice *= (1 - discount);
    }

    // Startup discount
    if (templates.startup && proposal.startup_verification) {
      const discount = this.parsePercentage(templates.startup.discount);
      finalPrice *= (1 - discount);
    }

    // Framework-specific pricing
    if (proposal.framework && templates[proposal.framework]) {
      const frameworkDiscount = this.parsePercentage(templates[proposal.framework].discount);
      finalPrice *= (1 - frameworkDiscount);
    }

    // Always return 2 decimal places
    return Math.max(0, Math.round(finalPrice * 100) / 100);
    
  }

  createAcceptance(terms) {
    const pactId = this.generatePactId();
    const expires = this.calculateExpiry(terms.duration);
    
    return {
      accepted: true,
      pact_id: pactId,
      terms: {
        use_case: terms.use_case,
        volume: terms.volume,
        price: terms.price,
        currency: this.pact.pact?.economics?.currency?.[0] || 'USD',
        duration: terms.duration,
        expires,
        payment_link: this.generatePaymentLink(terms.price, terms.use_case),
        payment_processors: Object.keys(this.pact.pact?.economics?.payment_processors || {}),
        attribution_required: this.pact.pact?.attribution?.required || false,
        attribution_format: this.pact.pact?.attribution?.format,
        compliance: this.getApplicableCompliance(),
        metadata: terms.metadata
      },
      signature: this.generateSignature({ pact_id: pactId, ...terms })
    };
  }

  createRejection(reason, details) {
    const response = {
      accepted: false,
      reason,
      timestamp: new Date().toISOString()
    };

    switch (reason) {
      case 'use_case_denied':
        response.message = `Use case '${details}' is not allowed`;
        response.allowed_use_cases = this.getAllowedUseCases();
        break;
      case 'negotiation_not_available':
        response.message = 'Negotiation is not available for this pact';
        response.contact = this.pact.pact?.dispute?.contact;
        break;
      default:
        response.message = 'Negotiation failed';
    }

    return response;
  }

  createCounterOffer(params) {
    const { use_case, volume, budget, finalPrice, basePrice } = params;

    // Always round to 2 decimals for protocol consistency
    const round2 = x => Math.round(x * 100) / 100;

    return {
      accepted: false,
      reason: 'budget_insufficient',
      counter_offer: {
        suggested_budget: round2(finalPrice),
        minimum_budget: round2(basePrice * 0.8), // 20% negotiation room
        suggested_volume: this.calculateVolumeForBudget(budget, use_case),
        available_discounts: this.getAvailableDiscounts(),
        negotiation_endpoint: this.pact.pact?.negotiation?.endpoint,
        human_contact: this.pact.pact?.dispute?.contact || this.pact.pact?.negotiation?.human_contact,
        expires: new Date(Date.now() + 3600000).toISOString() // 1 hour
      }
    };
  }


  parseVolume(volume) {
    const match = volume.toString().match(/^(\d+(?:\.\d+)?)\s*(gb|tb|mb|requests?|minutes?)?$/i);
    if (!match) return { amount: 0, unit: 'unknown' };
    
    return {
      amount: parseFloat(match[1]),
      unit: (match[2] || 'gb').toLowerCase().replace(/s$/, '')
    };
  }

  parsePrice(price) {
    if (typeof price === 'number') return price;
    if (typeof price === 'string') {
      const match = price.match(/\$?(\d+(?:\.\d+)?)/);
      return match ? parseFloat(match[1]) : 0;
    }
    return 0;
  }

  parsePercentage(percentage) {
    if (typeof percentage === 'number') return percentage / 100;
    if (typeof percentage === 'string') {
      const match = percentage.match(/(\d+(?:\.\d+)?)%?/);
      return match ? parseFloat(match[1]) / 100 : 0;
    }
    return 0;
  }

  generatePactId() {
    return `pact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generatePaymentLink(amount, purpose) {
    // This would integrate with actual payment processor
    const baseUrl = this.pact.pact?.economics?.payment_processors?.stripe?.endpoint || 
                   'https://pay.example.com';
    return `${baseUrl}?amount=${amount}&purpose=${encodeURIComponent(purpose)}`;
  }

  calculateExpiry(duration) {
    const match = duration.match(/(\d+)\s*(days?|months?|years?)/i);
    if (!match) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    const expiry = new Date();
    switch (unit) {
      case 'day':
      case 'days':
        expiry.setDate(expiry.getDate() + amount);
        break;
      case 'month':
      case 'months':
        expiry.setMonth(expiry.getMonth() + amount);
        break;
      case 'year':
      case 'years':
        expiry.setFullYear(expiry.getFullYear() + amount);
        break;
    }
    
    return expiry.toISOString();
  }

  getAllowedUseCases() {
    const consent = this.pact.pact?.consent || {};
    return Object.keys(consent).filter(key => 
      consent[key] === 'allowed' || consent[key] === 'conditional'
    );
  }

  getAvailableDiscounts() {
    const templates = this.pact.pact?.negotiation?.templates || {};
    const discounts = [];
    
    if (templates.bulk_discount) {
      discounts.push({
        type: 'bulk',
        threshold: templates.bulk_discount.threshold,
        discount: templates.bulk_discount.discount
      });
    }
    
    if (templates.academic) {
      discounts.push({
        type: 'academic',
        discount: templates.academic.discount,
        verification: templates.academic.verification
      });
    }
    
    if (templates.startup) {
      discounts.push({
        type: 'startup',
        discount: templates.startup.discount,
        criteria: templates.startup.criteria
      });
    }
    
    return discounts;
  }

  calculateVolumeForBudget(budget, use_case) {
    const economics = this.pact.pact?.economics;
    if (!economics) return '0GB';

    const pricing = economics.pricing_models?.usage_based;
    if (!pricing) return '0GB';

    const perGb = this.parsePrice(pricing.per_gb) || 0.01;
    const gb = Math.floor(budget / perGb);
    
    return `${gb}GB`;
  }

  getApplicableCompliance() {
    const compliance = this.pact.pact?.compliance?.jurisdictions || {};
    const applicable = {};
    
    // Include all true compliance flags
    for (const [jurisdiction, rules] of Object.entries(compliance)) {
      const activeRules = {};
      for (const [rule, value] of Object.entries(rules)) {
        if (value === true) {
          activeRules[rule] = value;
        }
      }
      if (Object.keys(activeRules).length > 0) {
        applicable[jurisdiction] = activeRules;
      }
    }
    
    return applicable;
  }

  generateSignature(data) {
    // In production, this would use proper cryptographic signing
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }
}

module.exports = PEACNegotiation;