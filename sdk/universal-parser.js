/**
 * PEAC Universal Parser v0.9.2
 * Parses and normalizes multiple policy formats
 * @license Apache-2.0
 */

const yaml = require('js-yaml');
const NodeCache = require('node-cache');
const PEACParser = require('./parser');

class UniversalParser extends PEACParser {
  constructor(options = {}) {
    super(options);
    
    // Use node-cache for better performance
    this.cache = new NodeCache({ 
      stdTTL: 3600, 
      checkperiod: 600,
      useClones: false 
    });
    
    this.parsers = {
      '/pact.txt': this.parsePact.bind(this),
      '/.well-known/pact': this.parsePact.bind(this),
      '/robots.txt': this.parseRobots.bind(this),
      '/llms.txt': this.parseLLMs.bind(this),
      '/ai.txt': this.parseAI.bind(this),
      '/usage.txt': this.parseUsage.bind(this)
    };
  }

  async parseAll(domain) {
    const cacheKey = `universal:${domain}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // Try pact.txt first (authoritative)
    try {
      const pact = await super.parse(domain);
      if (pact && !pact.partial) {
        this.cache.set(cacheKey, pact);
        return pact;
      }
    } catch (e) {
      // Continue to legacy formats
    }

    // Parallel fetch all formats
    const results = await this.fetchAllFormats(domain);
    
    // If we found a pact file, use it
    const pactResult = results.find(r => r && (r.file === '/pact.txt' || r.file === '/.well-known/pact'));
    if (pactResult) {
      const pact = await this.parsePact(pactResult.content);
      this.cache.set(cacheKey, pact);
      return pact;
    }

    // Otherwise merge legacy formats
    const merged = await this.mergeLegacyFormats(results);
    if (Object.keys(merged.pact).length > 0) {
      this.cache.set(cacheKey, merged);
      return merged;
    }

    throw new Error(`No valid policy found for ${domain}`);
  }

  async fetchAllFormats(domain) {
    const fetches = Object.keys(this.parsers).map(async (file) => {
      try {
        const content = await this.fetchFile(domain, file);
        return content ? { file, content } : null;
      } catch {
        return null;
      }
    });
    
    const results = await Promise.allSettled(fetches);
    return results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);
  }

  async mergeLegacyFormats(results) {
    const merged = {
      version: '0.9.2',
      protocol: 'peac',
      metadata: {
        sources: [],
        generated_at: new Date().toISOString(),
        generator: 'universal-parser'
      },
      pact: {
        consent: {},
        economics: {},
        attribution: {},
        compliance: {}
      }
    };

    for (const result of results) {
      if (!result) continue;
      
      try {
        const parser = this.parsers[result.file];
        const parsed = await parser(result.content);
        
        if (parsed) {
          merged.metadata.sources.push({
            file: result.file,
            parsed_at: new Date().toISOString()
          });
          this.deepMerge(merged.pact, parsed);
        }
      } catch (e) {
        this.warnings.push(`Failed to parse ${result.file}: ${e.message}`);
      }
    }

    // Set confidence based on sources
    merged.confidence = Math.min(1, merged.metadata.sources.length * 0.3);
    
    return merged;
  }

  parsePact(content) {
    return super.parsePactContent(content);
  }

  parseRobots(content) {
    const rules = {
      consent: {
        web_scraping: 'allowed'
      }
    };

    const lines = content.split('\n');
    let currentAgent = '*';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // User-agent
      if (trimmed.toLowerCase().startsWith('user-agent:')) {
        currentAgent = trimmed.substring(11).trim();
        continue;
      }
      
      // Disallow
      if (trimmed.toLowerCase().startsWith('disallow:')) {
        const path = trimmed.substring(9).trim();
        if (path === '/' && currentAgent === '*') {
          rules.consent.web_scraping = 'denied';
        }
      }
      
      // PEAC extensions
      if (trimmed.startsWith('X-PEAC-')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim();
        
        switch (key) {
          case 'X-PEAC-Price':
            rules.economics = { pricing: value };
            break;
          case 'X-PEAC-Attribution':
            rules.attribution = { required: value.toLowerCase() === 'required' };
            break;
          case 'X-PEAC-Consent':
            rules.consent.ai_training = value.toLowerCase();
            break;
        }
      }
    }

    return rules;
  }

  parseLLMs(content) {
    const rules = {
      consent: {
        ai_training: 'conditional'
      }
    };

    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      
      if (trimmed.includes('crawl: no') || trimmed.includes('scrape: no')) {
        rules.consent.ai_training = 'denied';
      } else if (trimmed.includes('crawl: yes') || trimmed.includes('scrape: yes')) {
        rules.consent.ai_training = 'allowed';
      }
      
      if (trimmed.includes('attribution:')) {
        rules.attribution = { required: true };
      }
      
      if (trimmed.includes('price:') || trimmed.includes('payment:')) {
        const priceMatch = line.match(/\$?[\d.]+/);
        if (priceMatch) {
          rules.economics = { pricing: priceMatch[0] };
        }
      }
    }

    return rules;
  }

  parseAI(content) {
    // Similar to llms.txt but with different keywords
    const rules = {
      consent: {
        ai_training: 'conditional'
      }
    };

    if (content.toLowerCase().includes('disallow')) {
      rules.consent.ai_training = 'denied';
    } else if (content.toLowerCase().includes('allow')) {
      rules.consent.ai_training = 'allowed';
    }

    return rules;
  }

  parseUsage(content) {
    // For sites that adopted usage.txt before PEAC
    try {
      const parsed = yaml.load(content);
      return this.normalizeUsageFormat(parsed);
    } catch {
      return {};
    }
  }

  normalizeUsageFormat(usage) {
    // Convert usage.txt format to PEAC format
    const normalized = {
      consent: {},
      economics: {}
    };

    if (usage.ai_agents) {
      normalized.consent.ai_training = usage.ai_agents.allowed || 'conditional';
      if (usage.ai_agents.price) {
        normalized.economics.pricing = usage.ai_agents.price;
      }
    }

    return normalized;
  }

  deepMerge(target, source) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        target[key] = target[key] || {};
        this.deepMerge(target[key], source[key]);
      } else if (source[key] !== undefined) {
        // Prefer non-default values
        if (!target[key] || target[key] === 'contact' || target[key] === 'conditional') {
          target[key] = source[key];
        }
      }
    }
  }
}

module.exports = UniversalParser;