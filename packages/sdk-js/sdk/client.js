/**
 * PEAC Protocol Client v0.9.6 - Agreement-First API
 * Modern client for agreement-based payment protocol
 * @license Apache-2.0
 */

const fetch = require('node-fetch');
const { createWebhookSignature, parseWebhookSignature, verifyWebhookSignature } = require('./crypto');

class PEACClient {
  constructor(options = {}) {
    this.baseURL = options.baseURL || process.env.PEAC_API_URL || 'https://api.peacprotocol.org';
    this.protocolVersion = '0.9.6';
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 3;
    
    // Auto-discovery configuration
    this.discovery = {
      ttl: options.discovery?.ttl || 300, // 5 minutes
      circuitBreaker: {
        failureThreshold: options.discovery?.circuitBreaker?.failureThreshold || 3,
        timeout: options.discovery?.circuitBreaker?.timeout || 60000
      },
      respectCacheControl: options.discovery?.respectCacheControl !== false,
      endpoint: options.discovery?.endpoint || process.env.PEAC_DISCOVERY_URL
    };
    
    // Cache for capabilities and agreements
    this.cache = new Map();
    this.circuitBreakerState = {
      failures: 0,
      lastFailure: null,
      state: 'closed' // closed, open, half-open
    };
  }

  /**
   * Create a new agreement from proposal
   * Primary method for agreement-first workflow
   */
  async createAgreement(proposal) {
    console.debug('Creating agreement with proposal:', { purpose: proposal.purpose });
    
    try {
      const response = await this._makeRequest('POST', '/peac/agreements', proposal, {
        headers: this._getProtocolHeaders()
      });
      
      if (response.status === 201) {
        const agreement = await response.json();
        console.info(`Agreement created: ${agreement.id}`);
        
        // Cache agreement for future use
        this._cacheAgreement(agreement);
        
        return agreement;
      }
      
      throw new Error(`Agreement creation failed: ${response.status}`);
      
    } catch (error) {
      console.error('Agreement creation failed:', error.message);
      throw error;
    }
  }

  /**
   * Retrieve an agreement by ID with ETag support
   */
  async getAgreement(id, options = {}) {
    console.debug(`Retrieving agreement: ${id}`);
    
    try {
      const headers = {};
      
      // Use If-None-Match for 304 caching if ETag available
      if (options.ifNoneMatch) {
        headers['If-None-Match'] = options.ifNoneMatch;
      }
      
      const response = await this._makeRequest('GET', `/peac/agreements/${id}`, null, { headers });
      
      if (response.status === 304) {
        console.debug('Agreement unchanged (304)');
        return this._getCachedAgreement(id);
      }
      
      if (response.status === 200) {
        const agreement = await response.json();
        this._cacheAgreement(agreement);
        return agreement;
      }
      
      if (response.status === 404) {
        throw new Error(`Agreement ${id} not found`);
      }
      
      throw new Error(`Failed to retrieve agreement: ${response.status}`);
      
    } catch (error) {
      console.error('Agreement retrieval failed:', error.message);
      throw error;
    }
  }

  /**
   * Process payment with agreement binding
   * Requires agreementId and auto-injects X-PEAC-Agreement header
   */
  async pay(amount, { agreementId, currency = 'USD', metadata = {} }) {
    if (!agreementId) {
      throw new Error('agreementId is required for payments in v0.9.6');
    }
    
    console.debug(`Processing payment: ${amount} ${currency} for agreement ${agreementId}`);
    
    try {
      const paymentRequest = {
        amount: amount.toString(),
        currency,
        agreement_id: agreementId,
        metadata
      };
      
      const response = await this._makeRequest('POST', '/peac/payments/charges', paymentRequest, {
        headers: {
          ...this._getProtocolHeaders(),
          'X-PEAC-Agreement': agreementId
        }
      });
      
      if (response.status === 200) {
        const receipt = await response.json();
        console.info(`Payment processed: ${receipt.id}`);
        return receipt;
      }
      
      if (response.status === 422) {
        const error = await response.json();
        throw new Error(`Invalid agreement reference: ${error.detail}`);
      }
      
      throw new Error(`Payment failed: ${response.status}`);
      
    } catch (error) {
      console.error('Payment processing failed:', error.message);
      throw error;
    }
  }

  /**
   * Deprecated: negotiate() method for backward compatibility
   * Forwards to createAgreement() with deprecation warning
   */
  async negotiate(proposal) {
    console.warn('⚠️  negotiate() is deprecated. Use createAgreement() instead.');
    console.warn('   The negotiate() method will be removed in a future version.');
    console.warn('   Migration: Replace client.negotiate(proposal) with client.createAgreement(proposal)');
    
    return this.createAgreement(proposal);
  }

  /**
   * Get server capabilities with auto-discovery and caching
   */
  async getCapabilities(options = {}) {
    const cacheKey = 'capabilities';
    const cached = this.cache.get(cacheKey);
    
    // Check cache TTL
    if (cached && Date.now() - cached.timestamp < this.discovery.ttl * 1000) {
      console.debug('Using cached capabilities');
      return cached.data;
    }
    
    // Circuit breaker check
    if (this._isCircuitBreakerOpen()) {
      throw new Error('Capabilities service unavailable (circuit breaker open)');
    }
    
    try {
      const headers = {};
      if (cached?.etag) {
        headers['If-None-Match'] = cached.etag;
      }
      
      const response = await this._makeRequest('GET', '/.well-known/peac-capabilities', null, { headers });
      
      if (response.status === 304 && cached) {
        console.debug('Capabilities unchanged (304)');
        // Update cache timestamp
        cached.timestamp = Date.now();
        return cached.data;
      }
      
      if (response.status === 200) {
        const capabilities = await response.json();
        const etag = response.headers.get('ETag');
        
        // Cache with ETag and timestamp
        this.cache.set(cacheKey, {
          data: capabilities,
          etag,
          timestamp: Date.now()
        });
        
        // Reset circuit breaker on success
        this._resetCircuitBreaker();
        
        return capabilities;
      }
      
      throw new Error(`Failed to get capabilities: ${response.status}`);
      
    } catch (error) {
      this._recordCircuitBreakerFailure();
      console.error('Capabilities request failed:', error.message);
      throw error;
    }
  }

  /**
   * Create webhook signature for outbound webhooks
   */
  createWebhookSignature(secret, timestamp, body, options = {}) {
    return createWebhookSignature(secret, timestamp, body, options);
  }

  /**
   * Verify incoming webhook signature
   */
  verifyWebhookSignature(secret, signature, body, toleranceSeconds = 300, options = {}) {
    return verifyWebhookSignature(secret, signature, body, toleranceSeconds, options);
  }

  /**
   * Parse webhook signature header
   */
  parseWebhookSignature(signature) {
    return parseWebhookSignature(signature);
  }

  // Private methods

  /**
   * Make HTTP request with retries and error handling
   */
  async _makeRequest(method, path, body = null, options = {}) {
    const url = `${this.baseURL}${path}`;
    const requestOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `PEAC-SDK-JS/0.9.6`,
        ...options.headers
      },
      timeout: this.timeout
    };
    
    if (body) {
      requestOptions.body = JSON.stringify(body);
    }
    
    let lastError;
    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        console.debug(`${method} ${path} (attempt ${attempt}/${this.retries})`);
        const response = await fetch(url, requestOptions);
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < this.retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.debug(`Request failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Get protocol headers for requests
   */
  _getProtocolHeaders() {
    return {
      'X-PEAC-Protocol': this.protocolVersion
    };
  }

  /**
   * Cache agreement for quick access
   */
  _cacheAgreement(agreement) {
    this.cache.set(`agreement:${agreement.id}`, {
      data: agreement,
      etag: `"${agreement.fingerprint}"`,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached agreement
   */
  _getCachedAgreement(id) {
    const cached = this.cache.get(`agreement:${id}`);
    return cached?.data || null;
  }

  /**
   * Circuit breaker implementation
   */
  _isCircuitBreakerOpen() {
    if (this.circuitBreakerState.state === 'open') {
      const timeSinceLastFailure = Date.now() - this.circuitBreakerState.lastFailure;
      if (timeSinceLastFailure > this.discovery.circuitBreaker.timeout) {
        this.circuitBreakerState.state = 'half-open';
        return false;
      }
      return true;
    }
    return false;
  }

  _recordCircuitBreakerFailure() {
    this.circuitBreakerState.failures++;
    this.circuitBreakerState.lastFailure = Date.now();
    
    if (this.circuitBreakerState.failures >= this.discovery.circuitBreaker.failureThreshold) {
      this.circuitBreakerState.state = 'open';
      console.warn('Circuit breaker opened due to repeated failures');
    }
  }

  _resetCircuitBreaker() {
    this.circuitBreakerState.failures = 0;
    this.circuitBreakerState.lastFailure = null;
    this.circuitBreakerState.state = 'closed';
  }
}

module.exports = PEACClient;