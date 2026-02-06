/**
 * PEAC Samples Loader
 *
 * Loads sample definitions from specs/conformance/samples/ when available,
 * falling back to embedded defaults when running outside the repo.
 *
 * This ensures a single source of truth (specs folder is canonical).
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Sample category
 */
export type SampleCategory = 'valid' | 'invalid' | 'edge';

/**
 * Sample definition
 */
export interface SampleDefinition {
  id: string;
  name: string;
  description: string;
  category: SampleCategory;
  claims: Record<string, unknown>;
  header?: Record<string, unknown>;
  expectedError?: string;
}

/**
 * Embedded fallback samples (used when specs folder not available)
 */
const EMBEDDED_SAMPLES: SampleDefinition[] = [
  {
    id: 'basic-receipt',
    name: 'Basic Receipt',
    description: 'Minimal valid PEAC receipt with only required fields',
    category: 'valid',
    claims: {
      iss: 'https://sandbox.peacprotocol.org',
      aud: 'https://example.com',
      iat: 0, // Placeholder - will be set at generation time
      exp: 0, // Placeholder - will be set at generation time
      rid: 'sample-basic-001',
    },
  },
  {
    id: 'full-receipt',
    name: 'Full Receipt',
    description: 'PEAC receipt with all optional claims populated',
    category: 'valid',
    claims: {
      iss: 'https://sandbox.peacprotocol.org',
      aud: 'https://api.example.com',
      sub: 'user:demo-user',
      iat: 0,
      exp: 0,
      rid: 'sample-full-001',
      purpose_declared: ['search', 'index'],
      purpose_enforced: 'search',
      purpose_reason: 'allowed',
    },
  },
  {
    id: 'interaction-evidence',
    name: 'Interaction Evidence',
    description: 'Receipt with InteractionEvidence extension for AI agent calls',
    category: 'valid',
    claims: {
      iss: 'https://sandbox.peacprotocol.org',
      aud: 'https://agent.example.com',
      sub: 'agent:demo-agent-v1',
      iat: 0,
      exp: 0,
      rid: 'sample-ie-001',
      ext: {
        'org.peacprotocol/interaction@0.1': {
          version: '0.1',
          interaction_id: 'int_sample_001',
          started_at: '2026-01-01T00:00:00.000Z',
          completed_at: '2026-01-01T00:00:01.000Z',
          outcome: { kind: 'success' },
          input: { hash: 'sha256:abc123...', byte_length: 1024 },
          output: { hash: 'sha256:def456...', byte_length: 2048 },
        },
      },
    },
  },
  {
    id: 'payment-evidence',
    name: 'Payment Evidence',
    description: 'Receipt with payment evidence (402 flow)',
    category: 'valid',
    claims: {
      iss: 'https://sandbox.peacprotocol.org',
      aud: 'https://api.example.com',
      iat: 0,
      exp: 0,
      rid: 'sample-payment-001',
      amt: '100',
      cur: 'USD',
      payment: {
        rail: 'x402',
        reference: 'pay_sample_001',
        amount: '100',
        currency: 'USD',
      },
    },
  },
  {
    id: 'long-expiry',
    name: 'Long Expiry',
    description: 'Receipt with 24-hour expiration',
    category: 'valid',
    claims: {
      iss: 'https://sandbox.peacprotocol.org',
      aud: 'https://example.com',
      iat: 0,
      exp: 0, // Will be set to iat + 86400 at generation time
      rid: 'sample-long-expiry-001',
    },
  },
  {
    id: 'expired',
    name: 'Expired Receipt',
    description: 'Receipt that has already expired (for testing rejection)',
    category: 'invalid',
    claims: {
      iss: 'https://sandbox.peacprotocol.org',
      aud: 'https://example.com',
      iat: 0, // Will be set to now - 7200 at generation time
      exp: 0, // Will be set to now - 3600 at generation time
      rid: 'sample-expired-001',
    },
    expectedError: 'E_EXPIRED_RECEIPT',
  },
  {
    id: 'future-iat',
    name: 'Future IAT',
    description: 'Receipt with iat in the future (should be rejected)',
    category: 'invalid',
    claims: {
      iss: 'https://sandbox.peacprotocol.org',
      aud: 'https://example.com',
      iat: 0, // Will be set to now + 3600 at generation time
      exp: 0, // Will be set to now + 7200 at generation time
      rid: 'sample-future-iat-001',
    },
    expectedError: 'E_FUTURE_IAT',
  },
  {
    id: 'missing-iss',
    name: 'Missing Issuer',
    description: 'Receipt missing required iss claim (for testing validation)',
    category: 'invalid',
    claims: {
      aud: 'https://example.com',
      iat: 0,
      exp: 0,
      rid: 'sample-no-iss-001',
    },
    expectedError: 'E_MISSING_CLAIM',
  },
];

/**
 * Find samples directory
 */
export function findSamplesDir(customPath?: string): string | null {
  // Use custom path if provided
  if (customPath) {
    if (fs.existsSync(customPath)) {
      return customPath;
    }
    return null;
  }

  // Try relative to CLI package
  const cliPath = path.resolve(__dirname, '../../../../specs/conformance/samples');
  if (fs.existsSync(cliPath)) {
    return cliPath;
  }

  // Try relative to repo root
  const repoPath = path.resolve(process.cwd(), 'specs/conformance/samples');
  if (fs.existsSync(repoPath)) {
    return repoPath;
  }

  // Try one level up
  const upPath = path.resolve(process.cwd(), '../../specs/conformance/samples');
  if (fs.existsSync(upPath)) {
    return upPath;
  }

  return null;
}

/**
 * Load sample definition from a JSON file
 */
function loadSampleFromFile(
  filePath: string,
  id: string,
  category: SampleCategory
): SampleDefinition | null {
  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Handle both formats: fixture-style (header/payload) and claims-only
    const claims = content.payload ?? content.claims ?? content;
    const description = content.$comment ?? content.description ?? `Sample ${id}`;

    return {
      id,
      name: id
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
      description,
      category,
      claims,
      header: content.header,
      expectedError: content.expected_error,
    };
  } catch {
    return null;
  }
}

/**
 * Load samples from specs directory
 */
function loadSamplesFromDir(samplesDir: string): SampleDefinition[] {
  const samples: SampleDefinition[] = [];

  // Load from valid/ directory
  const validDir = path.join(samplesDir, 'valid');
  if (fs.existsSync(validDir)) {
    const files = fs.readdirSync(validDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const id = file.replace('.json', '');
      const sample = loadSampleFromFile(path.join(validDir, file), id, 'valid');
      if (sample) samples.push(sample);
    }
  }

  // Load from invalid/ directory
  const invalidDir = path.join(samplesDir, 'invalid');
  if (fs.existsSync(invalidDir)) {
    const files = fs.readdirSync(invalidDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const id = file.replace('.json', '');
      const sample = loadSampleFromFile(path.join(invalidDir, file), id, 'invalid');
      if (sample) samples.push(sample);
    }
  }

  // Load from edge/ directory if present
  const edgeDir = path.join(samplesDir, 'edge');
  if (fs.existsSync(edgeDir)) {
    const files = fs.readdirSync(edgeDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const id = file.replace('.json', '');
      const sample = loadSampleFromFile(path.join(edgeDir, file), id, 'edge');
      if (sample) samples.push(sample);
    }
  }

  return samples;
}

/**
 * Get sample definitions
 *
 * Loads from specs/conformance/samples/ when available (canonical source),
 * falls back to embedded samples when running outside the repo.
 */
export function getSamples(customSamplesPath?: string): SampleDefinition[] {
  const samplesDir = findSamplesDir(customSamplesPath);

  if (samplesDir) {
    const dirSamples = loadSamplesFromDir(samplesDir);
    if (dirSamples.length > 0) {
      return dirSamples;
    }
  }

  // Fall back to embedded samples
  return EMBEDDED_SAMPLES;
}

/**
 * Get a specific sample by ID
 */
export function getSampleById(id: string, customSamplesPath?: string): SampleDefinition | null {
  const samples = getSamples(customSamplesPath);
  return samples.find((s) => s.id === id) ?? null;
}

/**
 * List available sample IDs by category
 */
export function listSampleIds(category?: SampleCategory, customSamplesPath?: string): string[] {
  const samples = getSamples(customSamplesPath);
  const filtered = category ? samples.filter((s) => s.category === category) : samples;
  return filtered.map((s) => s.id);
}
