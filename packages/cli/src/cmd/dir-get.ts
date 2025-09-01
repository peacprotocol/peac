import { Command, Option } from 'clipanion';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { request } from 'undici';
import * as ed25519 from '@noble/ed25519';

interface CacheEntry {
  url: string;
  etag?: string;
  lastModified?: string;
  directory: any;
  cachedAt: string;
}

export class DirGetCommand extends Command {
  static paths = [['dir', 'get']];

  static usage = Command.Usage({
    description: 'Fetch and validate signed agent directory',
    details:
      'Fetch agent directory from Signature-Agent-URL, validate signature, and cache with ETag support',
    examples: [
      [
        'Fetch directory',
        'peac dir get https://agent.example.com/.well-known/http-message-signatures-directory',
      ],
      [
        'Use custom cache',
        'peac dir get https://agent.example.com/.well-known/http-message-signatures-directory --cache ~/.peac/cache',
      ],
    ],
  });

  url = Option.String({ required: true });
  cache = Option.String('--cache', { description: 'Cache directory path' });

  private getCacheDir(): string {
    return this.cache || join(homedir(), '.peac', 'cache');
  }

  private getCacheFile(url: string): string {
    const hash = Buffer.from(url).toString('base64url').replace(/[\/=]/g, '_');
    return join(this.getCacheDir(), `${hash}.json`);
  }

  async execute(): Promise<number> {
    try {
      // Validate URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(this.url);
      } catch {
        this.context.stderr.write(chalk.red('Invalid URL\n'));
        return 3;
      }

      if (parsedUrl.protocol !== 'https:') {
        this.context.stderr.write(chalk.red('URL must use HTTPS\n'));
        return 3;
      }

      if (parsedUrl.port && parsedUrl.port !== '443') {
        this.context.stderr.write(chalk.red('Only port 443 allowed\n'));
        return 3;
      }

      // Ensure cache directory exists
      const cacheDir = this.getCacheDir();
      if (!existsSync(cacheDir)) {
        mkdirSync(cacheDir, { recursive: true });
      }

      const cacheFile = this.getCacheFile(this.url);

      // Check cache
      let cached: CacheEntry | undefined;
      if (existsSync(cacheFile)) {
        try {
          cached = JSON.parse(readFileSync(cacheFile, 'utf-8'));
        } catch {
          // Ignore cache read errors
        }
      }

      // Prepare headers
      const headers: Record<string, string> = {
        'user-agent': 'peac-cli/0.9.11',
        accept: 'application/json',
      };

      if (cached?.etag) {
        headers['if-none-match'] = cached.etag;
      }
      if (cached?.lastModified) {
        headers['if-modified-since'] = cached.lastModified;
      }

      // Fetch directory
      try {
        const response = await request(this.url, {
          method: 'GET',
          headers,
          throwOnError: false,
          maxRedirections: 0, // No redirects for agent directories
          bodyTimeout: 2000,
          headersTimeout: 2000,
        });

        // Handle 304 Not Modified
        if (response.statusCode === 304 && cached) {
          this.context.stdout.write(chalk.blue('Directory not modified (cached)\n'));
          this.displayDirectory(cached.directory);
          return 0;
        }

        if (response.statusCode !== 200) {
          this.context.stderr.write(chalk.red(`HTTP ${response.statusCode}\n`));
          return 3;
        }

        const contentType = (response.headers['content-type'] as string) || '';
        if (!contentType.includes('application/json')) {
          this.context.stderr.write(chalk.red(`Invalid content type: ${contentType}\n`));
          return 3;
        }

        // Read body
        const chunks: Buffer[] = [];
        for await (const chunk of response.body) {
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks);

        if (body.length > 32 * 1024) {
          this.context.stderr.write(chalk.red('Directory too large (>32KB)\n'));
          return 3;
        }

        const directory = JSON.parse(body.toString('utf-8'));

        // Validate directory structure
        if (!directory.keys || !Array.isArray(directory.keys)) {
          this.context.stderr.write(chalk.red('Invalid directory format: missing keys array\n'));
          return 3;
        }

        // Validate each key
        for (const keyEntry of directory.keys) {
          if (!keyEntry.jwk || !keyEntry.thumbprint) {
            this.context.stderr.write(chalk.red('Invalid key entry: missing jwk or thumbprint\n'));
            return 3;
          }

          const jwk = keyEntry.jwk;
          if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.x) {
            this.context.stderr.write(chalk.red('Invalid key: must be Ed25519\n'));
            return 3;
          }
        }

        // Cache the directory
        const etag = response.headers['etag'] as string;
        const lastModified = response.headers['last-modified'] as string;

        const cacheEntry: CacheEntry = {
          url: this.url,
          etag,
          lastModified,
          directory,
          cachedAt: new Date().toISOString(),
        };

        writeFileSync(cacheFile, JSON.stringify(cacheEntry, null, 2));

        this.context.stdout.write(chalk.green('✓ Directory fetched and cached\n'));
        this.displayDirectory(directory);

        return 0;
      } catch (error) {
        // If we have cached data and network fails, use cached
        if (cached) {
          this.context.stdout.write(chalk.yellow('⚠ Network error, using cached directory\n'));
          this.displayDirectory(cached.directory);
          return 0;
        }

        this.context.stderr.write(chalk.red(`Network error: ${error}\n`));
        return 3;
      }
    } catch (error) {
      this.context.stderr.write(chalk.red(`Error: ${error}\n`));
      return 3;
    }
  }

  private displayDirectory(directory: any): void {
    this.context.stdout.write(`\nKeys: ${directory.keys.length}\n`);

    for (const [index, keyEntry] of directory.keys.entries()) {
      this.context.stdout.write(`\n[${index + 1}]\n`);
      this.context.stdout.write(`  Thumbprint: ${keyEntry.thumbprint}\n`);
      this.context.stdout.write(`  Algorithm: ${keyEntry.jwk.alg || 'EdDSA'}\n`);
      this.context.stdout.write(`  Use: ${keyEntry.jwk.use || 'sig'}\n`);
      if (keyEntry.jwk.kid) {
        this.context.stdout.write(`  Kid: ${keyEntry.jwk.kid}\n`);
      }
    }

    if (directory.updated) {
      this.context.stdout.write(`\nUpdated: ${directory.updated}\n`);
    }
  }
}
