/**
 * Mock Payment Provider for Testing
 * 
 * Provides deterministic payment receipts for test environments.
 * Always returns successful payments with predictable IDs.
 */

import { ulid } from 'ulidx';

export interface MockPaymentRequest {
  amount: string;
  currency?: string;
  agreement_id: string;
  agreement_fingerprint: string;
  metadata?: Record<string, unknown>;
}

/**
 * Mock payment provider that returns deterministic successful receipts
 */
export class MockPaymentProvider {
  async processPayment(body: unknown): Promise<string> {
    // Cast to expected format
    const request = body as MockPaymentRequest;
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Return deterministic session token
    const sessionToken = `mock_session_${Date.now()}_${request.agreement_id.slice(-8)}`;
    
    return sessionToken;
  }
  
  /**
   * Generate a deterministic payment ID for consistent testing
   */
  static generatePaymentId(): string {
    return `pay_mock_${ulid()}`;
  }
}

/**
 * Export for dynamic import compatibility
 */
export default MockPaymentProvider;