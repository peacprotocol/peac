import { Adapter } from './spi';
import { deepMerge } from '../utils/deep-merge';
import pino from 'pino';

const logger = pino({ name: 'adapter-registry' });

export class AdapterRegistry {
  private adapters = new Map<string, Adapter>();

  async register(adapter: Adapter): Promise<void> {
    const name = adapter.name();

    if (this.adapters.has(name)) {
      throw new Error(`Adapter already registered: ${name}`);
    }

    logger.info({ adapter: name }, 'Registering adapter');

    if (adapter.initialize) {
      await adapter.initialize(this.getAdapterConfig(name));
    }

    this.adapters.set(name, adapter);
    logger.info({ adapter: name }, 'Adapter registered');
  }

  get<T extends Adapter>(name: string): T | undefined {
    return this.adapters.get(name) as T;
  }

  getAll(): Adapter[] {
    return Array.from(this.adapters.values());
  }

  composeDiscovery(): Record<string, unknown> {
    const fragments = this.getAll()
      .map((adapter) => {
        try {
          return adapter.discoveryFragment();
        } catch (err) {
          logger.error({ adapter: adapter.name(), err }, 'Failed to get discovery fragment');
          return {};
        }
      })
      .filter((f) => Object.keys(f).length > 0);

    return deepMerge({}, ...fragments);
  }

  async shutdown(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      if (adapter.shutdown) {
        try {
          await adapter.shutdown();
          logger.info({ adapter: adapter.name() }, 'Adapter shutdown');
        } catch (err) {
          logger.error({ adapter: adapter.name(), err }, 'Adapter shutdown failed');
        }
      }
    }
    this.adapters.clear();
  }

  private getAdapterConfig(name: string): Record<string, string> {
    const prefix = `PEAC_ADAPTER_${name.toUpperCase()}_`;
    const config: Record<string, string> = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix) && value) {
        const configKey = key.slice(prefix.length).toLowerCase();
        config[configKey] = value;
      }
    }

    return config;
  }
}
