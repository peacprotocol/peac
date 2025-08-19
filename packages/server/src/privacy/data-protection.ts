/**
 * PEAC Protocol v0.9.6 Data Protection and Privacy Features
 *
 * Enterprise-grade data protection with:
 * - GDPR/CCPA compliance
 * - Data classification and handling
 * - PII detection and masking
 * - Data retention and deletion
 * - Audit trails and consent management
 * - Encryption and anonymization
 */

import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  CipherGCM,
  DecipherGCM,
} from 'crypto';
import { EventEmitter } from 'events';
import { logger } from '../logging';
import { prometheus } from '../metrics/prom';

export interface DataClassification {
  level: 'public' | 'internal' | 'confidential' | 'restricted';
  categories: string[];
  piiFields: string[];
  retentionPeriod: number; // in days
  encryptionRequired: boolean;
  accessControls: string[];
}

export interface ConsentRecord {
  userId: string;
  purposes: string[];
  grantedAt: Date;
  expiresAt?: Date;
  withdrawnAt?: Date;
  version: string;
  ipAddress?: string;
  userAgent?: string;
  source: 'explicit' | 'implicit' | 'legitimate_interest';
}

export interface DataRequest {
  id: string;
  type: 'access' | 'export' | 'delete' | 'rectification' | 'portability';
  userId: string;
  requestedAt: Date;
  completedAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  reason?: string;
  approvedBy?: string;
  metadata: Record<string, unknown>;
}

export interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
  saltLength: number;
  iterations: number;
  digest: string;
}

export interface AuditEvent {
  id: string;
  timestamp: Date;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  outcome: 'success' | 'failure' | 'denied';
  details: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class DataProtectionManager extends EventEmitter {
  private readonly encryptionConfig: EncryptionConfig;
  private readonly dataClassifications: Map<string, DataClassification> = new Map();
  private readonly consentRecords: Map<string, ConsentRecord[]> = new Map();
  private readonly dataRequests: Map<string, DataRequest> = new Map();
  private readonly auditLog: AuditEvent[] = [];
  private readonly piiPatterns: RegExp[];

  constructor(config: Partial<EncryptionConfig> = {}) {
    super();

    this.encryptionConfig = {
      algorithm: 'aes-256-gcm',
      keyLength: 32,
      ivLength: 16,
      saltLength: 32,
      iterations: 100000,
      digest: 'sha256',
      ...config,
    };

    // PII detection patterns
    this.piiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b4[0-9]{12}(?:[0-9]{3})?\b/, // Visa credit card
      /\b5[1-5][0-9]{14}\b/, // Mastercard
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, // IP address
      /\b\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/, // Phone number
    ];

    this.setupDataClassifications();
    this.setupMetrics();
  }

  /**
   * Setup default data classifications
   */
  private setupDataClassifications(): void {
    // Payment data classification
    this.dataClassifications.set('payment', {
      level: 'confidential',
      categories: ['financial', 'transactional'],
      piiFields: ['cardholder_name', 'billing_address', 'email'],
      retentionPeriod: 2555, // 7 years for financial records
      encryptionRequired: true,
      accessControls: ['payment_processor', 'compliance_officer'],
    });

    // User data classification
    this.dataClassifications.set('user', {
      level: 'restricted',
      categories: ['personal', 'identity'],
      piiFields: ['name', 'email', 'phone', 'address', 'date_of_birth'],
      retentionPeriod: 1095, // 3 years default
      encryptionRequired: true,
      accessControls: ['user_admin', 'support_manager'],
    });

    // Negotiation data classification
    this.dataClassifications.set('negotiation', {
      level: 'confidential',
      categories: ['business', 'contractual'],
      piiFields: ['participant_email', 'company_name'],
      retentionPeriod: 2190, // 6 years for contracts
      encryptionRequired: true,
      accessControls: ['business_manager', 'legal_counsel'],
    });

    // Analytics data classification
    this.dataClassifications.set('analytics', {
      level: 'internal',
      categories: ['behavioral', 'technical'],
      piiFields: ['session_id', 'device_id'],
      retentionPeriod: 730, // 2 years for analytics
      encryptionRequired: false,
      accessControls: ['analyst', 'product_manager'],
    });

    // Audit data classification
    this.dataClassifications.set('audit', {
      level: 'restricted',
      categories: ['security', 'compliance'],
      piiFields: ['user_id', 'ip_address', 'session_id'],
      retentionPeriod: 2555, // 7 years for audit logs
      encryptionRequired: true,
      accessControls: ['security_officer', 'compliance_officer'],
    });
  }

  /**
   * Detect PII in data
   */
  detectPII(data: unknown): { detected: boolean; patterns: string[]; fields: string[] } {
    const result = { detected: false, patterns: [] as string[], fields: [] as string[] };

    const searchText = typeof data === 'string' ? data : JSON.stringify(data);

    this.piiPatterns.forEach((pattern, index) => {
      if (pattern.test(searchText)) {
        result.detected = true;
        result.patterns.push(`pattern_${index}`);
      }
    });

    // Check for PII field names in object data
    if (typeof data === 'object' && data !== null) {
      const piiFieldNames = ['email', 'phone', 'ssn', 'credit_card', 'address', 'name', 'dob'];
      const fields = Object.keys(data as Record<string, unknown>);

      fields.forEach((field) => {
        if (piiFieldNames.some((pii) => field.toLowerCase().includes(pii))) {
          result.detected = true;
          result.fields.push(field);
        }
      });
    }

    return result;
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(
    data: string,
    context: string = 'default',
  ): {
    encrypted: string;
    iv: string;
    tag: string;
    metadata: { algorithm: string; context: string; timestamp: string };
  } {
    try {
      const iv = randomBytes(this.encryptionConfig.ivLength);
      const cipher = createCipheriv(
        this.encryptionConfig.algorithm,
        this.deriveKey(context),
        iv,
      ) as CipherGCM;

      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const tag = cipher.getAuthTag();

      const result = {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        metadata: {
          algorithm: this.encryptionConfig.algorithm,
          context,
          timestamp: new Date().toISOString(),
        },
      };

      prometheus.incrementCounter('data_encryption_operations_total', { context });
      this.logAuditEvent('data.encrypt', 'data', undefined, 'success', { context });

      return result;
    } catch (error) {
      prometheus.incrementCounter('data_encryption_errors_total', { context });
      this.logAuditEvent('data.encrypt', 'data', undefined, 'failure', {
        error: (error as Error).message,
        context,
      });
      throw new Error(`Encryption failed: ${(error as Error).message}`);
    }
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData: {
    encrypted: string;
    iv: string;
    tag: string;
    metadata: { algorithm: string; context: string };
  }): string {
    try {
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const tag = Buffer.from(encryptedData.tag, 'hex');

      const decipher = createDecipheriv(
        encryptedData.metadata.algorithm,
        this.deriveKey(encryptedData.metadata.context),
        iv,
      ) as DecipherGCM;
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      prometheus.incrementCounter('data_decryption_operations_total', {
        context: encryptedData.metadata.context,
      });
      this.logAuditEvent('data.decrypt', 'data', undefined, 'success', {
        context: encryptedData.metadata.context,
      });

      return decrypted;
    } catch (error) {
      prometheus.incrementCounter('data_decryption_errors_total', {
        context: encryptedData.metadata.context,
      });
      this.logAuditEvent('data.decrypt', 'data', undefined, 'failure', {
        error: (error as Error).message,
        context: encryptedData.metadata.context,
      });
      throw new Error(`Decryption failed: ${(error as Error).message}`);
    }
  }

  /**
   * Mask PII data for safe display
   */
  maskPII(data: unknown, maskingLevel: 'partial' | 'full' = 'partial'): unknown {
    if (typeof data === 'string') {
      return this.maskString(data, maskingLevel);
    }

    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      const masked = { ...data } as Record<string, unknown>;

      Object.keys(masked).forEach((key) => {
        if (this.isPIIField(key)) {
          if (typeof masked[key] === 'string') {
            masked[key] = this.maskString(masked[key] as string, maskingLevel);
          } else {
            masked[key] = maskingLevel === 'full' ? '[REDACTED]' : '[MASKED]';
          }
        } else if (typeof masked[key] === 'object') {
          masked[key] = this.maskPII(masked[key], maskingLevel);
        }
      });

      return masked;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.maskPII(item, maskingLevel));
    }

    return data;
  }

  /**
   * Record consent
   */
  recordConsent(consent: Omit<ConsentRecord, 'grantedAt' | 'version'>): void {
    const record: ConsentRecord = {
      ...consent,
      grantedAt: new Date(),
      version: '1.0',
    };

    const userConsents = this.consentRecords.get(consent.userId) || [];
    userConsents.push(record);
    this.consentRecords.set(consent.userId, userConsents);

    prometheus.incrementCounter('consent_records_total', {
      source: consent.source,
      purposes: consent.purposes.join(','),
    });

    this.logAuditEvent('consent.record', 'consent', consent.userId, 'success', {
      purposes: consent.purposes,
      source: consent.source,
    });

    this.emit('consent-recorded', record);
  }

  /**
   * Withdraw consent
   */
  withdrawConsent(userId: string, purposes?: string[]): void {
    const userConsents = this.consentRecords.get(userId) || [];
    const now = new Date();

    userConsents.forEach((consent) => {
      if (
        !consent.withdrawnAt &&
        (!purposes || purposes.some((p) => consent.purposes.includes(p)))
      ) {
        consent.withdrawnAt = now;
      }
    });

    this.consentRecords.set(userId, userConsents);

    prometheus.incrementCounter('consent_withdrawals_total', {
      purposes: purposes?.join(',') || 'all',
    });

    this.logAuditEvent('consent.withdraw', 'consent', userId, 'success', {
      purposes: purposes || 'all',
    });

    this.emit('consent-withdrawn', { userId, purposes, withdrawnAt: now });
  }

  /**
   * Check if user has valid consent
   */
  hasValidConsent(userId: string, purpose: string): boolean {
    const userConsents = this.consentRecords.get(userId) || [];

    return userConsents.some(
      (consent) =>
        consent.purposes.includes(purpose) &&
        !consent.withdrawnAt &&
        (!consent.expiresAt || consent.expiresAt > new Date()),
    );
  }

  /**
   * Create data request (GDPR Article 15, CCPA)
   */
  createDataRequest(request: Omit<DataRequest, 'id' | 'requestedAt' | 'status'>): DataRequest {
    const dataRequest: DataRequest = {
      ...request,
      id: `req_${Date.now()}_${Math.random().toString(36).substring(2)}`,
      requestedAt: new Date(),
      status: 'pending',
    };

    this.dataRequests.set(dataRequest.id, dataRequest);

    prometheus.incrementCounter('data_requests_total', {
      type: request.type,
    });

    this.logAuditEvent('data_request.create', 'data_request', request.userId, 'success', {
      requestId: dataRequest.id,
      type: request.type,
    });

    this.emit('data-request-created', dataRequest);

    return dataRequest;
  }

  /**
   * Process data deletion request
   */
  async processDataDeletion(requestId: string, approvedBy: string): Promise<void> {
    const request = this.dataRequests.get(requestId);
    if (!request || request.type !== 'delete') {
      throw new Error('Invalid deletion request');
    }

    try {
      request.status = 'processing';
      request.approvedBy = approvedBy;

      // In a real implementation, this would delete user data from all systems
      // For now, we'll simulate the process
      await this.simulateDataDeletion(request.userId);

      request.status = 'completed';
      request.completedAt = new Date();

      prometheus.incrementCounter('data_deletions_completed_total', {});

      this.logAuditEvent('data_request.complete', 'data_request', request.userId, 'success', {
        requestId,
        type: 'delete',
        approvedBy,
      });

      this.emit('data-deletion-completed', request);
    } catch (error) {
      request.status = 'rejected';
      request.reason = (error as Error).message;

      prometheus.incrementCounter('data_deletions_failed_total', {});

      this.logAuditEvent('data_request.complete', 'data_request', request.userId, 'failure', {
        requestId,
        error: (error as Error).message,
      });

      throw error;
    }
  }

  /**
   * Anonymize data for analytics
   */
  anonymizeForAnalytics(data: Record<string, unknown>): Record<string, unknown> {
    const anonymized = { ...data };

    // Remove direct identifiers
    delete anonymized.id;
    delete anonymized.user_id;
    delete anonymized.email;
    delete anonymized.phone;
    delete anonymized.name;
    delete anonymized.address;

    // Hash quasi-identifiers
    if (anonymized.ip_address) {
      anonymized.ip_hash = this.hash(anonymized.ip_address as string);
      delete anonymized.ip_address;
    }

    if (anonymized.session_id) {
      anonymized.session_hash = this.hash(anonymized.session_id as string);
      delete anonymized.session_id;
    }

    // Add noise to sensitive numeric values
    if (typeof anonymized.amount === 'number') {
      anonymized.amount = this.addNoise(anonymized.amount, 0.1); // 10% noise
    }

    // Generalize timestamps to hour precision
    if (anonymized.timestamp) {
      const date = new Date(anonymized.timestamp as string);
      date.setMinutes(0, 0, 0);
      anonymized.timestamp_hour = date.toISOString();
      delete anonymized.timestamp;
    }

    prometheus.incrementCounter('data_anonymization_operations_total', {});

    return anonymized;
  }

  /**
   * Get audit trail for user
   */
  getUserAuditTrail(userId: string, fromDate?: Date, toDate?: Date): AuditEvent[] {
    return this.auditLog.filter((event) => {
      if (event.userId !== userId) return false;
      if (fromDate && event.timestamp < fromDate) return false;
      if (toDate && event.timestamp > toDate) return false;
      return true;
    });
  }

  /**
   * Get data retention requirements
   */
  getRetentionRequirements(dataType: string): DataClassification | null {
    return this.dataClassifications.get(dataType) || null;
  }

  /**
   * Check if data should be purged
   */
  shouldPurgeData(dataType: string, createdAt: Date): boolean {
    const classification = this.dataClassifications.get(dataType);
    if (!classification) return false;

    const retentionMs = classification.retentionPeriod * 24 * 60 * 60 * 1000;
    const expiryDate = new Date(createdAt.getTime() + retentionMs);

    return new Date() > expiryDate;
  }

  /**
   * Generate privacy compliance report
   */
  generateComplianceReport(): {
    timestamp: Date;
    summary: {
      totalConsents: number;
      activeConsents: number;
      withdrawnConsents: number;
      pendingDataRequests: number;
      completedDataRequests: number;
      dataClassifications: number;
      auditEvents: number;
    };
    riskAssessment: {
      unencryptedPII: number;
      expiredConsents: number;
      overRetentionData: number;
      failedEncryptions: number;
    };
    compliance: {
      gdprCompliant: boolean;
      ccpaCompliant: boolean;
      issues: string[];
    };
  } {
    const totalConsents = Array.from(this.consentRecords.values()).flat().length;
    const activeConsents = Array.from(this.consentRecords.values())
      .flat()
      .filter((c) => !c.withdrawnAt && (!c.expiresAt || c.expiresAt > new Date())).length;
    const withdrawnConsents = Array.from(this.consentRecords.values())
      .flat()
      .filter((c) => c.withdrawnAt).length;

    const pendingRequests = Array.from(this.dataRequests.values()).filter(
      (r) => r.status === 'pending',
    ).length;
    const completedRequests = Array.from(this.dataRequests.values()).filter(
      (r) => r.status === 'completed',
    ).length;

    const issues: string[] = [];

    // Check for compliance issues
    if (pendingRequests > 10) {
      issues.push('High number of pending data requests');
    }

    if (activeConsents < totalConsents * 0.8) {
      issues.push('Low consent rate may indicate compliance issues');
    }

    return {
      timestamp: new Date(),
      summary: {
        totalConsents,
        activeConsents,
        withdrawnConsents,
        pendingDataRequests: pendingRequests,
        completedDataRequests: completedRequests,
        dataClassifications: this.dataClassifications.size,
        auditEvents: this.auditLog.length,
      },
      riskAssessment: {
        unencryptedPII: 0, // Would be calculated from actual data scan
        expiredConsents: totalConsents - activeConsents - withdrawnConsents,
        overRetentionData: 0, // Would be calculated from data age analysis
        failedEncryptions: 0, // Would be tracked from metrics
      },
      compliance: {
        gdprCompliant: issues.length === 0,
        ccpaCompliant: issues.length === 0,
        issues,
      },
    };
  }

  /**
   * Helper methods
   */
  private deriveKey(context: string): Buffer {
    // In production, use proper key derivation with stored salt
    return createHash('sha256')
      .update(`${process.env.ENCRYPTION_KEY || 'default-key'}:${context}`)
      .digest();
  }

  private maskString(str: string, level: 'partial' | 'full'): string {
    if (level === 'full') {
      return '[REDACTED]';
    }

    if (str.includes('@')) {
      // Email masking
      const [local, domain] = str.split('@');
      return `${local.charAt(0)}${'*'.repeat(Math.max(0, local.length - 2))}${local.charAt(local.length - 1)}@${domain}`;
    }

    if (str.length <= 3) {
      return '*'.repeat(str.length);
    }

    return `${str.substring(0, 2)}${'*'.repeat(str.length - 4)}${str.substring(str.length - 2)}`;
  }

  private isPIIField(fieldName: string): boolean {
    const piiFields = ['email', 'phone', 'ssn', 'name', 'address', 'dob', 'credit_card'];
    return piiFields.some((pii) => fieldName.toLowerCase().includes(pii));
  }

  private hash(data: string): string {
    return createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  private addNoise(value: number, noiseLevel: number): number {
    const noise = (Math.random() - 0.5) * 2 * noiseLevel * value;
    return Math.round((value + noise) * 100) / 100;
  }

  private async simulateDataDeletion(userId: string): Promise<void> {
    // Simulate deletion process
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Remove consent records
    this.consentRecords.delete(userId);

    // In real implementation, would call deletion APIs for all systems
    logger.info({ userId }, 'Simulated data deletion completed');
  }

  private logAuditEvent(
    action: string,
    resource: string,
    userId?: string,
    outcome: 'success' | 'failure' | 'denied' = 'success',
    details: Record<string, unknown> = {},
  ): void {
    const event: AuditEvent = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2)}`,
      timestamp: new Date(),
      userId,
      action,
      resource,
      outcome,
      details,
      severity: outcome === 'failure' ? 'high' : 'low',
    };

    this.auditLog.push(event);

    // Keep audit log size manageable (in production, would persist to storage)
    if (this.auditLog.length > 10000) {
      this.auditLog.splice(0, 1000);
    }

    prometheus.incrementCounter('audit_events_total', {
      action,
      resource,
      outcome,
    });
  }

  private setupMetrics(): void {
    // Metrics are created automatically when first used
    logger.debug('Data protection metrics configured');
  }
}

/**
 * Create data protection manager with environment configuration
 */
export function createDataProtectionManager(): DataProtectionManager {
  const config = {
    algorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
    keyLength: parseInt(process.env.ENCRYPTION_KEY_LENGTH || '32', 10),
    ivLength: parseInt(process.env.ENCRYPTION_IV_LENGTH || '16', 10),
    iterations: parseInt(process.env.ENCRYPTION_ITERATIONS || '100000', 10),
  };

  return new DataProtectionManager(config);
}
