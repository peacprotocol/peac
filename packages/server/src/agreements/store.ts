/**
 * Agreement Store Service for PEAC Protocol v0.9.6
 *
 * Centralized agreement storage and retrieval service.
 * In production, this should be replaced with a persistent storage implementation.
 */

import { Agreement, isAgreementValid, AgreementInvalidReason } from '@peacprotocol/schema';
import { logger } from '../logging';

/**
 * In-memory agreement store (replace with persistent storage in production)
 */
class AgreementStore {
  private readonly agreements = new Map<string, Agreement>();

  /**
   * Store a new agreement
   */
  set(id: string, agreement: Agreement): void {
    this.agreements.set(id, agreement);
    logger.debug(
      { agreementId: id, fingerprint: agreement.fingerprint.substring(0, 8) },
      'Agreement stored',
    );
  }

  /**
   * Retrieve an agreement by ID
   */
  get(id: string): Agreement | undefined {
    return this.agreements.get(id);
  }

  /**
   * Check if an agreement exists
   */
  has(id: string): boolean {
    return this.agreements.has(id);
  }

  /**
   * Delete an agreement
   */
  delete(id: string): boolean {
    const deleted = this.agreements.delete(id);
    if (deleted) {
      logger.debug({ agreementId: id }, 'Agreement deleted');
    }
    return deleted;
  }

  /**
   * Get all agreements (for admin/debugging)
   */
  getAll(): Agreement[] {
    return Array.from(this.agreements.values());
  }

  /**
   * Get agreements by status
   */
  getByStatus(status: 'valid' | 'invalid'): Agreement[] {
    return Array.from(this.agreements.values()).filter((agreement) => agreement.status === status);
  }

  /**
   * Get valid agreements only (status + expiration check)
   */
  getValidAgreements(): Agreement[] {
    return Array.from(this.agreements.values()).filter((agreement) => isAgreementValid(agreement));
  }

  /**
   * Update agreement status
   */
  updateStatus(id: string, status: 'valid' | 'invalid', reason?: AgreementInvalidReason): boolean {
    const agreement = this.agreements.get(id);
    if (!agreement) {
      return false;
    }

    agreement.status = status;
    if (reason) {
      agreement.reason = reason;
    }

    logger.info({ agreementId: id, status, reason }, 'Agreement status updated');
    return true;
  }

  /**
   * Get store statistics
   */
  getStats() {
    const all = Array.from(this.agreements.values());
    return {
      total: all.length,
      valid: all.filter((a) => a.status === 'valid').length,
      invalid: all.filter((a) => a.status === 'invalid').length,
      active_valid: all.filter((a) => isAgreementValid(a)).length,
    };
  }

  /**
   * Clear all agreements (for testing)
   */
  clear(): void {
    this.agreements.clear();
    logger.warn('All agreements cleared from store');
  }
}

/**
 * Singleton agreement store instance
 */
export const agreementStore = new AgreementStore();

/**
 * Type export for external use
 */
export type { Agreement } from '@peacprotocol/schema';
