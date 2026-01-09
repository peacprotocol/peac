// Package policy provides PEAC policy evaluation for Go.
// It implements first-match-wins rule semantics with deterministic, auditable evaluation.
package policy

// Decision represents a policy decision.
type Decision string

const (
	// Allow unconditionally permits access.
	Allow Decision = "allow"
	// Deny unconditionally forbids access.
	Deny Decision = "deny"
	// Review requires a condition (typically a valid receipt) to be met.
	Review Decision = "review"
)

// SubjectType represents the type of subject making a request.
type SubjectType string

const (
	Human SubjectType = "human"
	Agent SubjectType = "agent"
	Org   SubjectType = "org"
)

// ControlPurpose represents the intended purpose of access.
type ControlPurpose string

const (
	PurposeCrawl     ControlPurpose = "crawl"
	PurposeIndex     ControlPurpose = "index"
	PurposeTrain     ControlPurpose = "train"
	PurposeInference ControlPurpose = "inference"
	PurposeAiInput   ControlPurpose = "ai_input"
	PurposeAiIndex   ControlPurpose = "ai_index"
	PurposeSearch    ControlPurpose = "search"
)

// ControlLicensingMode represents the licensing arrangement.
type ControlLicensingMode string

const (
	LicensingSubscription    ControlLicensingMode = "subscription"
	LicensingPayPerInference ControlLicensingMode = "pay_per_inference"
	LicensingPayPerCrawl     ControlLicensingMode = "pay_per_crawl"
)

// PolicyVersion is the supported policy format version.
const PolicyVersion = "peac-policy/0.1"

// Error codes for policy validation.
const (
	ErrCodeInvalidPolicy        = "E_INVALID_POLICY"
	ErrCodeInvalidPolicyVersion = "E_INVALID_POLICY_VERSION"
	ErrCodeInvalidPolicyEnum    = "E_INVALID_POLICY_ENUM"
)

// ReasonNilPolicy is the reason returned when evaluating a nil policy.
const ReasonNilPolicy = "nil policy"

// PolicyDocument represents a PEAC policy document.
type PolicyDocument struct {
	// Version of the policy format (must be "peac-policy/0.1")
	Version string `json:"version"`

	// Name is an optional human-readable name for the policy.
	Name string `json:"name,omitempty"`

	// Defaults specifies fallback values when no rule matches.
	Defaults *PolicyDefaults `json:"defaults,omitempty"`

	// Rules are evaluated in order; first match wins.
	Rules []PolicyRule `json:"rules"`
}

// PolicyDefaults specifies default decision when no rule matches.
type PolicyDefaults struct {
	// Decision is the fallback decision (allow, deny, or review).
	Decision Decision `json:"decision"`

	// Reason explains why this default was applied.
	Reason string `json:"reason,omitempty"`
}

// PolicyRule represents a single rule in a policy.
type PolicyRule struct {
	// Name identifies the rule (required).
	Name string `json:"name"`

	// Subject specifies constraints on who is making the request.
	// If omitted, matches any subject.
	Subject *SubjectMatcher `json:"subject,omitempty"`

	// Purpose specifies which purposes this rule applies to.
	// Can be a single purpose or multiple. If omitted, matches any purpose.
	Purpose Purposes `json:"purpose,omitempty"`

	// LicensingMode specifies which licensing modes this rule applies to.
	// Can be a single mode or multiple. If omitted, matches any mode.
	LicensingMode LicensingModes `json:"licensing_mode,omitempty"`

	// Decision is the outcome if this rule matches (required).
	Decision Decision `json:"decision"`

	// Reason explains why this decision was made.
	Reason string `json:"reason,omitempty"`
}

// SubjectMatcher specifies constraints for matching a subject.
type SubjectMatcher struct {
	// Type constrains subject type (human, agent, org).
	// If omitted, matches any type.
	Type SubjectType `json:"type,omitempty"`

	// Labels that the subject must have (ALL required).
	// If omitted, matches any labels.
	Labels []string `json:"labels,omitempty"`

	// ID pattern for matching subject ID.
	// Supports prefix matching with * (e.g., "internal:*").
	// If omitted, matches any ID.
	ID string `json:"id,omitempty"`
}

// Subject represents a request subject for evaluation.
type Subject struct {
	// Type of subject (human, agent, org).
	Type SubjectType `json:"type,omitempty"`

	// Labels associated with the subject.
	Labels []string `json:"labels,omitempty"`

	// ID of the subject.
	ID string `json:"id,omitempty"`
}

// EvaluationContext contains the context for policy evaluation.
type EvaluationContext struct {
	// Subject making the request.
	Subject *Subject `json:"subject,omitempty"`

	// Purpose of the access request.
	Purpose ControlPurpose `json:"purpose,omitempty"`

	// LicensingMode of the request.
	LicensingMode ControlLicensingMode `json:"licensing_mode,omitempty"`
}

// EvaluationResult contains the result of policy evaluation.
type EvaluationResult struct {
	// Decision is the policy outcome.
	Decision Decision `json:"decision"`

	// MatchedRule is the name of the rule that matched (empty if default).
	MatchedRule string `json:"matched_rule,omitempty"`

	// Reason explains the decision.
	Reason string `json:"reason,omitempty"`

	// IsDefault indicates whether the default was applied.
	IsDefault bool `json:"is_default"`
}

// Purposes represents one or more purposes (for JSON unmarshaling).
type Purposes []ControlPurpose

// LicensingModes represents one or more licensing modes (for JSON unmarshaling).
type LicensingModes []ControlLicensingMode
