# Dispute Attestation Conformance Fixtures (v0.9.27+)

Golden vectors for DisputeAttestation validation and state machine conformance.

## Files

- **valid.json** - Valid dispute attestations in various states
- **invalid.json** - Invalid attestations with expected error codes
- **edge-cases.json** - Edge cases including state transitions and time validation

## Dispute Lifecycle States

```
FILED -> ACKNOWLEDGED -> UNDER_REVIEW -> RESOLVED
           |                |              |
           +-> REJECTED     +-> ESCALATED  +-> APPEALED
                                              |
                                              +-> FINAL
```

### Terminal States (Require Resolution)

- `resolved` - Dispute has been resolved
- `rejected` - Dispute was rejected
- `final` - Final decision after appeal (no further transitions)

### Non-Terminal States

- `filed` - Initial state when dispute is created
- `acknowledged` - Dispute received and assigned
- `under_review` - Active investigation in progress
- `escalated` - Escalated to senior review
- `appealed` - Previous decision being appealed

## State Machine Rules

1. Terminal states (resolved, rejected, final) REQUIRE a resolution field
2. Non-terminal states MUST NOT have a resolution field
3. Transitioning from a terminal state to appealed CLEARS the resolution
4. Final state has no outgoing transitions

## Error Codes (E*DISPUTE*\*)

| Code                                 | HTTP | Description                                |
| ------------------------------------ | ---- | ------------------------------------------ |
| E_DISPUTE_INVALID_FORMAT             | 400  | Schema validation failure                  |
| E_DISPUTE_INVALID_ID                 | 400  | Invalid ULID format                        |
| E_DISPUTE_INVALID_TYPE               | 400  | Unknown dispute type                       |
| E_DISPUTE_INVALID_TARGET_TYPE        | 400  | Unknown target type                        |
| E_DISPUTE_INVALID_GROUNDS            | 400  | Unknown grounds code                       |
| E_DISPUTE_INVALID_STATE              | 400  | Unknown state value                        |
| E_DISPUTE_INVALID_TRANSITION         | 400  | Invalid state transition                   |
| E_DISPUTE_MISSING_RESOLUTION         | 400  | Resolution required for terminal state     |
| E_DISPUTE_RESOLUTION_NOT_ALLOWED     | 400  | Resolution provided for non-terminal state |
| E_DISPUTE_NOT_YET_VALID              | 401  | issued_at in future (retriable)            |
| E_DISPUTE_EXPIRED                    | 401  | Attestation expired                        |
| E_DISPUTE_OTHER_REQUIRES_DESCRIPTION | 400  | 'other' type needs 50+ char description    |
| E_DISPUTE_DUPLICATE                  | 409  | Duplicate dispute ID                       |
| E_DISPUTE_TARGET_NOT_FOUND           | 404  | Target not found (retriable)               |

## ULID Format

Dispute IDs use ULID format (26 uppercase alphanumeric characters):

- Crockford Base32 encoding (excludes I, L, O, U)
- PEAC requires UPPERCASE canonical form
- Example: `01ARZ3NDEKTSV4RRFFQ69G5FAV`

## Fixture Categories

### Valid Fixtures (valid.json)

- Minimal dispute in filed state
- Disputes targeting receipts, attributions, identities, policies
- All lifecycle states with proper resolution for terminal states
- Various contact methods (email, URL, DID)
- Supporting documents with content hashes
- Resolved disputes with all outcome types
- Remediation examples

### Invalid Fixtures (invalid.json)

- Missing required fields (type, issuer, issued_at, ref)
- Invalid ULID formats (too short, lowercase, invalid chars)
- Unknown enum values (dispute_type, target_type, state, grounds)
- State/resolution invariant violations
- Contact validation failures
- Exceeding limits (too many grounds)

### Edge Cases (edge-cases.json)

- Maximum allowed values (10 grounds, exactly 50 char description for 'other')
- State transition validation vectors
- All valid enum values for each field
- ULID boundary characters
- Time validation (future issued_at, expired attestations)

## Usage

```typescript
import validFixtures from './valid.json';
import invalidFixtures from './invalid.json';
import edgeCases from './edge-cases.json';

// Schema validation
for (const fixture of validFixtures.fixtures) {
  const result = DisputeAttestationSchema.safeParse(fixture.input);
  assert(result.success === fixture.expected.valid);
}

// Error code verification
for (const fixture of invalidFixtures.fixtures) {
  const result = validateDisputeAttestation(fixture.input);
  assert(!result.ok);
  // Map Zod error to expected error code based on field path and message
}

// State transition testing
for (const fixture of edgeCases.fixtures.filter((f) => f.transition_test)) {
  const result = transitionDisputeState(
    fixture.input,
    fixture.to_state,
    'Test',
    fixture.resolution
  );
  assert(result.ok === fixture.expected.valid_transition);
}
```

## Cross-Implementation Notes

1. **ULID Case Sensitivity**: PEAC enforces uppercase. Implementations MAY normalize lowercase to uppercase before validation but SHOULD warn.

2. **Time Validation**: Schema validation does not reject future timestamps or expired attestations. Runtime validation (via `isDisputeNotYetValid()` and `isDisputeExpired()`) handles time-based checks.

3. **Resolution Clearing**: When transitioning from a terminal state (resolved, rejected) to appealed, the previous resolution MUST be cleared from the attestation.

4. **Error Code Mapping**: The error codes in invalid fixtures represent the EXPECTED error. Implementations may need to map from their internal error representation.
