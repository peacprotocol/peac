/**
 * @peac/crawler v0.9.12.1 - Main crawler control registry builder
 * Zero-config local provider with optional Cloudflare integration
 */

import { CrawlerControlRegistry } from './registry.js';
import { RegistryHealthMonitor } from './health.js';
import { LocalProvider } from './providers/local/local.provider.js';
import { CloudflareProvider } from './providers/cloudflare/cf.provider.js';
import { CFClient } from './providers/cloudflare/cf.client.js';
import { crawlerMetrics } from './observability.js';
import { RegistryOptions, VerificationLevel } from './types.js';

export interface RegistryHandle {
  registry: CrawlerControlRegistry;
  healthMonitor?: RegistryHealthMonitor;
  shutdown: () => Promise<void>;
}

export interface BuildRegistryOptions {
  strategy?: RegistryOptions['strategy'];
  mode?: RegistryOptions['mode'];
  weights?: Record<string, number>;
  fallbackPolicy?: RegistryOptions['fallbackPolicy'];
  providerTimeout?: number;
  enableHealthMonitor?: boolean;
  healthCheckInterval?: number;
  cloudflare?: {
    enabled: boolean;
    apiToken: string;
    zoneId: string;
    baseURL?: string;
    priority?: number;
  };
  quotas?: Record<string, {
    requestsPerMinute?: number;
    requestsPerHour?: number;
    maxMonthlyCostUSD?: number;
  }>;
}

/**
 * Build crawler control registry from environment variables
 */
export async function buildRegistry(env = process.env): Promise<RegistryHandle> {
  const options: BuildRegistryOptions = {
    strategy: (env.CRAWLER_STRATEGY as any) || 'weighted',
    mode: (env.CRAWLER_MODE as any) || 'parallel',
    weights: env.CRAWLER_WEIGHTS ? JSON.parse(env.CRAWLER_WEIGHTS) : { local: 1.0 },
    fallbackPolicy: (env.CRAWLER_FALLBACK as any) || 'allow',
    providerTimeout: Number(env.CRAWLER_PROVIDER_TIMEOUT_MS || 500),
    enableHealthMonitor: env.ENABLE_CRAWLER_HEALTH === 'true',
    healthCheckInterval: Number(env.CRAWLER_HEALTH_INTERVAL_MS || 30_000),
    quotas: env.CRAWLER_QUOTAS ? JSON.parse(env.CRAWLER_QUOTAS) : undefined,
    cloudflare: env.ENABLE_CF === 'true' ? {
      enabled: true,
      apiToken: env.CF_API_TOKEN!,
      zoneId: env.CF_ZONE_ID!,
      baseURL: env.CF_API_BASE || 'https://api.cloudflare.com',
      priority: Number(env.CF_PROVIDER_PRIORITY || 50)
    } : { enabled: false, apiToken: '', zoneId: '' }
  };
  
  return buildRegistryFromOptions(options);
}

/**
 * Build crawler control registry from explicit options
 */
export async function buildRegistryFromOptions(options: BuildRegistryOptions): Promise<RegistryHandle> {
  const registry = new CrawlerControlRegistry({
    strategy: options.strategy || 'weighted',
    mode: options.mode || 'parallel',
    weights: options.weights || { local: 1.0 },
    fallbackPolicy: options.fallbackPolicy || 'allow',
    perProviderTimeoutMs: options.providerTimeout || 500,
    dynamicWeightOnUnhealthy: 0, // Disable unhealthy providers
    quotas: options.quotas
  });
  
  const cleanupFunctions: Array<() => Promise<void> | void> = [];
  
  // Always register local provider (zero-config)
  const localProvider = new LocalProvider({
    uaAllow: /bot|gpt|claude|bing|google|perplexity|crawler|spider|scraper/i,
    maxRpsThreshold: 10,
    rdnsRequired: false
  });
  
  registry.register(localProvider, options.weights?.local || 1.0);
  crawlerMetrics.verifyRequests('local'); // Initialize metrics
  
  // Cloudflare provider with safe initialization
  if (options.cloudflare?.enabled) {
    try {
      const cfClient = new CFClient({
        apiToken: options.cloudflare.apiToken,
        zoneId: options.cloudflare.zoneId,
        baseURL: options.cloudflare.baseURL || 'https://api.cloudflare.com',
        timeoutMs: options.providerTimeout || 500,
        retries: 2
      });
      
      const cfProvider = new CloudflareProvider(cfClient, {
        priority: options.cloudflare.priority || 50
      });
      
      // Health probe before registration
      console.log('Probing Cloudflare API connectivity...');
      const healthResult = await cfProvider.healthCheck();
      
      if (healthResult.healthy) {
        console.log(`✅ Cloudflare provider initialized (${healthResult.latency_ms}ms)`);
        registry.register(
          cfProvider, 
          options.weights?.cloudflare || 1.0,
          options.quotas?.cloudflare
        );
        cleanupFunctions.push(() => cfProvider.close());
        crawlerMetrics.verifyRequests('cloudflare'); // Initialize metrics
      } else {
        console.warn('⚠️  Cloudflare health check failed; provider not registered');
        crawlerMetrics.providerInitFailed('cloudflare');
      }
    } catch (error) {
      console.error('❌ Cloudflare provider initialization failed:', error.message);
      crawlerMetrics.providerInitFailed('cloudflare');
      // Continue without Cloudflare - graceful degradation
    }
  }
  
  // Health monitor (optional)
  let healthMonitor: RegistryHealthMonitor | undefined;
  if (options.enableHealthMonitor) {
    healthMonitor = new RegistryHealthMonitor(
      registry.providers as any,
      (name, healthy, latency) => {
        registry.updateHealth(name, healthy);
        crawlerMetrics.providerHealthy(name, healthy);
        
        if (healthy) {
          console.log(`✅ Provider ${name} healthy (${latency}ms)`);
        } else {
          console.warn(`⚠️  Provider ${name} unhealthy`);
        }
      },
      {
        intervalMs: options.healthCheckInterval || 30_000,
        timeoutMs: (options.providerTimeout || 500) * 2,
        unhealthyThreshold: 3,
        healthyThreshold: 2
      }
    );
    
    healthMonitor.start();
    cleanupFunctions.push(() => {
      healthMonitor?.stop();
      return Promise.resolve();
    });
  }
  
  // Graceful shutdown
  const shutdown = async (): Promise<void> {
    console.log('🛑 Shutting down crawler registry...');
    
    try {
      // Stop health monitoring first
      if (healthMonitor) {
        healthMonitor.stop();
      }
      
      // Close all providers
      for (const cleanup of cleanupFunctions) {
        await cleanup();
      }
      
      // Close registry
      await registry.close();
      
      console.log('✅ Crawler registry shutdown complete');
    } catch (error) {
      console.error('❌ Error during crawler registry shutdown:', error);
      throw error;
    }
  };
  
  // Hook process signals for graceful shutdown
  if (typeof process !== 'undefined') {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    const signalHandler = () => {
      shutdown().catch(console.error);
    };
    
    signals.forEach(signal => {
      process.once(signal, signalHandler);
    });
  }
  
  return {
    registry,
    healthMonitor,
    shutdown
  };
}

// Export types and utilities
export {
  CrawlerControlRegistry,
  RegistryHealthMonitor,
  LocalProvider,
  CloudflareProvider,
  CFClient,
  VerificationLevel,
  crawlerMetrics
} from './registry.js';

export * from './types.js';
export * from './cache.js';
export * from './circuitBreaker.js';
export * from './health.js';
export * from './observability.js';

// Webhook utilities
export * from './providers/cloudflare/cf.webhook.js';

// Default export for convenience
export default buildRegistry;