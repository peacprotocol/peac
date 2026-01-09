package policy

import (
	"fmt"
)

// ValidationError represents a policy validation error.
type ValidationError struct {
	Code    string
	Message string
	Field   string
}

func (e *ValidationError) Error() string {
	if e.Field != "" {
		return fmt.Sprintf("%s: %s (field: %s)", e.Code, e.Message, e.Field)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Error codes for policy validation.
const (
	ErrCodeInvalidPolicy        = "E_INVALID_POLICY"
	ErrCodeInvalidPolicyVersion = "E_INVALID_POLICY_VERSION"
	ErrCodeInvalidPolicyEnum    = "E_INVALID_POLICY_ENUM"
)

// Validate validates a policy document.
// Returns nil if valid, or a ValidationError if invalid.
//
// Validates:
//   - Policy is not nil
//   - Version is supported
//   - Rules array is present
//   - All rules have names and valid decisions
//   - All enum values (SubjectType, Purpose, LicensingMode) are known
func Validate(policy *PolicyDocument) error {
	// Guard against nil policy
	if policy == nil {
		return &ValidationError{
			Code:    ErrCodeInvalidPolicy,
			Message: "policy is nil",
		}
	}

	// Check version
	if policy.Version == "" {
		return &ValidationError{
			Code:    ErrCodeInvalidPolicy,
			Message: "version is required",
			Field:   "version",
		}
	}

	if policy.Version != PolicyVersion {
		return &ValidationError{
			Code:    ErrCodeInvalidPolicyVersion,
			Message: fmt.Sprintf("unsupported version: %s (expected %s)", policy.Version, PolicyVersion),
			Field:   "version",
		}
	}

	// Check rules array exists
	if policy.Rules == nil {
		return &ValidationError{
			Code:    ErrCodeInvalidPolicy,
			Message: "rules is required",
			Field:   "rules",
		}
	}

	// Validate each rule
	for i, rule := range policy.Rules {
		if err := validateRule(&rule, i); err != nil {
			return err
		}
	}

	// Validate defaults if present
	if policy.Defaults != nil {
		if err := validateDecision(policy.Defaults.Decision, "defaults.decision"); err != nil {
			return err
		}
	}

	return nil
}

// validateRule validates a single policy rule.
func validateRule(rule *PolicyRule, index int) error {
	fieldPrefix := fmt.Sprintf("rules[%d]", index)

	// Check name
	if rule.Name == "" {
		return &ValidationError{
			Code:    ErrCodeInvalidPolicy,
			Message: "rule name is required",
			Field:   fieldPrefix + ".name",
		}
	}

	// Check decision
	if err := validateDecision(rule.Decision, fieldPrefix+".decision"); err != nil {
		return err
	}

	// Validate subject matcher enums
	if rule.Subject != nil {
		if err := validateSubjectType(rule.Subject.Type, fieldPrefix+".subject.type"); err != nil {
			return err
		}
	}

	// Validate purposes
	for i, p := range rule.Purpose {
		field := fmt.Sprintf("%s.purpose[%d]", fieldPrefix, i)
		if err := validatePurpose(p, field); err != nil {
			return err
		}
	}

	// Validate licensing modes
	for i, m := range rule.LicensingMode {
		field := fmt.Sprintf("%s.licensing_mode[%d]", fieldPrefix, i)
		if err := validateLicensingMode(m, field); err != nil {
			return err
		}
	}

	return nil
}

// validateDecision validates a decision value.
func validateDecision(decision Decision, field string) error {
	switch decision {
	case Allow, Deny, Review:
		return nil
	case "":
		return &ValidationError{
			Code:    ErrCodeInvalidPolicy,
			Message: "decision is required",
			Field:   field,
		}
	default:
		return &ValidationError{
			Code:    ErrCodeInvalidPolicy,
			Message: fmt.Sprintf("invalid decision: %s (must be allow, deny, or review)", decision),
			Field:   field,
		}
	}
}

// validateSubjectType validates a subject type value.
// Empty is allowed (means any type).
func validateSubjectType(st SubjectType, field string) error {
	switch st {
	case "", Human, Agent, Org:
		return nil
	default:
		return &ValidationError{
			Code:    ErrCodeInvalidPolicyEnum,
			Message: fmt.Sprintf("unknown subject type: %s (must be human, agent, or org)", st),
			Field:   field,
		}
	}
}

// validatePurpose validates a control purpose value.
func validatePurpose(p ControlPurpose, field string) error {
	switch p {
	case PurposeCrawl, PurposeIndex, PurposeTrain, PurposeInference,
		PurposeAiInput, PurposeAiIndex, PurposeSearch:
		return nil
	case "":
		return &ValidationError{
			Code:    ErrCodeInvalidPolicyEnum,
			Message: "purpose cannot be empty",
			Field:   field,
		}
	default:
		return &ValidationError{
			Code:    ErrCodeInvalidPolicyEnum,
			Message: fmt.Sprintf("unknown purpose: %s", p),
			Field:   field,
		}
	}
}

// validateLicensingMode validates a licensing mode value.
func validateLicensingMode(m ControlLicensingMode, field string) error {
	switch m {
	case LicensingSubscription, LicensingPayPerInference, LicensingPayPerCrawl:
		return nil
	case "":
		return &ValidationError{
			Code:    ErrCodeInvalidPolicyEnum,
			Message: "licensing mode cannot be empty",
			Field:   field,
		}
	default:
		return &ValidationError{
			Code:    ErrCodeInvalidPolicyEnum,
			Message: fmt.Sprintf("unknown licensing mode: %s", m),
			Field:   field,
		}
	}
}

// MustValidate validates a policy and panics on error.
// Use only in tests or when the policy is known to be valid.
func MustValidate(policy *PolicyDocument) {
	if err := Validate(policy); err != nil {
		panic(err)
	}
}

// IsValid returns true if the policy is valid.
func IsValid(policy *PolicyDocument) bool {
	return Validate(policy) == nil
}
