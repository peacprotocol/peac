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
 * Valid sample: a current PEAC signed interaction record, expressed as the
 * inputs passed to issue(). Generation supplies privateKey and kid. Generated
 * output passes local verification (verifyLocal).
 */
export interface ValidSampleDefinition {
  id: string;
  name: string;
  description: string;
  category: 'valid';
  format: 'issue-options';
  /** Inputs for issue() (without privateKey/kid, which generation supplies). */
  input: Record<string, unknown>;
}

/**
 * Invalid / edge sample: a rejection fixture expressed as raw legacy claims
 * that are signed directly (not issued), so it can carry intentionally invalid
 * shapes that issue() would refuse to produce.
 */
export interface LegacySampleDefinition {
  id: string;
  name: string;
  description: string;
  category: 'invalid' | 'edge';
  format: 'legacy-claims';
  claims: Record<string, unknown>;
  header?: Record<string, unknown>;
  expectedError?: string;
}

/**
 * Sample definition (discriminated by category/format).
 */
export type SampleDefinition = ValidSampleDefinition | LegacySampleDefinition;

/**
 * Embedded fallback samples (used when specs folder not available)
 */
const EMBEDDED_SAMPLES: SampleDefinition[] = [
  {
    id: 'basic-record',
    name: 'Basic Record',
    description: 'Minimal valid PEAC signed interaction record',
    category: 'valid',
    format: 'issue-options',
    input: {
      iss: 'https://sandbox.peacprotocol.org',
      kind: 'evidence',
      type: 'org.peacprotocol/access',
    },
  },
  {
    id: 'full-record',
    name: 'Full Record',
    description: 'Valid PEAC signed interaction record with optional fields',
    category: 'valid',
    format: 'issue-options',
    input: {
      iss: 'https://sandbox.peacprotocol.org',
      kind: 'evidence',
      type: 'org.peacprotocol/access',
      sub: 'agent:demo-agent',
      purpose_declared: 'search',
    },
  },
  {
    id: 'mcp-tool-run',
    name: 'Mcp Tool Run',
    description: 'Valid PEAC signed interaction record for an MCP tool run',
    category: 'valid',
    format: 'issue-options',
    input: {
      iss: 'https://sandbox.peacprotocol.org',
      kind: 'evidence',
      type: 'org.peacprotocol/mcp',
      extensions: {
        'org.peacprotocol/mcp': {
          server: 'demo',
          tool: 'search',
        },
      },
    },
  },
  {
    id: 'payment-event',
    name: 'Payment Event',
    description: 'Valid PEAC signed interaction record for a payment event',
    category: 'valid',
    format: 'issue-options',
    input: {
      iss: 'https://sandbox.peacprotocol.org',
      kind: 'evidence',
      type: 'org.peacprotocol/payment',
      extensions: {
        'org.peacprotocol/commerce': {
          payment_rail: 'stripe',
          amount_minor: '1000',
          currency: 'USD',
        },
      },
    },
  },
  {
    id: 'event-time-record',
    name: 'Event Time Record',
    description:
      'Valid PEAC signed interaction record with an event time. occurred_at is the interaction time; iat remains issuance time. Generation maps --now to occurred_at.',
    category: 'valid',
    format: 'issue-options',
    input: {
      iss: 'https://sandbox.peacprotocol.org',
      kind: 'evidence',
      type: 'org.peacprotocol/access',
      occurred_at: '2026-01-01T00:00:00.000Z',
    },
  },
  {
    id: 'expired',
    name: 'Expired Receipt',
    description: 'Receipt that has already expired (for testing rejection)',
    category: 'invalid',
    format: 'legacy-claims',
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
    format: 'legacy-claims',
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
    format: 'legacy-claims',
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
    const description = content.$comment ?? content.description ?? `Sample ${id}`;
    const name = id
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    if (category === 'valid') {
      // Valid samples are issue() input recipes -> current PEAC signed
      // interaction records that pass local verification. Require the
      // explicit shape rather than silently degrading to an empty input
      // (which would fail later with an opaque issue error).
      if (
        content.format !== 'issue-options' ||
        content.input === null ||
        typeof content.input !== 'object' ||
        Array.isArray(content.input)
      ) {
        process.stderr.write(
          `samples-loader: skipping malformed valid sample '${id}' (expected format "issue-options" with an input object)\n`
        );
        return null;
      }
      return {
        id,
        name,
        description,
        category: 'valid',
        format: 'issue-options',
        input: content.input,
      };
    }

    // Invalid / edge samples are raw legacy claims (rejection fixtures). They
    // carry no format, or an explicit "legacy-claims"; anything else is
    // surfaced and skipped rather than silently treated as claims.
    if (content.format !== undefined && content.format !== 'legacy-claims') {
      process.stderr.write(
        `samples-loader: skipping '${id}' (unexpected format "${content.format}" for ${category} sample)\n`
      );
      return null;
    }
    const claims = content.payload ?? content.claims ?? content;
    if (claims === null || typeof claims !== 'object' || Array.isArray(claims)) {
      process.stderr.write(
        `samples-loader: skipping malformed ${category} sample '${id}' (claims must be an object)\n`
      );
      return null;
    }
    return {
      id,
      name,
      description,
      category,
      format: 'legacy-claims',
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
 * Get sample definitions.
 *
 * An explicit `customSamplesPath` is an authoritative source: it must exist,
 * and its contents are returned as-is (even if empty after skipping malformed
 * samples). It never falls back to embedded samples, so a malformed custom
 * catalog is not masked. With no custom path, the repo/package samples
 * directory is used when present; the embedded samples are a fallback only for
 * runtime environments where that directory is unavailable.
 */
export function getSamples(customSamplesPath?: string): SampleDefinition[] {
  if (customSamplesPath !== undefined) {
    if (!fs.existsSync(customSamplesPath)) {
      throw new Error(`Samples directory not found: ${customSamplesPath}`);
    }
    return loadSamplesFromDir(customSamplesPath);
  }

  const samplesDir = findSamplesDir();
  if (samplesDir) {
    return loadSamplesFromDir(samplesDir);
  }

  // Fall back to embedded samples only when no samples directory exists.
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
