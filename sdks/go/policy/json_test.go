package policy

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestPurposes_UnmarshalJSON(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    Purposes
		wantErr bool
	}{
		{
			name:  "single string",
			input: `"crawl"`,
			want:  Purposes{PurposeCrawl},
		},
		{
			name:  "array of strings",
			input: `["crawl", "index", "train"]`,
			want:  Purposes{PurposeCrawl, PurposeIndex, PurposeTrain},
		},
		{
			name:  "empty array",
			input: `[]`,
			want:  Purposes{},
		},
		{
			name:    "invalid json",
			input:   `{invalid}`,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got Purposes
			err := json.Unmarshal([]byte(tt.input), &got)

			if (err != nil) != tt.wantErr {
				t.Errorf("UnmarshalJSON() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && !reflect.DeepEqual(got, tt.want) {
				t.Errorf("UnmarshalJSON() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestPurposes_MarshalJSON(t *testing.T) {
	tests := []struct {
		name  string
		input Purposes
		want  string
	}{
		{
			name:  "single value serializes as string",
			input: Purposes{PurposeCrawl},
			want:  `"crawl"`,
		},
		{
			name:  "multiple values serialize as array",
			input: Purposes{PurposeCrawl, PurposeIndex},
			want:  `["crawl","index"]`,
		},
		{
			name:  "empty serializes as empty array",
			input: Purposes{},
			want:  `[]`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := json.Marshal(tt.input)
			if err != nil {
				t.Errorf("MarshalJSON() error = %v", err)
				return
			}
			if string(got) != tt.want {
				t.Errorf("MarshalJSON() = %s, want %s", string(got), tt.want)
			}
		})
	}
}

func TestLicensingModes_UnmarshalJSON(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    LicensingModes
		wantErr bool
	}{
		{
			name:  "single string",
			input: `"subscription"`,
			want:  LicensingModes{LicensingSubscription},
		},
		{
			name:  "array of strings",
			input: `["subscription", "pay_per_inference"]`,
			want:  LicensingModes{LicensingSubscription, LicensingPayPerInference},
		},
		{
			name:  "empty array",
			input: `[]`,
			want:  LicensingModes{},
		},
		{
			name:    "invalid json",
			input:   `{invalid}`,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got LicensingModes
			err := json.Unmarshal([]byte(tt.input), &got)

			if (err != nil) != tt.wantErr {
				t.Errorf("UnmarshalJSON() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && !reflect.DeepEqual(got, tt.want) {
				t.Errorf("UnmarshalJSON() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestLicensingModes_MarshalJSON(t *testing.T) {
	tests := []struct {
		name  string
		input LicensingModes
		want  string
	}{
		{
			name:  "single value serializes as string",
			input: LicensingModes{LicensingSubscription},
			want:  `"subscription"`,
		},
		{
			name:  "multiple values serialize as array",
			input: LicensingModes{LicensingSubscription, LicensingPayPerInference},
			want:  `["subscription","pay_per_inference"]`,
		},
		{
			name:  "empty serializes as empty array",
			input: LicensingModes{},
			want:  `[]`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := json.Marshal(tt.input)
			if err != nil {
				t.Errorf("MarshalJSON() error = %v", err)
				return
			}
			if string(got) != tt.want {
				t.Errorf("MarshalJSON() = %s, want %s", string(got), tt.want)
			}
		})
	}
}

func TestPolicyRule_UnmarshalJSON(t *testing.T) {
	// Test that a rule with single purpose and array purpose both work
	t.Run("single purpose", func(t *testing.T) {
		input := `{
			"name": "test",
			"purpose": "crawl",
			"decision": "allow"
		}`

		var rule PolicyRule
		if err := json.Unmarshal([]byte(input), &rule); err != nil {
			t.Fatalf("Unmarshal error = %v", err)
		}

		if rule.Name != "test" {
			t.Errorf("Name = %s, want test", rule.Name)
		}
		if len(rule.Purpose) != 1 || rule.Purpose[0] != PurposeCrawl {
			t.Errorf("Purpose = %v, want [crawl]", rule.Purpose)
		}
	})

	t.Run("array purpose", func(t *testing.T) {
		input := `{
			"name": "test",
			"purpose": ["crawl", "index"],
			"decision": "allow"
		}`

		var rule PolicyRule
		if err := json.Unmarshal([]byte(input), &rule); err != nil {
			t.Fatalf("Unmarshal error = %v", err)
		}

		if len(rule.Purpose) != 2 {
			t.Fatalf("len(Purpose) = %d, want 2", len(rule.Purpose))
		}
		if rule.Purpose[0] != PurposeCrawl {
			t.Errorf("Purpose[0] = %s, want crawl", rule.Purpose[0])
		}
		if rule.Purpose[1] != PurposeIndex {
			t.Errorf("Purpose[1] = %s, want index", rule.Purpose[1])
		}
	})
}

func TestPolicyDocument_JSON_RoundTrip(t *testing.T) {
	// Create a policy
	original := &PolicyDocument{
		Version: PolicyVersion,
		Name:    "Test Policy",
		Defaults: &PolicyDefaults{
			Decision: Deny,
			Reason:   "Default deny",
		},
		Rules: []PolicyRule{
			{
				Name: "allow-crawl",
				Subject: &SubjectMatcher{
					Type:   Human,
					Labels: []string{"verified"},
				},
				Purpose:  Purposes{PurposeCrawl},
				Decision: Allow,
				Reason:   "Allow verified humans to crawl",
			},
			{
				Name:          "review-inference",
				Purpose:       Purposes{PurposeInference, PurposeAiInput},
				LicensingMode: LicensingModes{LicensingPayPerInference},
				Decision:      Review,
			},
		},
	}

	// Marshal to JSON
	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("Marshal error = %v", err)
	}

	// Unmarshal back
	var parsed PolicyDocument
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Unmarshal error = %v", err)
	}

	// Verify key fields
	if parsed.Version != original.Version {
		t.Errorf("Version = %s, want %s", parsed.Version, original.Version)
	}
	if parsed.Name != original.Name {
		t.Errorf("Name = %s, want %s", parsed.Name, original.Name)
	}
	if len(parsed.Rules) != len(original.Rules) {
		t.Errorf("len(Rules) = %d, want %d", len(parsed.Rules), len(original.Rules))
	}

	// Validate round-tripped policy
	if err := Validate(&parsed); err != nil {
		t.Errorf("Validate() error = %v", err)
	}
}

func TestPolicyDocument_FromConformanceFixture(t *testing.T) {
	// Parse the test policy from evaluation.json format
	input := `{
		"version": "peac-policy/0.1",
		"name": "conformance-test-policy",
		"defaults": {
			"decision": "deny",
			"reason": "No matching rule found"
		},
		"rules": [
			{
				"name": "allow-subscribed-humans-crawl",
				"subject": {
					"type": "human",
					"labels": ["subscribed"]
				},
				"purpose": "crawl",
				"licensing_mode": "subscription",
				"decision": "allow",
				"reason": "Subscribed humans can crawl"
			},
			{
				"name": "allow-verified-agents-inference",
				"subject": {
					"type": "agent",
					"labels": ["verified"]
				},
				"purpose": ["inference", "ai_input"],
				"licensing_mode": "pay_per_inference",
				"decision": "allow",
				"reason": "Verified agents can run inference"
			}
		]
	}`

	var policy PolicyDocument
	if err := json.Unmarshal([]byte(input), &policy); err != nil {
		t.Fatalf("Unmarshal error = %v", err)
	}

	if err := Validate(&policy); err != nil {
		t.Errorf("Validate() error = %v", err)
	}

	if policy.Version != PolicyVersion {
		t.Errorf("Version = %s, want %s", policy.Version, PolicyVersion)
	}
	if policy.Name != "conformance-test-policy" {
		t.Errorf("Name = %s, want conformance-test-policy", policy.Name)
	}
	if len(policy.Rules) != 2 {
		t.Fatalf("len(Rules) = %d, want 2", len(policy.Rules))
	}

	// Check first rule
	rule1 := policy.Rules[0]
	if rule1.Name != "allow-subscribed-humans-crawl" {
		t.Errorf("rule1.Name = %s", rule1.Name)
	}
	if len(rule1.Purpose) != 1 || rule1.Purpose[0] != PurposeCrawl {
		t.Errorf("rule1.Purpose = %v", rule1.Purpose)
	}

	// Check second rule (array purpose)
	rule2 := policy.Rules[1]
	if len(rule2.Purpose) != 2 {
		t.Errorf("rule2.Purpose length = %d, want 2", len(rule2.Purpose))
	}
}
