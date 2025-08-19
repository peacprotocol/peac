/**
 * PEAC Protocol API Client v0.9.6
 * HTTP client for PEAC server endpoints
 * @license Apache-2.0
 */

const fetch = require('node-fetch');

// Single source of truth for protocol version
const PROTOCOL_VERSION = '0.9.6';

class PEACClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 30000;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'PEAC-SDK-JS/0.9.6',
      ...options.headers,
    };

    if (this.apiKey) {
      this.defaultHeaders['Authorization'] = `Bearer ${this.apiKey}`;
    }
  }

  /**
   * Helper to add protocol version header for write operations
   */
  withProtocolHeaders(headers = {}) {
    return {
      'X-PEAC-Protocol': PROTOCOL_VERSION,
      ...headers,
    };
  }

  async request(method, path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = { ...this.defaultHeaders, ...options.headers };

    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const config = {
      method,
      headers,
      timeout: this.timeout,
    };

    if (options.body) {
      config.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        const error = new Error(data.detail || data.title || `HTTP ${response.status}`);
        error.status = response.status;
        error.type = data.type;
        error.response = data;
        throw error;
      }

      return {
        data,
        status: response.status,
        headers: {
          requestId: response.headers.get('X-Request-Id'),
          rateLimitLimit: parseInt(response.headers.get('RateLimit-Limit')),
          rateLimitRemaining: parseInt(response.headers.get('RateLimit-Remaining')),
          idempotencyKey: response.headers.get('Idempotency-Key'),
        },
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  // Negotiation methods
  async createNegotiation(negotiation, options = {}) {
    return this.request('POST', '/negotiations', {
      body: negotiation,
      idempotencyKey: options.idempotencyKey,
      headers: this.withProtocolHeaders(options.headers),
    });
  }

  async getNegotiation(id) {
    return this.request('GET', `/negotiations/${id}`);
  }

  async listNegotiations(options = {}) {
    const params = new URLSearchParams();
    if (options.cursor) params.append('cursor', options.cursor);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.state) params.append('state', options.state);

    const query = params.toString();
    const path = query ? `/negotiations?${query}` : '/negotiations';

    return this.request('GET', path);
  }

  async acceptNegotiation(id, options = {}) {
    return this.request('POST', `/negotiations/${id}/accept`, {
      body: options,
      headers: this.withProtocolHeaders(options.headers),
    });
  }

  async rejectNegotiation(id, reason, options = {}) {
    return this.request('POST', `/negotiations/${id}/reject`, {
      body: { reason, ...options },
      headers: this.withProtocolHeaders(options.headers),
    });
  }

  // Payment methods
  async createPayment(payment, options = {}) {
    return this.request('POST', '/payments', {
      body: payment,
      idempotencyKey: options.idempotencyKey,
      headers: this.withProtocolHeaders(options.headers),
    });
  }

  async getPayment(id) {
    return this.request('GET', `/payments/${id}`);
  }

  async listPayments(options = {}) {
    const params = new URLSearchParams();
    if (options.cursor) params.append('cursor', options.cursor);
    if (options.limit) params.append('limit', options.limit.toString());

    const query = params.toString();
    const path = query ? `/payments?${query}` : '/payments';

    return this.request('GET', path);
  }

  // Webhook verification helper
  async sendWebhook(payload, signature) {
    return this.request('POST', '/webhooks/peac', {
      body: payload,
      headers: {
        'Peac-Signature': signature,
      },
    });
  }

  // Health check methods
  async getLiveness() {
    return this.request('GET', '/livez');
  }

  async getReadiness() {
    return this.request('GET', '/readyz');
  }

  // Metrics
  async getMetrics() {
    const response = await fetch(`${this.baseUrl}/metrics`, {
      headers: { ...this.defaultHeaders },
      timeout: this.timeout,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.text();
  }

  // Capabilities
  async getCapabilities() {
    return this.request('GET', '/.well-known/peac-capabilities');
  }

  // Pagination helper
  async *paginateNegotiations(options = {}) {
    let cursor = options.cursor;
    const limit = options.limit || 50;

    while (true) {
      const response = await this.listNegotiations({ ...options, cursor, limit });

      for (const item of response.data.items) {
        yield item;
      }

      if (!response.data.next_cursor) {
        break;
      }

      cursor = response.data.next_cursor;
    }
  }

  async *paginatePayments(options = {}) {
    let cursor = options.cursor;
    const limit = options.limit || 50;

    while (true) {
      const response = await this.listPayments({ ...options, cursor, limit });

      for (const item of response.data.items) {
        yield item;
      }

      if (!response.data.next_cursor) {
        break;
      }

      cursor = response.data.next_cursor;
    }
  }

  // Utility methods
  generateIdempotencyKey() {
    return `sdk_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  async waitForPayment(paymentId, options = {}) {
    const maxAttempts = options.maxAttempts || 30;
    const interval = options.interval || 2000;
    const successStates = options.successStates || ['succeeded'];
    const failureStates = options.failureStates || ['failed'];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await this.getPayment(paymentId);
      const payment = response.data;

      if (successStates.includes(payment.status)) {
        return { success: true, payment };
      }

      if (failureStates.includes(payment.status)) {
        return { success: false, payment };
      }

      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }

    throw new Error(`Payment ${paymentId} did not reach final state within timeout`);
  }

  async waitForNegotiation(negotiationId, options = {}) {
    const maxAttempts = options.maxAttempts || 30;
    const interval = options.interval || 2000;
    const finalStates = options.finalStates || ['accepted', 'rejected'];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await this.getNegotiation(negotiationId);
      const negotiation = response.data;

      if (finalStates.includes(negotiation.state)) {
        return negotiation;
      }

      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }

    throw new Error(`Negotiation ${negotiationId} did not reach final state within timeout`);
  }
}

module.exports = PEACClient;
