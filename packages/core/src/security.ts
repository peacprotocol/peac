/**
 * @peac/core v0.9.12.1 - Security features for replay protection and key rotation
 * Nonce management, JTI tracking, and automated key lifecycle
 */

import { SECURITY_CONFIG, FEATURES } from './config.js';
import { Receipt, PurgeReceipt, VerifyKeySet } from './types.js';

export interface SecurityContext {
  nonce_store: NonceStore;
  key_manager: KeyManager;
  replay_detector: ReplayDetector;
}

export interface NonceStore {
  has(nonce: string): Promise<boolean>;
  add(nonce: string, expires_at: number): Promise<void>;
  cleanup(): Promise<void>;
}

export interface ReplayProtection {
  check_nonce: boolean;
  check_timestamp: boolean;
  max_age_seconds: number;
  jti_required: boolean;
}

export interface KeyRotationPolicy {
  rotation_interval_days: number;
  overlap_period_days: number;
  max_active_keys: number;
  auto_rotate: boolean;
}

// Memory-based nonce store (Redis in production)
export class MemoryNonceStore implements NonceStore {
  private store = new Map<string, number>();

  async has(nonce: string): Promise<boolean> {
    const expires = this.store.get(nonce);
    if (!expires) return false;

    if (Date.now() > expires) {
      this.store.delete(nonce);
      return false;
    }

    return true;
  }

  async add(nonce: string, expires_at: number): Promise<void> {
    this.store.set(nonce, expires_at);
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    for (const [nonce, expires] of this.store.entries()) {
      if (now > expires) {
        this.store.delete(nonce);
      }
    }
  }
}

export class ReplayDetector {
  constructor(
    private nonce_store: NonceStore,
    private config = SECURITY_CONFIG.replay_protection
  ) {}

  async checkReplay(receipt: Receipt): Promise<{ valid: boolean; reason?: string }> {
    // Check timestamp freshness
    if (this.config.check_timestamp) {
      const issued_at = new Date(receipt.issued_at).getTime();
      const now = Date.now();
      const max_age = this.config.max_age_seconds * 1000;

      if (now - issued_at > max_age) {
        return { valid: false, reason: 'receipt_too_old' };
      }

      // Reject future timestamps (clock skew tolerance)
      if (issued_at > now + 60000) {
        // 60 second tolerance
        return { valid: false, reason: 'receipt_from_future' };
      }
    }

    // Check nonce uniqueness
    if (this.config.check_nonce && receipt.nonce) {
      if (await this.nonce_store.has(receipt.nonce)) {
        return { valid: false, reason: 'nonce_already_used' };
      }

      // Add nonce to store
      const expires_at = receipt.expires_at
        ? new Date(receipt.expires_at).getTime()
        : Date.now() + this.config.max_age_seconds * 1000;

      await this.nonce_store.add(receipt.nonce, expires_at);
    }

    // Check JTI requirement
    if (this.config.jti_required && !receipt.nonce) {
      return { valid: false, reason: 'jti_required' };
    }

    return { valid: true };
  }
}

export interface KeyInfo {
  kid: string;
  created_at: string;
  expires_at?: string;
  status: 'active' | 'rotating' | 'expired' | 'revoked';
  algorithm: string;
  key_size?: number;
}

export class KeyManager {
  private keys = new Map<string, KeyInfo>();
  private rotation_timer?: ReturnType<typeof setInterval>;

  constructor(
    private config = SECURITY_CONFIG.key_rotation,
    private key_store?: KeyStore
  ) {
    if (this.config.auto_rotate && FEATURES.AUTO_KEY_ROTATION) {
      this.scheduleRotation();
    }
  }

  async addKey(kid: string, info: Omit<KeyInfo, 'kid'>): Promise<void> {
    const keyInfo = { kid, ...info };
    this.keys.set(kid, keyInfo);

    if (this.key_store) {
      await this.key_store.store(kid, keyInfo);
    }
  }

  async getKeyInfo(kid: string): Promise<KeyInfo | null> {
    let info = this.keys.get(kid);

    if (!info && this.key_store) {
      const retrievedInfo = await this.key_store.retrieve(kid);
      if (retrievedInfo) {
        this.keys.set(kid, retrievedInfo);
        info = retrievedInfo;
      }
    }

    return info ?? null;
  }

  async getActiveKeys(): Promise<KeyInfo[]> {
    const active = Array.from(this.keys.values()).filter((key) => key.status === 'active');

    // Load from store if empty
    if (active.length === 0 && this.key_store) {
      const stored = await this.key_store.getActive();
      stored.forEach((key) => this.keys.set(key.kid, key));
      return stored;
    }

    return active;
  }

  async rotateKeys(): Promise<{ created: string[]; expired: string[] }> {
    if (!FEATURES.AUTO_KEY_ROTATION) {
      throw new Error('Key rotation is disabled');
    }

    const now = new Date();
    const created: string[] = [];
    const expired: string[] = [];

    // Mark old keys as rotating
    const active = await this.getActiveKeys();
    const old_keys = active.filter((key) => {
      const age_days = (now.getTime() - new Date(key.created_at).getTime()) / (24 * 60 * 60 * 1000);
      return age_days >= this.config.rotation_interval_days;
    });

    for (const key of old_keys) {
      if (this.config.overlap_period_days > 0) {
        const expires_at = new Date(
          now.getTime() + this.config.overlap_period_days * 24 * 60 * 60 * 1000
        );
        key.status = 'rotating';
        key.expires_at = expires_at.toISOString();
      } else {
        key.status = 'expired';
        expired.push(key.kid);
      }

      if (this.key_store) {
        await this.key_store.update(key.kid, key);
      }
    }

    // Create new keys if below maximum
    const current_active = active.length - expired.length;
    const keys_to_create = Math.max(1, Math.min(2, this.config.max_active_keys - current_active));

    for (let i = 0; i < keys_to_create; i++) {
      const kid = this.generateKeyId();
      const key_info: KeyInfo = {
        kid,
        created_at: now.toISOString(),
        status: 'active',
        algorithm: 'EdDSA',
      };

      await this.addKey(kid, key_info);
      created.push(kid);
    }

    return { created, expired };
  }

  private generateKeyId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `key-${timestamp}-${random}`;
  }

  private scheduleRotation(): void {
    if (this.rotation_timer) {
      clearInterval(this.rotation_timer);
    }

    // Check for rotation daily
    const check_interval = 24 * 60 * 60 * 1000; // 24 hours

    this.rotation_timer = setInterval(async () => {
      try {
        await this.rotateKeys();
      } catch (error) {
        console.error('Automatic key rotation failed:', error);
      }
    }, check_interval);
    (this.rotation_timer as any)?.unref?.();
  }

  cleanup(): void {
    if (this.rotation_timer) {
      clearInterval(this.rotation_timer);
      this.rotation_timer = undefined;
    }
  }
}

export interface KeyStore {
  store(kid: string, key_info: KeyInfo): Promise<void>;
  retrieve(kid: string): Promise<KeyInfo | null>;
  update(kid: string, key_info: KeyInfo): Promise<void>;
  getActive(): Promise<KeyInfo[]>;
}

// Rate limiting for security operations
export class SecurityRateLimit {
  private attempts = new Map<string, { count: number; window_start: number }>();

  constructor(
    private max_attempts = 5,
    private window_ms = 60000
  ) {}

  checkLimit(key: string): { allowed: boolean; retry_after?: number } {
    const now = Date.now();
    let entry = this.attempts.get(key);

    if (!entry || now - entry.window_start > this.window_ms) {
      entry = { count: 0, window_start: now };
      this.attempts.set(key, entry);
    }

    if (entry.count >= this.max_attempts) {
      const retry_after = Math.ceil((entry.window_start + this.window_ms - now) / 1000);
      return { allowed: false, retry_after };
    }

    entry.count++;
    return { allowed: true };
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.attempts.entries()) {
      if (now - entry.window_start > this.window_ms) {
        this.attempts.delete(key);
      }
    }
  }
}

// Security audit logging
export interface SecurityEvent {
  type: 'replay_detected' | 'key_rotated' | 'nonce_reused' | 'timestamp_invalid' | 'rate_limited';
  timestamp: string;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class SecurityAuditor {
  private events: SecurityEvent[] = [];
  private max_events = 1000;

  logEvent(event: Omit<SecurityEvent, 'timestamp'>): void {
    const security_event: SecurityEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    this.events.push(security_event);

    // Maintain rolling buffer
    if (this.events.length > this.max_events) {
      this.events = this.events.slice(-this.max_events);
    }

    // Log critical events immediately
    if (event.severity === 'critical') {
      console.error('SECURITY CRITICAL:', JSON.stringify(security_event));
    }
  }

  getRecentEvents(limit = 100): SecurityEvent[] {
    return this.events.slice(-limit);
  }

  getEventsByType(type: SecurityEvent['type'], limit = 50): SecurityEvent[] {
    return this.events.filter((event) => event.type === type).slice(-limit);
  }

  getSecurityReport(): {
    total_events: number;
    by_severity: Record<string, number>;
    by_type: Record<string, number>;
    recent_critical: SecurityEvent[];
  } {
    const by_severity: Record<string, number> = {};
    const by_type: Record<string, number> = {};

    for (const event of this.events) {
      by_severity[event.severity] = (by_severity[event.severity] || 0) + 1;
      by_type[event.type] = (by_type[event.type] || 0) + 1;
    }

    const recent_critical = this.events.filter((event) => event.severity === 'critical').slice(-10);

    return {
      total_events: this.events.length,
      by_severity,
      by_type,
      recent_critical,
    };
  }
}

// Enhanced security validation for receipts
export async function validateReceiptSecurity(
  receipt: Receipt,
  context: SecurityContext
): Promise<{ valid: boolean; violations: string[] }> {
  const violations: string[] = [];

  // Replay protection
  const replay_check = await context.replay_detector.checkReplay(receipt);
  if (!replay_check.valid) {
    violations.push(`replay_protection: ${replay_check.reason}`);
  }

  // Key validation
  if (receipt.kid) {
    const key_info = await context.key_manager.getKeyInfo(receipt.kid);
    if (!key_info) {
      violations.push('key_validation: unknown_key');
    } else if (key_info.status === 'expired' || key_info.status === 'revoked') {
      violations.push(`key_validation: key_${key_info.status}`);
    }
  }

  // Timestamp validation
  const now = Date.now();
  const issued_at = new Date(receipt.issued_at).getTime();

  if (issued_at > now + 60000) {
    // 60 second clock skew
    violations.push('timestamp_validation: future_timestamp');
  }

  if (receipt.expires_at) {
    const expires_at = new Date(receipt.expires_at).getTime();
    if (expires_at < now) {
      violations.push('timestamp_validation: expired_receipt');
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

// Factory function for creating security context
export function createSecurityContext(
  opts: {
    nonce_store?: NonceStore;
    key_store?: KeyStore;
    features?: typeof FEATURES;
  } = {}
): SecurityContext {
  const nonce_store = opts.nonce_store || new MemoryNonceStore();
  const key_manager = new KeyManager(SECURITY_CONFIG.key_rotation, opts.key_store);
  const replay_detector = new ReplayDetector(nonce_store);

  return {
    nonce_store,
    key_manager,
    replay_detector,
  };
}

// Global instances
export const securityContext = createSecurityContext();
export const securityAuditor = new SecurityAuditor();

// Cleanup scheduler
if (typeof setInterval !== 'undefined') {
  // Cleanup nonces every 15 minutes
  const _nonceIv = setInterval(() => securityContext.nonce_store.cleanup(), 15 * 60 * 1000);

  // Cleanup rate limit entries every hour
  const _rlIv = setInterval(
    () => {
      // Rate limiter cleanup would go here if needed
    },
    60 * 60 * 1000
  );

  (_nonceIv as any)?.unref?.();
  (_rlIv as any)?.unref?.();
}
