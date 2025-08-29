export interface ReceiptStore {
  store(jti: string, jws: string, ttlSec?: number): Promise<void>;
  get(jti: string): Promise<string | undefined>;
  delete(jti: string): Promise<void>;
  cleanup(): Promise<void>;
}

interface StoredReceipt {
  jws: string;
  expiresAt: number;
}

class InMemoryReceiptStore implements ReceiptStore {
  private receipts = new Map<string, StoredReceipt>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    // Run cleanup every hour (skip in test environment)
    if (process.env.NODE_ENV !== 'test') {
      this.cleanupInterval = setInterval(() => {
        this.cleanup().catch(() => {
          // Silent cleanup failures
        });
      }, 3600000);
    }
  }

  async store(jti: string, jws: string, ttlSec = 30 * 24 * 3600): Promise<void> {
    const expiresAt = Date.now() + ttlSec * 1000;
    this.receipts.set(jti, { jws, expiresAt });
  }

  async get(jti: string): Promise<string | undefined> {
    const receipt = this.receipts.get(jti);
    if (!receipt) return undefined;

    if (Date.now() > receipt.expiresAt) {
      this.receipts.delete(jti);
      return undefined;
    }

    return receipt.jws;
  }

  async delete(jti: string): Promise<void> {
    this.receipts.delete(jti);
  }

  async cleanup(): Promise<void> {
    const now = Date.now();
    for (const [jti, receipt] of this.receipts) {
      if (now > receipt.expiresAt) {
        this.receipts.delete(jti);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

export const receiptStore = new InMemoryReceiptStore();
