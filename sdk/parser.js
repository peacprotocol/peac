/**
 * PEAC Protocol Parser
 * Parses pact.txt files with resilience and validation
 */

const yaml = require('js-yaml');
const https = require('https');
const { URL } = require('url');

const MAX_FILE_SIZE = 512 * 1024; // 512KB
const TIMEOUT = 10000; // 10 seconds

class PEACParser {
  constructor(options = {}) {
    this.options = {
      timeout: options.timeout || TIMEOUT,
      cache: options.cache !== false,
      ...options
    };
    
    this.cache = new Map();
    this.pactFiles = ['/pact.txt', '/.well-known/pact'];
  }

  async parse(domain) {
    // Validate domain
    if (!this.isValidDomain(domain)) {
      throw new Error('Invalid domain');
    }

    // Check cache
    const cacheKey = `pact:${domain}`;
    if (this.options.cache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (cached.expires > Date.now()) {
        return cached.data;
      }
    }

    // Try to fetch pact.txt
    for (const file of this.pactFiles) {
      try {
        const content = await this.fetchFile(domain, file);
        if (content) {
          const pact = this.parsePactContent(content);
          this.validatePact(pact);
          
          // Cache result
          if (this.options.cache) {
            this.cache.set(cacheKey, {
              data: pact,
              expires: Date.now() + (pact.cache_ttl || 3600) * 1000
            });
          }
          
          return pact;
        }
      } catch (error) {
        // Continue to next file
        continue;
      }
    }

    throw new Error(`No valid pact found for ${domain}`);
  }

  async fetchFile(domain, path) {
    return new Promise((resolve, reject) => {
      const url = `https://${domain}${path}`;
      
      const request = https.get(url, { timeout: this.options.timeout }, (res) => {
        if (res.statusCode !== 200) {
          return resolve(null);
        }

        let data = '';
        let size = 0;

        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_FILE_SIZE) {
            res.destroy();
            return reject(new Error('File too large'));
          }
          data += chunk;
        });

        res.on('end', () => {
          if (!this.isValidUtf8(data)) {
            return reject(new Error('Invalid UTF-8'));
          }
          resolve(data);
        });
      });

      request.on('error', () => resolve(null));
      request.on('timeout', () => {
        request.destroy();
        resolve(null);
      });
    });
  }

  parsePactContent(content) {
    try {
      // Try YAML first
      return yaml.load(content);
    } catch (yamlError) {
      try {
        // Fallback to JSON
        return JSON.parse(content);
      } catch (jsonError) {
        throw new Error('Invalid pact format (must be YAML or JSON)');
      }
    }
  }

  validatePact(pact) {
    // Required fields
    if (!pact.version) {
      throw new Error('Missing required field: version');
    }
    
    if (!pact.protocol || pact.protocol !== 'peac') {
      throw new Error('Invalid protocol');
    }

    if (!pact.pact) {
      throw new Error('Missing pact section');
    }

    // Validate version compatibility
    const majorVersion = parseInt(pact.version.split('.')[0]);
    if (majorVersion > 0) {
      console.warn('This parser supports v0.x pacts. Future compatibility not guaranteed.');
    }
  }

  isValidDomain(domain) {
    try {
      new URL(`https://${domain}`);
      return !domain.includes('/') && !domain.includes('@');
    } catch {
      return false;
    }
  }

  isValidUtf8(str) {
    try {
      return str === Buffer.from(str, 'utf8').toString('utf8');
    } catch {
      return false;
    }
  }
}

module.exports = PEACParser;