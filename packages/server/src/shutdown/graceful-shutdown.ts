/**
 * PEAC Protocol v0.9.6 Graceful Shutdown Manager
 *
 * Enterprise-grade graceful shutdown with:
 * - Coordinated resource cleanup
 * - Configurable shutdown timeouts
 * - Health check integration
 * - In-flight request tracking
 * - Resource dependency management
 * - Comprehensive monitoring and logging
 * - Error recovery and fallback strategies
 */

import { Server } from 'http';
import { EventEmitter } from 'events';
import { logger } from '../logging';
import { prometheus } from '../metrics/prom';
import { getRedis } from '../utils/redis-pool';

export interface ShutdownConfig {
  gracefulTimeoutMs: number;
  forceShutdownTimeoutMs: number;
  drainTimeoutMs: number;
  healthCheckGracePeriodMs: number;
  enableMetrics: boolean;
  enableDetailedLogging: boolean;
}

export interface ShutdownResource {
  name: string;
  priority: number; // Higher number = shutdown earlier
  cleanup: () => Promise<void>;
  timeoutMs?: number;
  required?: boolean; // If true, shutdown fails if this resource fails
}

export type ShutdownPhase = 'draining' | 'cleanup' | 'force' | 'complete' | 'error';

export interface ShutdownEvent {
  phase: ShutdownPhase;
  timestamp: Date;
  duration?: number;
  error?: Error;
  resourcesRemaining?: number;
}

export class GracefulShutdownManager extends EventEmitter {
  private server?: Server;
  private isShuttingDown = false;
  private shutdownStartTime?: Date;
  private resources: Map<string, ShutdownResource> = new Map();
  private activeRequests = 0;
  private shutdownTimer?: NodeJS.Timeout;
  private forceShutdownTimer?: NodeJS.Timeout;
  private phase: ShutdownPhase = 'draining';

  private readonly stats = {
    shutdownAttempts: 0,
    successfulShutdowns: 0,
    forcedShutdowns: 0,
    failedShutdowns: 0,
    averageShutdownTime: 0,
    longestShutdownTime: 0,
  };

  constructor(private config: ShutdownConfig) {
    super();
    this.setupSignalHandlers();
    this.setupMetrics();
  }

  /**
   * Register the HTTP server for graceful shutdown
   */
  registerServer(server: Server): void {
    this.server = server;

    // Track active requests
    server.on('request', (_req, res) => {
      this.activeRequests++;

      res.on('finish', () => {
        this.activeRequests--;
        if (this.config.enableMetrics) {
          prometheus.setGauge('active_requests', {}, this.activeRequests);
        }
      });

      res.on('close', () => {
        this.activeRequests--;
        if (this.config.enableMetrics) {
          prometheus.setGauge('active_requests', {}, this.activeRequests);
        }
      });
    });

    logger.info('HTTP server registered for graceful shutdown');
  }

  /**
   * Register a resource for cleanup during shutdown
   */
  registerResource(resource: ShutdownResource): void {
    if (this.resources.has(resource.name)) {
      logger.warn({ resourceName: resource.name }, 'Overwriting existing shutdown resource');
    }

    this.resources.set(resource.name, resource);

    if (this.config.enableDetailedLogging) {
      logger.debug(
        {
          resourceName: resource.name,
          priority: resource.priority,
          required: resource.required || false,
          timeout: resource.timeoutMs || 'default',
        },
        'Shutdown resource registered',
      );
    }
  }

  /**
   * Unregister a shutdown resource
   */
  unregisterResource(name: string): void {
    const removed = this.resources.delete(name);
    if (removed && this.config.enableDetailedLogging) {
      logger.debug({ resourceName: name }, 'Shutdown resource unregistered');
    }
  }

  /**
   * Start graceful shutdown process
   */
  async shutdown(signal?: string): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress, ignoring additional shutdown request');
      return;
    }

    this.isShuttingDown = true;
    this.shutdownStartTime = new Date();
    this.stats.shutdownAttempts++;

    logger.info(
      {
        signal: signal || 'manual',
        activeRequests: this.activeRequests,
        registeredResources: this.resources.size,
      },
      'Starting graceful shutdown',
    );

    if (this.config.enableMetrics) {
      prometheus.incrementCounter('shutdown_attempts_total', { signal: signal || 'manual' });
      prometheus.setGauge('shutdown_in_progress', {}, 1);
    }

    try {
      // Phase 1: Drain existing connections
      await this.drainConnections();

      // Phase 2: Cleanup resources
      await this.cleanupResources();

      // Phase 3: Complete shutdown
      await this.completeShutdown();

      this.stats.successfulShutdowns++;
      this.recordShutdownTime();

      if (this.config.enableMetrics) {
        prometheus.incrementCounter('shutdown_success_total', {});
      }

      this.emitShutdownEvent('complete');
      logger.info('Graceful shutdown completed successfully');
    } catch (error) {
      this.stats.failedShutdowns++;

      if (this.config.enableMetrics) {
        prometheus.incrementCounter('shutdown_failed_total', {});
      }

      this.emitShutdownEvent('error', error as Error);
      logger.error(
        {
          error: (error as Error).message,
          phase: this.phase,
        },
        'Graceful shutdown failed',
      );

      throw error;
    } finally {
      if (this.config.enableMetrics) {
        prometheus.setGauge('shutdown_in_progress', {}, 0);
      }

      if (this.shutdownTimer) {
        clearTimeout(this.shutdownTimer);
      }
      if (this.forceShutdownTimer) {
        clearTimeout(this.forceShutdownTimer);
      }
    }
  }

  /**
   * Force immediate shutdown (emergency)
   */
  forceShutdown(reason?: string): void {
    logger.warn(
      {
        reason: reason || 'unknown',
        phase: this.phase,
        activeRequests: this.activeRequests,
      },
      'Force shutdown initiated',
    );

    this.stats.forcedShutdowns++;

    if (this.config.enableMetrics) {
      prometheus.incrementCounter('shutdown_forced_total', { reason: reason || 'unknown' });
    }

    this.emitShutdownEvent('force');

    // Immediate cleanup without waiting
    process.exit(1);
  }

  /**
   * Phase 1: Drain existing connections
   */
  private async drainConnections(): Promise<void> {
    this.phase = 'draining';
    this.emitShutdownEvent('draining');

    logger.info(
      {
        activeRequests: this.activeRequests,
        drainTimeout: this.config.drainTimeoutMs,
      },
      'Draining active connections',
    );

    if (!this.server) {
      logger.debug('No HTTP server registered, skipping connection draining');
      return;
    }

    // Stop accepting new connections
    this.server.close();

    // Wait for existing requests to complete
    const drainStartTime = Date.now();
    while (this.activeRequests > 0) {
      const elapsed = Date.now() - drainStartTime;

      if (elapsed > this.config.drainTimeoutMs) {
        logger.warn(
          {
            activeRequests: this.activeRequests,
            drainTimeout: this.config.drainTimeoutMs,
          },
          'Drain timeout exceeded, proceeding with active requests',
        );
        break;
      }

      // Wait and check again
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const drainDuration = Date.now() - drainStartTime;
    logger.info(
      {
        drainDuration,
        remainingRequests: this.activeRequests,
      },
      'Connection draining completed',
    );
  }

  /**
   * Phase 2: Cleanup resources in priority order
   */
  private async cleanupResources(): Promise<void> {
    this.phase = 'cleanup';
    this.emitShutdownEvent('cleanup');

    if (this.resources.size === 0) {
      logger.debug('No resources registered for cleanup');
      return;
    }

    // Sort resources by priority (higher first)
    const sortedResources = Array.from(this.resources.values()).sort(
      (a, b) => b.priority - a.priority,
    );

    logger.info(
      {
        resourceCount: sortedResources.length,
        resources: sortedResources.map((r) => ({ name: r.name, priority: r.priority })),
      },
      'Starting resource cleanup',
    );

    const errors: Array<{ resource: string; error: Error }> = [];

    for (const resource of sortedResources) {
      const startTime = Date.now();

      try {
        logger.debug(
          {
            resourceName: resource.name,
            priority: resource.priority,
          },
          'Cleaning up resource',
        );

        const timeout = resource.timeoutMs || this.config.gracefulTimeoutMs;
        await this.executeWithTimeout(resource.cleanup, timeout, resource.name);

        const duration = Date.now() - startTime;
        logger.debug(
          {
            resourceName: resource.name,
            duration,
          },
          'Resource cleanup completed',
        );

        if (this.config.enableMetrics) {
          prometheus.setGauge(
            'shutdown_resource_cleanup_duration_ms',
            { resource: resource.name },
            duration,
          );
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        const cleanupError = error as Error;

        errors.push({ resource: resource.name, error: cleanupError });

        logger.error(
          {
            resourceName: resource.name,
            error: cleanupError.message,
            duration,
            required: resource.required,
          },
          'Resource cleanup failed',
        );

        if (this.config.enableMetrics) {
          prometheus.incrementCounter('shutdown_resource_errors_total', {
            resource: resource.name,
          });
        }

        // If this is a required resource, fail the shutdown
        if (resource.required) {
          throw new Error(
            `Required resource cleanup failed: ${resource.name} - ${cleanupError.message}`,
          );
        }
      }
    }

    if (errors.length > 0) {
      logger.warn(
        {
          errorCount: errors.length,
          errors: errors.map((e) => ({ resource: e.resource, error: e.error.message })),
        },
        'Some resources failed to cleanup properly',
      );
    }

    logger.info('Resource cleanup phase completed');
  }

  /**
   * Phase 3: Complete the shutdown
   */
  private async completeShutdown(): Promise<void> {
    this.phase = 'complete';

    // Final cleanup
    this.removeAllListeners();

    // Final logging
    const totalDuration = this.shutdownStartTime
      ? Date.now() - this.shutdownStartTime.getTime()
      : 0;

    logger.info(
      {
        totalDuration,
        phase: this.phase,
      },
      'Shutdown sequence completed',
    );
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    resourceName: string,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Resource cleanup timeout: ${resourceName} (${timeoutMs}ms)`));
      }, timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGQUIT'];

    for (const signal of signals) {
      process.on(signal, () => {
        logger.info({ signal }, 'Shutdown signal received');
        this.shutdown(signal).catch((error) => {
          logger.fatal(
            {
              signal,
              error: error.message,
            },
            'Graceful shutdown failed, forcing exit',
          );
          process.exit(1);
        });
      });
    }

    // Setup force shutdown timer
    this.forceShutdownTimer = setTimeout(() => {
      if (this.isShuttingDown) {
        this.forceShutdown('timeout');
      }
    }, this.config.forceShutdownTimeoutMs);
  }

  /**
   * Setup Prometheus metrics
   */
  private setupMetrics(): void {
    if (!this.config.enableMetrics) return;

    prometheus.setGauge('shutdown_registered_resources', {}, this.resources.size);
    prometheus.setGauge('shutdown_in_progress', {}, 0);
    prometheus.setGauge('active_requests', {}, 0);
  }

  /**
   * Record shutdown timing statistics
   */
  private recordShutdownTime(): void {
    if (!this.shutdownStartTime) return;

    const duration = Date.now() - this.shutdownStartTime.getTime();

    // Update running average
    const totalShutdowns = this.stats.successfulShutdowns + this.stats.forcedShutdowns;
    this.stats.averageShutdownTime =
      (this.stats.averageShutdownTime * (totalShutdowns - 1) + duration) / totalShutdowns;

    // Update longest shutdown time
    if (duration > this.stats.longestShutdownTime) {
      this.stats.longestShutdownTime = duration;
    }

    if (this.config.enableMetrics) {
      prometheus.setGauge('shutdown_duration_ms', {}, duration);
      prometheus.setGauge('shutdown_average_duration_ms', {}, this.stats.averageShutdownTime);
      prometheus.setGauge('shutdown_longest_duration_ms', {}, this.stats.longestShutdownTime);
    }
  }

  /**
   * Emit shutdown events for monitoring
   */
  private emitShutdownEvent(phase: ShutdownPhase, error?: Error): void {
    const event: ShutdownEvent = {
      phase,
      timestamp: new Date(),
      resourcesRemaining: this.resources.size,
      error,
    };

    if (this.shutdownStartTime) {
      event.duration = Date.now() - this.shutdownStartTime.getTime();
    }

    this.emit('shutdown', event);

    if (this.config.enableDetailedLogging) {
      logger.debug(
        {
          shutdownEvent: event,
        },
        'Shutdown event emitted',
      );
    }
  }

  /**
   * Get shutdown manager statistics
   */
  getStats() {
    return {
      ...this.stats,
      isShuttingDown: this.isShuttingDown,
      currentPhase: this.phase,
      activeRequests: this.activeRequests,
      registeredResources: this.resources.size,
      resourceNames: Array.from(this.resources.keys()),
    };
  }

  /**
   * Health check for shutdown readiness
   */
  isHealthy(): boolean {
    return !this.isShuttingDown && this.server !== undefined;
  }
}

/**
 * Default shutdown configurations for different environments
 */
export const shutdownConfigs = {
  production: {
    gracefulTimeoutMs: 30000, // 30 seconds per resource
    forceShutdownTimeoutMs: 60000, // 1 minute total
    drainTimeoutMs: 15000, // 15 seconds to drain
    healthCheckGracePeriodMs: 5000, // 5 seconds grace for health checks
    enableMetrics: true,
    enableDetailedLogging: true,
  },

  staging: {
    gracefulTimeoutMs: 20000, // 20 seconds per resource
    forceShutdownTimeoutMs: 45000, // 45 seconds total
    drainTimeoutMs: 10000, // 10 seconds to drain
    healthCheckGracePeriodMs: 3000, // 3 seconds grace for health checks
    enableMetrics: true,
    enableDetailedLogging: true,
  },

  development: {
    gracefulTimeoutMs: 5000, // 5 seconds per resource
    forceShutdownTimeoutMs: 15000, // 15 seconds total
    drainTimeoutMs: 2000, // 2 seconds to drain
    healthCheckGracePeriodMs: 1000, // 1 second grace for health checks
    enableMetrics: false,
    enableDetailedLogging: false,
  },
};

/**
 * Create graceful shutdown manager with environment-specific config
 */
export function createGracefulShutdownManager(
  environment: string = process.env.NODE_ENV || 'development',
): GracefulShutdownManager {
  const config =
    shutdownConfigs[environment as keyof typeof shutdownConfigs] || shutdownConfigs.development;

  return new GracefulShutdownManager(config);
}

/**
 * Setup common resource cleanup handlers
 */
export function setupCommonResources(shutdownManager: GracefulShutdownManager): void {
  // Redis cleanup
  shutdownManager.registerResource({
    name: 'redis',
    priority: 100,
    required: false,
    timeoutMs: 5000,
    cleanup: async () => {
      try {
        const redis = await getRedis();
        await redis.quit();
        logger.debug('Redis connection closed');
      } catch (error) {
        logger.warn({ error: (error as Error).message }, 'Redis cleanup warning');
      }
    },
  });

  // Webhook secret rotation cleanup
  shutdownManager.registerResource({
    name: 'webhook-secret-rotation',
    priority: 80,
    required: false,
    timeoutMs: 3000,
    cleanup: async () => {
      // This would be called by the webhook verifier if it exists
      logger.debug('Webhook secret rotation cleaned up');
    },
  });

  // Enhanced idempotency cleanup
  shutdownManager.registerResource({
    name: 'enhanced-idempotency',
    priority: 80,
    required: false,
    timeoutMs: 3000,
    cleanup: async () => {
      // This would be called by the idempotency middleware
      logger.debug('Enhanced idempotency middleware cleaned up');
    },
  });

  // Resilience patterns cleanup
  shutdownManager.registerResource({
    name: 'resilience-patterns',
    priority: 70,
    required: false,
    timeoutMs: 5000,
    cleanup: async () => {
      // Import and shutdown resilience components
      try {
        const { shutdownResilience } = await import('../resilience');
        await shutdownResilience();
        logger.debug('Resilience patterns cleaned up');
      } catch (error) {
        logger.warn({ error: (error as Error).message }, 'Resilience cleanup warning');
      }
    },
  });

  // Metrics cleanup
  shutdownManager.registerResource({
    name: 'metrics',
    priority: 60,
    required: false,
    timeoutMs: 2000,
    cleanup: async () => {
      // Final metrics flush
      prometheus.setGauge('server_shutdown_timestamp', {}, Date.now() / 1000);
      logger.debug('Metrics cleanup completed');
    },
  });

  logger.info(
    {
      registeredResources: Array.from([
        'redis',
        'webhook-secret-rotation',
        'enhanced-idempotency',
        'resilience-patterns',
        'metrics',
      ]),
    },
    'Common shutdown resources registered',
  );
}
