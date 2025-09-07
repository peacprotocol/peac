import { randomUUID } from 'crypto';
import { EventEnvelope } from './types';
import { logger } from '../../logging';
import { metrics } from '../../metrics';

export class EventEmitter {
  private correlationId?: string;

  setCorrelationId(id: string): void {
    this.correlationId = id;
  }

  async emit<T>(
    type: string,
    payload: T,
    options?: {
      causationId?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<void> {
    const event: EventEnvelope<T> = {
      id: randomUUID(),
      version: '0.9.6',
      type,
      timestamp: new Date().toISOString(),
      causation_id: options?.causationId,
      correlation_id: this.correlationId,
      metadata: options?.metadata,
      payload,
    };

    // For PR-1, just log the event
    logger.info({ event }, 'Protocol event emitted');
    metrics.protocolEvents.inc({ type });

    // In future PRs, wire to event bus/storage
  }
}

export const eventEmitter = new EventEmitter();
