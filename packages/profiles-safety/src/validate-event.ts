/**
 * Safety event validation against receipt schema
 */

import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { SafetyEvent } from './types';

let ajvInstance: Ajv | null = null;

function getAjv(): Ajv {
  if (!ajvInstance) {
    ajvInstance = new Ajv({
      strict: true,
      allErrors: true,
    });
    addFormats(ajvInstance);
  }
  return ajvInstance;
}

export interface EventValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Validate safety event against safety-event.v1.json schema
 */
export async function validateSafetyEvent(event: SafetyEvent): Promise<EventValidationResult> {
  try {
    const ajv = getAjv();

    // Load safety event receipt schema (we validate just the safety_event portion)
    const schema = await import('../../../schemas/receipts/safety-event.v1.json', {
      with: { type: 'json' },
    });

    // Extract just the safety_event property schema
    const safetyEventSchema = schema.default.properties.safety_event;

    const validate = ajv.compile(safetyEventSchema);
    const valid = validate(event);

    if (valid) {
      return { valid: true };
    } else {
      const errors = validate.errors?.map(
        (err) => `${err.instancePath || 'root'} ${err.message}`
      ) || ['Unknown validation error'];

      return {
        valid: false,
        errors,
      };
    }
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Event validation failed'],
    };
  }
}

/**
 * Validate event type specific requirements
 */
export function validateEventTypeRequirements(event: SafetyEvent): EventValidationResult {
  const errors: string[] = [];

  switch (event.event_type) {
    case 'disclosure':
      if (!event.counters.time_window) {
        errors.push('Disclosure events must specify time_window');
      }
      break;

    case 'crisis_referral':
      if (event.action_taken === 'none') {
        errors.push('Crisis referral events must have action taken');
      }
      break;

    case 'minor_protection':
      if (!event.counters.severity_counts) {
        errors.push('Minor protection events should include severity counts');
      }
      break;

    case 'intent_classification':
      if (!event.intent_key) {
        errors.push('Intent classification events must specify intent_key');
      }
      break;

    case 'policy_violation':
      if (!event.action_taken || event.action_taken === 'none') {
        errors.push('Policy violation events must have action taken');
      }
      break;

    case 'safety_action':
      if (!event.action_taken || event.action_taken === 'none') {
        errors.push('Safety action events must specify action taken');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Validate counter consistency and non-PII compliance
 */
export function validateCounterCompliance(event: SafetyEvent): EventValidationResult {
  const errors: string[] = [];

  // Check total_events consistency
  if (event.counters.severity_counts) {
    const severityTotal = Object.values(event.counters.severity_counts).reduce(
      (sum, count) => sum + (count || 0),
      0
    );
    if (severityTotal > event.counters.total_events) {
      errors.push('Severity count total cannot exceed total_events');
    }
  }

  // Check time window format if present
  if (event.counters.time_window) {
    const timeWindowPattern = /^PT[0-9]+[HMS]$/;
    if (!timeWindowPattern.test(event.counters.time_window)) {
      errors.push('time_window must be valid ISO 8601 duration (PT format)');
    }
  }

  // Validate counters are non-negative
  if (event.counters.total_events < 0) {
    errors.push('total_events must be non-negative');
  }

  if (event.counters.severity_counts) {
    for (const [level, count] of Object.entries(event.counters.severity_counts)) {
      if (count !== undefined && count < 0) {
        errors.push(`severity_counts.${level} must be non-negative`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}
