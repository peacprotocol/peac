package policy

import (
	"testing"
)

// Conformance tests from validation.json - valid policies

func TestValidate_MinimalPolicy(t *testing.T) {
	// policy-valid-001: Minimal valid policy with one rule
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Rules: []PolicyRule{
			{Name: "default-deny", Decision: Deny},
		},
	}

	if err := Validate(policy); err != nil {
		t.Errorf("Validate() error = %v, want nil", err)
	}
}

func TestValidate_FullPolicy(t *testing.T) {
	// policy-valid-002: Policy with all optional fields
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Name:    "Full Policy",
		Defaults: &PolicyDefaults{
			Decision: Deny,
			Reason:   "Default deny",
		},
		Rules: []PolicyRule{
			{
				Name: "allow-all",
				Subject: &SubjectMatcher{
					Type:   Human,
					Labels: []string{"verified"},
					ID:     "user:*",
				},
				Purpose:       Purposes{PurposeCrawl, PurposeIndex},
				LicensingMode: LicensingModes{LicensingSubscription, LicensingPayPerCrawl},
				Decision:      Allow,
				Reason:        "Allow verified humans",
			},
		},
	}

	if err := Validate(policy); err != nil {
		t.Errorf("Validate() error = %v, want nil", err)
	}
}

func TestValidate_MultipleRules(t *testing.T) {
	// policy-valid-003: Policy with multiple rules
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Rules: []PolicyRule{
			{Name: "rule-1", Decision: Allow},
			{Name: "rule-2", Decision: Review},
			{Name: "rule-3", Decision: Deny},
		},
	}

	if err := Validate(policy); err != nil {
		t.Errorf("Validate() error = %v, want nil", err)
	}
}

func TestValidate_EmptyRulesWithDefaults(t *testing.T) {
	// policy-valid-004: Empty rules array is valid when defaults are provided
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Defaults: &PolicyDefaults{
			Decision: Deny,
			Reason:   "No rules defined",
		},
		Rules: []PolicyRule{},
	}

	if err := Validate(policy); err != nil {
		t.Errorf("Validate() error = %v, want nil", err)
	}
}

// Conformance tests from validation.json - invalid policies

func TestValidate_WrongVersion(t *testing.T) {
	// policy-invalid-001: Invalid policy version
	policy := &PolicyDocument{
		Version: "peac-policy/0.2",
		Rules: []PolicyRule{
			{Name: "default", Decision: Deny},
		},
	}

	err := Validate(policy)
	if err == nil {
		t.Fatal("Validate() error = nil, want error")
	}

	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	if ve.Code != ErrCodeInvalidPolicyVersion {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeInvalidPolicyVersion)
	}
}

func TestValidate_MissingVersion(t *testing.T) {
	// policy-invalid-002: Missing required version field
	policy := &PolicyDocument{
		Rules: []PolicyRule{
			{Name: "default", Decision: Deny},
		},
	}

	err := Validate(policy)
	if err == nil {
		t.Fatal("Validate() error = nil, want error")
	}

	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	if ve.Code != ErrCodeInvalidPolicy {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeInvalidPolicy)
	}
	if ve.Field != "version" {
		t.Errorf("error field = %s, want version", ve.Field)
	}
}

func TestValidate_MissingRules(t *testing.T) {
	// policy-invalid-003: Missing required rules array
	policy := &PolicyDocument{
		Version: PolicyVersion,
	}

	err := Validate(policy)
	if err == nil {
		t.Fatal("Validate() error = nil, want error")
	}

	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	if ve.Code != ErrCodeInvalidPolicy {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeInvalidPolicy)
	}
	if ve.Field != "rules" {
		t.Errorf("error field = %s, want rules", ve.Field)
	}
}

func TestValidate_InvalidDecision(t *testing.T) {
	// policy-invalid-004: Decision must be allow, deny, or review
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Rules: []PolicyRule{
			{Name: "invalid", Decision: Decision("maybe")},
		},
	}

	err := Validate(policy)
	if err == nil {
		t.Fatal("Validate() error = nil, want error")
	}

	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	if ve.Code != ErrCodeInvalidPolicy {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeInvalidPolicy)
	}
	if ve.Field != "rules[0].decision" {
		t.Errorf("error field = %s, want rules[0].decision", ve.Field)
	}
}

func TestValidate_RuleMissingName(t *testing.T) {
	// policy-invalid-006: Rule must have a name
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Rules: []PolicyRule{
			{Decision: Deny},
		},
	}

	err := Validate(policy)
	if err == nil {
		t.Fatal("Validate() error = nil, want error")
	}

	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	if ve.Code != ErrCodeInvalidPolicy {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeInvalidPolicy)
	}
	if ve.Field != "rules[0].name" {
		t.Errorf("error field = %s, want rules[0].name", ve.Field)
	}
}

func TestValidate_RuleMissingDecision(t *testing.T) {
	// policy-invalid-007: Rule must have a decision
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Rules: []PolicyRule{
			{Name: "no-decision"},
		},
	}

	err := Validate(policy)
	if err == nil {
		t.Fatal("Validate() error = nil, want error")
	}

	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	if ve.Code != ErrCodeInvalidPolicy {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeInvalidPolicy)
	}
	if ve.Field != "rules[0].decision" {
		t.Errorf("error field = %s, want rules[0].decision", ve.Field)
	}
}

// Additional validation tests

func TestValidate_InvalidDefaultsDecision(t *testing.T) {
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Defaults: &PolicyDefaults{
			Decision: Decision("invalid"),
		},
		Rules: []PolicyRule{
			{Name: "test", Decision: Allow},
		},
	}

	err := Validate(policy)
	if err == nil {
		t.Fatal("Validate() error = nil, want error")
	}

	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	if ve.Field != "defaults.decision" {
		t.Errorf("error field = %s, want defaults.decision", ve.Field)
	}
}

func TestValidationError_Error(t *testing.T) {
	t.Run("with field", func(t *testing.T) {
		e := &ValidationError{
			Code:    ErrCodeInvalidPolicy,
			Message: "version is required",
			Field:   "version",
		}
		expected := "E_INVALID_POLICY: version is required (field: version)"
		if e.Error() != expected {
			t.Errorf("Error() = %s, want %s", e.Error(), expected)
		}
	})

	t.Run("without field", func(t *testing.T) {
		e := &ValidationError{
			Code:    ErrCodeInvalidPolicy,
			Message: "policy is nil",
		}
		expected := "E_INVALID_POLICY: policy is nil"
		if e.Error() != expected {
			t.Errorf("Error() = %s, want %s", e.Error(), expected)
		}
	})
}

func TestMustValidate_Success(t *testing.T) {
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Rules: []PolicyRule{
			{Name: "test", Decision: Allow},
		},
	}

	// Should not panic
	MustValidate(policy)
}

func TestMustValidate_Panic(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("MustValidate() should panic on invalid policy")
		}
	}()

	policy := &PolicyDocument{} // Missing version and rules
	MustValidate(policy)
}

func TestIsValid(t *testing.T) {
	validPolicy := &PolicyDocument{
		Version: PolicyVersion,
		Rules: []PolicyRule{
			{Name: "test", Decision: Allow},
		},
	}

	invalidPolicy := &PolicyDocument{} // Missing version and rules

	if !IsValid(validPolicy) {
		t.Error("IsValid() = false for valid policy, want true")
	}
	if IsValid(invalidPolicy) {
		t.Error("IsValid() = true for invalid policy, want false")
	}
}

// Nil policy tests

func TestValidate_NilPolicy(t *testing.T) {
	err := Validate(nil)
	if err == nil {
		t.Fatal("Validate(nil) error = nil, want error")
	}

	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	if ve.Code != ErrCodeInvalidPolicy {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeInvalidPolicy)
	}
	if ve.Message != "policy is nil" {
		t.Errorf("error message = %q, want %q", ve.Message, "policy is nil")
	}
}

func TestIsValid_NilPolicy(t *testing.T) {
	if IsValid(nil) {
		t.Error("IsValid(nil) = true, want false")
	}
}

func TestMustValidate_NilPolicy(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("MustValidate(nil) should panic")
		}
	}()
	MustValidate(nil)
}

// Unknown enum value tests

func TestValidate_UnknownSubjectType(t *testing.T) {
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Rules: []PolicyRule{
			{
				Name:     "test-rule",
				Decision: Allow,
				Subject: &SubjectMatcher{
					Type: SubjectType("robot"), // Unknown type
				},
			},
		},
	}

	err := Validate(policy)
	if err == nil {
		t.Fatal("Validate() error = nil, want error for unknown SubjectType")
	}

	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	if ve.Code != ErrCodeInvalidPolicyEnum {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeInvalidPolicyEnum)
	}
	if ve.Field != "rules[0].subject.type" {
		t.Errorf("error field = %s, want rules[0].subject.type", ve.Field)
	}
}

func TestValidate_UnknownPurpose(t *testing.T) {
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Rules: []PolicyRule{
			{
				Name:     "test-rule",
				Decision: Allow,
				Purpose:  Purposes{ControlPurpose("unknown_purpose")},
			},
		},
	}

	err := Validate(policy)
	if err == nil {
		t.Fatal("Validate() error = nil, want error for unknown Purpose")
	}

	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	if ve.Code != ErrCodeInvalidPolicyEnum {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeInvalidPolicyEnum)
	}
	if ve.Field != "rules[0].purpose[0]" {
		t.Errorf("error field = %s, want rules[0].purpose[0]", ve.Field)
	}
}

func TestValidate_UnknownLicensingMode(t *testing.T) {
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Rules: []PolicyRule{
			{
				Name:          "test-rule",
				Decision:      Allow,
				LicensingMode: LicensingModes{ControlLicensingMode("freemium")},
			},
		},
	}

	err := Validate(policy)
	if err == nil {
		t.Fatal("Validate() error = nil, want error for unknown LicensingMode")
	}

	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	if ve.Code != ErrCodeInvalidPolicyEnum {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeInvalidPolicyEnum)
	}
	if ve.Field != "rules[0].licensing_mode[0]" {
		t.Errorf("error field = %s, want rules[0].licensing_mode[0]", ve.Field)
	}
}

func TestValidate_EmptyPurposeInArray(t *testing.T) {
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Rules: []PolicyRule{
			{
				Name:     "test-rule",
				Decision: Allow,
				Purpose:  Purposes{""}, // Empty purpose in array
			},
		},
	}

	err := Validate(policy)
	if err == nil {
		t.Fatal("Validate() error = nil, want error for empty Purpose in array")
	}

	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	if ve.Code != ErrCodeInvalidPolicyEnum {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeInvalidPolicyEnum)
	}
}

func TestValidate_EmptyLicensingModeInArray(t *testing.T) {
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Rules: []PolicyRule{
			{
				Name:          "test-rule",
				Decision:      Allow,
				LicensingMode: LicensingModes{""}, // Empty mode in array
			},
		},
	}

	err := Validate(policy)
	if err == nil {
		t.Fatal("Validate() error = nil, want error for empty LicensingMode in array")
	}

	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	if ve.Code != ErrCodeInvalidPolicyEnum {
		t.Errorf("error code = %s, want %s", ve.Code, ErrCodeInvalidPolicyEnum)
	}
}

func TestValidate_ValidEnumValues(t *testing.T) {
	// All known enum values should be valid
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Rules: []PolicyRule{
			{
				Name:     "test-human",
				Decision: Allow,
				Subject: &SubjectMatcher{
					Type: Human,
				},
				Purpose:       Purposes{PurposeCrawl, PurposeIndex, PurposeTrain, PurposeInference, PurposeAiInput, PurposeAiIndex, PurposeSearch},
				LicensingMode: LicensingModes{LicensingSubscription, LicensingPayPerInference, LicensingPayPerCrawl},
			},
			{
				Name:     "test-agent",
				Decision: Deny,
				Subject: &SubjectMatcher{
					Type: Agent,
				},
			},
			{
				Name:     "test-org",
				Decision: Review,
				Subject: &SubjectMatcher{
					Type: Org,
				},
			},
		},
	}

	if err := Validate(policy); err != nil {
		t.Errorf("Validate() error = %v, want nil for valid enum values", err)
	}
}

func TestValidate_MultipleUnknownEnums(t *testing.T) {
	// First unknown enum is reported
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Rules: []PolicyRule{
			{
				Name:          "test-rule",
				Decision:      Allow,
				Purpose:       Purposes{ControlPurpose("bad_purpose")},
				LicensingMode: LicensingModes{ControlLicensingMode("bad_mode")},
			},
		},
	}

	err := Validate(policy)
	if err == nil {
		t.Fatal("Validate() error = nil, want error")
	}

	ve, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	// Purpose is validated before LicensingMode, so it should be reported first
	if ve.Field != "rules[0].purpose[0]" {
		t.Errorf("error field = %s, want rules[0].purpose[0]", ve.Field)
	}
}
