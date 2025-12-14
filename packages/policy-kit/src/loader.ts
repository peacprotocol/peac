/**
 * PEAC Policy Kit Loader
 *
 * Loads and validates policy documents from YAML or JSON.
 * No network calls - file system only.
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { ZodError } from 'zod';
import { PolicyDocument, PolicyDocumentSchema, POLICY_VERSION } from './types';

/**
 * Policy load error
 */
export class PolicyLoadError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error | ZodError
  ) {
    super(message);
    this.name = 'PolicyLoadError';
  }
}

/**
 * Policy validation error with details
 */
export class PolicyValidationError extends PolicyLoadError {
  constructor(
    message: string,
    public readonly issues: ZodError['issues']
  ) {
    super(message);
    this.name = 'PolicyValidationError';
  }
}

/**
 * Parse policy from string content
 *
 * @param content - YAML or JSON string
 * @param format - Optional format hint ('yaml' | 'json'), auto-detected if not provided
 * @returns Validated policy document
 * @throws PolicyLoadError on parse failure
 * @throws PolicyValidationError on schema validation failure
 */
export function parsePolicy(content: string, format?: 'yaml' | 'json'): PolicyDocument {
  let parsed: unknown;

  try {
    if (format === 'json') {
      parsed = JSON.parse(content);
    } else if (format === 'yaml') {
      parsed = yaml.parse(content);
    } else {
      // Auto-detect: try JSON first (faster), fall back to YAML
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = yaml.parse(content);
      }
    }
  } catch (err) {
    throw new PolicyLoadError(
      `Failed to parse policy: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err : undefined
    );
  }

  return validatePolicy(parsed);
}

/**
 * Validate a parsed policy object
 *
 * @param obj - Parsed policy object (from YAML/JSON)
 * @returns Validated policy document
 * @throws PolicyValidationError on schema validation failure
 */
export function validatePolicy(obj: unknown): PolicyDocument {
  try {
    return PolicyDocumentSchema.parse(obj);
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new PolicyValidationError(`Policy validation failed: ${issues}`, err.issues);
    }
    throw new PolicyLoadError(
      `Policy validation failed: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err : undefined
    );
  }
}

/**
 * Load policy from file
 *
 * @param filePath - Path to policy file (.yaml, .yml, or .json)
 * @returns Validated policy document
 * @throws PolicyLoadError on file read or parse failure
 * @throws PolicyValidationError on schema validation failure
 */
export function loadPolicy(filePath: string): PolicyDocument {
  const ext = path.extname(filePath).toLowerCase();
  let format: 'yaml' | 'json' | undefined;

  if (ext === '.json') {
    format = 'json';
  } else if (ext === '.yaml' || ext === '.yml') {
    format = 'yaml';
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new PolicyLoadError(
      `Failed to read policy file: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err : undefined
    );
  }

  return parsePolicy(content, format);
}

/**
 * Check if a policy file exists and is readable
 *
 * @param filePath - Path to policy file
 * @returns true if file exists and is readable
 */
export function policyFileExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a minimal example policy document
 *
 * Useful for scaffolding new policy files.
 */
export function createExamplePolicy(): PolicyDocument {
  return {
    version: POLICY_VERSION,
    name: 'Example Policy',
    defaults: {
      decision: 'deny',
      reason: 'No matching rule found',
    },
    rules: [
      {
        name: 'allow-subscribed-crawl',
        subject: {
          type: 'human',
          labels: ['subscribed'],
        },
        purpose: 'crawl',
        licensing_mode: 'subscription',
        decision: 'allow',
        reason: 'Subscribed users can crawl',
      },
      {
        name: 'allow-verified-agents-inference',
        subject: {
          type: 'agent',
          labels: ['verified'],
        },
        purpose: ['inference', 'ai_input'],
        licensing_mode: 'pay_per_inference',
        decision: 'allow',
        reason: 'Verified agents can run inference with payment',
      },
      {
        name: 'review-org-train',
        subject: {
          type: 'org',
        },
        purpose: 'train',
        decision: 'review',
        reason: 'Training requests from organizations require review',
      },
    ],
  };
}

/**
 * Serialize policy to YAML string
 *
 * @param policy - Policy document to serialize
 * @returns YAML string
 */
export function serializePolicyYaml(policy: PolicyDocument): string {
  return yaml.stringify(policy, {
    lineWidth: 100,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'QUOTE_DOUBLE',
  });
}

/**
 * Serialize policy to JSON string
 *
 * @param policy - Policy document to serialize
 * @param pretty - Pretty-print with indentation (default: true)
 * @returns JSON string
 */
export function serializePolicyJson(policy: PolicyDocument, pretty = true): string {
  return JSON.stringify(policy, null, pretty ? 2 : undefined);
}
