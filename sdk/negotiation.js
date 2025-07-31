/**
 * PEAC Protocol Negotiation Module
 * Enables programmatic negotiation for AI agents and publishers
 * @license Apache-2.0
 */

const crypto = require('crypto');

class Negotiation {
  constructor(peac) {
    this.peac = peac;
  }

  async negotiate(proposal) {
    if (!this.peac.peac?.negotiation?.enabled && !this.peac.peac?.negotiation?.endpoint) {
      return this.createManualResponse();
    }

    // Extract proposal details
    const {
      use_case,
      volume: volumeStr,
      budget,
      duration = '30 days',
      attribution_commitment = true,
      academic_verification = false,
      startup_verification = false
    } = proposal;

    // Parse volume
    const volume = this.parseVolume(volumeStr);
    if (!volume) {
      return {
        accepted: false,
        reason: 'invalid_volume',
        message: 'Invalid volume format. Use formats like "100GB", "1TB", "1000 requests"'
      };
    }

    // Check consent
    const consent = this.peac.peac?.consent?.[use_case];
    if (!consent || consent === 'denied') {
      return {
        accepted: false,
        reason: 'use_case_denied',
        message: `Use case "${use_case}" is not allowed`,
        alternatives: this.getSuggestedUseCases()
      };
    }

    // Calculate base price
    const basePrice = this.calculateBasePrice(use_case, volume);
    let finalPrice = basePrice;

    // Apply discounts
    const discounts = [];
    
    // Academic discount
    if (academic_verification && this.peac.peac?.negotiation?.templates?.academic) {
      const academicDiscount = this.parseDiscount(
        this.peac.peac.negotiation.templates.academic.discount
      );
      finalPrice *= (1 - academicDiscount);
      discounts.push({
        type: 'academic',
        discount: `${academicDiscount * 100}%`,
        verification: 'required'
      });
    }

    // Startup discount
    if (startup_verification && this.peac.peac?.negotiation?.templates?.startup) {
      const startupDiscount = this.parseDiscount(
        this.peac.peac.negotiation.templates.startup.discount
      );
      finalPrice *= (1 - startupDiscount);
      discounts.push({
        type: 'startup',
        discount: `${startupDiscount * 100}%`,
        criteria: this.peac.peac.negotiation.templates.startup.criteria
      });
    }

    // Bulk discount
    const bulkTemplate = this.peac.peac?.negotiation?.templates?.bulk_discount;
    if (bulkTemplate && this.isEligibleForBulkDiscount(volume, bulkTemplate)) {
      const bulkDiscount = this.parseDiscount(bulkTemplate.discount);
      finalPrice *= (1 - bulkDiscount);
      discounts.push({
        type: 'bulk',
        discount: `${bulkDiscount * 100}%`,
        threshold: bulkTemplate.threshold
      });
    }

    // Always round to 2 decimals
    finalPrice = Math.round(finalPrice * 100) / 100;

    // Check if within budget
    if (finalPrice <= budget) {
      return this.createAcceptedResponse({
        use_case,
        volume: volumeStr,
        price: finalPrice,
        currency: 'USD',
        duration,
        discounts,
        attribution_commitment,
        payment_processors: this.getAvailableProcessors()
      });
    } else {
      return this.createCounterOffer({
        use_case,
        budget,
        finalPrice,
        basePrice
      });
    }
  }

  calculateBasePrice(use_case, volume) {
    const economics = this.peac.peac?.economics;
    if (!economics) return 0;

    const pricing = economics.pricing_models;
    if (!pricing) return 0;

    // Usage-based pricing
    if (pricing.usage_based) {
      const { amount, unit } = volume;
      
      switch (unit) {
        case 'gb':
          return amount * this.parsePrice(pricing.usage_based.per_gb || '$0.01');
        case 'tb':
          return amount * 1024 * this.parsePrice(pricing.usage_based.per_gb || '$0.01');
        case 'request':
          return amount * this.parsePrice(pricing.usage_based.per_request || '$0.001');
        case 'minute':
          return amount * this.parsePrice(pricing.usage_based.per_minute || '$0.10');
        default:
          return 0;
      }
    }

    // Flat rate pricing
    if (pricing.flat_rate) {
      const monthly = this.parsePrice(pricing.flat_rate.monthly);
      return monthly || 0;
    }

    return 0;
  }

  parseVolume(volumeStr) {
    if (!volumeStr || typeof volumeStr !== 'string') return null;
    
    const match = volumeStr.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(gb|tb|mb|requests?|minutes?|hours?)/);
    if (!match) return null;

    const amount = parseFloat(match[1]);
    let unit = match[2];
    
    // Normalize units
    if (unit.endsWith('s')) unit = unit.slice(0, -1);
    if (unit === 'mb') return { amount: amount / 1024, unit: 'gb' };
    if (unit === 'hour') return { amount: amount * 60, unit: 'minute' };
    
    return { amount, unit };
  }

  parsePrice(priceStr) {
    if (typeof priceStr === 'number') return priceStr;
    if (!priceStr || typeof priceStr !== 'string') return 0;
    
    const match = priceStr.match(/\$?([\d.]+)/);
    return match ? parseFloat(match[1]) : 0;
  }

  parseDiscount(discountStr) {
    if (!discountStr) return 0;
    const match = discountStr.match(/([\d.]+)%?/);
    const value = match ? parseFloat(match[1]) : 0;
    return value > 1 ? value / 100 : value;
  }

  isEligibleForBulkDiscount(volume, template) {
    if (!template.threshold) return false;
    
    const threshold = this.parseVolume(template.threshold);
    if (!threshold || !volume) return false;
    
    // Convert to same unit for comparison
    if (volume.unit === threshold.unit) {
      return volume.amount >= threshold.amount;
    }
    
    // Convert TB to GB for comparison
    if (volume.unit === 'gb' && threshold.unit === 'tb') {
      return volume.amount >= threshold.amount * 1024;
    }
    if (volume.unit === 'tb' && threshold.unit === 'gb') {
      return volume.amount * 1024 >= threshold.amount;
    }
    
    return false;
  }

  getSuggestedUseCases() {
    const consent = this.peac.peac?.consent || {};
    return Object.keys(consent).filter(key => 
      consent[key] === 'allowed' || 
      consent[key] === 'conditional' ||
      (typeof consent[key] === 'object' && consent[key].allowed !== 'denied')
    );
  }

  getAvailableProcessors() {
    const processors = this.peac.peac?.economics?.payment_processors || {};
    return Object.keys(processors);
  }

  createAcceptedResponse(params) {
    const peacId = this.generatePeacId();
    const expires = this.calculateExpiry(params.duration);
    
    const response = {
      accepted: true,
      peac_id: peacId,
      terms: {
        use_case: params.use_case,
        volume: params.volume,
        price: params.price,
        currency: params.currency,
        duration: params.duration,
        expires,
        payment_processors: params.payment_processors,
        attribution_required: params.attribution_commitment,
        attribution_format: this.peac.peac?.attribution?.format
      }
    };

    if (params.discounts && params.discounts.length > 0) {
      response.terms.discounts_applied = params.discounts;
    }

    // Add payment link if Stripe is available
    const stripeProcessor = this.peac.peac?.economics?.payment_processors?.stripe;
    if (stripeProcessor && stripeProcessor.endpoint) {
      response.terms.payment_link = `${stripeProcessor.endpoint}?amount=${params.price}&peac_id=${peacId}`;
    }

    return response;
  }

  createCounterOffer(params) {
    const { budget, finalPrice, basePrice } = params;

    // Always round to 2 decimals for protocol consistency
    const round2 = x => Math.round(x * 100) / 100;

    return {
      accepted: false,
      reason: 'budget_insufficient',
      counter_offer: {
        suggested_budget: round2(finalPrice),
        minimum_budget: round2(basePrice * 0.8), // 20% discount max
        suggested_volume: this.calculateVolumeForBudget(budget),
        available_discounts: this.getAvailableDiscounts(),
        human_contact: this.peac.peac?.negotiation?.human_contact || 
                      this.peac.peac?.dispute?.contact ||
                      'sales@example.com'
      }
    };
  }

  calculateVolumeForBudget(budget) {
    const economics = this.peac.peac?.economics;
    if (!economics) return '0GB';

    const pricing = economics.pricing_models?.usage_based;
    if (!pricing) return '0GB';

    const pricePerGB = this.parsePrice(pricing.per_gb || '$0.01');
    const gb = Math.floor(budget / pricePerGB);
    
    return gb >= 1024 ? `${Math.floor(gb / 1024)}TB` : `${gb}GB`;
  }

  getAvailableDiscounts() {
    const templates = this.peac.peac?.negotiation?.templates || {};
    const discounts = [];

    if (templates.academic) {
      discounts.push({
        type: 'academic',
        discount: templates.academic.discount,
        requirements: 'Academic email or verification required'
      });
    }

    if (templates.startup) {
      discounts.push({
        type: 'startup',
        discount: templates.startup.discount,
        criteria: templates.startup.criteria || 'Under $10M revenue'
      });
    }

    if (templates.bulk_discount) {
      discounts.push({
        type: 'bulk',
        discount: templates.bulk_discount.discount,
        threshold: templates.bulk_discount.threshold
      });
    }

    return discounts;
  }

  createManualResponse() {
    return {
      accepted: false,
      reason: 'manual_negotiation_required',
      message: 'Automated negotiation not available',
      contact: this.peac.peac?.dispute?.contact || 
               this.peac.peac?.negotiation?.human_contact ||
               'Contact information not provided'
    };
  }

  generatePeacId() {
    return `peac_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  calculateExpiry(duration) {
    const now = new Date();
    const match = duration.match(/(\d+)\s*(days?|months?|years?)/i);
    
    if (!match) {
      now.setDate(now.getDate() + 30); // Default 30 days
      return now.toISOString();
    }

    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'day':
      case 'days':
        now.setDate(now.getDate() + amount);
        break;
      case 'month':
      case 'months':
        now.setMonth(now.getMonth() + amount);
        break;
      case 'year':
      case 'years':
        now.setFullYear(now.getFullYear() + amount);
        break;
    }

    return now.toISOString();
  }

  // Apply template-specific logic
  applyTemplate(template, basePrice) {
    let price = basePrice;
    
    if (template.fixed_price) {
      price = this.parsePrice(template.fixed_price);
    } else if (template.discount) {
      const discount = this.parseDiscount(template.discount);
      price *= (1 - discount);
    }
    
    return Math.round(price * 100) / 100;
  }
}

module.exports = Negotiation;