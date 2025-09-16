/**
 * Adapter auto-discovery with fallback order
 */

import { join } from 'path';
import { existsSync } from 'fs';

export interface AdapterConfig {
  name: string;
  path: string;
  type: 'local' | 'npx' | 'global';
  priority: number;
}

export interface DiscoveryOptions {
  timeout?: number;
  retries?: number;
  fallbackOrder?: string[];
}

const DEFAULT_BRIDGE_PATHS = [
  // Local development (monorepo)
  'apps/bridge/dist/server.js',
  // Local build
  'dist/server.js',
  // Global installation
  'node_modules/@peac/app-bridge/dist/server.js',
  // Try using npx
  '@peac/app-bridge',
];

const DEFAULT_ADAPTER_PATHS = [
  // Local development patterns
  'packages/adapters/*/dist/index.js',
  'adapters/*/dist/index.js',
  // Global installations
  'node_modules/@peac/adapter-*/dist/index.js',
];

export class AdapterDiscovery {
  private timeout: number;
  private retries: number;
  private fallbackOrder: string[];

  constructor(options: DiscoveryOptions = {}) {
    this.timeout = options.timeout || 2000;
    this.retries = options.retries || 3;
    this.fallbackOrder = options.fallbackOrder || [
      '@peac/adapter-openai',
      '@peac/adapter-langchain',
      '@peac/adapter-mcp',
    ];
  }

  /**
   * Discover bridge executable with retry logic
   */
  async discoverBridge(): Promise<AdapterConfig | null> {
    const attempts: AdapterConfig[] = [];

    // Check local development paths first
    for (const path of DEFAULT_BRIDGE_PATHS) {
      if (path.endsWith('.js')) {
        const fullPath = join(process.cwd(), path);
        if (existsSync(fullPath)) {
          attempts.push({
            name: 'bridge-local',
            path: fullPath,
            type: 'local',
            priority: 1,
          });
          break;
        }
      }
    }

    // Add npx option as fallback
    attempts.push({
      name: 'bridge-npx',
      path: '@peac/app-bridge',
      type: 'npx',
      priority: 2,
    });

    // Try each adapter with retry logic
    for (const adapter of attempts) {
      if (await this.testAdapter(adapter)) {
        return adapter;
      }
    }

    return null;
  }

  /**
   * Discover available adapters
   */
  async discoverAdapters(): Promise<AdapterConfig[]> {
    const found: AdapterConfig[] = [];
    let priority = 1;

    // Check fallback order first (higher priority)
    for (const adapterName of this.fallbackOrder) {
      const config: AdapterConfig = {
        name: adapterName,
        path: adapterName,
        type: 'npx',
        priority: priority++,
      };

      if (await this.testAdapter(config)) {
        found.push(config);
      }
    }

    // TODO: Add local adapter discovery from filesystem
    // This would scan DEFAULT_ADAPTER_PATHS for built adapters

    return found.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Test if an adapter is available and working
   */
  private async testAdapter(config: AdapterConfig): Promise<boolean> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => resolve(false), this.timeout);

      try {
        if (config.type === 'local') {
          // For local files, just check if they exist and are readable
          try {
            require('fs').accessSync(config.path, require('fs').constants.R_OK);
            clearTimeout(timeoutId);
            resolve(true);
            return;
          } catch {
            clearTimeout(timeoutId);
            resolve(false);
            return;
          }
        }

        if (config.type === 'npx') {
          // For npx packages, try to resolve them
          const { spawn } = require('child_process');
          const proc = spawn('npm', ['list', config.path, '--depth=0'], {
            stdio: 'pipe',
            timeout: this.timeout,
          });

          proc.on('exit', (code: number | null) => {
            clearTimeout(timeoutId);
            // npm list returns 0 if package is found, 1 if not found
            resolve(code === 0);
          });

          proc.on('error', () => {
            clearTimeout(timeoutId);
            resolve(false);
          });

          return;
        }

        // Default to false for unknown types
        clearTimeout(timeoutId);
        resolve(false);
      } catch (error) {
        clearTimeout(timeoutId);
        resolve(false);
      }
    });
  }

  /**
   * Create circuit breaker for adapter with exponential backoff
   */
  createCircuitBreaker<T>(
    fn: () => Promise<T>,
    options: {
      maxRetries?: number;
      baseDelay?: number;
      maxDelay?: number;
    } = {}
  ): () => Promise<T> {
    const maxRetries = options.maxRetries || this.retries;
    const baseDelay = options.baseDelay || 100;
    const maxDelay = options.maxDelay || 2000;

    return async (): Promise<T> => {
      let lastError: Error;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          if (attempt === maxRetries) {
            throw lastError;
          }

          // Exponential backoff with jitter
          const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 100, maxDelay);

          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      throw lastError!;
    };
  }
}

/**
 * Global discovery instance
 */
export const discovery = new AdapterDiscovery();

/**
 * Quick bridge discovery function
 */
export async function findBridge(): Promise<string | null> {
  const bridge = await discovery.discoverBridge();
  return bridge?.path || null;
}

/**
 * Quick adapter discovery function
 */
export async function findAdapters(): Promise<string[]> {
  const adapters = await discovery.discoverAdapters();
  return adapters.map((a) => a.path);
}
