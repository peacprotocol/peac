/**
 * @peac/crawler v0.9.12.1 - Cloudflare API client
 * Signed HTTP client with retries and proper error handling
 */

import crypto from 'node:crypto';

export interface CFClientOptions {
  apiToken: string;
  baseURL: string;
  zoneId: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

export interface CFVerifyRequest {
  ip: string;
  userAgent: string;
  requestId: string;
  headers?: Record<string, string>;
  context?: Record<string, unknown>;
}

export interface CFVerifyResponse {
  status: 'trusted' | 'suspicious' | 'unverified';
  confidence: number;
  indicators?: string[];
  request_id?: string;
  evidence?: Record<string, unknown>;
  rationale?: string;
}

export interface CFPricingRequest {
  usage: {
    bytes?: number;
    requests?: number;
    tokens?: number;
  };
}

export interface CFPricingResponse {
  model: 'per_gb' | 'per_request' | 'per_token' | 'flat_rate';
  rate: number;
  currency: string;
  ttl_s?: number;
}

export interface CFError {
  code: number;
  message: string;
  type?: string;
}

export interface CFResponse<T> {
  success: boolean;
  result?: T;
  errors?: CFError[];
  messages?: string[];
}

export class CFClient {
  constructor(private readonly opts: CFClientOptions) {
    this.opts.timeoutMs ??= 2500;
    this.opts.retries ??= 2;
    this.opts.retryDelayMs ??= 1000;
  }
  
  async verifyCrawler(request: CFVerifyRequest): Promise<CFVerifyResponse> {
    const path = `/client/v4/zones/${this.opts.zoneId}/ai-crawl-control/verify`;
    const response = await this.post<CFVerifyResponse>(path, {
      ip: request.ip,
      user_agent: request.userAgent,
      request_id: request.requestId,
      headers: request.headers,
      context: request.context
    });
    
    return response;
  }
  
  async calculatePricing(request: CFPricingRequest): Promise<CFPricingResponse> {
    const path = `/client/v4/zones/${this.opts.zoneId}/ai-crawl-control/pricing`;
    const response = await this.post<CFPricingResponse>(path, request);
    
    return response;
  }
  
  async ping(): Promise<{ pong: boolean; timestamp: number }> {
    const path = `/client/v4/zones/${this.opts.zoneId}/ai-crawl-control/ping`;
    const response = await this.get<{ pong: boolean; timestamp: number }>(path);
    
    return response;
  }
  
  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }
  
  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }
  
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= this.opts.retries!; attempt++) {
      try {
        return await this.makeRequest<T>(method, path, body);
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on client errors (4xx)
        if (error.message.startsWith('cf_4')) {
          throw error;
        }
        
        // Don't retry on final attempt
        if (attempt === this.opts.retries) {
          throw error;
        }
        
        // Wait before retry
        await this.delay(this.opts.retryDelayMs! * (attempt + 1));
      }
    }
    
    throw lastError!;
  }
  
  private async makeRequest<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.opts.baseURL}${path}`;
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.opts.apiToken}`,
      'User-Agent': 'PEAC-Crawler/0.9.12.1',
      'Accept': 'application/json'
    };
    
    if (method === 'POST' && body) {
      headers['Content-Type'] = 'application/json';
      headers['Idempotency-Key'] = crypto.randomUUID();
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Handle HTTP errors
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`cf_${response.status}: ${errorText}`);
      }
      
      const data: CFResponse<T> = await response.json();
      
      // Handle Cloudflare API errors
      if (!data.success) {
        const error = data.errors?.[0];
        if (error) {
          throw new Error(`cf_api_${error.code}: ${error.message}`);
        }
        throw new Error('cf_api_error: Unknown API error');
      }
      
      if (data.result === undefined) {
        throw new Error('cf_api_error: Missing result in successful response');
      }
      
      return data.result;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`cf_timeout: Request timed out after ${this.opts.timeoutMs}ms`);
      }
      
      // Re-throw CF errors as-is
      if (error.message.startsWith('cf_')) {
        throw error;
      }
      
      // Network/fetch errors
      throw new Error(`cf_network: ${error.message}`);
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // For testing
  getConfig(): CFClientOptions {
    return { ...this.opts };
  }
}