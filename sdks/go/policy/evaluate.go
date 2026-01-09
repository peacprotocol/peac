package policy

import (
	"strings"
)

// ReasonNilPolicy is the reason returned when evaluating a nil policy.
const ReasonNilPolicy = "nil policy"

// Evaluate evaluates a policy against a context and returns the result.
// Rules are evaluated in order; the first matching rule wins.
// If no rule matches, the default decision is used.
//
// If policy is nil, returns a deny result with reason ReasonNilPolicy.
// If context is nil, an empty context is used.
func Evaluate(policy *PolicyDocument, context *EvaluationContext) *EvaluationResult {
	// Guard against nil policy
	if policy == nil {
		return &EvaluationResult{
			Decision:  Deny,
			Reason:    ReasonNilPolicy,
			IsDefault: true,
		}
	}

	if context == nil {
		context = &EvaluationContext{}
	}

	// Evaluate rules in order - first match wins
	for _, rule := range policy.Rules {
		if ruleMatches(&rule, context) {
			return &EvaluationResult{
				Decision:    rule.Decision,
				MatchedRule: rule.Name,
				Reason:      rule.Reason,
				IsDefault:   false,
			}
		}
	}

	// No rule matched, use defaults
	result := &EvaluationResult{
		Decision:  Deny, // Default to deny if no defaults specified
		IsDefault: true,
	}

	if policy.Defaults != nil {
		result.Decision = policy.Defaults.Decision
		result.Reason = policy.Defaults.Reason
	}

	return result
}

// ruleMatches checks if a rule matches the given context.
// All specified constraints must match (AND logic).
func ruleMatches(rule *PolicyRule, context *EvaluationContext) bool {
	// Check subject matcher
	if rule.Subject != nil && !matchesSubject(context.Subject, rule.Subject) {
		return false
	}

	// Check purpose
	if len(rule.Purpose) > 0 && !matchesPurpose(context.Purpose, rule.Purpose) {
		return false
	}

	// Check licensing mode
	if len(rule.LicensingMode) > 0 && !matchesLicensingMode(context.LicensingMode, rule.LicensingMode) {
		return false
	}

	return true
}

// matchesSubject checks if a subject matches the given matcher.
func matchesSubject(subject *Subject, matcher *SubjectMatcher) bool {
	if subject == nil {
		// If there's a subject matcher but no subject in context, no match
		// unless the matcher has no constraints
		return matcher.Type == "" && len(matcher.Labels) == 0 && matcher.ID == ""
	}

	// Check type
	if matcher.Type != "" && subject.Type != matcher.Type {
		return false
	}

	// Check labels - subject must have ALL required labels
	if len(matcher.Labels) > 0 {
		if !hasAllLabels(subject.Labels, matcher.Labels) {
			return false
		}
	}

	// Check ID pattern
	if matcher.ID != "" && !matchesIDPattern(subject.ID, matcher.ID) {
		return false
	}

	return true
}

// hasAllLabels checks if subjectLabels contains all required labels.
func hasAllLabels(subjectLabels []string, requiredLabels []string) bool {
	if len(requiredLabels) == 0 {
		return true
	}
	if len(subjectLabels) == 0 {
		return false
	}

	// Create a set of subject labels for O(1) lookup
	labelSet := make(map[string]bool, len(subjectLabels))
	for _, label := range subjectLabels {
		labelSet[label] = true
	}

	// Check all required labels are present
	for _, required := range requiredLabels {
		if !labelSet[required] {
			return false
		}
	}
	return true
}

// matchesIDPattern checks if an ID matches a pattern.
// Pattern can be exact match or prefix match with * suffix.
func matchesIDPattern(id string, pattern string) bool {
	if pattern == "" {
		return true
	}

	// Check for wildcard prefix match
	if strings.HasSuffix(pattern, "*") {
		prefix := strings.TrimSuffix(pattern, "*")
		return strings.HasPrefix(id, prefix)
	}

	// Exact match
	return id == pattern
}

// matchesPurpose checks if a purpose matches any of the allowed purposes.
func matchesPurpose(purpose ControlPurpose, allowed Purposes) bool {
	if len(allowed) == 0 {
		return true // No constraint means any purpose
	}
	if purpose == "" {
		return false // If allowed is specified but context has no purpose, no match
	}

	for _, p := range allowed {
		if p == purpose {
			return true
		}
	}
	return false
}

// matchesLicensingMode checks if a mode matches any of the allowed modes.
func matchesLicensingMode(mode ControlLicensingMode, allowed LicensingModes) bool {
	if len(allowed) == 0 {
		return true // No constraint means any mode
	}
	if mode == "" {
		return false // If allowed is specified but context has no mode, no match
	}

	for _, m := range allowed {
		if m == mode {
			return true
		}
	}
	return false
}

// IsAllowed returns true if the policy allows the context.
func IsAllowed(policy *PolicyDocument, context *EvaluationContext) bool {
	return Evaluate(policy, context).Decision == Allow
}

// IsDenied returns true if the policy denies the context.
func IsDenied(policy *PolicyDocument, context *EvaluationContext) bool {
	return Evaluate(policy, context).Decision == Deny
}

// RequiresReview returns true if the policy requires review for the context.
func RequiresReview(policy *PolicyDocument, context *EvaluationContext) bool {
	return Evaluate(policy, context).Decision == Review
}

// EvaluateBatch evaluates a policy against multiple contexts.
func EvaluateBatch(policy *PolicyDocument, contexts []*EvaluationContext) []*EvaluationResult {
	results := make([]*EvaluationResult, len(contexts))
	for i, ctx := range contexts {
		results[i] = Evaluate(policy, ctx)
	}
	return results
}
