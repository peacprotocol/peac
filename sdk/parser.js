/**
 * PEAC Protocol Parser
 * Core parsing functionality with enhanced error recovery
 * @license Apache-2.0
 */

const yaml = require('js-yaml');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');

const MAX_FILE_SIZE = 512 * 1024; // 512KB
const TIMEOUT = 10000; // 10 seconds
const RETRY_COUNT = 3;
const RETRY_DELAY = 1000; // 1 second

class PEACParser {
  constructor(options = {}) {
    this.options = {
      timeout: options.timeout || TIMEOUT,
      cache: options.cache !== false,
      retries: options.retries || RETRY_COUNT,
      strict: options.strict !== false,
      ...options
    };
    
    this.cache = new Map();
    this.pactFiles = ['/pact.txt', '/.well-known/pact'];
    this.errors = [];
    this.warnings = [];
  }

  async parse(domain) {
    // Reset error tracking
    this.errors = [];
    this.warnings = [];
    
    // Validate domain
    if (!this.isValidDomain(domain)) {
      throw new Error(`Invalid domain: ${domain}`);
    }

    // Check cache
    const cacheKey = `pact:${domain}`;
    if (this.options.cache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (cached.expires > Date.now()) {
        return cached.data;
      }
      this.cache.delete(cacheKey);
    }

    // Try to fetch pact.txt with retries
    for (const file of this.pactFiles) {
      for (let attempt = 0; attempt < this.options.retries; attempt++) {
        try {
          const content = await this.fetchFile(domain, file);
          if (content) {
            const pact = await this.parsePactContent(content);
            
            // Validate pact
            await this.validatePact(pact);
            
            // Verify signature if present
            if (pact.signature && !await this.verifySignature(pact)) {
              this.warnings.push('Signature verification failed');
              if (this.options.strict) {
                throw new Error('Invalid signature');
              }
            }
            
            // Calculate confidence score
            pact.confidence = this.calculateConfidence();
            
            // Cache result
            if (this.options.cache) {
              const ttl = (pact.cache_ttl || 3600) * 1000;
              this.cache.set(cacheKey, {
                data: pact,
                expires: Date.now() + ttl
              });
            }
            
            return pact;
          }
        } catch (error) {
          this.errors.push({
            type: 'fetch_error',
            file,
            attempt: attempt + 1,
            error: error.message
          });
          
          if (attempt < this.options.retries - 1) {
            await this.delay(this.options.retryDelay || RETRY_DELAY);
          }
        }
      }
    }

    // Return partial result with errors if not strict
    if (!this.options.strict && this.errors.length > 0) {
      return {
        version: '0.9.2',
        protocol: 'peac',
        pact: this.getDefaultPact(),
        errors: this.errors,
        warnings: this.warnings,
        confidence: 0
      };
    }

    throw new Error(`No valid pact found for ${domain}: ${this.errors.map(e => e.error).join(', ')}`);
  }

  async fetchFile(domain, path) {
    return new Promise((resolve, reject) => {
      const url = `https://${domain}${path}`;
      
      const request = https.get(url, { 
        timeout: this.options.timeout,
        headers: {
          'User-Agent': 'PEAC-Protocol/0.9.2',
          'Accept': 'text/plain, application/yaml, application/json'
        }
      }, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this.warnings.push(`Redirect from ${url} to ${res.headers.location}`);
          // Follow redirect (simplified, production should handle better)
          return resolve(null);
        }
        
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

      request.on('error', (error) => {
        reject(error);
      });
      
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  parsePactContent(content) {
  let result;
  try {
    result = yaml.load(content);
    // Defensive: if result is a string, treat as invalid format
    if (typeof result !== 'object' || result === null) {
      return { error: "Invalid pact format" };
    }
    return result;
  } catch (yamlError) {
    try {
      result = JSON.parse(content);
      if (typeof result !== 'object' || result === null) {
        return { error: "Invalid pact format" };
      }
      return result;
    } catch (jsonError) {
      const partial = this.extractPartialData(content);
      if (partial && !this.options.strict) {
        this.warnings.push('Parsed partial data due to format errors');
        return partial;
      }
      return { error: "Invalid pact format" };
    }
  }
}


  async validatePact(pact) {
    const errors = [];
    
    // Required fields
    if (!pact.version) {
      errors.push('Missing required field: version');
    } else {
      // Version compatibility check
      const [major, minor] = pact.version.split('.').map(Number);
      if (major > 0 || minor > 9) {
        this.warnings.push(`Parser supports up to v0.9.x, found ${pact.version}`);
      }
    }
    
    if (!pact.protocol || pact.protocol !== 'peac') {
      errors.push('Invalid or missing protocol field');
    }

    if (!pact.pact) {
      errors.push('Missing pact section');
    } else {
      // Validate pact structure
      if (!pact.pact.consent && !pact.pact.economics) {
        this.warnings.push('Pact should define consent or economics');
      }
    }

    if (errors.length > 0) {
      if (this.options.strict) {
        throw new Error(`Validation failed: ${errors.join(', ')}`);
      }
      this.errors.push(...errors.map(e => ({ type: 'validation', error: e })));
    }
  }

  async verifySignature(pact) {
    try {
      const publicKey = pact.metadata?.public_key;
      const signature = Buffer.from(pact.signature, 'hex');
      const message = this.canonicalize(pact.pact);
      
      if (!publicKey || !signature) {
        return false;
      }
      
      return crypto.verify(
        null,
        Buffer.from(message),
        publicKey,
        signature
      );
    } catch (error) {
      this.errors.push({
        type: 'signature_verification',
        error: error.message
      });
      return false;
    }
  }

  canonicalize(obj) {
    // Sort keys for consistent hashing
    return JSON.stringify(obj, Object.keys(obj).sort());
  }

  calculateConfidence() {
    const errorWeight = this.errors.length * 0.2;
    const warningWeight = this.warnings.length * 0.1;
    return Math.max(0, 1 - errorWeight - warningWeight);
  }

  getDefaultPact() {
    return {
      consent: {
        default: 'contact'
      },
      economics: {
        pricing: 'contact'
      }
    };
  }

  extractPartialData(content) {
    // Attempt to extract some data even from malformed content
    try {
      const versionMatch = content.match(/version:\s*["']?([0-9.]+)/);
      const protocolMatch = content.match(/protocol:\s*["']?(\w+)/);
      
      if (versionMatch && protocolMatch) {
        return {
          version: versionMatch[1],
          protocol: protocolMatch[1],
          pact: this.getDefaultPact(),
          partial: true
        };
      }
    } catch {
      // Ignore extraction errors
    }
    return null;
  }

  isValidDomain(domain) {
    try {
      const url = new URL(`https://${domain}`);
      return url.hostname === domain && !domain.includes('/');
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

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Batch parsing for multiple domains
  async parseBatch(domains, options = {}) {
    const results = await Promise.allSettled(
      domains.map(domain => this.parse(domain))
    );
    
    return results.map((result, index) => ({
      domain: domains[index],
      status: result.status,
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason.message : null
    }));
  }
}

module.exports = PEACParser;