import { PaymentStore, InMemoryPaymentStore, RedisPaymentStore } from '../payments/store';
import {
  NegotiationStore,
  InMemoryNegotiationStore,
  RedisNegotiationStore,
} from '../negotiation/store';
import { logger } from '../logging';

export type StoreBackend = 'memory' | 'redis';

export interface StoreConfig {
  backend: StoreBackend;
}

class StoreManager {
  private paymentStore?: PaymentStore;
  private negotiationStore?: NegotiationStore;
  private config: StoreConfig;

  constructor() {
    this.config = {
      backend: (process.env.PEAC_STORE_BACKEND as StoreBackend) || 'memory',
    };

    logger.info({ backend: this.config.backend }, 'Store backend configured');
  }

  getPaymentStore(): PaymentStore {
    if (!this.paymentStore) {
      switch (this.config.backend) {
        case 'redis':
          this.paymentStore = new RedisPaymentStore();
          break;
        case 'memory':
        default:
          this.paymentStore = new InMemoryPaymentStore();
          break;
      }
      logger.debug({ backend: this.config.backend }, 'Payment store initialized');
    }
    return this.paymentStore;
  }

  getNegotiationStore(): NegotiationStore {
    if (!this.negotiationStore) {
      switch (this.config.backend) {
        case 'redis':
          this.negotiationStore = new RedisNegotiationStore();
          break;
        case 'memory':
        default:
          this.negotiationStore = new InMemoryNegotiationStore();
          break;
      }
      logger.debug({ backend: this.config.backend }, 'Negotiation store initialized');
    }
    return this.negotiationStore;
  }

  getConfig(): StoreConfig {
    return { ...this.config };
  }
}

export const storeManager = new StoreManager();
