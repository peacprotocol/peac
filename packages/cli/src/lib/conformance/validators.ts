/**
 * Conformance Category Validators
 *
 * Category-aware validation using the same validators as tests/conformance/*.spec.ts.
 */

import {
  ReceiptClaimsSchema,
  validateAgentIdentityAttestation,
  validateAttributionAttestation,
  validateDisputeAttestation,
  validateInteractionOrdered,
  validateWorkflowContextOrdered,
  validateObligationsExtension,
  isValidPurposeToken,
  isCanonicalPurpose,
  type InteractionValidationResult,
  type WorkflowValidationResult,
} from '@peac/schema';
import { parse as parseDiscovery } from '@peac/disc';
import type { ValidationResult, ValidationResultWithPath, CategoryValidator } from './types.js';
import { zodPathToJsonPointer } from './digest.js';

/**
 * Map Zod issue code to manifest keyword
 */
function zodCodeToKeyword(code: string): string {
  const mapping: Record<string, string> = {
    invalid_type: 'type',
    invalid_literal: 'const',
    unrecognized_keys: 'additionalProperties',
    invalid_union: 'anyOf',
    invalid_enum_value: 'enum',
    invalid_string: 'format',
    too_small: 'minLength',
    too_big: 'maxLength',
    custom: 'custom',
  };
  return mapping[code] ?? code;
}

/**
 * Validate receipt claims using Zod schema
 */
export function validateReceiptPayload(payload: unknown): ValidationResultWithPath {
  const result = ReceiptClaimsSchema.safeParse(payload);

  if (result.success) {
    return { valid: true };
  }

  const firstIssue = result.error.issues[0];
  const zodPath = firstIssue?.path ?? [];
  const errorPath = zodPathToJsonPointer(zodPath);
  const errorKeyword = zodCodeToKeyword(firstIssue?.code ?? 'unknown');

  // Map paths to canonical error codes
  let errorCode = 'E_INVALID_FORMAT';
  const pathStr = zodPath.join('.');
  if (pathStr === 'iss' || pathStr.startsWith('iss.')) errorCode = 'E_INVALID_ISSUER';
  else if (pathStr === 'aud' || pathStr.startsWith('aud.')) errorCode = 'E_INVALID_AUDIENCE';
  else if (pathStr === 'iat') errorCode = 'E_INVALID_IAT';
  else if (pathStr === 'exp') errorCode = 'E_INVALID_EXP';
  else if (pathStr === 'rid') errorCode = 'E_INVALID_RID';
  else if (firstIssue?.code === 'invalid_type' && zodPath.length > 0) {
    // For required fields, Zod reports invalid_type when field is undefined
    errorCode = 'E_REQUIRED';
  }

  return {
    valid: false,
    error_code: errorCode,
    error_message: firstIssue?.message ?? 'Unknown validation error',
    error_path: errorPath,
    error_keyword: errorKeyword,
  };
}

/**
 * Validate discovery document (peac.txt or peac-issuer.json)
 */
function validateDiscoveryInput(input: unknown): ValidationResult {
  if (typeof input === 'string') {
    // Parse as peac.txt format
    const result = parseDiscovery(input);
    if (result.valid) {
      return { valid: true };
    }
    return {
      valid: false,
      error_code: 'E_DISCOVERY_PARSE_ERROR',
      error_message: result.errors?.join('; ') ?? 'Discovery parse error',
    };
  }

  // JSON format - validate structure
  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;
    if (!obj.issuer || typeof obj.issuer !== 'string') {
      return {
        valid: false,
        error_code: 'E_MISSING_ISSUER',
        error_message: 'Discovery document missing required issuer field',
      };
    }
    if (!obj.jwks_uri || typeof obj.jwks_uri !== 'string') {
      return {
        valid: false,
        error_code: 'E_MISSING_JWKS_URI',
        error_message: 'Discovery document missing required jwks_uri field',
      };
    }
    return { valid: true };
  }

  return {
    valid: false,
    error_code: 'E_INVALID_DISCOVERY',
    error_message: 'Discovery input must be string or object',
  };
}

/**
 * Validate agent identity attestation
 */
function validateAgentIdentityInput(input: unknown): ValidationResult {
  const result = validateAgentIdentityAttestation(input);
  if (result.ok) {
    return { valid: true };
  }
  return {
    valid: false,
    error_code: 'E_INVALID_AGENT_IDENTITY',
    error_message: result.error,
  };
}

/**
 * Validate attribution attestation
 */
function validateAttributionInput(input: unknown): ValidationResult {
  const result = validateAttributionAttestation(input);
  if (result.ok) {
    return { valid: true };
  }
  return {
    valid: false,
    error_code: 'E_INVALID_ATTRIBUTION',
    error_message: result.error,
  };
}

/**
 * Validate dispute attestation
 */
function validateDisputeInput(input: unknown): ValidationResult {
  const result = validateDisputeAttestation(input);
  if (result.ok) {
    return { valid: true };
  }
  return {
    valid: false,
    error_code: 'E_INVALID_DISPUTE',
    error_message: result.error,
  };
}

/**
 * Validate interaction evidence
 */
function validateInteractionInput(input: unknown): ValidationResult {
  const result: InteractionValidationResult = validateInteractionOrdered(input);
  if (result.valid) {
    return {
      valid: true,
      warnings: result.warnings.map((w) => w.message),
    };
  }
  // InteractionValidationResult has errors array when invalid
  const firstError = result.errors[0];
  return {
    valid: false,
    error_code: firstError?.code ?? 'E_INVALID_INTERACTION',
    error_message: firstError?.message ?? 'Interaction validation failed',
  };
}

/**
 * Validate workflow context
 */
function validateWorkflowInput(input: unknown): ValidationResult {
  const result: WorkflowValidationResult = validateWorkflowContextOrdered(input);
  if (result.valid) {
    return { valid: true };
  }
  // WorkflowValidationResult has error_code and error when invalid
  return {
    valid: false,
    error_code: result.error_code,
    error_message: result.error,
  };
}

/**
 * Validate obligations extension
 */
function validateObligationsInput(input: unknown): ValidationResult {
  const result = validateObligationsExtension(input);
  if (result.ok) {
    return { valid: true };
  }
  return {
    valid: false,
    error_code: 'E_INVALID_OBLIGATIONS',
    error_message: result.error,
  };
}

/**
 * Validate purpose tokens
 */
function validatePurposeInput(input: unknown): ValidationResult {
  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;

    // Check purpose_declared array
    if (obj.purpose_declared && Array.isArray(obj.purpose_declared)) {
      for (const p of obj.purpose_declared) {
        if (typeof p === 'string' && !isValidPurposeToken(p) && !isCanonicalPurpose(p)) {
          return {
            valid: false,
            error_code: 'E_INVALID_PURPOSE_TOKEN',
            error_message: `Invalid purpose token: ${p}`,
          };
        }
      }
    }

    // Check purpose_enforced
    if (obj.purpose_enforced && typeof obj.purpose_enforced === 'string') {
      if (!isValidPurposeToken(obj.purpose_enforced) && !isCanonicalPurpose(obj.purpose_enforced)) {
        return {
          valid: false,
          error_code: 'E_INVALID_PURPOSE_ENFORCED',
          error_message: `Invalid enforced purpose: ${obj.purpose_enforced}`,
        };
      }
    }

    return { valid: true };
  }

  return {
    valid: false,
    error_code: 'E_INVALID_PURPOSE',
    error_message: 'Purpose input must be object with purpose_declared/purpose_enforced',
  };
}

/**
 * Validate bundle (basic structure check - full verification requires async)
 */
function validateBundleInput(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null) {
    return {
      valid: false,
      error_code: 'E_INVALID_BUNDLE',
      error_message: 'Bundle must be an object',
    };
  }

  const obj = input as Record<string, unknown>;

  // Check required bundle fields
  if (!obj.version || typeof obj.version !== 'string') {
    return {
      valid: false,
      error_code: 'E_MISSING_VERSION',
      error_message: 'Bundle missing required version field',
    };
  }

  // Check for entries or receipts array
  if (!Array.isArray(obj.entries) && !Array.isArray(obj.receipts)) {
    return {
      valid: false,
      error_code: 'E_MISSING_ENTRIES',
      error_message: 'Bundle missing entries or receipts array',
    };
  }

  return { valid: true };
}

/**
 * Validate x402 offer/payment structures
 */
function validateX402Input(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null) {
    return {
      valid: false,
      error_code: 'E_INVALID_X402',
      error_message: 'x402 input must be an object',
    };
  }

  const obj = input as Record<string, unknown>;

  // Check for x402 payment required structure
  if (obj.accepts && Array.isArray(obj.accepts)) {
    // Validate accepts array contains payment options
    for (const accept of obj.accepts) {
      if (typeof accept !== 'object' || accept === null) {
        return {
          valid: false,
          error_code: 'E_INVALID_ACCEPTS',
          error_message: 'x402 accepts must contain payment option objects',
        };
      }
    }
    return { valid: true };
  }

  // Check for x402 payment evidence structure
  if (obj.rail && obj.reference) {
    return { valid: true };
  }

  return {
    valid: false,
    error_code: 'E_INVALID_X402_STRUCTURE',
    error_message: 'x402 input missing required fields (accepts or rail+reference)',
  };
}

/**
 * Validate policy-related input
 */
function validatePolicyInput(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null) {
    return {
      valid: false,
      error_code: 'E_INVALID_POLICY',
      error_message: 'Policy input must be an object',
    };
  }

  // Basic structure validation for policy
  return { valid: true };
}

/**
 * Validate issue-related input (receipt issuance)
 */
function validateIssueInput(input: unknown): ValidationResult {
  // Issue fixtures are typically receipt structures for issuance testing
  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;

    // If it has claims, validate them
    if (obj.claims) {
      return validateReceiptPayload(obj.claims);
    }

    // If it has payload, validate it
    if (obj.payload) {
      return validateReceiptPayload(obj.payload);
    }
  }

  return { valid: true };
}

/**
 * Category validator registry
 */
export const CATEGORY_VALIDATORS: Record<string, CategoryValidator> = {
  // Receipt claim validation
  valid: (input) => {
    const obj = input as Record<string, unknown>;
    return validateReceiptPayload(obj.payload ?? obj.claims ?? input);
  },
  invalid: (input) => {
    const obj = input as Record<string, unknown>;
    return validateReceiptPayload(obj.payload ?? obj.claims ?? input);
  },
  edge: (input) => {
    const obj = input as Record<string, unknown>;
    return validateReceiptPayload(obj.payload ?? obj.claims ?? input);
  },

  // Category-specific validators
  'agent-identity': validateAgentIdentityInput,
  attribution: validateAttributionInput,
  bundle: validateBundleInput,
  discovery: validateDiscoveryInput,
  dispute: validateDisputeInput,
  interaction: validateInteractionInput,
  issue: validateIssueInput,
  obligations: validateObligationsInput,
  policy: validatePolicyInput,
  purpose: validatePurposeInput,
  verifier: (input) => {
    const obj = input as Record<string, unknown>;
    return validateReceiptPayload(obj.payload ?? obj.claims ?? input);
  },
  workflow: validateWorkflowInput,
  x402: validateX402Input,
};

/**
 * Get validator for a category
 */
export function getValidator(category: string): CategoryValidator {
  return (
    CATEGORY_VALIDATORS[category] ??
    ((input) => {
      // Default: validate as receipt payload
      // Input may be the raw fixture (with payload/claims wrapper) or the payload directly
      if (typeof input === 'object' && input !== null) {
        const obj = input as Record<string, unknown>;
        // Check for wrapped payload/claims first
        if (obj.payload || obj.claims) {
          return validateReceiptPayload(obj.payload ?? obj.claims);
        }
        // Otherwise, if it looks like receipt claims (has standard fields), validate directly
        if ('iss' in obj || 'aud' in obj || 'iat' in obj || 'rid' in obj) {
          return validateReceiptPayload(input);
        }
      }
      return { valid: true };
    })
  );
}
