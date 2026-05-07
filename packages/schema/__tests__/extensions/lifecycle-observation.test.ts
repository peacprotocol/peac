/**
 * lifecycle-observation schema validator tests.
 *
 * Exercises the no-inline-value invariant, the opaque-reference grammar,
 * the approver_ref priority chain, the observed_at missing/malformed
 * split, the per-event-kind required-field discriminated union, and the
 * unknown event_kind rejection. Multilingual name strings (English,
 * Devanagari, Han, Cyrillic) are rejected uniformly via the
 * no-whitespace + missing-prefix grammar rules without language-specific
 * heuristics.
 */
import { describe, it, expect } from 'vitest';
import {
  FORBIDDEN_TOP_LEVEL_KEYS,
  LIFECYCLE_OBSERVATION_ERROR_CODES,
  LifecycleObservationSchema,
  validateLifecycleObservation,
} from '../../src/extensions/lifecycle-observation';

const validApprovalRequest = () => ({
  event_kind: 'lifecycle-approval-requested',
  subject_ref: 'urn:peac:task:approval-001',
  observed_at: '2026-05-12T10:00:00Z',
  approval_ref: 'urn:peac:approval:req-001',
  approver_ref: 'ref:approver-pseudonym-001',
});

const validEvaluationCompleted = () => ({
  event_kind: 'lifecycle-evaluation-completed',
  subject_ref: 'urn:peac:eval:run-004',
  observed_at: '2026-05-12T11:10:00Z',
  result_ref: 'urn:peac:result:eval-completed',
});

const validWorkflowTransition = () => ({
  event_kind: 'lifecycle-workflow-transition',
  subject_ref: 'urn:peac:task:wf-008',
  observed_at: '2026-05-12T13:00:00Z',
  from_state: 'pending',
  to_state: 'running',
});

describe('lifecycle-observation: positive cases', () => {
  for (const eventKind of [
    'lifecycle-approval-requested',
    'lifecycle-approval-granted',
    'lifecycle-approval-denied',
  ] as const) {
    it(`${eventKind}: minimum-required fields validate`, () => {
      const obs = { ...validApprovalRequest(), event_kind: eventKind };
      const result = validateLifecycleObservation(obs);
      expect(result.ok).toBe(true);
    });
  }

  it('lifecycle-evaluation-started: minimum-required fields validate', () => {
    const result = validateLifecycleObservation({
      event_kind: 'lifecycle-evaluation-started',
      subject_ref: 'urn:peac:eval:run-x',
      observed_at: '2026-05-12T11:00:00Z',
    });
    expect(result.ok).toBe(true);
  });

  it('lifecycle-evaluation-completed: result_ref required and accepted', () => {
    expect(validateLifecycleObservation(validEvaluationCompleted()).ok).toBe(true);
  });

  it('lifecycle-experiment-assigned: experiment_ref required and accepted', () => {
    const result = validateLifecycleObservation({
      event_kind: 'lifecycle-experiment-assigned',
      subject_ref: 'urn:peac:subject:user-006',
      observed_at: '2026-05-12T12:00:00Z',
      experiment_ref: 'urn:peac:experiment:onboarding-flow',
    });
    expect(result.ok).toBe(true);
  });

  it('lifecycle-experiment-result: experiment_ref + result_ref required and accepted', () => {
    const result = validateLifecycleObservation({
      event_kind: 'lifecycle-experiment-result',
      subject_ref: 'urn:peac:subject:user-006',
      observed_at: '2026-05-12T12:30:00Z',
      experiment_ref: 'urn:peac:experiment:onboarding-flow',
      result_ref: 'urn:peac:result:exp-result',
    });
    expect(result.ok).toBe(true);
  });

  it('lifecycle-workflow-transition: from_state + to_state required and accepted', () => {
    expect(validateLifecycleObservation(validWorkflowTransition()).ok).toBe(true);
  });

  it('lifecycle-mode-observed: observed_mode required and accepted', () => {
    const result = validateLifecycleObservation({
      event_kind: 'lifecycle-mode-observed',
      subject_ref: 'urn:peac:run:mode-009',
      observed_at: '2026-05-12T14:00:00Z',
      observed_mode: 'agent_loop',
    });
    expect(result.ok).toBe(true);
  });

  it('approver_ref accepts a recognized opaque-reference (no @, recognized prefix)', () => {
    const result = validateLifecycleObservation({
      ...validApprovalRequest(),
      approver_ref: 'ref:alice-pseudonym-001',
    });
    expect(result.ok).toBe(true);
  });
});

describe('lifecycle-observation: forbidden top-level keys (no-inline-value invariant)', () => {
  it('contains the locked 20-key list (closed enum)', () => {
    expect(FORBIDDEN_TOP_LEVEL_KEYS).toHaveLength(20);
  });

  for (const forbidden of FORBIDDEN_TOP_LEVEL_KEYS) {
    it(`rejects top-level "${forbidden}" with lifecycle.inline_value_blocked`, () => {
      const observation = { ...validEvaluationCompleted(), [forbidden]: 'whatever' };
      const result = validateLifecycleObservation(observation);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(
          result.errors.some(
            (e) =>
              e.code === LIFECYCLE_OBSERVATION_ERROR_CODES.inlineValueBlocked &&
              e.path === forbidden
          )
        ).toBe(true);
      }
    });
  }
});

describe('lifecycle-observation: opaque-reference grammar (numeric strings, multilingual names)', () => {
  it('rejects numeric-string result_ref with lifecycle.opaque_ref_grammar_violation (NOT inline_value_blocked)', () => {
    const result = validateLifecycleObservation({
      ...validEvaluationCompleted(),
      result_ref: '0.92',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.opaqueRefGrammarViolation);
      expect(codes).not.toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.inlineValueBlocked);
    }
  });

  for (const [label, value] of [
    ['English-name approver_ref', 'Alice Smith'],
    ['Devanagari-name approver_ref', 'अलिस स्मिथ'],
    ['Han-name approver_ref', '李 明'],
    ['Cyrillic-name approver_ref', 'Алиса Смит'],
  ] as const) {
    it(`rejects ${label} with lifecycle.opaque_ref_grammar_violation (no language-specific heuristic)`, () => {
      const result = validateLifecycleObservation({
        ...validApprovalRequest(),
        approver_ref: value,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const codes = result.errors.map((e) => e.code);
        expect(codes).toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.opaqueRefGrammarViolation);
      }
    });
  }

  it('rejects subject_ref starting with JSON-structural character with grammar violation', () => {
    const result = validateLifecycleObservation({
      ...validWorkflowTransition(),
      subject_ref: '{"smuggled": "payload"}',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.code === LIFECYCLE_OBSERVATION_ERROR_CODES.opaqueRefGrammarViolation
        )
      ).toBe(true);
    }
  });

  it('rejects *_ref with whitespace (no-whitespace rule)', () => {
    const result = validateLifecycleObservation({
      ...validWorkflowTransition(),
      subject_ref: 'urn:peac:task with space',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.code === LIFECYCLE_OBSERVATION_ERROR_CODES.opaqueRefGrammarViolation
        )
      ).toBe(true);
    }
  });

  it('rejects *_ref with no recognized prefix', () => {
    const result = validateLifecycleObservation({
      ...validWorkflowTransition(),
      subject_ref: 'arbitrary-no-prefix',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (e) => e.code === LIFECYCLE_OBSERVATION_ERROR_CODES.opaqueRefGrammarViolation
        )
      ).toBe(true);
    }
  });
});

describe('lifecycle-observation: approver_ref priority chain', () => {
  it('non-string approver_ref (number) -> lifecycle.ref_must_be_string', () => {
    const result = validateLifecycleObservation({
      ...validApprovalRequest(),
      approver_ref: 42,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.refMustBeString);
      expect(codes).not.toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.approverRefPiiBlocked);
      expect(codes).not.toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.opaqueRefGrammarViolation);
    }
  });

  it('non-string approver_ref (object) -> lifecycle.ref_must_be_string', () => {
    const result = validateLifecycleObservation({
      ...validApprovalRequest(),
      approver_ref: { name: 'Alice' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.code === LIFECYCLE_OBSERVATION_ERROR_CODES.refMustBeString)
      ).toBe(true);
    }
  });

  it('email-shape approver_ref -> lifecycle.approver_ref_pii_blocked (priority over general grammar)', () => {
    const result = validateLifecycleObservation({
      ...validApprovalRequest(),
      approver_ref: 'alice@example.com',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.approverRefPiiBlocked);
    }
  });

  it('whitespace approver_ref (no @) -> lifecycle.opaque_ref_grammar_violation (general grammar)', () => {
    const result = validateLifecycleObservation({
      ...validApprovalRequest(),
      approver_ref: 'alice smith',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.opaqueRefGrammarViolation);
      expect(codes).not.toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.approverRefPiiBlocked);
    }
  });

  it('numeric-string approver_ref ("0.92") -> lifecycle.opaque_ref_grammar_violation', () => {
    const result = validateLifecycleObservation({
      ...validApprovalRequest(),
      approver_ref: '0.92',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.opaqueRefGrammarViolation);
    }
  });

  it('valid opaque-reference approver_ref ("ref:alice-pseudonym-001") -> ACCEPTED', () => {
    const result = validateLifecycleObservation({
      ...validApprovalRequest(),
      approver_ref: 'ref:alice-pseudonym-001',
    });
    expect(result.ok).toBe(true);
  });

  it('does not leak Zod string-type messages as public diagnostics for non-string ref', () => {
    const result = validateLifecycleObservation({
      ...validApprovalRequest(),
      approver_ref: 42,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The stable lifecycle code MUST be present.
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.refMustBeString);
      // No code outside the lifecycle namespace should leak.
      for (const c of codes) {
        expect(c.startsWith('lifecycle.')).toBe(true);
      }
    }
  });
});

describe('lifecycle-observation: per-event-kind required fields', () => {
  it('approval-granted without approver_ref -> lifecycle.missing_required_field', () => {
    const obs = validApprovalRequest();
    delete (obs as Record<string, unknown>).approver_ref;
    const result = validateLifecycleObservation({
      ...obs,
      event_kind: 'lifecycle-approval-granted',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.code === LIFECYCLE_OBSERVATION_ERROR_CODES.missingRequiredField)
      ).toBe(true);
    }
  });

  it('evaluation-completed without result_ref -> lifecycle.missing_required_field', () => {
    const obs = validEvaluationCompleted();
    delete (obs as Record<string, unknown>).result_ref;
    const result = validateLifecycleObservation(obs);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.code === LIFECYCLE_OBSERVATION_ERROR_CODES.missingRequiredField)
      ).toBe(true);
    }
  });

  it('experiment-assigned without experiment_ref -> lifecycle.missing_required_field', () => {
    const result = validateLifecycleObservation({
      event_kind: 'lifecycle-experiment-assigned',
      subject_ref: 'urn:peac:subject:x',
      observed_at: '2026-05-12T12:00:00Z',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.code === LIFECYCLE_OBSERVATION_ERROR_CODES.missingRequiredField)
      ).toBe(true);
    }
  });

  it('workflow-transition without to_state -> lifecycle.missing_required_field', () => {
    const obs = validWorkflowTransition();
    delete (obs as Record<string, unknown>).to_state;
    const result = validateLifecycleObservation(obs);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.code === LIFECYCLE_OBSERVATION_ERROR_CODES.missingRequiredField)
      ).toBe(true);
    }
  });

  it('mode-observed without observed_mode -> lifecycle.missing_required_field', () => {
    const result = validateLifecycleObservation({
      event_kind: 'lifecycle-mode-observed',
      subject_ref: 'urn:peac:run:m',
      observed_at: '2026-05-12T14:00:00Z',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.code === LIFECYCLE_OBSERVATION_ERROR_CODES.missingRequiredField)
      ).toBe(true);
    }
  });
});

describe('lifecycle-observation: observed_at split (missing vs malformed)', () => {
  it('missing observed_at -> lifecycle.missing_required_field', () => {
    const obs = validWorkflowTransition();
    delete (obs as Record<string, unknown>).observed_at;
    const result = validateLifecycleObservation(obs);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.missingRequiredField);
      expect(codes).not.toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.invalidObservedAt);
    }
  });

  it('malformed observed_at (non-RFC-3339 string) -> lifecycle.invalid_observed_at', () => {
    const result = validateLifecycleObservation({
      ...validWorkflowTransition(),
      observed_at: 'yesterday afternoon',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.invalidObservedAt);
      expect(codes).not.toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.missingRequiredField);
    }
  });
});

describe('lifecycle-observation: unknown event_kind', () => {
  it('event_kind not in the 9-literal enum -> lifecycle.event_kind_unknown', () => {
    const result = validateLifecycleObservation({
      event_kind: 'lifecycle-something-else',
      subject_ref: 'urn:peac:task:x',
      observed_at: '2026-05-12T10:00:00Z',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.eventKindUnknown);
    }
  });

  it('missing event_kind -> lifecycle.missing_required_field', () => {
    const result = validateLifecycleObservation({
      subject_ref: 'urn:peac:task:x',
      observed_at: '2026-05-12T10:00:00Z',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.missingRequiredField);
    }
  });
});

describe('lifecycle-observation: non-ref field error codes', () => {
  it('non-string from_state (number) -> lifecycle.invalid_state', () => {
    const result = validateLifecycleObservation({
      ...validWorkflowTransition(),
      from_state: 123,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.invalidState);
      expect(codes).not.toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.refMustBeString);
      expect(codes).not.toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.opaqueRefGrammarViolation);
    }
  });

  it('non-string to_state (object) -> lifecycle.invalid_state', () => {
    const result = validateLifecycleObservation({
      ...validWorkflowTransition(),
      to_state: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.code === LIFECYCLE_OBSERVATION_ERROR_CODES.invalidState)
      ).toBe(true);
    }
  });

  it('empty from_state -> lifecycle.invalid_state', () => {
    const result = validateLifecycleObservation({
      ...validWorkflowTransition(),
      from_state: '',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.code === LIFECYCLE_OBSERVATION_ERROR_CODES.invalidState)
      ).toBe(true);
    }
  });

  it('from_state with leading whitespace is rejected (no silent trim)', () => {
    const result = validateLifecycleObservation({
      ...validWorkflowTransition(),
      from_state: ' pending ',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.code === LIFECYCLE_OBSERVATION_ERROR_CODES.invalidState)
      ).toBe(true);
    }
  });

  it('multi-byte from_state value is preserved exactly when accepted', () => {
    const obs = {
      ...validWorkflowTransition(),
      from_state: 'процесс-ожидание',
      to_state: 'процесс-выполняется',
    };
    const result = validateLifecycleObservation(obs);
    expect(result.ok).toBe(true);
    if (result.ok && 'from_state' in result.value) {
      expect(result.value.from_state).toBe('процесс-ожидание');
      expect(result.value.to_state).toBe('процесс-выполняется');
    }
  });

  it('over-length from_state (over 256 UTF-8 bytes) -> lifecycle.invalid_state', () => {
    const tooLong = 'x'.repeat(257);
    const result = validateLifecycleObservation({
      ...validWorkflowTransition(),
      from_state: tooLong,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.code === LIFECYCLE_OBSERVATION_ERROR_CODES.invalidState)
      ).toBe(true);
    }
  });

  it('observed_mode out of enum ("bad-mode") -> lifecycle.invalid_observed_mode', () => {
    const result = validateLifecycleObservation({
      event_kind: 'lifecycle-mode-observed',
      subject_ref: 'urn:peac:run:bad',
      observed_at: '2026-05-12T14:00:00Z',
      observed_mode: 'bad-mode',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.errors.map((e) => e.code);
      expect(codes).toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.invalidObservedMode);
      expect(codes).not.toContain(LIFECYCLE_OBSERVATION_ERROR_CODES.opaqueRefGrammarViolation);
    }
  });

  it('non-string observed_mode (number) -> lifecycle.invalid_observed_mode', () => {
    const result = validateLifecycleObservation({
      event_kind: 'lifecycle-mode-observed',
      subject_ref: 'urn:peac:run:bad',
      observed_at: '2026-05-12T14:00:00Z',
      observed_mode: 42,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some((e) => e.code === LIFECYCLE_OBSERVATION_ERROR_CODES.invalidObservedMode)
      ).toBe(true);
    }
  });
});

describe('lifecycle-observation: schema (LifecycleObservationSchema) direct safeParse', () => {
  it('accepts canonical positive vector via discriminated union', () => {
    const result = LifecycleObservationSchema.safeParse(validApprovalRequest());
    expect(result.success).toBe(true);
  });

  it('rejects unknown variant key with strict()', () => {
    const result = LifecycleObservationSchema.safeParse({
      ...validApprovalRequest(),
      unknown_field: 'value',
    });
    expect(result.success).toBe(false);
  });
});
