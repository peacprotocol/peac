package policy

import (
	"testing"
)

// testPolicy creates the conformance test policy from evaluation.json
func testPolicy() *PolicyDocument {
	return &PolicyDocument{
		Version: PolicyVersion,
		Name:    "conformance-test-policy",
		Defaults: &PolicyDefaults{
			Decision: Deny,
			Reason:   "No matching rule found",
		},
		Rules: []PolicyRule{
			{
				Name: "allow-subscribed-humans-crawl",
				Subject: &SubjectMatcher{
					Type:   Human,
					Labels: []string{"subscribed"},
				},
				Purpose:       Purposes{PurposeCrawl},
				LicensingMode: LicensingModes{LicensingSubscription},
				Decision:      Allow,
				Reason:        "Subscribed humans can crawl",
			},
			{
				Name: "allow-verified-agents-inference",
				Subject: &SubjectMatcher{
					Type:   Agent,
					Labels: []string{"verified"},
				},
				Purpose:       Purposes{PurposeInference, PurposeAiInput},
				LicensingMode: LicensingModes{LicensingPayPerInference},
				Decision:      Allow,
				Reason:        "Verified agents can run inference",
			},
			{
				Name: "allow-org-index",
				Subject: &SubjectMatcher{
					Type: Org,
				},
				Purpose:  Purposes{PurposeIndex},
				Decision: Allow,
				Reason:   "Any org can index",
			},
			{
				Name:     "review-train",
				Purpose:  Purposes{PurposeTrain},
				Decision: Review,
				Reason:   "All training requires review",
			},
			{
				Name: "allow-premium-users-all",
				Subject: &SubjectMatcher{
					Type:   Human,
					Labels: []string{"premium"},
				},
				Decision: Allow,
				Reason:   "Premium users can do anything",
			},
			{
				Name: "allow-by-id-prefix",
				Subject: &SubjectMatcher{
					ID: "internal:*",
				},
				Decision: Allow,
				Reason:   "Internal subjects allowed",
			},
		},
	}
}

// Conformance tests from evaluation.json

func TestEvaluate_FirstMatchWins(t *testing.T) {
	// eval-001: When multiple rules match, first rule wins
	policy := testPolicy()
	context := &EvaluationContext{
		Subject: &Subject{
			Type:   Human,
			Labels: []string{"subscribed", "premium"},
		},
		Purpose:       PurposeCrawl,
		LicensingMode: LicensingSubscription,
	}

	result := Evaluate(policy, context)

	if result.Decision != Allow {
		t.Errorf("Decision = %s, want allow", result.Decision)
	}
	if result.MatchedRule != "allow-subscribed-humans-crawl" {
		t.Errorf("MatchedRule = %s, want allow-subscribed-humans-crawl", result.MatchedRule)
	}
	if result.IsDefault {
		t.Error("IsDefault = true, want false")
	}
}

func TestEvaluate_DefaultOnNoMatch(t *testing.T) {
	// eval-002: Default applies when no rules match
	policy := testPolicy()
	context := &EvaluationContext{
		Subject: &Subject{
			Type:   Human,
			Labels: []string{},
		},
		Purpose: PurposeIndex,
	}

	result := Evaluate(policy, context)

	if result.Decision != Deny {
		t.Errorf("Decision = %s, want deny", result.Decision)
	}
	if result.MatchedRule != "" {
		t.Errorf("MatchedRule = %s, want empty", result.MatchedRule)
	}
	if !result.IsDefault {
		t.Error("IsDefault = false, want true")
	}
	if result.Reason != "No matching rule found" {
		t.Errorf("Reason = %s, want 'No matching rule found'", result.Reason)
	}
}

func TestEvaluate_ArrayPurposeMatch(t *testing.T) {
	// eval-003: Rule with array of purposes matches any
	policy := testPolicy()
	context := &EvaluationContext{
		Subject: &Subject{
			Type:   Agent,
			Labels: []string{"verified"},
		},
		Purpose:       PurposeAiInput,
		LicensingMode: LicensingPayPerInference,
	}

	result := Evaluate(policy, context)

	if result.Decision != Allow {
		t.Errorf("Decision = %s, want allow", result.Decision)
	}
	if result.MatchedRule != "allow-verified-agents-inference" {
		t.Errorf("MatchedRule = %s, want allow-verified-agents-inference", result.MatchedRule)
	}
}

func TestEvaluate_NoSubjectConstraint(t *testing.T) {
	// eval-004: Rule without subject constraint matches any subject
	policy := testPolicy()
	context := &EvaluationContext{
		Subject: &Subject{
			Type:   Human,
			Labels: []string{},
		},
		Purpose: PurposeTrain,
	}

	result := Evaluate(policy, context)

	if result.Decision != Review {
		t.Errorf("Decision = %s, want review", result.Decision)
	}
	if result.MatchedRule != "review-train" {
		t.Errorf("MatchedRule = %s, want review-train", result.MatchedRule)
	}
}

func TestEvaluate_NoPurposeConstraint(t *testing.T) {
	// eval-005: Rule without purpose constraint matches any purpose
	policy := testPolicy()
	context := &EvaluationContext{
		Subject: &Subject{
			Type:   Human,
			Labels: []string{"premium"},
		},
		Purpose: PurposeSearch,
	}

	result := Evaluate(policy, context)

	if result.Decision != Allow {
		t.Errorf("Decision = %s, want allow", result.Decision)
	}
	if result.MatchedRule != "allow-premium-users-all" {
		t.Errorf("MatchedRule = %s, want allow-premium-users-all", result.MatchedRule)
	}
}

func TestEvaluate_AllLabelsRequired(t *testing.T) {
	// eval-006: All specified labels must be present
	policy := testPolicy()
	context := &EvaluationContext{
		Subject: &Subject{
			Type:   Human,
			Labels: []string{"verified"}, // has 'verified' but rule requires 'subscribed'
		},
		Purpose:       PurposeCrawl,
		LicensingMode: LicensingSubscription,
	}

	result := Evaluate(policy, context)

	if result.Decision != Deny {
		t.Errorf("Decision = %s, want deny", result.Decision)
	}
	if result.MatchedRule != "" {
		t.Errorf("MatchedRule = %s, want empty (default)", result.MatchedRule)
	}
	if !result.IsDefault {
		t.Error("IsDefault = false, want true")
	}
}

func TestEvaluate_IDPrefixMatch(t *testing.T) {
	// eval-007: Wildcard pattern matches ID prefix
	policy := testPolicy()
	context := &EvaluationContext{
		Subject: &Subject{
			ID: "internal:service-123",
		},
		Purpose: PurposeInference,
	}

	result := Evaluate(policy, context)

	if result.Decision != Allow {
		t.Errorf("Decision = %s, want allow", result.Decision)
	}
	if result.MatchedRule != "allow-by-id-prefix" {
		t.Errorf("MatchedRule = %s, want allow-by-id-prefix", result.MatchedRule)
	}
}

func TestEvaluate_IDPrefixNoMatch(t *testing.T) {
	// eval-008: Non-matching ID prefix falls through
	policy := testPolicy()
	context := &EvaluationContext{
		Subject: &Subject{
			ID: "external:user-456",
		},
		Purpose: PurposeInference,
	}

	result := Evaluate(policy, context)

	if result.Decision != Deny {
		t.Errorf("Decision = %s, want deny", result.Decision)
	}
	if result.MatchedRule != "" {
		t.Errorf("MatchedRule = %s, want empty", result.MatchedRule)
	}
	if !result.IsDefault {
		t.Error("IsDefault = false, want true")
	}
}

func TestEvaluate_EmptyContext(t *testing.T) {
	// eval-009: Empty context matches no rules
	policy := testPolicy()
	context := &EvaluationContext{}

	result := Evaluate(policy, context)

	if result.Decision != Deny {
		t.Errorf("Decision = %s, want deny", result.Decision)
	}
	if !result.IsDefault {
		t.Error("IsDefault = false, want true")
	}
}

func TestEvaluate_OnlySubject(t *testing.T) {
	// eval-010: Context with only subject
	policy := testPolicy()
	context := &EvaluationContext{
		Subject: &Subject{
			Type:   Human,
			Labels: []string{"premium"},
		},
	}

	result := Evaluate(policy, context)

	if result.Decision != Allow {
		t.Errorf("Decision = %s, want allow", result.Decision)
	}
	if result.MatchedRule != "allow-premium-users-all" {
		t.Errorf("MatchedRule = %s, want allow-premium-users-all", result.MatchedRule)
	}
}

func TestEvaluate_OnlyPurpose(t *testing.T) {
	// eval-011: Context with only purpose
	policy := testPolicy()
	context := &EvaluationContext{
		Purpose: PurposeTrain,
	}

	result := Evaluate(policy, context)

	if result.Decision != Review {
		t.Errorf("Decision = %s, want review", result.Decision)
	}
	if result.MatchedRule != "review-train" {
		t.Errorf("MatchedRule = %s, want review-train", result.MatchedRule)
	}
}

func TestEvaluate_OrgIndexAllow(t *testing.T) {
	// eval-012: Org type can index
	policy := testPolicy()
	context := &EvaluationContext{
		Subject: &Subject{
			Type: Org,
		},
		Purpose: PurposeIndex,
	}

	result := Evaluate(policy, context)

	if result.Decision != Allow {
		t.Errorf("Decision = %s, want allow", result.Decision)
	}
	if result.MatchedRule != "allow-org-index" {
		t.Errorf("MatchedRule = %s, want allow-org-index", result.MatchedRule)
	}
}

// Additional tests

func TestEvaluate_NilContext(t *testing.T) {
	policy := testPolicy()
	result := Evaluate(policy, nil)

	if result.Decision != Deny {
		t.Errorf("Decision = %s, want deny (default)", result.Decision)
	}
	if !result.IsDefault {
		t.Error("IsDefault = false, want true")
	}
}

func TestEvaluate_EmptyRulesWithDefaults(t *testing.T) {
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Defaults: &PolicyDefaults{
			Decision: Allow,
			Reason:   "Default allow",
		},
		Rules: []PolicyRule{},
	}
	context := &EvaluationContext{
		Purpose: PurposeCrawl,
	}

	result := Evaluate(policy, context)

	if result.Decision != Allow {
		t.Errorf("Decision = %s, want allow (default)", result.Decision)
	}
	if !result.IsDefault {
		t.Error("IsDefault = false, want true")
	}
}

func TestEvaluate_NoDefaultsUsesDeny(t *testing.T) {
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Rules:   []PolicyRule{},
	}
	context := &EvaluationContext{
		Purpose: PurposeCrawl,
	}

	result := Evaluate(policy, context)

	if result.Decision != Deny {
		t.Errorf("Decision = %s, want deny (implicit default)", result.Decision)
	}
	if !result.IsDefault {
		t.Error("IsDefault = false, want true")
	}
}

// Helper function tests

func TestIsAllowed(t *testing.T) {
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Rules: []PolicyRule{
			{Name: "allow-all", Decision: Allow},
		},
	}

	if !IsAllowed(policy, &EvaluationContext{}) {
		t.Error("IsAllowed() = false, want true")
	}
}

func TestIsDenied(t *testing.T) {
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Rules: []PolicyRule{
			{Name: "deny-all", Decision: Deny},
		},
	}

	if !IsDenied(policy, &EvaluationContext{}) {
		t.Error("IsDenied() = false, want true")
	}
}

func TestRequiresReview(t *testing.T) {
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Rules: []PolicyRule{
			{Name: "review-all", Decision: Review},
		},
	}

	if !RequiresReview(policy, &EvaluationContext{}) {
		t.Error("RequiresReview() = false, want true")
	}
}

func TestEvaluateBatch(t *testing.T) {
	policy := &PolicyDocument{
		Version: PolicyVersion,
		Defaults: &PolicyDefaults{
			Decision: Deny,
		},
		Rules: []PolicyRule{
			{Name: "allow-crawl", Purpose: Purposes{PurposeCrawl}, Decision: Allow},
		},
	}

	contexts := []*EvaluationContext{
		{Purpose: PurposeCrawl},
		{Purpose: PurposeTrain},
		{Purpose: PurposeIndex},
	}

	results := EvaluateBatch(policy, contexts)

	if len(results) != 3 {
		t.Fatalf("len(results) = %d, want 3", len(results))
	}
	if results[0].Decision != Allow {
		t.Errorf("results[0].Decision = %s, want allow", results[0].Decision)
	}
	if results[1].Decision != Deny {
		t.Errorf("results[1].Decision = %s, want deny", results[1].Decision)
	}
	if results[2].Decision != Deny {
		t.Errorf("results[2].Decision = %s, want deny", results[2].Decision)
	}
}

// Label matching tests

func TestHasAllLabels(t *testing.T) {
	tests := []struct {
		name     string
		subject  []string
		required []string
		want     bool
	}{
		{"empty required", []string{"a", "b"}, []string{}, true},
		{"nil required", []string{"a"}, nil, true},
		{"exact match", []string{"a"}, []string{"a"}, true},
		{"superset", []string{"a", "b", "c"}, []string{"a", "b"}, true},
		{"missing label", []string{"a"}, []string{"a", "b"}, false},
		{"empty subject", []string{}, []string{"a"}, false},
		{"nil subject", nil, []string{"a"}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := hasAllLabels(tt.subject, tt.required)
			if got != tt.want {
				t.Errorf("hasAllLabels(%v, %v) = %v, want %v",
					tt.subject, tt.required, got, tt.want)
			}
		})
	}
}

// ID pattern matching tests

func TestMatchesIDPattern(t *testing.T) {
	tests := []struct {
		name    string
		id      string
		pattern string
		want    bool
	}{
		{"empty pattern", "anything", "", true},
		{"exact match", "user:123", "user:123", true},
		{"exact no match", "user:123", "user:456", false},
		{"prefix match", "internal:service-1", "internal:*", true},
		{"prefix no match", "external:user-1", "internal:*", false},
		{"prefix exact boundary", "internal:", "internal:*", true},
		{"no prefix in ID", "external", "internal:*", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := matchesIDPattern(tt.id, tt.pattern)
			if got != tt.want {
				t.Errorf("matchesIDPattern(%q, %q) = %v, want %v",
					tt.id, tt.pattern, got, tt.want)
			}
		})
	}
}

// Nil policy tests

func TestEvaluate_NilPolicy(t *testing.T) {
	result := Evaluate(nil, &EvaluationContext{Purpose: PurposeCrawl})

	if result.Decision != Deny {
		t.Errorf("Decision = %s, want deny for nil policy", result.Decision)
	}
	if result.Reason != "nil policy" {
		t.Errorf("Reason = %q, want %q", result.Reason, "nil policy")
	}
	if !result.IsDefault {
		t.Error("IsDefault = false, want true for nil policy")
	}
}

func TestEvaluate_NilPolicyNilContext(t *testing.T) {
	result := Evaluate(nil, nil)

	if result.Decision != Deny {
		t.Errorf("Decision = %s, want deny for nil policy", result.Decision)
	}
	if result.Reason != "nil policy" {
		t.Errorf("Reason = %q, want %q", result.Reason, "nil policy")
	}
}

func TestIsAllowed_NilPolicy(t *testing.T) {
	if IsAllowed(nil, &EvaluationContext{}) {
		t.Error("IsAllowed(nil, ctx) = true, want false")
	}
}

func TestIsDenied_NilPolicy(t *testing.T) {
	if !IsDenied(nil, &EvaluationContext{}) {
		t.Error("IsDenied(nil, ctx) = false, want true")
	}
}

func TestRequiresReview_NilPolicy(t *testing.T) {
	if RequiresReview(nil, &EvaluationContext{}) {
		t.Error("RequiresReview(nil, ctx) = true, want false")
	}
}

func TestEvaluateBatch_NilPolicy(t *testing.T) {
	contexts := []*EvaluationContext{
		{Purpose: PurposeCrawl},
		{Purpose: PurposeTrain},
	}

	results := EvaluateBatch(nil, contexts)

	if len(results) != 2 {
		t.Fatalf("len(results) = %d, want 2", len(results))
	}
	for i, r := range results {
		if r.Decision != Deny {
			t.Errorf("results[%d].Decision = %s, want deny", i, r.Decision)
		}
	}
}
