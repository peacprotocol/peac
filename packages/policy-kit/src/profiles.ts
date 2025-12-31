/**
 * Profile Loader API
 *
 * Convenience functions for working with pre-built policy profiles.
 *
 * @example
 * ```typescript
 * import { listProfiles, loadProfile, customizeProfile } from '@peac/policy-kit';
 *
 * // List available profiles
 * const ids = listProfiles(); // ['api-provider', 'news-media', ...]
 *
 * // Load a profile
 * const profile = loadProfile('news-media');
 *
 * // Customize with parameters
 * const policy = customizeProfile('news-media', {
 *   contact: 'licensing@example.com',
 *   rate_limit: '100/hour',
 * });
 * ```
 *
 * @packageDocumentation
 */

import { PROFILES, PROFILE_IDS, type ProfileId } from './generated/profiles';
import type { ProfileDefinition, ProfileParameter, PolicyDocument, RateLimitConfig } from './types';
import { parseRateLimit, RateLimitConfigSchema } from './types';

/**
 * Error thrown when profile operations fail
 */
export class ProfileError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'PROFILE_NOT_FOUND'
      | 'INVALID_PARAMETER'
      | 'MISSING_REQUIRED_PARAMETER'
      | 'VALIDATION_FAILED'
  ) {
    super(message);
    this.name = 'ProfileError';
  }
}

/**
 * Result of parameter validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validation error details
 */
export interface ValidationError {
  parameter: string;
  message: string;
  code: 'MISSING_REQUIRED' | 'INVALID_FORMAT' | 'UNKNOWN_PARAMETER';
}

/**
 * Validation warning details
 */
export interface ValidationWarning {
  parameter: string;
  message: string;
}

/**
 * Customization result with policy and applied defaults
 */
export interface CustomizeResult {
  policy: PolicyDocument;
  appliedDefaults: {
    requirements?: { receipt?: boolean };
    rate_limit?: RateLimitConfig;
  };
  parameters: Record<string, string | number | boolean>;
}

/**
 * List all available profile IDs
 *
 * @returns Array of profile IDs
 *
 * @example
 * ```typescript
 * const ids = listProfiles();
 * // ['api-provider', 'news-media', 'open-source', 'saas-docs']
 * ```
 */
export function listProfiles(): ProfileId[] {
  return [...PROFILE_IDS];
}

/**
 * Check if a profile ID exists
 *
 * @param id - Profile ID to check
 * @returns true if profile exists
 *
 * @example
 * ```typescript
 * if (hasProfile('news-media')) {
 *   const profile = loadProfile('news-media');
 * }
 * ```
 */
export function hasProfile(id: string): id is ProfileId {
  return PROFILE_IDS.includes(id as ProfileId);
}

/**
 * Load a profile by ID
 *
 * @param id - Profile ID
 * @returns Profile definition
 * @throws ProfileError if profile not found
 *
 * @example
 * ```typescript
 * const profile = loadProfile('news-media');
 * console.log(profile.name); // 'News Media Publisher'
 * ```
 */
export function loadProfile(id: ProfileId): ProfileDefinition {
  const profile = PROFILES[id];
  if (!profile) {
    throw new ProfileError(`Profile not found: ${id}`, 'PROFILE_NOT_FOUND');
  }
  return profile;
}

/**
 * Get a profile by ID, returning undefined if not found
 *
 * @param id - Profile ID
 * @returns Profile definition or undefined
 *
 * @example
 * ```typescript
 * const profile = getProfile('news-media');
 * if (profile) {
 *   console.log(profile.name);
 * }
 * ```
 */
export function getProfile(id: string): ProfileDefinition | undefined {
  if (!hasProfile(id)) {
    return undefined;
  }
  return PROFILES[id];
}

/**
 * Validate parameters against a profile's requirements
 *
 * @param profile - Profile definition or ID
 * @param params - Parameters to validate
 * @returns Validation result with errors and warnings
 *
 * @example
 * ```typescript
 * const result = validateProfileParams('news-media', {
 *   contact: 'invalid-email',
 * });
 *
 * if (!result.valid) {
 *   console.error(result.errors);
 * }
 * ```
 */
export function validateProfileParams(
  profile: ProfileId | ProfileDefinition,
  params: Record<string, unknown>
): ValidationResult {
  const def = typeof profile === 'string' ? loadProfile(profile) : profile;
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const paramDefs = def.parameters || {};
  const providedKeys = new Set(Object.keys(params));

  // Check for required parameters
  for (const [key, paramDef] of Object.entries(paramDefs)) {
    if (paramDef.required && !providedKeys.has(key)) {
      errors.push({
        parameter: key,
        message: `Required parameter missing: ${key}`,
        code: 'MISSING_REQUIRED',
      });
    }
  }

  // Validate provided parameters
  for (const [key, value] of Object.entries(params)) {
    const paramDef = paramDefs[key] as ProfileParameter | undefined;

    if (!paramDef) {
      errors.push({
        parameter: key,
        message: `Unknown parameter: ${key}`,
        code: 'UNKNOWN_PARAMETER',
      });
      continue;
    }

    // Skip validation if value is undefined/null
    if (value === undefined || value === null) {
      if (paramDef.required) {
        errors.push({
          parameter: key,
          message: `Required parameter is null/undefined: ${key}`,
          code: 'MISSING_REQUIRED',
        });
      }
      continue;
    }

    // Type-specific validation
    const strValue = String(value);
    const validationError = validateParameterValue(key, strValue, paramDef);
    if (validationError) {
      errors.push(validationError);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate a single parameter value
 */
function validateParameterValue(
  key: string,
  value: string,
  paramDef: ProfileParameter
): ValidationError | null {
  if (!paramDef.validate) {
    return null;
  }

  switch (paramDef.validate) {
    case 'email': {
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return {
          parameter: key,
          message: `Invalid email format: ${value}`,
          code: 'INVALID_FORMAT',
        };
      }
      break;
    }

    case 'url': {
      try {
        new URL(value);
      } catch {
        return {
          parameter: key,
          message: `Invalid URL format: ${value}`,
          code: 'INVALID_FORMAT',
        };
      }
      break;
    }

    case 'rate_limit': {
      try {
        parseRateLimit(value);
      } catch {
        // Also try parsing as RateLimitConfig object
        const parsed = RateLimitConfigSchema.safeParse(value);
        if (!parsed.success) {
          return {
            parameter: key,
            message: `Invalid rate limit format: ${value}. Expected format: "100/hour" or RateLimitConfig object`,
            code: 'INVALID_FORMAT',
          };
        }
      }
      break;
    }
  }

  return null;
}

/**
 * Customize a profile with parameters to produce a PolicyDocument
 *
 * This applies parameter values and profile defaults to create a ready-to-use policy.
 *
 * @param profile - Profile definition or ID
 * @param params - Parameters to apply
 * @returns Customization result with policy and applied defaults
 * @throws ProfileError if validation fails
 *
 * @example
 * ```typescript
 * const result = customizeProfile('news-media', {
 *   contact: 'licensing@example.com',
 *   rate_limit: '100/hour',
 * });
 *
 * // result.policy is a PolicyDocument ready for use
 * const decision = evaluate(result.policy, context);
 * ```
 */
export function customizeProfile(
  profile: ProfileId | ProfileDefinition,
  params: Record<string, unknown> = {}
): CustomizeResult {
  const def = typeof profile === 'string' ? loadProfile(profile) : profile;

  // Validate parameters
  const validation = validateProfileParams(def, params);
  if (!validation.valid) {
    const errorMessages = validation.errors.map((e) => `${e.parameter}: ${e.message}`).join(', ');
    throw new ProfileError(`Parameter validation failed: ${errorMessages}`, 'VALIDATION_FAILED');
  }

  // Apply defaults for missing optional parameters
  const appliedParams: Record<string, string | number | boolean> = {};
  for (const [key, paramDef] of Object.entries(def.parameters || {})) {
    if (key in params && params[key] !== undefined && params[key] !== null) {
      appliedParams[key] = params[key] as string | number | boolean;
    } else if (paramDef.default !== undefined) {
      appliedParams[key] = paramDef.default;
    }
  }

  // Deep clone the policy to avoid mutations
  const policy: PolicyDocument = JSON.parse(JSON.stringify(def.policy));

  // Apply profile defaults
  const appliedDefaults: CustomizeResult['appliedDefaults'] = {};

  if (def.defaults?.requirements) {
    appliedDefaults.requirements = { ...def.defaults.requirements };
  }

  if (def.defaults?.rate_limit) {
    appliedDefaults.rate_limit = { ...def.defaults.rate_limit };
  }

  // If rate_limit parameter was provided, parse and apply it
  if (appliedParams.rate_limit) {
    const rateLimitValue = appliedParams.rate_limit;
    if (typeof rateLimitValue === 'string') {
      try {
        appliedDefaults.rate_limit = parseRateLimit(rateLimitValue);
      } catch {
        // Already validated, should not happen
      }
    }
  }

  return {
    policy,
    appliedDefaults,
    parameters: appliedParams,
  };
}

/**
 * Get all profiles as an array
 *
 * @returns Array of all profile definitions
 *
 * @example
 * ```typescript
 * const profiles = getAllProfiles();
 * for (const profile of profiles) {
 *   console.log(`${profile.id}: ${profile.name}`);
 * }
 * ```
 */
export function getAllProfiles(): ProfileDefinition[] {
  return PROFILE_IDS.map((id) => PROFILES[id]);
}

/**
 * Get profile summary for display purposes
 *
 * @param profile - Profile definition or ID
 * @returns Summary object with key information
 *
 * @example
 * ```typescript
 * const summary = getProfileSummary('news-media');
 * console.log(summary);
 * // {
 * //   id: 'news-media',
 * //   name: 'News Media Publisher',
 * //   defaultDecision: 'deny',
 * //   ruleCount: 3,
 * //   requiresReceipt: true,
 * //   requiredParams: ['contact']
 * // }
 * ```
 */
export function getProfileSummary(profile: ProfileId | ProfileDefinition): {
  id: string;
  name: string;
  description: string;
  defaultDecision: 'allow' | 'deny' | 'review';
  ruleCount: number;
  requiresReceipt: boolean;
  requiredParams: string[];
  optionalParams: string[];
} {
  const def = typeof profile === 'string' ? loadProfile(profile) : profile;

  const requiredParams: string[] = [];
  const optionalParams: string[] = [];

  for (const [key, paramDef] of Object.entries(def.parameters || {})) {
    if (paramDef.required) {
      requiredParams.push(key);
    } else {
      optionalParams.push(key);
    }
  }

  return {
    id: def.id,
    name: def.name,
    description: def.description,
    defaultDecision: def.policy.defaults.decision,
    ruleCount: def.policy.rules?.length || 0,
    requiresReceipt: def.defaults?.requirements?.receipt ?? false,
    requiredParams: requiredParams.sort(),
    optionalParams: optionalParams.sort(),
  };
}
