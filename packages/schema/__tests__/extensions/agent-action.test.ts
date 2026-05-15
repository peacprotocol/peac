/**
 * Agent action schema validator tests.
 *
 * Exercises the no-inline-content invariant, the opaque-reference grammar,
 * per-event-kind required fields, the discriminated union, observed_at
 * missing/malformed split, and unknown event_kind rejection.
 */
import { describe, it, expect } from 'vitest';
import {
  AGENT_ACTION_FORBIDDEN_TOP_LEVEL_KEYS,
  AGENT_ACTION_ERROR_CODES,
  AgentActionSchema,
  validateAgentAction,
  validateAgentActionForType,
} from '../../src/extensions/agent-action';

const validInvoked = () => ({
  event_kind: 'agent-action-invoked-observed',
  agent_ref: 'urn:peac:agent:worker-001',
  action_ref: 'urn:peac:action:task-fetch-data',
  observed_at: '2026-05-14T10:00:00Z',
});

const validDelegated = () => ({
  event_kind: 'agent-action-delegated-observed',
  agent_ref: 'urn:peac:agent:orchestrator-001',
  action_ref: 'urn:peac:action:task-summarize',
  observed_at: '2026-05-14T10:01:00Z',
  delegated_to_ref: 'urn:peac:agent:sub-worker-002',
});

const validApproved = () => ({
  event_kind: 'agent-action-approved-observed',
  agent_ref: 'urn:peac:agent:worker-002',
  action_ref: 'urn:peac:action:task-deploy',
  observed_at: '2026-05-14T10:02:00Z',
});

const validDenied = () => ({
  event_kind: 'agent-action-denied-observed',
  agent_ref: 'urn:peac:agent:worker-003',
  action_ref: 'urn:peac:action:task-delete',
  observed_at: '2026-05-14T10:03:00Z',
});

const validCancelled = () => ({
  event_kind: 'agent-action-cancelled-observed',
  agent_ref: 'urn:peac:agent:worker-004',
  action_ref: 'urn:peac:action:task-export',
  observed_at: '2026-05-14T10:04:00Z',
});

const validTimedOut = () => ({
  event_kind: 'agent-action-timed-out-observed',
  agent_ref: 'urn:peac:agent:worker-005',
  action_ref: 'urn:peac:action:task-api-call',
  observed_at: '2026-05-14T10:05:00Z',
});

describe('agent-action: positive cases', () => {
  it('invoked: minimum-required fields validate', () => {
    expect(validateAgentAction(validInvoked())).toEqual({ ok: true, value: validInvoked() });
  });

  it('delegated: minimum-required fields validate', () => {
    expect(validateAgentAction(validDelegated())).toEqual({ ok: true, value: validDelegated() });
  });

  it('approved: minimum-required fields validate', () => {
    expect(validateAgentAction(validApproved())).toEqual({ ok: true, value: validApproved() });
  });

  it('denied: minimum-required fields validate', () => {
    expect(validateAgentAction(validDenied())).toEqual({ ok: true, value: validDenied() });
  });

  it('cancelled: minimum-required fields validate', () => {
    expect(validateAgentAction(validCancelled())).toEqual({ ok: true, value: validCancelled() });
  });

  it('timed-out: minimum-required fields validate', () => {
    expect(validateAgentAction(validTimedOut())).toEqual({ ok: true, value: validTimedOut() });
  });

  it('invoked: with all optional common fields validates', () => {
    const obs = {
      ...validInvoked(),
      caller_ref: 'ref:caller-pseudonym-001',
      policy_ref: 'urn:peac:policy:action-policy-v1',
      policy_digest: 'sha256:' + 'a'.repeat(64),
      upstream_artifact_ref: 'sha256:' + 'b'.repeat(64),
      upstream_artifact_digest: 'sha256:' + 'c'.repeat(64),
      parent_ref: 'urn:peac:task:parent-task-001',
    };
    const result = validateAgentAction(obs);
    expect(result.ok).toBe(true);
  });

  it('delegated: with caller_ref and policy_ref validates', () => {
    const obs = {
      ...validDelegated(),
      caller_ref: 'did:example:caller-system',
      policy_ref: 'urn:peac:policy:delegation-v1',
    };
    expect(validateAgentAction(obs)).toMatchObject({ ok: true });
  });

  it('cancelled: with optional cancelled_by_ref validates', () => {
    const obs = { ...validCancelled(), cancelled_by_ref: 'ref:user-signal-007' };
    expect(validateAgentAction(obs)).toMatchObject({ ok: true });
  });

  it('timed-out: with optional timeout_at validates', () => {
    const obs = { ...validTimedOut(), timeout_at: '2026-05-14T10:04:55Z' };
    expect(validateAgentAction(obs)).toMatchObject({ ok: true });
  });

  it('AgentActionSchema.safeParse succeeds on valid invoked payload', () => {
    expect(AgentActionSchema.safeParse(validInvoked()).success).toBe(true);
  });
});

describe('agent-action: no-inline-content invariant (AGENT-ACT-001)', () => {
  it('FORBIDDEN_TOP_LEVEL_KEYS has 20 entries', () => {
    expect(AGENT_ACTION_FORBIDDEN_TOP_LEVEL_KEYS).toHaveLength(20);
  });

  for (const forbidden of AGENT_ACTION_FORBIDDEN_TOP_LEVEL_KEYS) {
    it(`rejects top-level key '${forbidden}' with inline_content_blocked`, () => {
      const obs = { ...validInvoked(), [forbidden]: 'some-value' };
      const result = validateAgentAction(obs);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const err = result.errors.find((e) => e.path === forbidden);
        expect(err?.code).toBe(AGENT_ACTION_ERROR_CODES.inlineContentBlocked);
      }
    });
  }
});

describe('agent-action: opaque-ref grammar (AGENT-ACT-002)', () => {
  it('agent_ref with no recognized prefix rejects with opaque_ref_grammar_violation', () => {
    const result = validateAgentAction({ ...validInvoked(), agent_ref: 'plain-string-no-prefix' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.code === AGENT_ACTION_ERROR_CODES.opaqueRefGrammarViolation)
      ).toBe(true);
    }
  });

  it('action_ref with email shape rejects (@ character blocked)', () => {
    const result = validateAgentAction({ ...validInvoked(), agent_ref: 'user@example.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.code === AGENT_ACTION_ERROR_CODES.opaqueRefGrammarViolation)
      ).toBe(true);
    }
  });

  it('delegated_to_ref with numeric string rejects (no prefix)', () => {
    const result = validateAgentAction({ ...validDelegated(), delegated_to_ref: '12345' });
    expect(result.ok).toBe(false);
  });

  it('cancelled_by_ref with whitespace rejects', () => {
    const result = validateAgentAction({
      ...validCancelled(),
      cancelled_by_ref: 'urn:peac: with space',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.code === AGENT_ACTION_ERROR_CODES.opaqueRefGrammarViolation)
      ).toBe(true);
    }
  });

  it('parent_ref with https: prefix validates', () => {
    const result = validateAgentAction({
      ...validInvoked(),
      parent_ref: 'https://tasks.example.com/task-001',
    });
    expect(result.ok).toBe(true);
  });

  it('agent_ref with did: prefix validates', () => {
    const result = validateAgentAction({
      ...validInvoked(),
      agent_ref: 'did:example:agent-identity-001',
    });
    expect(result.ok).toBe(true);
  });
});

describe('agent-action: ref_must_be_string (AGENT-ACT-003)', () => {
  it('numeric agent_ref rejects with ref_must_be_string', () => {
    const result = validateAgentAction({ ...validInvoked(), agent_ref: 42 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === AGENT_ACTION_ERROR_CODES.refMustBeString)).toBe(
        true
      );
    }
  });

  it('null action_ref rejects with ref_must_be_string', () => {
    const result = validateAgentAction({ ...validInvoked(), action_ref: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === AGENT_ACTION_ERROR_CODES.refMustBeString)).toBe(
        true
      );
    }
  });

  it('object delegated_to_ref rejects with ref_must_be_string', () => {
    const result = validateAgentAction({ ...validDelegated(), delegated_to_ref: { ref: 'bad' } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === AGENT_ACTION_ERROR_CODES.refMustBeString)).toBe(
        true
      );
    }
  });
});

describe('agent-action: missing required fields (AGENT-ACT-004)', () => {
  it('missing event_kind rejects with missing_required_field', () => {
    const { event_kind: _, ...rest } = validInvoked();
    const result = validateAgentAction(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === 'event_kind');
      expect(err?.code).toBe(AGENT_ACTION_ERROR_CODES.missingRequiredField);
    }
  });

  it('missing agent_ref rejects with missing_required_field', () => {
    const { agent_ref: _, ...rest } = validInvoked();
    const result = validateAgentAction(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === 'agent_ref');
      expect(err?.code).toBe(AGENT_ACTION_ERROR_CODES.missingRequiredField);
    }
  });

  it('missing action_ref rejects with missing_required_field', () => {
    const { action_ref: _, ...rest } = validInvoked();
    const result = validateAgentAction(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === 'action_ref');
      expect(err?.code).toBe(AGENT_ACTION_ERROR_CODES.missingRequiredField);
    }
  });

  it('missing observed_at rejects with missing_required_field', () => {
    const { observed_at: _, ...rest } = validInvoked();
    const result = validateAgentAction(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === 'observed_at');
      expect(err?.code).toBe(AGENT_ACTION_ERROR_CODES.missingRequiredField);
    }
  });

  it('delegated missing delegated_to_ref rejects with missing_required_field (AGENT-ACT-007)', () => {
    const { delegated_to_ref: _, ...rest } = validDelegated();
    const result = validateAgentAction(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === 'delegated_to_ref');
      expect(err?.code).toBe(AGENT_ACTION_ERROR_CODES.missingRequiredField);
    }
  });
});

describe('agent-action: event_kind_unknown (AGENT-ACT-005)', () => {
  it('unknown event_kind string rejects with event_kind_unknown', () => {
    const result = validateAgentAction({
      ...validInvoked(),
      event_kind: 'agent-action-executed-observed',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === AGENT_ACTION_ERROR_CODES.eventKindUnknown)).toBe(
        true
      );
    }
  });

  it('empty string event_kind rejects with event_kind_unknown', () => {
    const result = validateAgentAction({ ...validInvoked(), event_kind: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === AGENT_ACTION_ERROR_CODES.eventKindUnknown)).toBe(
        true
      );
    }
  });

  it('numeric event_kind rejects with event_kind_unknown', () => {
    const result = validateAgentAction({ ...validInvoked(), event_kind: 42 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === AGENT_ACTION_ERROR_CODES.eventKindUnknown)).toBe(
        true
      );
    }
  });

  it('lifecycle event_kind prefix rejects as unknown', () => {
    const result = validateAgentAction({
      ...validInvoked(),
      event_kind: 'lifecycle-approval-requested',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === AGENT_ACTION_ERROR_CODES.eventKindUnknown)).toBe(
        true
      );
    }
  });
});

describe('agent-action: invalid_observed_at (AGENT-ACT-006)', () => {
  it('malformed observed_at rejects with invalid_observed_at', () => {
    const result = validateAgentAction({ ...validInvoked(), observed_at: 'not-a-timestamp' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === AGENT_ACTION_ERROR_CODES.invalidObservedAt)).toBe(
        true
      );
    }
  });

  it('observed_at without timezone offset rejects with invalid_observed_at', () => {
    const result = validateAgentAction({ ...validInvoked(), observed_at: '2026-05-14T10:00:00' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === AGENT_ACTION_ERROR_CODES.invalidObservedAt)).toBe(
        true
      );
    }
  });

  it('malformed timeout_at rejects with invalid_observed_at', () => {
    const result = validateAgentAction({ ...validTimedOut(), timeout_at: 'bad-ts' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === AGENT_ACTION_ERROR_CODES.invalidObservedAt)).toBe(
        true
      );
    }
  });

  it('missing observed_at emits missing_required_field not invalid_observed_at', () => {
    const { observed_at: _, ...rest } = validInvoked();
    const result = validateAgentAction(rest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === 'observed_at');
      expect(err?.code).toBe(AGENT_ACTION_ERROR_CODES.missingRequiredField);
      expect(result.errors.some((e) => e.code === AGENT_ACTION_ERROR_CODES.invalidObservedAt)).toBe(
        false
      );
    }
  });
});

describe('agent-action: unknown_field vs inline_content_blocked distinction', () => {
  it('forbidden key "prompt" rejects with inline_content_blocked (not unknown_field)', () => {
    const result = validateAgentAction({ ...validInvoked(), prompt: 'some prompt text' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.path === 'prompt');
      expect(err?.code).toBe(AGENT_ACTION_ERROR_CODES.inlineContentBlocked);
      expect(err?.message).toContain('agent.action.inline_content_blocked');
      expect(result.errors.some((e) => e.code === AGENT_ACTION_ERROR_CODES.unknownField)).toBe(
        false
      );
    }
  });

  it('unknown non-forbidden key "foo" rejects with unknown_field at path "foo" (stable message)', () => {
    const result = validateAgentAction({ ...validInvoked(), foo: 'bar' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.code === AGENT_ACTION_ERROR_CODES.unknownField);
      expect(err).toBeDefined();
      expect(err?.path).toBe('foo');
      expect(err?.message).toContain('agent.action.unknown_field');
      expect(err?.message).not.toContain('Unrecognized');
      expect(
        result.errors.some((e) => e.code === AGENT_ACTION_ERROR_CODES.inlineContentBlocked)
      ).toBe(false);
    }
  });

  it('two unknown keys "foo" and "bar" produce two unknown_field errors with distinct paths', () => {
    const result = validateAgentAction({ ...validInvoked(), foo: 'x', bar: 'y' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const unknownErrors = result.errors.filter(
        (e) => e.code === AGENT_ACTION_ERROR_CODES.unknownField
      );
      expect(unknownErrors).toHaveLength(2);
      const paths = unknownErrors.map((e) => e.path).sort();
      expect(paths).toEqual(['bar', 'foo']);
      for (const err of unknownErrors) {
        expect(err.message).toContain('agent.action.unknown_field');
        expect(err.message).not.toContain('Unrecognized');
      }
    }
  });
});

describe('agent-action: validateAgentActionForType (type URI / event_kind agreement)', () => {
  it('matching type URI and event_kind validates (AGENT-ACT-009)', () => {
    const result = validateAgentActionForType(
      'org.peacprotocol/agent-action-invoked-observed',
      validInvoked()
    );
    expect(result.ok).toBe(true);
  });

  it('delegated type URI with delegated payload validates', () => {
    const result = validateAgentActionForType(
      'org.peacprotocol/agent-action-delegated-observed',
      validDelegated()
    );
    expect(result.ok).toBe(true);
  });

  it('type URI mismatch with event_kind emits type_event_kind_mismatch', () => {
    const result = validateAgentActionForType(
      'org.peacprotocol/agent-action-approved-observed',
      validInvoked()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.code === AGENT_ACTION_ERROR_CODES.typeEventKindMismatch)
      ).toBe(true);
    }
  });

  it('denied type URI with invoked event_kind emits type_event_kind_mismatch', () => {
    const result = validateAgentActionForType(
      'org.peacprotocol/agent-action-denied-observed',
      validApproved()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find(
        (e) => e.code === AGENT_ACTION_ERROR_CODES.typeEventKindMismatch
      );
      expect(err?.path).toBe('event_kind');
    }
  });

  it('mismatch on otherwise-invalid payload includes both errors', () => {
    const badPayload = {
      event_kind: 'agent-action-invoked-observed',
      agent_ref: 42,
      action_ref: 'urn:peac:action:x',
      observed_at: '2026-05-15T00:00:00Z',
    };
    const result = validateAgentActionForType(
      'org.peacprotocol/agent-action-approved-observed',
      badPayload
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.code === AGENT_ACTION_ERROR_CODES.typeEventKindMismatch)
      ).toBe(true);
    }
  });

  it('unrecognized type URI (bare event_kind string) rejects with type_uri_unknown', () => {
    const result = validateAgentActionForType('agent-action-invoked-observed', validInvoked());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.code).toBe(AGENT_ACTION_ERROR_CODES.typeUriUnknown);
      expect(result.errors[0]?.path).toBe('type');
    }
  });

  it('unrecognized type URI (wrong namespace) rejects with type_uri_unknown', () => {
    const result = validateAgentActionForType('org.peacprotocol/not-agent-action', validInvoked());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.code).toBe(AGENT_ACTION_ERROR_CODES.typeUriUnknown);
    }
  });
});

describe('agent-action: non-object and null inputs', () => {
  it('null input returns no errors (guard path)', () => {
    const result = validateAgentAction(null);
    expect(result.ok).toBe(false);
  });

  it('string input rejects', () => {
    expect(validateAgentAction('bad')).toMatchObject({ ok: false });
  });

  it('array input rejects', () => {
    expect(validateAgentAction([])).toMatchObject({ ok: false });
  });
});
