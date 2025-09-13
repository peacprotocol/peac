/**
 * PEIP-SAF policy validation
 */

import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { SafetyPolicy, OverlayId } from './types.js';

// Schema cache
let ajvInstance: Ajv | null = null;

function getAjv(): Ajv {
  if (!ajvInstance) {
    ajvInstance = new Ajv({
      strict: false, // Disable strict mode for external schema refs
      allErrors: true,
      loadSchema: loadSchemaFromId,
    });
    addFormats(ajvInstance);
  }
  return ajvInstance;
}

async function loadSchemaFromId(uri: string): Promise<object> {
  // In real implementation, this would fetch from URLs
  // For now, load from local schemas using fs
  const fs = await import('fs');
  const path = await import('path');

  // Find the repository root by looking for package.json
  let schemaBaseDir = process.cwd();
  while (schemaBaseDir !== path.dirname(schemaBaseDir)) {
    if (fs.existsSync(path.join(schemaBaseDir, 'package.json'))) {
      const packageJsonPath = path.join(schemaBaseDir, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.name === '@peacprotocol/monorepo') {
        break; // Found repository root
      }
    }
    schemaBaseDir = path.dirname(schemaBaseDir);
  }

  if (uri === 'https://peacprotocol.org/schemas/peip-saf/core.v1.json') {
    const schemaPath = path.join(schemaBaseDir, 'schemas/peip-saf/core.v1.json');
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    return JSON.parse(schemaContent);
  }

  if (uri === 'https://peacprotocol.org/schemas/peip-saf/us-ca-sb243.v1.json') {
    const schemaPath = path.join(schemaBaseDir, 'schemas/peip-saf/us-ca-sb243.v1.json');
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    return JSON.parse(schemaContent);
  }

  throw new Error(`Unknown schema URI: ${uri}`);
}

export interface ValidationOptions {
  overlay?: OverlayId;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  profile?: string;
}

/**
 * Validate safety policy against PEIP-SAF schemas
 */
export async function validateSafetyPolicy(
  policy: SafetyPolicy,
  options: ValidationOptions = {}
): Promise<ValidationResult> {
  try {
    const ajv = getAjv();

    // Determine schema based on profile or overlay
    let schemaUri: string;

    if (options.overlay === 'us-ca-sb243' || policy.profile === 'peip-saf/us-ca-sb243') {
      schemaUri = 'https://peacprotocol.org/schemas/peip-saf/us-ca-sb243.v1.json';
    } else {
      schemaUri = 'https://peacprotocol.org/schemas/peip-saf/core.v1.json';
    }

    // Get or compile validator
    let validate = ajv.getSchema(schemaUri);
    if (!validate) {
      const schema = await loadSchemaFromId(schemaUri);
      validate = ajv.compile(schema);
    }

    const valid = validate(policy);

    if (valid) {
      return {
        valid: true,
        profile: policy.profile,
      };
    } else {
      const errors = validate.errors?.map(
        (err) => `${err.instancePath || 'root'} ${err.message}`
      ) || ['Unknown validation error'];

      return {
        valid: false,
        errors,
        profile: policy.profile,
      };
    }
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Validation failed'],
    };
  }
}

/**
 * Validate policy against specific overlay requirements
 */
export function validateOverlayCompliance(
  policy: SafetyPolicy,
  overlayId: OverlayId
): ValidationResult {
  if (overlayId === 'us-ca-sb243') {
    return validateSB243Compliance(policy);
  }

  return {
    valid: false,
    errors: [`Unknown overlay: ${overlayId}`],
  };
}

/**
 * Validate California SB-243 specific requirements
 */
function validateSB243Compliance(policy: SafetyPolicy): ValidationResult {
  const errors: string[] = [];

  // Check disclosure cadence defaults
  if (!policy.disclosure_cadence.enabled) {
    errors.push('SB-243 requires disclosure_cadence to be enabled');
  }

  if (policy.disclosure_cadence.interval !== 'PT3H') {
    errors.push('SB-243 requires default 3-hour disclosure interval (PT3H)');
  }

  // Check minors protection
  if (!policy.minors_gate.enabled) {
    errors.push('SB-243 requires minor protection to be enabled');
  }

  if (policy.minors_gate.min_age < 13) {
    errors.push('SB-243 requires minimum age of 13 or higher');
  }

  // If it's a full SB-243 policy, check additional requirements
  if (policy.profile === 'peip-saf/us-ca-sb243') {
    const sb243Policy = policy as any;

    if (!sb243Policy.osp_report_url) {
      errors.push('SB-243 requires OSP report URL');
    }

    if (!sb243Policy.sb243_compliance?.enabled) {
      errors.push('SB-243 compliance must be explicitly enabled');
    }

    if (!sb243Policy.sb243_compliance?.designated_contact?.email) {
      errors.push('SB-243 requires designated contact email');
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}
