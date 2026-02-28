/**
 * Control Action Extension Tests (v0.11.3+, DD-145)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ControlActionTypeSchema,
  ControlTriggerSchema,
  ControlActionSchema,
  CONTROL_ACTION_EXTENSION_KEY,
  CONTROL_ACTIONS,
  CONTROL_TRIGGERS,
  validateControlAction,
} from '../../src/extensions/control-action';

describe('ControlActionTypeSchema', () => {
  it('should accept all 5 action types', () => {
    for (const action of CONTROL_ACTIONS) {
      expect(ControlActionTypeSchema.parse(action)).toBe(action);
    }
  });

  it('should reject unknown actions', () => {
    expect(() => ControlActionTypeSchema.parse('delete')).toThrow();
    expect(() => ControlActionTypeSchema.parse('')).toThrow();
  });
});

describe('ControlTriggerSchema', () => {
  it('should accept all 5 trigger types', () => {
    for (const trigger of CONTROL_TRIGGERS) {
      expect(ControlTriggerSchema.parse(trigger)).toBe(trigger);
    }
  });

  it('should reject unknown triggers', () => {
    expect(() => ControlTriggerSchema.parse('unknown')).toThrow();
  });
});

describe('ControlActionSchema', () => {
  it('should accept grant with policy evaluation', () => {
    const action = {
      action: 'grant',
      trigger: 'policy_evaluation',
      resource: 'https://api.example.com/data',
      policy_ref: 'https://policies.example.com/access/read-only',
    };
    expect(ControlActionSchema.parse(action)).toEqual(action);
  });

  it('should accept minimal action (action + trigger only)', () => {
    const action = { action: 'audit', trigger: 'scheduled' };
    expect(ControlActionSchema.parse(action)).toEqual(action);
  });

  it('should accept deny with reason', () => {
    const action = {
      action: 'deny',
      trigger: 'anomaly_detection',
      reason: 'Request rate exceeded threshold',
    };
    expect(ControlActionSchema.parse(action)).toEqual(action);
  });

  it('should accept escalate with action_at', () => {
    const action = {
      action: 'escalate',
      trigger: 'manual_review',
      action_at: '2026-03-01T12:00:00Z',
    };
    expect(ControlActionSchema.parse(action)).toEqual(action);
  });

  it('should reject unknown action', () => {
    expect(() => ControlActionSchema.parse({ action: 'remove', trigger: 'scheduled' })).toThrow();
  });

  it('should reject unknown trigger', () => {
    expect(() => ControlActionSchema.parse({ action: 'grant', trigger: 'auto' })).toThrow();
  });

  it('should reject extra fields (strict mode)', () => {
    expect(() =>
      ControlActionSchema.parse({ action: 'grant', trigger: 'scheduled', extra: 'bad' })
    ).toThrow();
  });

  it('should have correct extension key', () => {
    expect(CONTROL_ACTION_EXTENSION_KEY).toBe('org.peacprotocol/control_action');
  });
});

describe('validateControlAction', () => {
  it('should return ok for valid action', () => {
    const result = validateControlAction({ action: 'grant', trigger: 'policy_evaluation' });
    expect(result.ok).toBe(true);
  });

  it('should return error for invalid action', () => {
    const result = validateControlAction({ action: 'bad' });
    expect(result.ok).toBe(false);
  });
});

describe('conformance fixtures', () => {
  const fixtures = JSON.parse(
    readFileSync(
      resolve(__dirname, '../../../../specs/conformance/fixtures/zero-trust/control-action.json'),
      'utf-8'
    )
  );

  for (const fixture of fixtures.valid) {
    it(`valid: ${fixture.name}`, () => {
      expect(ControlActionSchema.safeParse(fixture.input).success).toBe(true);
    });
  }

  for (const fixture of fixtures.invalid) {
    it(`invalid: ${fixture.name}`, () => {
      expect(ControlActionSchema.safeParse(fixture.input).success).toBe(false);
    });
  }
});
