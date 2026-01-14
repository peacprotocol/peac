/**
 * Tests for PEAC discovery parsing
 */

import { describe, it, expect } from 'vitest';
import {
  parseIssuerConfig,
  parsePolicyManifest,
  parseDiscovery,
} from '../src/discovery';

describe('Issuer Configuration (peac-issuer.json)', () => {
  it('should parse a valid issuer config', () => {
    const config = parseIssuerConfig({
      version: 'peac-issuer/0.1',
      issuer: 'https://api.example.com',
      jwks_uri: 'https://api.example.com/.well-known/jwks.json',
      verify_endpoint: 'https://api.example.com/verify',
      receipt_versions: ['peac.receipt/0.9'],
      algorithms: ['EdDSA'],
      payment_rails: ['x402', 'stripe'],
      security_contact: 'security@example.com',
    });

    expect(config.version).toBe('peac-issuer/0.1');
    expect(config.issuer).toBe('https://api.example.com');
    expect(config.jwks_uri).toBe('https://api.example.com/.well-known/jwks.json');
    expect(config.verify_endpoint).toBe('https://api.example.com/verify');
    expect(config.receipt_versions).toEqual(['peac.receipt/0.9']);
    expect(config.algorithms).toEqual(['EdDSA']);
    expect(config.payment_rails).toEqual(['x402', 'stripe']);
    expect(config.security_contact).toBe('security@example.com');
  });

  it('should parse a minimal issuer config', () => {
    const config = parseIssuerConfig({
      version: 'peac-issuer/0.1',
      issuer: 'https://api.example.com',
      jwks_uri: 'https://api.example.com/.well-known/jwks.json',
    });

    expect(config.version).toBe('peac-issuer/0.1');
    expect(config.issuer).toBe('https://api.example.com');
    expect(config.jwks_uri).toBe('https://api.example.com/.well-known/jwks.json');
    expect(config.verify_endpoint).toBeUndefined();
  });

  it('should parse from JSON string', () => {
    const json = JSON.stringify({
      version: 'peac-issuer/0.1',
      issuer: 'https://api.example.com',
      jwks_uri: 'https://api.example.com/.well-known/jwks.json',
    });

    const config = parseIssuerConfig(json);
    expect(config.issuer).toBe('https://api.example.com');
  });

  it('should reject missing version', () => {
    expect(() =>
      parseIssuerConfig({
        issuer: 'https://api.example.com',
        jwks_uri: 'https://api.example.com/.well-known/jwks.json',
      })
    ).toThrow('Missing required field: version');
  });

  it('should reject missing issuer', () => {
    expect(() =>
      parseIssuerConfig({
        version: 'peac-issuer/0.1',
        jwks_uri: 'https://api.example.com/.well-known/jwks.json',
      })
    ).toThrow('Missing required field: issuer');
  });

  it('should reject missing jwks_uri', () => {
    expect(() =>
      parseIssuerConfig({
        version: 'peac-issuer/0.1',
        issuer: 'https://api.example.com',
      })
    ).toThrow('Missing required field: jwks_uri');
  });

  it('should reject non-HTTPS issuer', () => {
    expect(() =>
      parseIssuerConfig({
        version: 'peac-issuer/0.1',
        issuer: 'http://api.example.com',
        jwks_uri: 'https://api.example.com/.well-known/jwks.json',
      })
    ).toThrow('issuer must be an HTTPS URL');
  });

  it('should reject non-HTTPS jwks_uri', () => {
    expect(() =>
      parseIssuerConfig({
        version: 'peac-issuer/0.1',
        issuer: 'https://api.example.com',
        jwks_uri: 'http://api.example.com/.well-known/jwks.json',
      })
    ).toThrow('jwks_uri must be an HTTPS URL');
  });

  it('should reject invalid JSON', () => {
    expect(() => parseIssuerConfig('not json')).toThrow('not valid JSON');
  });

  it('should reject oversized config', () => {
    const largeJson = JSON.stringify({
      version: 'peac-issuer/0.1',
      issuer: 'https://api.example.com',
      jwks_uri: 'https://api.example.com/.well-known/jwks.json',
      extra: 'x'.repeat(70000),
    });

    expect(() => parseIssuerConfig(largeJson)).toThrow('exceeds');
  });
});

describe('Policy Manifest (peac.txt)', () => {
  it('should parse a valid YAML policy manifest', () => {
    const manifest = parsePolicyManifest(`
version: "peac-policy/0.1"
usage: open
purposes: [crawl, index, search]
receipts: optional
attribution: optional
rate_limit: unlimited
license: Apache-2.0
contact: docs@example.com
    `.trim());

    expect(manifest.version).toBe('peac-policy/0.1');
    expect(manifest.usage).toBe('open');
    expect(manifest.purposes).toEqual(['crawl', 'index', 'search']);
    expect(manifest.receipts).toBe('optional');
    expect(manifest.attribution).toBe('optional');
    expect(manifest.rate_limit).toBe('unlimited');
    expect(manifest.license).toBe('Apache-2.0');
    expect(manifest.contact).toBe('docs@example.com');
  });

  it('should parse a conditional policy manifest', () => {
    const manifest = parsePolicyManifest(`
version: "peac-policy/0.1"
usage: conditional
purposes: [inference, ai_input]
receipts: required
rate_limit: 100/hour
price: 10
currency: USD
    `.trim());

    expect(manifest.usage).toBe('conditional');
    expect(manifest.receipts).toBe('required');
    expect(manifest.price).toBe(10);
    expect(manifest.currency).toBe('USD');
  });

  it('should parse JSON policy manifest', () => {
    const manifest = parsePolicyManifest(
      JSON.stringify({
        version: 'peac-policy/0.1',
        usage: 'open',
        purposes: ['crawl', 'index'],
      })
    );

    expect(manifest.version).toBe('peac-policy/0.1');
    expect(manifest.usage).toBe('open');
    expect(manifest.purposes).toEqual(['crawl', 'index']);
  });

  it('should detect JSON from Content-Type', () => {
    const manifest = parsePolicyManifest(
      '{"version": "peac-policy/0.1", "usage": "open"}',
      'application/json; charset=utf-8'
    );

    expect(manifest.version).toBe('peac-policy/0.1');
  });

  it('should skip comments', () => {
    const manifest = parsePolicyManifest(`
# This is a comment
version: "peac-policy/0.1"
# Another comment
usage: open
    `.trim());

    expect(manifest.version).toBe('peac-policy/0.1');
    expect(manifest.usage).toBe('open');
  });

  it('should reject missing version', () => {
    expect(() => parsePolicyManifest('usage: open')).toThrow(
      'Missing required field: version'
    );
  });

  it('should reject missing usage', () => {
    expect(() => parsePolicyManifest('version: "peac-policy/0.1"')).toThrow(
      'Missing or invalid field: usage'
    );
  });

  it('should reject invalid usage value', () => {
    expect(() =>
      parsePolicyManifest(`
version: "peac-policy/0.1"
usage: invalid
      `.trim())
    ).toThrow('Missing or invalid field: usage');
  });

  it('should reject bare version number (missing peac-policy/ prefix)', () => {
    expect(() =>
      parsePolicyManifest(`
version: "0.1"
usage: open
      `.trim())
    ).toThrow('Invalid version format');
  });

  it('should reject legacy version format', () => {
    expect(() =>
      parsePolicyManifest(`
version: "0.9"
usage: open
      `.trim())
    ).toThrow('Invalid version format');
  });

  it('should reject wrong namespace prefix (dot instead of hyphen)', () => {
    expect(() =>
      parsePolicyManifest(`
version: "peac.policy/0.1"
usage: open
      `.trim())
    ).toThrow('Invalid version format');
  });

  it('should reject YAML anchors', () => {
    expect(() =>
      parsePolicyManifest(`
version: "peac-policy/0.1"
usage: open
anchor: &ref value
      `.trim())
    ).toThrow('YAML anchors and aliases are not allowed');
  });

  it('should reject YAML aliases', () => {
    expect(() =>
      parsePolicyManifest(`
version: "peac-policy/0.1"
usage: open
alias: *ref
      `.trim())
    ).toThrow('YAML anchors and aliases are not allowed');
  });

  it('should reject YAML merge keys', () => {
    expect(() =>
      parsePolicyManifest(`
version: "peac-policy/0.1"
usage: open
<<: *ref
      `.trim())
    ).toThrow('YAML merge keys are not allowed');
  });

  it('should reject YAML custom tags', () => {
    expect(() =>
      parsePolicyManifest(`
version: "peac-policy/0.1"
usage: open
custom: !tag value
      `.trim())
    ).toThrow('YAML custom tags are not allowed');
  });

  it('should reject multi-document YAML', () => {
    expect(() =>
      parsePolicyManifest(`
---
version: "peac-policy/0.1"
usage: open
---
version: "peac-policy/0.1"
usage: conditional
      `.trim())
    ).toThrow('Multi-document YAML is not allowed');
  });

  it('should allow single document separator', () => {
    const manifest = parsePolicyManifest(`
---
version: "peac-policy/0.1"
usage: open
    `.trim());

    expect(manifest.version).toBe('peac-policy/0.1');
  });

  it('should parse quoted strings', () => {
    const manifest = parsePolicyManifest(`
version: "peac-policy/0.1"
usage: 'open'
contact: "support@example.com"
    `.trim());

    expect(manifest.version).toBe('peac-policy/0.1');
    expect(manifest.usage).toBe('open');
    expect(manifest.contact).toBe('support@example.com');
  });

  it('should parse numbers', () => {
    const manifest = parsePolicyManifest(`
version: "peac-policy/0.1"
usage: conditional
price: 100
daily_limit: 5000
    `.trim());

    expect(manifest.price).toBe(100);
    expect(manifest.daily_limit).toBe(5000);
  });
});

describe('Legacy Discovery API (deprecated)', () => {
  it('should parse a valid discovery manifest', () => {
    const manifest = `
version: peac/0.9
issuer: https://api.example.com
verify: https://api.example.com/verify
jwks: https://keys.peacprotocol.org/jwks.json
    `.trim();

    const discovery = parseDiscovery(manifest);

    expect(discovery.version).toBe('peac/0.9');
    expect(discovery.issuer).toBe('https://api.example.com');
    expect(discovery.verify_endpoint).toBe('https://api.example.com/verify');
    expect(discovery.jwks_uri).toBe('https://keys.peacprotocol.org/jwks.json');
  });

  it('should skip comments and empty lines', () => {
    const manifest = `
# This is a comment
version: peac/0.9

# Issuer information
issuer: https://api.example.com

verify: https://api.example.com/verify
jwks: https://keys.peacprotocol.org/jwks.json
    `.trim();

    const discovery = parseDiscovery(manifest);

    expect(discovery.version).toBe('peac/0.9');
    expect(discovery.issuer).toBe('https://api.example.com');
  });

  it('should reject manifest exceeding 20 lines', () => {
    const lines = Array.from({ length: 25 }, (_, i) => `line${i}: value${i}`);
    const manifest = lines.join('\n');

    expect(() => parseDiscovery(manifest)).toThrow(
      'Discovery manifest exceeds 20 lines (got 25)'
    );
  });

  it('should reject manifest exceeding 2000 bytes', () => {
    const manifest = 'a'.repeat(2001);

    expect(() => parseDiscovery(manifest)).toThrow(
      'Discovery manifest exceeds 2000 bytes'
    );
  });

  it('should reject manifest missing version', () => {
    const manifest = `
issuer: https://api.example.com
verify: https://api.example.com/verify
jwks: https://keys.peacprotocol.org/jwks.json
    `.trim();

    expect(() => parseDiscovery(manifest)).toThrow(
      'Missing required field: version'
    );
  });

  it('should reject manifest missing issuer', () => {
    const manifest = `
version: peac/0.9
verify: https://api.example.com/verify
jwks: https://keys.peacprotocol.org/jwks.json
    `.trim();

    expect(() => parseDiscovery(manifest)).toThrow(
      'Missing required field: issuer'
    );
  });

  it('should reject manifest missing verify', () => {
    const manifest = `
version: peac/0.9
issuer: https://api.example.com
jwks: https://keys.peacprotocol.org/jwks.json
    `.trim();

    expect(() => parseDiscovery(manifest)).toThrow(
      'Missing required field: verify'
    );
  });

  it('should reject manifest missing jwks', () => {
    const manifest = `
version: peac/0.9
issuer: https://api.example.com
verify: https://api.example.com/verify
    `.trim();

    expect(() => parseDiscovery(manifest)).toThrow(
      'Missing required field: jwks'
    );
  });
});
